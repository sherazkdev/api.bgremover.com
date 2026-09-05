import type { FastifyReply, FastifyRequest } from 'fastify';

import { IMAGE_FIELD_NAME, IMAGE_FIELD_NAMES } from './background-removal.constants.js';
import {
  imageRequiredError,
  imagesRequiredError,
  multipleImagesError,
  tooManyImagesError,
  validationError,
} from './background-removal.errors.js';
import {
  removeBackgroundFieldsSchema,
  removeBackgroundsFieldsSchema,
} from './background-removal.schema.js';
import type { BackgroundRemovalService } from './background-removal.service.js';
import type {
  RemoveBackgroundOptions,
  RemoveBackgroundsOptions,
  UploadedImagePart,
} from './background-removal.types.js';
import { contentDispositionForImage } from '../../shared/utils/image-response.js';

interface MultipartFilePart {
  type: 'file';
  fieldname: string;
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
  file: { resume: () => void };
}

interface MultipartFieldPart {
  type: 'field';
  fieldname: string;
  value: unknown;
}

type MultipartPart = MultipartFilePart | MultipartFieldPart;

function isMultipartRequest(request: FastifyRequest): request is FastifyRequest & {
  isMultipart: () => boolean;
  parts: () => AsyncIterable<MultipartPart>;
} {
  return typeof (request as { isMultipart?: unknown }).isMultipart === 'function';
}

async function drainFile(part: MultipartFilePart): Promise<void> {
  try {
    await part.toBuffer();
  } catch {
    part.file.resume();
  }
}

export async function parseRemoveBackgroundRequest(request: FastifyRequest): Promise<{
  upload: UploadedImagePart;
  options: RemoveBackgroundOptions;
}> {
  if (!isMultipartRequest(request) || !request.isMultipart()) {
    throw validationError('Content-Type must be multipart/form-data');
  }

  const fields: Record<string, unknown> = {};
  let upload: UploadedImagePart | undefined;
  let extraFiles = 0;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== IMAGE_FIELD_NAME) {
        await drainFile(part);
        throw validationError(`Unexpected file field "${part.fieldname}"`);
      }
      if (upload) {
        extraFiles += 1;
        await drainFile(part);
        continue;
      }
      const buffer = await part.toBuffer();
      upload = {
        buffer,
        filename: part.filename,
        mimetype: part.mimetype,
        fieldname: part.fieldname,
      };
    } else {
      fields[part.fieldname] = part.value;
    }
  }

  if (extraFiles > 0) {
    throw multipleImagesError();
  }
  if (!upload) {
    throw imageRequiredError();
  }

  const parsed = removeBackgroundFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    throw validationError('Invalid request fields', parsed.error.flatten());
  }

  return { upload, options: parsed.data };
}

export function createBackgroundRemovalController(service: BackgroundRemovalService) {
  return async function removeBackgroundHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const { upload, options } = await parseRemoveBackgroundRequest(request);
    const result = await service.removeBackground(upload, options, request.log);

    if (options.responseMode === 'binary') {
      const stream = await service.createResultStream(result.resultRelativePath);
      stream.on('error', (error: Error) => {
        request.log.error({ err: { message: error.message } }, 'failed to stream processed image');
        if (!reply.sent) {
          void reply.status(500).send({
            success: false,
            error: {
              code: 'FILE_STORAGE_FAILED',
              message: 'Failed to stream the processed image',
              details: null,
              requestId: request.id,
            },
          });
        }
      });

      return reply
        .header('Content-Type', result.result.mimeType)
        .header('Content-Disposition', contentDispositionForImage(result.id, options.format))
        .header('X-Request-Id', request.id)
        .header('X-Image-Id', result.id)
        .header('X-Processing-Duration-Ms', String(result.processing.durationMs))
        .header('X-Result-Url', result.result.url)
        .send(stream);
    }

    return reply.status(200).send(service.toJsonResponse(result));
  };
}

export async function parseRemoveBackgroundsRequest(
  request: FastifyRequest,
  maxImages: number,
): Promise<{
  uploads: UploadedImagePart[];
  options: RemoveBackgroundsOptions;
}> {
  if (!isMultipartRequest(request) || !request.isMultipart()) {
    throw validationError('Content-Type must be multipart/form-data');
  }

  const fields: Record<string, unknown> = {};
  const uploads: UploadedImagePart[] = [];
  let extraFiles = 0;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (!IMAGE_FIELD_NAMES.has(part.fieldname)) {
        await drainFile(part);
        throw validationError(`Unexpected file field "${part.fieldname}"`);
      }
      if (uploads.length >= maxImages) {
        extraFiles += 1;
        await drainFile(part);
        continue;
      }
      const buffer = await part.toBuffer();
      uploads.push({
        buffer,
        filename: part.filename,
        mimetype: part.mimetype,
        fieldname: part.fieldname,
      });
    } else {
      fields[part.fieldname] = part.value;
    }
  }

  if (extraFiles > 0) {
    throw tooManyImagesError(maxImages);
  }
  if (uploads.length === 0) {
    throw imagesRequiredError();
  }

  const parsed = removeBackgroundsFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    throw validationError('Invalid request fields', parsed.error.flatten());
  }

  return { uploads, options: parsed.data };
}

export function createBulkBackgroundRemovalController(service: BackgroundRemovalService) {
  return async function removeBackgroundsHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const { uploads, options } = await parseRemoveBackgroundsRequest(
      request,
      request.server.env.MAX_BULK_IMAGES,
    );
    const result = await service.removeBackgrounds(uploads, options, request.log);
    return reply.status(200).send(service.toBulkJsonResponse(result));
  };
}
