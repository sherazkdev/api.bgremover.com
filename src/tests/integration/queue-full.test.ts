import { describe, expect, it } from 'vitest';

import { AsyncQueue } from '../../shared/utils/async-queue.js';
import { createJpeg, createMultipartPayload } from '../fixtures/create-test-image.js';
import { FakeSegmentationProvider } from '../fixtures/fake-provider.js';
import { buildTestApp } from '../fixtures/test-app.js';

describe('processing queue', () => {
  it('returns 503 when the queue is full', async () => {
    const provider = new FakeSegmentationProvider();
    provider.inferDelayMs = 250;
    const queue = new AsyncQueue({ concurrency: 1, maxQueueSize: 0 });
    const { app, cleanup } = await buildTestApp({ provider, queue });

    try {
      const image = await createJpeg();
      const multipart = createMultipartPayload({
        files: [
          { fieldname: 'image', filename: 'a.jpg', contentType: 'image/jpeg', content: image },
        ],
      });

      const first = app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: multipart.headers,
        payload: multipart.payload,
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });

      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: multipart.headers,
        payload: multipart.payload,
      });

      expect(second.statusCode).toBe(503);
      expect(second.json()).toMatchObject({
        success: false,
        error: { code: 'PROCESSING_QUEUE_FULL' },
      });

      const firstResponse = await first;
      expect(firstResponse.statusCode).toBe(200);
    } finally {
      await cleanup();
    }
  });
});
