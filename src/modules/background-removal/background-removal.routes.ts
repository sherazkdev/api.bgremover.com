import type { FastifyInstance } from 'fastify';

import type { Env } from '../../config/env.js';
import {
  REMOVE_BACKGROUND_PATH,
  REMOVE_BACKGROUNDS_PATH,
} from './background-removal.constants.js';
import {
  createBackgroundRemovalController,
  createBulkBackgroundRemovalController,
} from './background-removal.controller.js';
import {
  errorResponseOpenApi,
  removeBackgroundJsonOpenApi,
  removeBackgroundOpenApiBody,
  removeBackgroundsJsonOpenApi,
  removeBackgroundsOpenApiBody,
} from './background-removal.schema.js';
import type { BackgroundRemovalService } from './background-removal.service.js';

export function registerBackgroundRemovalRoutes(
  app: FastifyInstance,
  deps: { env: Env; service: BackgroundRemovalService },
): void {
  const handler = createBackgroundRemovalController(deps.service);
  const bulkHandler = createBulkBackgroundRemovalController(deps.service);

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
        operationId: 'removeBackground',
        summary: 'Remove background from one image',
        description:
          'Upload one JPEG, PNG or WebP file. Returns a transparent cutout. Text, logos, and badges stay when preserveText=true. Requires x-api-key.',
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

  app.post(
    REMOVE_BACKGROUNDS_PATH,
    {
      config: {
        rateLimit: {
          max: deps.env.RATE_LIMIT_MAX,
          timeWindow: deps.env.RATE_LIMIT_WINDOW,
        },
      },
      schema: {
        tags: ['Background Removal'],
        operationId: 'removeBackgrounds',
        summary: 'Remove backgrounds from a batch of images',
        description:
          `Upload 1 to ${deps.env.MAX_BULK_IMAGES} JPEG, PNG or WebP files as repeated images fields. Images are prepared in parallel and inferred one-by-one on the shared model. Each item gets completed or failed. A ZIP is included when at least one image succeeds. One bad file does not cancel the rest. Requires x-api-key.`,
        security: [{ apiKey: [] }],
        consumes: ['multipart/form-data'],
        body: removeBackgroundsOpenApiBody,
        response: {
          200: {
            content: {
              'application/json': { schema: removeBackgroundsJsonOpenApi },
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
    bulkHandler,
  );
}
