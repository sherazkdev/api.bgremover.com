import { timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { Env } from '../config/env.js';
import { invalidApiKeyError } from '../shared/errors/app-error.js';

export function registerApiKeyAuth(app: FastifyInstance, env: Env): void {
  app.addHook('onRequest', async (request) => {
    if (isPublicRequest(request, env.API_PREFIX)) {
      return;
    }
    if (!apiKeyMatches(readApiKeyHeader(request), env.API_KEY)) {
      throw invalidApiKeyError();
    }
  });
}

export function isPublicRequest(
  request: Pick<FastifyRequest, 'method' | 'url'>,
  apiPrefix: string,
): boolean {
  if (request.method === 'OPTIONS') {
    return true;
  }

  const path = request.url.split('?')[0] ?? '/';
  if (path === '/' || path === '/favicon.ico') {
    return true;
  }
  if (path === '/docs' || path.startsWith('/docs/')) {
    return true;
  }
  if (path.startsWith('/uploads/')) {
    return true;
  }

  const health = `${apiPrefix}/health`;
  return path === health || path === `${health}/ready`;
}

export function apiKeyMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) {
    return false;
  }

  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length) {
    timingSafeEqual(expectedBytes, expectedBytes);
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
}

function readApiKeyHeader(request: FastifyRequest): string | undefined {
  const header = request.headers['x-api-key'];
  if (typeof header === 'string') {
    return header;
  }
  if (Array.isArray(header) && typeof header[0] === 'string') {
    return header[0];
  }
  return undefined;
}
