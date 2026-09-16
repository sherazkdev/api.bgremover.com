import type { PhotoRemovalEngine } from '../../config/constants.js';
import type { Env } from '../../config/env.js';
import type { InspyrenetWorkerClient } from '../../infrastructure/ai/inspyrenet-worker.client.js';
import type { ModelManager } from '../../infrastructure/ai/model-manager.js';
import type { AsyncQueue } from '../utils/async-queue.js';

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
    modelManager: ModelManager;
    processingQueue: AsyncQueue;
    inspyrenetClient: InspyrenetWorkerClient | null;
    photoEngine: PhotoRemovalEngine;
  }
}

export {};
