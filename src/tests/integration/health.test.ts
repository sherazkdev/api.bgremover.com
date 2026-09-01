import { describe, expect, it } from 'vitest';

import { FailingSegmentationProvider } from '../fixtures/fake-provider.js';
import { buildTestApp } from '../fixtures/test-app.js';

describe('health endpoints', () => {
  it('returns liveness even when the model is not ready', async () => {
    const { app, cleanup } = await buildTestApp({ initializeModel: false });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        success: boolean;
        data: { status: string; uptime: number; timestamp: string };
      };
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('ok');
      expect(body.data.uptime).toBeGreaterThanOrEqual(0);
      expect(body.data.timestamp).toBeTruthy();
    } finally {
      await cleanup();
    }
  });

  it('returns 503 from readiness until the model is ready', async () => {
    const { app, cleanup, modelManager } = await buildTestApp({ initializeModel: false });
    try {
      const notReady = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
      expect(notReady.statusCode).toBe(503);
      expect(notReady.json()).toMatchObject({
        success: false,
        data: { status: 'not_ready', model: { state: 'idle' } },
      });

      await modelManager.initialize();
      const ready = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toMatchObject({
        success: true,
        data: {
          status: 'ready',
          model: { state: 'ready', displayName: 'BiRefNet Lite' },
          storage: { ready: true },
        },
      });
    } finally {
      await cleanup();
    }
  });

  it('reports a failed model as not ready', async () => {
    const { app, cleanup, modelManager } = await buildTestApp({
      initializeModel: false,
      provider: new FailingSegmentationProvider(),
    });
    try {
      await modelManager.initialize().catch(() => undefined);
      const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        data: { status: 'not_ready', model: { state: 'failed' } },
      });
    } finally {
      await cleanup();
    }
  });
});
