import type { FastifyInstance } from 'fastify';

import type { Env } from '../../config/env.js';
import { REMOVE_BACKGROUND_PATH } from './background-removal.constants.js';
import { createBackgroundRemovalController } from './background-removal.controller.js';
import {
  errorResponseOpenApi,
  removeBackgroundJsonOpenApi,
  removeBackgroundOpenApiBody,
} from './background-removal.schema.js';
import type { BackgroundRemovalService } from './background-removal.service.js';

export function registerBackgroundRemovalRoutes(
  app: FastifyInstance,
  deps: { env: Env; service: BackgroundRemovalService },
): void {
  const handler = createBackgroundRemovalController(deps.service);

  app.post(
    REMOVE_BACKGROUND_PATH,
    {
      config: {
        rateLimit: {
          max: deps.env.RATE_LIMIT_MAX,
          timeWindow: deps.env.RATE_LIMIT_WINDOW,
        },
      },
      schema: {
        tags: ['Background Removal'],
        summary: 'Remove the background from an uploaded image',
        description:
          'Accepts a single JPEG, PNG or WebP image, removes the background with a locally executed BiRefNet ONNX model, and returns JSON metadata or the transparent image bytes. Requires the x-api-key header.',
        security: [{ apiKey: [] }],
        consumes: ['multipart/form-data'],
        body: removeBackgroundOpenApiBody,
        response: {
          200: {
            content: {
              'application/json': { schema: removeBackgroundJsonOpenApi },
              'image/png': { schema: { type: 'string', format: 'binary' } },
              'image/webp': { schema: { type: 'string', format: 'binary' } },
            },
          },
          401: errorResponseOpenApi,
          400: errorResponseOpenApi,
          413: errorResponseOpenApi,
          415: errorResponseOpenApi,
          422: errorResponseOpenApi,
          429: errorResponseOpenApi,
          500: errorResponseOpenApi,
          503: errorResponseOpenApi,
        },
      },
    },
    handler,
  );
}
