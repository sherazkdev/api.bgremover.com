import type { OutputFormat } from '../../config/constants.js';
import { BULK_PROCESS_CONCURRENCY } from '../../config/constants.js';
import type { Env } from '../../config/env.js';
import type { ImageProcessor } from '../../infrastructure/image/image.processor.js';
import type { ImageValidator, ValidatedImage } from '../../infrastructure/image/image.validator.js';
import type { StorageService } from '../../infrastructure/storage/storage.interface.js';
import { AppError, processingFailedError, processingQueueFullError } from '../../shared/errors/app-error.js';
import { QueueFullError, type AsyncQueue } from '../../shared/utils/async-queue.js';
import {
  buildDatedRelativePath,
  generateImageId,
  normalizeExtension,
  sanitizeContentDispositionFilename,
} from '../../shared/utils/file-name.js';
import { buildPublicUrl } from '../../shared/utils/image-response.js';
import { mapLimit } from '../../shared/utils/map-limit.js';
import { createZipBuffer } from '../../shared/utils/zip.js';
import type { BackgroundRemovalProcessor } from './background-removal.processor.js';
import {
  BULK_FAILED_MESSAGE,
  BULK_PARTIAL_MESSAGE,
  BULK_SUCCESS_MESSAGE,
  SUCCESS_MESSAGE,
} from './background-removal.constants.js';
import type {
  BulkFailedItem,
  BulkRemoveBackgroundItem,
  RemoveBackgroundJsonResponse,
  RemoveBackgroundOptions,
  RemoveBackgroundResult,
  RemoveBackgroundsJsonResponse,
  RemoveBackgroundsOptions,
  RemoveBackgroundsResult,
  UploadedImagePart,
} from './background-removal.types.js';

export interface ServiceLogger {
  info(bindings: Record<string, unknown>, message: string): void;
}

interface PreparedImage {
  upload: UploadedImagePart;
  validated: ValidatedImage;
  id: string;
  originalRelativePath: string;
  resultRelativePath: string;
  createdAt: Date;
  index: number;
}

export class BackgroundRemovalService {
  constructor(
    private readonly env: Env,
    private readonly validator: ImageValidator,
    private readonly imageProcessor: ImageProcessor,
    private readonly storage: StorageService,
    private readonly processor: BackgroundRemovalProcessor,
    private readonly queue: AsyncQueue,
  ) {}

  public async removeBackground(
    upload: UploadedImagePart,
    options: RemoveBackgroundOptions,
    logger?: ServiceLogger,
  ): Promise<RemoveBackgroundResult> {
    const prepared = await this.prepareImage(upload, options.format, 0);
    const enqueuedAt = Date.now();

    try {
      return await this.queue.add(() =>
        this.processPrepared(prepared, options, logger, enqueuedAt),
      );
    } catch (error) {
      await this.removeStoredPair(prepared.originalRelativePath, prepared.resultRelativePath);
      if (error instanceof QueueFullError) {
        throw processingQueueFullError();
      }
      throw error;
    }
  }

  public async removeBackgrounds(
    uploads: UploadedImagePart[],
    options: RemoveBackgroundsOptions,
    logger?: ServiceLogger,
  ): Promise<RemoveBackgroundsResult> {
    const preparedOrFailed = await Promise.all(
      uploads.map(async (upload, index) => this.tryPrepareImage(upload, options.format, index)),
    );
    const prepared = preparedOrFailed.filter(isPrepared);
    const failed: BulkRemoveBackgroundItem[] = preparedOrFailed.filter(isFailedItem);

    if (prepared.length > 0 && !this.queue.canAccept(1)) {
      throw processingQueueFullError();
    }

    const enqueuedAt = Date.now();
    const batchStarted = Date.now();
    let processed: BulkRemoveBackgroundItem[] = [];

    if (prepared.length > 0) {
      try {
        processed = await this.queue.add(() => {
          const concurrency = Math.min(
            prepared.length,
            Math.max(this.env.BG_REMOVAL_CONCURRENCY, BULK_PROCESS_CONCURRENCY),
          );
          return mapLimit(prepared, concurrency, async (item) => {
            try {
              const result = await this.processPrepared(item, options, logger, enqueuedAt);
              return toCompletedItem(result, item);
            } catch (error) {
              await this.removeStoredPair(item.originalRelativePath, item.resultRelativePath);
              return toFailedItem(item.index, item.upload.filename, error);
            }
          });
        });
      } catch (error) {
        await Promise.all(
          prepared.map((item) =>
            this.removeStoredPair(item.originalRelativePath, item.resultRelativePath),
          ),
        );
        if (error instanceof QueueFullError) {
          throw processingQueueFullError();
        }
        throw error;
      }
    }

    const items = [...processed, ...failed].sort((left, right) => left.index - right.index);
    const completedItems = items.filter((item) => item.status === 'completed');
    const zip = await this.createZipArchive(completedItems, options.format);
    const durationMs = Date.now() - batchStarted;

    logger?.info(
      {
        count: items.length,
        completed: completedItems.length,
        failed: items.length - completedItems.length,
        quality: options.quality,
        format: options.format,
        mode: options.mode,
        preserveText: options.preserveText,
        durationMs,
      },
      'backgrounds removed',
    );

    return {
      items,
      completed: completedItems.length,
      failed: items.length - completedItems.length,
      durationMs,
      zip,
      quality: options.quality,
      mode: options.mode,
      preserveText: options.preserveText,
    };
  }

