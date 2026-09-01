import type { Env } from '../../config/env.js';
import type { ImageProcessor } from '../../infrastructure/image/image.processor.js';
import type { ImageValidator } from '../../infrastructure/image/image.validator.js';
import type { StorageService } from '../../infrastructure/storage/storage.interface.js';
import { processingQueueFullError } from '../../shared/errors/app-error.js';
import { QueueFullError, type AsyncQueue } from '../../shared/utils/async-queue.js';
import {
  buildDatedRelativePath,
  generateImageId,
  normalizeExtension,
} from '../../shared/utils/file-name.js';
import { buildPublicUrl } from '../../shared/utils/image-response.js';
import type { BackgroundRemovalProcessor } from './background-removal.processor.js';
import { SUCCESS_MESSAGE } from './background-removal.constants.js';
import type {
  RemoveBackgroundJsonResponse,
  RemoveBackgroundOptions,
  RemoveBackgroundResult,
  UploadedImagePart,
} from './background-removal.types.js';

export interface ServiceLogger {
  info(bindings: Record<string, unknown>, message: string): void;
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
    const validated = await this.validator.validate(upload.buffer);
    const id = generateImageId();
    const createdAt = new Date();

    const originalRelativePath = buildDatedRelativePath(
      'originals',
      id,
      normalizeExtension(validated.format),
      createdAt,
    );
    const resultRelativePath = buildDatedRelativePath('processed', id, options.format, createdAt);

    const enqueuedAt = Date.now();

    try {
      const result = await this.queue.add(async () => {
        const queueWaitMs = Date.now() - enqueuedAt;
        const totalStarted = Date.now();

        const oriented = await this.imageProcessor.orientAndDecode(validated.buffer);
        const [originalStored, processed] = await Promise.all([
          this.storage.saveAtomic(originalRelativePath, validated.buffer),
          this.processor.process({
            orientedBuffer: oriented.buffer,
            orientedRgb: oriented.rgb,
            width: oriented.width,
            height: oriented.height,
            quality: options.quality,
            format: options.format,
          }),
        ]);

        const resultStored = await this.storage.saveAtomic(resultRelativePath, processed.buffer);

        const durationMs = Date.now() - totalStarted;
        logger?.info(
          {
            imageId: id,
            width: oriented.width,
            height: oriented.height,
            inputSize: originalStored.size,
            outputSize: resultStored.size,
            quality: options.quality,
            format: options.format,
            queueWaitMs,
            inferenceMs: processed.inferenceMs,
            durationMs,
          },
          'background removed',
        );

        return {
          id,
          original: {
            url: buildPublicUrl(this.env.PUBLIC_BASE_URL, originalRelativePath),
            mimeType: validated.mimeType,
            width: oriented.width,
            height: oriented.height,
            size: originalStored.size,
          },
          result: {
            url: buildPublicUrl(this.env.PUBLIC_BASE_URL, resultRelativePath),
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
          },
          createdAt: createdAt.toISOString(),
          originalRelativePath,
          resultRelativePath,
        };
      });
      return result;
    } catch (error) {
      await this.storage.remove(resultRelativePath);
      await this.storage.remove(originalRelativePath);
      if (error instanceof QueueFullError) {
        throw processingQueueFullError();
      }
      throw error;
    }
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
}
