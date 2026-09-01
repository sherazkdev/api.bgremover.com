import type { FastifyInstance } from 'fastify';

import { createHealthController, type HealthDependencies } from './health.controller.js';
import { healthResponseOpenApi, readyResponseOpenApi } from './health.schema.js';

export function registerHealthRoutes(app: FastifyInstance, deps: HealthDependencies): void {
  const controller = createHealthController(deps);

  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness check',
        description: 'Confirms that the HTTP application process is running. No API key required.',
        security: [],
        response: {
          200: healthResponseOpenApi,
        },
      },
    },
    controller.live,
  );

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness check',
        description:
          'Reports model state, queue depth, and upload directory availability. Returns 200 only when the API can process images. No API key required.',
        security: [],
        response: {
          200: readyResponseOpenApi,
          503: readyResponseOpenApi,
        },
      },
    },
    controller.ready,
  );
}
