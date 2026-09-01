import type { FastifyInstance } from 'fastify';

import type { Env } from '../../config/env.js';
import { renderIndexPage } from './index.page.js';

export function registerIndexRoutes(app: FastifyInstance, env: Env): void {
  app.get(
    '/',
    {
      schema: { hide: true },
    },
    async (_request, reply) => {
      return reply
        .header('Cache-Control', 'public, max-age=30')
        .type('text/html; charset=utf-8')
        .send(renderIndexPage(env));
    },
  );
}
