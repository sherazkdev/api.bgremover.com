import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../app.js';
import { parseEnv, type Env } from '../../config/env.js';
import { ModelManager } from '../../infrastructure/ai/model-manager.js';
import type { AsyncQueue } from '../../shared/utils/async-queue.js';
import { FakeSegmentationProvider } from './fake-provider.js';
import { TEST_API_KEY } from './test-api-key.js';

export async function createTempUploadRoot(): Promise<{
  uploadRoot: string;
  cleanup: () => Promise<void>;
}> {
  const uploadRoot = await mkdtemp(path.join(os.tmpdir(), 'bg-remover-uploads-'));
  return {
    uploadRoot,
    cleanup: async () => {
      await rm(uploadRoot, { recursive: true, force: true });
    },
  };
}

export function createTestEnv(
  uploadRoot: string,
  overrides: Record<string, string | undefined> = {},
): Env {
  return parseEnv({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3456',
    API_PREFIX: '/api/v1',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    UPLOAD_ROOT: uploadRoot,
    MAX_FILE_SIZE_MB: '10',
    MAX_BULK_IMAGES: '10',
    MAX_IMAGE_WIDTH: '6000',
    MAX_IMAGE_HEIGHT: '6000',
    MAX_IMAGE_PIXELS: '25000000',
    BG_REMOVAL_CONCURRENCY: '1',
    BG_REMOVAL_QUEUE_LIMIT: '20',
    MODEL_ID: 'studioludens/birefnet-lite-512',
    MODEL_DTYPE: 'fp32',
    API_KEY: TEST_API_KEY,
    RATE_LIMIT_MAX: '1000',
    RATE_LIMIT_WINDOW: '1 minute',
    ...overrides,
  });
}

export async function buildTestApp(options?: {
  env?: Env;
  queue?: AsyncQueue;
  initializeModel?: boolean;
  provider?: FakeSegmentationProvider;
}): Promise<{
  app: FastifyInstance;
  provider: FakeSegmentationProvider;
  modelManager: ModelManager;
  env: Env;
  cleanup: () => Promise<void>;
}> {
  const temp = options?.env ? null : await createTempUploadRoot();
  const env = options?.env ?? createTestEnv(temp?.uploadRoot ?? '');
  const provider = options?.provider ?? new FakeSegmentationProvider();
  const modelManager = new ModelManager(provider);
  if (options?.initializeModel !== false) {
    await modelManager.initialize();
  }

  const app = await buildApp({
    env,
    logger: false,
    dependencies: {
      modelManager,
      ...(options?.queue ? { queue: options.queue } : {}),
    },
  });

  return {
    app,
    provider,
    modelManager,
    env,
    cleanup: async () => {
      await app.close();
      if (temp) {
        await temp.cleanup();
      }
    },
  };
}
