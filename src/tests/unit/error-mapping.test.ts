import { describe, expect, it } from 'vitest';

import { parseEnv } from '../../config/env.js';
import { AppError, fileTooLargeError } from '../../shared/errors/app-error.js';
import { buildErrorBody, mapUnknownError } from '../../shared/errors/error-handler.js';

const env = parseEnv({ API_KEY: 'test-api-key', MAX_FILE_SIZE_MB: '10' });

describe('error mapping', () => {
  it('preserves application errors', () => {
    const error = fileTooLargeError(10);
    expect(mapUnknownError(error, env)).toBe(error);
  });

  it('maps Fastify file-size errors', () => {
    const mapped = mapUnknownError({ code: 'FST_REQ_FILE_TOO_LARGE', statusCode: 413 }, env);
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.code).toBe('FILE_TOO_LARGE');
    expect(mapped.statusCode).toBe(413);
  });

  it('maps Fastify file-count errors to the bulk image cap', () => {
    const mapped = mapUnknownError({ code: 'FST_FILES_LIMIT', statusCode: 413 }, env);
    expect(mapped.code).toBe('TOO_MANY_IMAGES');
    expect(mapped.statusCode).toBe(400);
  });

  it('maps rate-limit errors', () => {
    const mapped = mapUnknownError({ code: 'FST_ERR_RATE_LIMIT', statusCode: 429 }, env);
    expect(mapped.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(mapped.statusCode).toBe(429);
  });

  it('maps validation errors', () => {
    const mapped = mapUnknownError({ validation: [{ message: 'bad' }] }, env);
    expect(mapped.code).toBe('VALIDATION_ERROR');
    expect(mapped.statusCode).toBe(400);
  });

  it('hides unknown errors as internal failures', () => {
    const mapped = mapUnknownError(new Error('secret internals'), env);
    expect(mapped.code).toBe('INTERNAL_SERVER_ERROR');
    expect(mapped.message).not.toContain('secret');
  });

  it('builds the standard error envelope', () => {
    const body = buildErrorBody(fileTooLargeError(10), 'req-123');
    expect(body).toEqual({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'The uploaded file exceeds the 10MB limit',
        details: null,
        requestId: 'req-123',
      },
    });
  });
});
