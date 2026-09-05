import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

import { AppError, internalServerError, rateLimitExceededError } from './app-error.js';
import { fileTooLargeError, tooManyImagesError, validationError } from './app-error.js';
import type { Env } from '../../config/env.js';

export interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown;
    requestId: string;
  };
}

interface MappedFastifyError {
  code?: string | undefined;
  statusCode?: number | undefined;
  validation?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asMappedError(error: unknown): MappedFastifyError {
  if (!isRecord(error)) {
    return {};
  }
  return {
    code: typeof error.code === 'string' ? error.code : undefined,
    statusCode: typeof error.statusCode === 'number' ? error.statusCode : undefined,
    validation: error.validation,
  };
}

export function mapUnknownError(error: unknown, env: Env): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const mapped = asMappedError(error);
  if (mapped.code === 'FST_FILES_LIMIT') {
    return tooManyImagesError(env.MAX_BULK_IMAGES);
  }
  if (mapped.code === 'FST_PARTS_LIMIT') {
    return validationError('The request contains too many multipart parts');
  }
  if (mapped.code === 'FST_REQ_FILE_TOO_LARGE' || mapped.statusCode === 413) {
    return fileTooLargeError(env.MAX_FILE_SIZE_MB);
  }
  if (mapped.code === 'FST_ERR_RATE_LIMIT' || mapped.statusCode === 429) {
    return rateLimitExceededError();
  }
  if (mapped.validation) {
    return validationError('Request validation failed', mapped.validation);
  }

  return internalServerError();
}

export function buildErrorBody(error: AppError, requestId: string): ErrorBody {
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      requestId,
    },
  };
}

export function createErrorHandler(env: Env) {
  return function errorHandler(
    error: FastifyError | AppError | Error,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const mapped = mapUnknownError(error, env);
    const exposeStack = env.NODE_ENV !== 'production';

    request.log.error(
      {
        err: {
          name: error.name,
          message: error.message,
          code: mapped.code,
          statusCode: mapped.statusCode,
          stack: exposeStack ? error.stack : undefined,
        },
        requestId: request.id,
      },
      'request failed',
    );

    if (reply.sent) {
      return;
    }

    void reply.status(mapped.statusCode).send(buildErrorBody(mapped, request.id));
  };
}
