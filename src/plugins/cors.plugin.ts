import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

export async function registerCors(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Api-Key', 'X-Request-Id', 'Accept'],
    exposedHeaders: [
      'X-Request-Id',
      'X-Image-Id',
      'X-Processing-Duration-Ms',
      'X-Result-Url',
    ],
  });
}
