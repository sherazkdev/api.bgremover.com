import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AsyncQueue } from '../../shared/utils/async-queue.js';
import type { PhotoRemovalEngine } from '../../config/constants.js';
import type { InspyrenetWorkerClient } from '../../infrastructure/ai/inspyrenet-worker.client.js';
import type { ModelManager } from '../../infrastructure/ai/model-manager.js';
import type { StorageService } from '../../infrastructure/storage/storage.interface.js';

export interface HealthDependencies {
  modelManager: ModelManager;
  queue: AsyncQueue;
  storage: StorageService;
  photoEngine: PhotoRemovalEngine;
  inspyrenetClient: InspyrenetWorkerClient | null;
}

export function createHealthController(deps: HealthDependencies) {
  return {
    async live(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
      void reply.status(200).send({
        success: true,
        data: {
          status: 'ok',
          uptime: Number(process.uptime().toFixed(2)),
          timestamp: new Date().toISOString(),
        },
      });
    },

    async ready(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
      const model = deps.modelManager.getStatus();
      const queue = deps.queue.stats;
      const storageReady = await deps.storage.ensureReady();
      const workerReady =
        deps.photoEngine !== 'inspyrenet' ||
        (deps.inspyrenetClient ? await deps.inspyrenetClient.probeHealth() : false);
      const isReady = model.state === 'ready' && storageReady && workerReady;
      const status = isReady ? 'ready' : 'not_ready';

      void reply.status(isReady ? 200 : 503).send({
        success: isReady,
        data: {
          status,
          model: {
            state: model.state,
            modelId: model.modelId,
            displayName: model.displayName,
          },
          photoEngine: deps.photoEngine,
          inspyrenetWorker: {
            ready: workerReady,
            url: deps.inspyrenetClient?.baseUrl ?? null,
          },
          queue: {
            active: queue.active,
            queued: queue.queued,
          },
          storage: {
            ready: storageReady,
          },
          timestamp: new Date().toISOString(),
        },
      });
    },
  };
}
