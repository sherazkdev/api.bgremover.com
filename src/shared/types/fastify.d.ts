import type { Env } from '../../config/env.js';
import type { ModelManager } from '../../infrastructure/ai/model-manager.js';
import type { AsyncQueue } from '../utils/async-queue.js';

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
    modelManager: ModelManager;
    processingQueue: AsyncQueue;
  }
}

export {};
