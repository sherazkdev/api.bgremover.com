import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';

export async function registerStaticFiles(
  app: FastifyInstance,
  cwd: string = process.cwd(),
): Promise<void> {
  await app.register(fastifyStatic, {
    root: path.resolve(cwd, 'public'),
    prefix: '/',
    decorateReply: false,
    index: false,
    list: false,
    allowedPath: (pathname) => {
      const normalized = pathname.replace(/\\/g, '/');
      if (normalized.includes('..')) {
        return false;
      }
      return normalized.startsWith('/uploads/') || normalized.startsWith('uploads/');
    },
  });
}