  public createResultStream(relativePath: string): Promise<NodeJS.ReadableStream> {
    return this.storage.createReadStream(relativePath);
  }

  public toJsonResponse(result: RemoveBackgroundResult): RemoveBackgroundJsonResponse {
    return {
      success: true,
      message: SUCCESS_MESSAGE,
      data: {
        id: result.id,
        original: result.original,
        result: result.result,
        processing: result.processing,
        createdAt: result.createdAt,
      },
    };
  }

  public toBulkJsonResponse(result: RemoveBackgroundsResult): RemoveBackgroundsJsonResponse {
    return {
      success: result.completed > 0,
      message:
        result.failed === 0
          ? BULK_SUCCESS_MESSAGE
          : result.completed === 0
            ? BULK_FAILED_MESSAGE
            : BULK_PARTIAL_MESSAGE,
      data: {
        count: result.items.length,
        completed: result.completed,
        failed: result.failed,
        processing: {
          quality: result.quality,
          mode: result.mode,
          preserveText: result.preserveText,
          durationMs: result.durationMs,
        },
        items: result.items.map(toPublicBulkItem),
        zip: result.zip,
      },
    };
  }

  private async tryPrepareImage(
    upload: UploadedImagePart,
    format: OutputFormat,
    index: number,
  ): Promise<PreparedImage | BulkFailedItem> {
    try {
      return await this.prepareImage(upload, format, index);
    } catch (error) {
      return toFailedItem(index, upload.filename, error);
    }
  }

  private async prepareImage(
    upload: UploadedImagePart,
    format: OutputFormat,
    index: number,
  ): Promise<PreparedImage> {
    const validated = await this.validateUpload(upload, index);
    const id = generateImageId();
    const createdAt = new Date();

    return {
      upload,
      validated,
      id,
      originalRelativePath: buildDatedRelativePath(
        'originals',
        id,
        normalizeExtension(validated.format),
        createdAt,
      ),
      resultRelativePath: buildDatedRelativePath('processed', id, format, createdAt),
      createdAt,
      index,
    };
  }

  private async validateUpload(upload: UploadedImagePart, index?: number): Promise<ValidatedImage> {
    try {
      return await this.validator.validate(upload.buffer);
    } catch (error) {
      if (error instanceof AppError && index !== undefined) {
        throw new AppError(error.code, error.message, error.statusCode, {
          index,
          filename: upload.filename,
          details: error.details,
        });
      }
      throw error;
    }
  }

