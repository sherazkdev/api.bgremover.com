import { buildApp } from './app.js';
import { EnvValidationError, loadEnv } from './config/env.js';

async function main(): Promise<void> {
  let env;
  try {
    env = loadEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const app = await buildApp({ env });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error(
        { err: error instanceof Error ? error.message : 'close failed' },
        'shutdown failed',
      );
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info({ url: `${env.PUBLIC_BASE_URL}${env.API_PREFIX}` }, 'api listening');

  void app.modelManager.initialize().catch((error: unknown) => {
    app.log.error(
      {
        err: error instanceof Error ? error.message : 'unknown model error',
        modelId: env.MODEL_ID,
      },
      'failed to initialize background-removal model',
    );
  });
}

void main();
