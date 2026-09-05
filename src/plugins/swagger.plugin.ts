import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

import { APP_NAME, APP_VERSION } from '../config/constants.js';
import type { Env } from '../config/env.js';

export async function registerSwagger(app: FastifyInstance, env: Env): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: APP_NAME,
        version: APP_VERSION,
        description: [
          'Local background-removal API. Images stay on this server and are processed with BiRefNet ONNX.',
          '',
          '## Endpoints',
          '',
          '| Method | Path | Auth | Purpose |',
          '| --- | --- | --- | --- |',
          `| GET | ${env.API_PREFIX}/health | No | Liveness |`,
          `| GET | ${env.API_PREFIX}/health/ready | No | Model and storage readiness |`,
          `| POST | ${env.API_PREFIX}/remove-background | x-api-key | Single image, transparent PNG/WebP |`,
          `| POST | ${env.API_PREFIX}/remove-backgrounds | x-api-key | Batch of 1–${env.MAX_BULK_IMAGES} images, per-item status + ZIP |`,
          '',
          '`preserveText` defaults to true so text, logos, and badges stay in the cutout.',
        ].join('\n'),
      },
      servers: [
        {
          url: env.PUBLIC_BASE_URL,
          description: 'This deployment',
        },
      ],
      tags: [
        {
          name: 'Background Removal',
          description: 'Single-image and batch background removal',
        },
        {
          name: 'Health',
          description: 'Liveness and readiness',
        },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
            description: 'Must match the server API_KEY environment variable',
          },
        },
      },
    },
    hideUntagged: true,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
      defaultModelsExpandDepth: -1,
      defaultModelExpandDepth: 0,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    staticCSP: true,
  });
}