  private async processPrepared(
    prepared: PreparedImage,
    options: RemoveBackgroundsOptions,
    logger: ServiceLogger | undefined,
    enqueuedAt: number,
  ): Promise<RemoveBackgroundResult> {
    const queueWaitMs = Date.now() - enqueuedAt;
    const totalStarted = Date.now();

    const oriented = await this.imageProcessor.orientAndDecode(prepared.validated.buffer);
    const [originalStored, processed] = await Promise.all([
      this.storage.saveAtomic(prepared.originalRelativePath, prepared.validated.buffer),
      this.processor.process({
        orientedBuffer: oriented.buffer,
        orientedRgb: oriented.rgb,
        width: oriented.width,
        height: oriented.height,
        quality: options.quality,
        format: options.format,
        mode: options.mode,
        preserveText: options.preserveText,
      }),
    ]);

    const resultStored = await this.storage.saveAtomic(
      prepared.resultRelativePath,
      processed.buffer,
    );

    const durationMs = Date.now() - totalStarted;
    logger?.info(
      {
        imageId: prepared.id,
        width: oriented.width,
        height: oriented.height,
        inputSize: originalStored.size,
        outputSize: resultStored.size,
        quality: options.quality,
        format: options.format,
        mode: options.mode,
        preserveText: options.preserveText,
        textPreserved: processed.textPreserved,
        queueWaitMs,
        inferenceMs: processed.inferenceMs,
        durationMs,
      },
      'background removed',
    );

    return {
      id: prepared.id,
      original: {
        url: buildPublicUrl(this.env.PUBLIC_BASE_URL, prepared.originalRelativePath),
        mimeType: prepared.validated.mimeType,
        width: oriented.width,
        height: oriented.height,
        size: originalStored.size,
      },
      result: {
        url: buildPublicUrl(this.env.PUBLIC_BASE_URL, prepared.resultRelativePath),
        mimeType: processed.mimeType,
        width: processed.width,
        height: processed.height,
        size: resultStored.size,
        hasTransparency: processed.hasTransparency,
      },
      processing: {
        model: processed.modelName,
        quality: options.quality,
        durationMs,
        mode: options.mode,
        preserveText: options.preserveText,
        textPreserved: processed.textPreserved,
      },
      createdAt: prepared.createdAt.toISOString(),
      originalRelativePath: prepared.originalRelativePath,
      resultRelativePath: prepared.resultRelativePath,
      resultBuffer: processed.buffer,
    };
  }

  private async createZipArchive(
    completed: Array<Extract<BulkRemoveBackgroundItem, { status: 'completed' }>>,
    format: OutputFormat,
  ): Promise<RemoveBackgroundsResult['zip']> {
    if (completed.length === 0) {
      return null;
    }

    const entries = completed.flatMap((item, order) => {
      if (!item.resultBuffer) {
        return [];
      }
      const base = sanitizeContentDispositionFilename(item.filename.replace(/\.[^.]+$/, ''));
      return [
        {
          name: `${String(order + 1).padStart(2, '0')}-${base || 'image'}-transparent.${format}`,
          data: item.resultBuffer,
        },
      ];
    });
    if (entries.length === 0) {
      return null;
    }

    const zipBuffer = createZipBuffer(entries);
    const relativePath = buildDatedRelativePath('archives', generateImageId(), 'zip');
    const stored = await this.storage.saveAtomic(relativePath, zipBuffer);
    return {
      url: buildPublicUrl(this.env.PUBLIC_BASE_URL, relativePath),
      mimeType: 'application/zip',
      size: stored.size,
    };
  }

  private async removeStoredPair(
    originalRelativePath: string,
    resultRelativePath: string,
  ): Promise<void> {
    await this.storage.remove(resultRelativePath);
    await this.storage.remove(originalRelativePath);
  }
}

function isPrepared(value: PreparedImage | BulkFailedItem): value is PreparedImage {
  return 'validated' in value;
}

function isFailedItem(value: PreparedImage | BulkFailedItem): value is BulkFailedItem {
  return 'status' in value && value.status === 'failed';
}

function toCompletedItem(
  result: RemoveBackgroundResult,
  prepared: PreparedImage,
): Extract<BulkRemoveBackgroundItem, { status: 'completed' }> {
  return {
    index: prepared.index,
    filename: prepared.upload.filename,
    status: 'completed',
    id: result.id,
    original: result.original,
    result: result.result,
    processing: result.processing,
    createdAt: result.createdAt,
    textPreserved: result.processing.textPreserved,
    resultBuffer: result.resultBuffer,
  };
}

function toPublicBulkItem(item: BulkRemoveBackgroundItem): BulkRemoveBackgroundItem {
  if (item.status !== 'completed') {
    return item;
  }
  const { resultBuffer: _resultBuffer, ...publicItem } = item;
  return publicItem as BulkRemoveBackgroundItem;
}

function toFailedItem(index: number, filename: string, error: unknown): BulkFailedItem {
  if (error instanceof AppError) {
    return {
      index,
      filename,
      status: 'failed',
      errorCode: error.code,
      message: error.message,
    };
  }
  const fallback = processingFailedError('Unable to process this image.');
  return {
    index,
    filename,
    status: 'failed',
    errorCode: fallback.code,
    message: fallback.message,
  };
}
