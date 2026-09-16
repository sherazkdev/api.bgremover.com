import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';

export async function registerStaticFiles(
  app: FastifyInstance,
  cwd: string = process.cwd(),
  options: { allowDebugAssets?: boolean } = {},
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
      if (normalized.startsWith('/uploads/') || normalized.startsWith('uploads/')) {
        return true;
      }
      if (
        options.allowDebugAssets &&
        (normalized.startsWith('/debug/') || normalized.startsWith('debug/'))
      ) {
        return true;
      }
      return false;
    },
  });
}
