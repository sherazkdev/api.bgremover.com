import { describe, expect, it } from 'vitest';

import { createJpeg, createMultipartPayload } from '../fixtures/create-test-image.js';
import { buildTestApp } from '../fixtures/test-app.js';
import { TEST_API_KEY } from '../fixtures/test-api-key.js';

describe('x-api-key authentication', () => {
  it('rejects background removal without a key', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const multipart = createMultipartPayload({
        files: [
          {
            fieldname: 'image',
            filename: 'a.jpg',
            contentType: 'image/jpeg',
            content: await createJpeg(),
          },
        ],
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: { 'content-type': multipart.headers['content-type'] ?? '' },
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        success: false,
        error: { code: 'INVALID_API_KEY' },
      });
    } finally {
      await cleanup();
    }
  });

  it('rejects a non-matching key', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const multipart = createMultipartPayload({
        files: [
          {
            fieldname: 'image',
            filename: 'a.jpg',
            contentType: 'image/jpeg',
            content: await createJpeg(),
          },
        ],
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: { ...multipart.headers, 'x-api-key': 'wrong-key-value' },
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: 'INVALID_API_KEY' } });
    } finally {
      await cleanup();
    }
  });

  it('accepts the matching key and leaves health public', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
      expect(health.statusCode).toBe(200);

      const multipart = createMultipartPayload({
        files: [
          {
            fieldname: 'image',
            filename: 'a.jpg',
            contentType: 'image/jpeg',
            content: await createJpeg(),
          },
        ],
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: { ...multipart.headers, 'x-api-key': TEST_API_KEY },
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await cleanup();
    }
  });
});
