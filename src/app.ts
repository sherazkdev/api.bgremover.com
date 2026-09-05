import Fastify, { type FastifyInstance } from 'fastify';

import { bodyLimitBytes, requestTimeoutMs, SENSITIVE_HEADER_NAMES } from './config/constants.js';
import { loadEnv, type Env } from './config/env.js';
import { BiRefNetProvider } from './infrastructure/ai/birefnet.provider.js';
import { InferenceWorker } from './infrastructure/ai/inference-worker.js';
import { getSharedModelManager, ModelManager } from './infrastructure/ai/model-manager.js';
import { ImageProcessor } from './infrastructure/image/image.processor.js';
import { ImageValidator } from './infrastructure/image/image.validator.js';
import { LocalStorageService } from './infrastructure/storage/local-storage.service.js';
import type { StorageService } from './infrastructure/storage/storage.interface.js';
import {
  BackgroundRemovalProcessor,
  BackgroundRemovalService,
  registerBackgroundRemovalRoutes,
} from './modules/background-removal/index.js';
import { registerIndexRoutes } from './modules/index/index.routes.js';
import { registerHealthRoutes } from './modules/health/index.js';
import { registerApiKeyAuth } from './plugins/api-key.plugin.js';
import { registerCors } from './plugins/cors.plugin.js';
import { registerHelmet } from './plugins/helmet.plugin.js';
import { registerMultipart } from './plugins/multipart.plugin.js';
import { registerRateLimit } from './plugins/rate-limit.plugin.js';
import { registerStaticFiles } from './plugins/static-files.plugin.js';
import { registerSwagger } from './plugins/swagger.plugin.js';
import { createErrorHandler } from './shared/errors/error-handler.js';
import { AsyncQueue } from './shared/utils/async-queue.js';

export interface AppDependencies {
  env: Env;
  storage: StorageService;
  modelManager: ModelManager;
  queue: AsyncQueue;
  imageValidator: ImageValidator;
  imageProcessor: ImageProcessor;
  inferenceWorker: InferenceWorker;
  backgroundRemovalProcessor: BackgroundRemovalProcessor;
  backgroundRemovalService: BackgroundRemovalService;
}

export interface BuildAppOptions {
  env?: Env;
  dependencies?: Partial<AppDependencies>;
  logger?: boolean | object;
}

function mergeDependencies(env: Env, overrides: Partial<AppDependencies> = {}): AppDependencies {
  const storage = overrides.storage ?? new LocalStorageService(env.UPLOAD_ROOT);
  const imageValidator = overrides.imageValidator ?? new ImageValidator(env);
  const imageProcessor = overrides.imageProcessor ?? new ImageProcessor();
  const modelManager =
    overrides.modelManager ??
    getSharedModelManager(() => new ModelManager(new BiRefNetProvider(env)));
  const inferenceWorker = overrides.inferenceWorker ?? new InferenceWorker(modelManager);
  const queue =
    overrides.queue ??
    new AsyncQueue({
      concurrency: env.BG_REMOVAL_CONCURRENCY,
      maxQueueSize: env.BG_REMOVAL_QUEUE_LIMIT,
    });
  const backgroundRemovalProcessor =
    overrides.backgroundRemovalProcessor ??
    new BackgroundRemovalProcessor(modelManager, inferenceWorker, imageProcessor);
  const backgroundRemovalService =
    overrides.backgroundRemovalService ??
    new BackgroundRemovalService(
      env,
      imageValidator,
      imageProcessor,
      storage,
      backgroundRemovalProcessor,
      queue,
    );

  return {
    env,
    storage,
    modelManager,
    queue,
    imageValidator,
    imageProcessor,
    inferenceWorker,
    backgroundRemovalProcessor,
    backgroundRemovalService,
  };
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();
  const deps = mergeDependencies(env, options.dependencies);

  const app = Fastify({
    logger: options.logger ?? buildLoggerOptions(env),
    requestTimeout: requestTimeoutMs(env.MAX_BULK_IMAGES),
    bodyLimit: bodyLimitBytes(env.MAX_FILE_SIZE_MB, env.MAX_BULK_IMAGES),
    trustProxy: true,
    genReqId: (request) => {
      const header = request.headers['x-request-id'];
      return typeof header === 'string' && header.length > 0 ? header : crypto.randomUUID();
    },
  });

  app.decorate('env', deps.env);
  app.decorate('modelManager', deps.modelManager);
  app.decorate('processingQueue', deps.queue);

  app.setValidatorCompiler(() => {
    return (data: unknown) => ({ value: data });
  });
  app.setErrorHandler(createErrorHandler(env));

  app.addHook('onSend', async (request, reply) => {
    void reply.header('X-Request-Id', request.id);
  });

  await registerHelmet(app);
  await registerCors(app);
  await registerRateLimit(app);
  await registerMultipart(app, env);
  await registerStaticFiles(app);
  registerApiKeyAuth(app, env);
  registerIndexRoutes(app, env);
  if (env.NODE_ENV !== 'test') {
    await registerSwagger(app, env);
  }

  await app.register(
    async (scoped) => {
      registerHealthRoutes(scoped, {
        modelManager: deps.modelManager,
        queue: deps.queue,
        storage: deps.storage,
      });
      registerBackgroundRemovalRoutes(scoped, {
        env,
        service: deps.backgroundRemovalService,
      });
    },
    { prefix: env.API_PREFIX },
  );

  app.addHook('onClose', async () => {
    await deps.queue.onIdle();
  });

  await deps.storage.ensureReady();
  return app;
}

function buildLoggerOptions(env: Env): boolean | object {
  if (env.NODE_ENV === 'test') {
    return false;
  }

  const redact = {
    paths: SENSITIVE_HEADER_NAMES.map((name) => `req.headers.${name}`),
    remove: true,
  };

  if (env.NODE_ENV === 'development') {
    return {
      level: 'info',
      redact,
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  return {
    level: 'info',
    redact,
    serializers: {
      req(request: { id?: string; method?: string; url?: string }) {
        return {
          id: request.id,
          method: request.method,
          url: request.url,
        };
      },
    },
  };
}
