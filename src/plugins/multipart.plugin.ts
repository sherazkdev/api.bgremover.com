import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';

import type { Env } from '../config/env.js';

export async function registerMultipart(app: FastifyInstance, env: Env): Promise<void> {
  await app.register(multipart, {
    attachFieldsToBody: false,
    limits: {
      files: 2,
      fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
      fields: 8,
      parts: 10,
      headerPairs: 50,
    },
    throwFileSizeLimit: true,
  });
}
