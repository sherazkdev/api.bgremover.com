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
        description:
          'Local background-removal API. Images are stored on disk and processed with BiRefNet ONNX. No third-party image APIs are used.',
      },
      servers: [
        {
          url: env.PUBLIC_BASE_URL,
        },
      ],
      tags: [
        { name: 'Background Removal', description: 'Image matting endpoints' },
        { name: 'Health', description: 'Liveness and readiness' },
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
      security: [{ apiKey: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: true,
  });
}
