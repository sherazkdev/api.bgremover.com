import { access } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { AsyncQueue } from '../../shared/utils/async-queue.js';
import {
  createCorruptJpeg,
  createGif,
  createJpeg,
  createMultipartPayload,
  createPng,
  createWebp,
} from '../fixtures/create-test-image.js';
import { FakeSegmentationProvider } from '../fixtures/fake-provider.js';
import { buildTestApp, createTempUploadRoot, createTestEnv } from '../fixtures/test-app.js';

async function expectStored(root: string, url: string): Promise<void> {
  const publicPath = new URL(url).pathname.replace(/^\/+/, '');
  const relative = publicPath.startsWith('uploads/')
    ? publicPath.slice('uploads/'.length)
    : publicPath;
  await access(path.join(root, relative));
}

describe('POST /api/v1/remove-backgrounds', () => {
  it('removes multiple images with the same quality path and JSON URLs', async () => {
    const temp = await createTempUploadRoot();
    const { app, cleanup, env, provider } = await buildTestApp({
      env: createTestEnv(temp.uploadRoot),
    });
    try {
      const jpeg = await createJpeg(80, 60);
      const png = await createPng(48, 48);
      const webp = await createWebp(32, 40);
      const multipart = createMultipartPayload({
        fields: { format: 'png', quality: 'hd' },
        files: [
          {
            fieldname: 'images',
            filename: 'one.jpg',
            contentType: 'image/jpeg',
            content: jpeg,
          },
          {
            fieldname: 'images',
            filename: 'two.png',
            contentType: 'image/png',
            content: png,
          },
          {
            fieldname: 'image',
            filename: 'three.webp',
            contentType: 'image/webp',
            content: webp,
          },
        ],
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-backgrounds',
        headers: multipart.headers,
        payload: multipart.payload,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        success: boolean;
        message: string;
        data: {
          count: number;
          completed: number;
          failed: number;
          processing: { quality: string; durationMs: number; mode: string; preserveText: boolean };
          items: Array<{
            index: number;
            filename: string;
            status: string;
            id: string;
            original: { url: string; width: number; height: number; mimeType: string };
            result: {
              url: string;
              width: number;
              height: number;
              mimeType: string;
              hasTransparency: boolean;
            };
            processing: { model: string; quality: string };
            textPreserved: boolean;
          }>;
          zip: { url: string; mimeType: string; size: number } | null;
        };
      };

      expect(body.success).toBe(true);
      expect(body.message).toBe('Backgrounds removed successfully');
      expect(body.data.count).toBe(3);
      expect(body.data.completed).toBe(3);
      expect(body.data.failed).toBe(0);
      expect(body.data.processing.quality).toBe('hd');
      expect(body.data.processing.mode).toBe('auto');
      expect(body.data.processing.preserveText).toBe(true);
      expect(body.data.zip?.url).toContain('/uploads/archives/');
      expect(body.data.zip?.mimeType).toBe('application/zip');
      expect(body.data.items).toHaveLength(3);
      expect(body.data.items.every((item) => item.status === 'completed')).toBe(true);
      expect(body.data.items.map((item) => item.filename)).toEqual([
        'one.jpg',
        'two.png',
        'three.webp',
      ]);
      expect(body.data.items.map((item) => item.index)).toEqual([0, 1, 2]);
      expect(body.data.items[0]?.original.width).toBe(80);
      expect(body.data.items[0]?.result.width).toBe(80);
      expect(body.data.items[1]?.original.width).toBe(48);
      expect(body.data.items[2]?.original.height).toBe(40);
      expect(body.data.items.every((item) => item.result.hasTransparency)).toBe(true);
      expect(body.data.items.every((item) => item.result.mimeType === 'image/png')).toBe(true);
      expect(body.data.items.every((item) => item.processing.model === 'BiRefNet Lite')).toBe(
        true,
      );
      expect(body.data.items.every((item) => item.processing.quality === 'hd')).toBe(true);
      expect(provider.inferCount).toBe(3);

      for (const item of body.data.items) {
        await expectStored(env.UPLOAD_ROOT, item.original.url);
        await expectStored(env.UPLOAD_ROOT, item.result.url);
        const processedPath = new URL(item.result.url).pathname.replace(/^\/uploads\//, '');
        const meta = await sharp(path.join(env.UPLOAD_ROOT, processedPath)).metadata();
        expect(meta.hasAlpha).toBe(true);
        expect(meta.width).toBe(item.original.width);
        expect(meta.height).toBe(item.original.height);
      }
    } finally {
      await cleanup();
      await temp.cleanup();
    }
  });

  it('rejects a missing image list', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const multipart = createMultipartPayload({ fields: { format: 'png' } });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-backgrounds',
        headers: multipart.headers,
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        success: false,
        error: { code: 'IMAGE_REQUIRED' },
      });
    } finally {
      await cleanup();
    }
  });

  it('rejects more images than MAX_BULK_IMAGES', async () => {
    const temp = await createTempUploadRoot();
    const { app, cleanup } = await buildTestApp({
      env: createTestEnv(temp.uploadRoot, { MAX_BULK_IMAGES: '2' }),
    });
    try {
      const image = await createJpeg();
      const multipart = createMultipartPayload({
        files: [
          { fieldname: 'images', filename: 'a.jpg', contentType: 'image/jpeg', content: image },
          { fieldname: 'images', filename: 'b.jpg', contentType: 'image/jpeg', content: image },
          { fieldname: 'images', filename: 'c.jpg', contentType: 'image/jpeg', content: image },
        ],
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-backgrounds',
        headers: multipart.headers,
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: 'TOO_MANY_IMAGES' },
      });
    } finally {
      await cleanup();
      await temp.cleanup();
    }
  });

  it('keeps successful images when one file is unsupported', async () => {
    const { app, cleanup, provider } = await buildTestApp();
    try {
      const multipart = createMultipartPayload({
        files: [
          {
            fieldname: 'images',
            filename: 'ok.jpg',
            contentType: 'image/jpeg',
            content: await createJpeg(),
          },
          {
            fieldname: 'images',
            filename: 'bad.gif',
            contentType: 'image/gif',
            content: createGif(),
          },
        ],
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-backgrounds',
        headers: multipart.headers,
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        success: boolean;
        data: {
          completed: number;
          failed: number;
          items: Array<{ index: number; status: string; errorCode?: string; filename: string }>;
          zip: { url: string } | null;
        };
      };
      expect(body.success).toBe(true);
      expect(body.data.completed).toBe(1);
      expect(body.data.failed).toBe(1);
      expect(body.data.items[0]).toMatchObject({ index: 0, status: 'completed', filename: 'ok.jpg' });
      expect(body.data.items[1]).toMatchObject({
        index: 1,
        status: 'failed',
        filename: 'bad.gif',
        errorCode: 'UNSUPPORTED_IMAGE_TYPE',
      });
      expect(body.data.zip?.url).toContain('/uploads/archives/');
      expect(provider.inferCount).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it('keeps successful images when one file is corrupt', async () => {
    const { app, cleanup, provider } = await buildTestApp();
    try {
      const multipart = createMultipartPayload({
        files: [
          {
            fieldname: 'images',
            filename: 'ok.jpg',
            contentType: 'image/jpeg',
            content: await createJpeg(),
          },
          {
            fieldname: 'images',
            filename: 'broken.jpg',
            contentType: 'image/jpeg',
            content: createCorruptJpeg(),
          },
        ],
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-backgrounds',
        headers: multipart.headers,
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        success: true,
        data: {
          completed: 1,
          failed: 1,
          items: [
            { index: 0, status: 'completed', filename: 'ok.jpg' },
            { index: 1, status: 'failed', filename: 'broken.jpg', errorCode: 'CORRUPT_IMAGE' },
          ],
        },
      });
      expect(provider.inferCount).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it('processes a batch of 8 images and rejects a 9th', async () => {
    const temp = await createTempUploadRoot();
    const { app, cleanup } = await buildTestApp({
      env: createTestEnv(temp.uploadRoot, { MAX_BULK_IMAGES: '8' }),
    });
    try {
      const image = await createJpeg(32, 24);
      const eight = createMultipartPayload({
        files: Array.from({ length: 8 }, (_, index) => ({
          fieldname: 'images',
          filename: `n${index + 1}.jpg`,
          contentType: 'image/jpeg',
          content: image,
        })),
      });
      const eightResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-backgrounds',
        headers: eight.headers,
        payload: eight.payload,
      });
      expect(eightResponse.statusCode).toBe(200);
      expect(eightResponse.json()).toMatchObject({
        success: true,
        data: { count: 8, completed: 8, failed: 0 },
      });

      const nine = createMultipartPayload({
        files: Array.from({ length: 9 }, (_, index) => ({
          fieldname: 'images',
          filename: `n${index + 1}.jpg`,
          contentType: 'image/jpeg',
          content: image,
        })),
      });
      const nineResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-backgrounds',
        headers: nine.headers,
        payload: nine.payload,
      });
      expect(nineResponse.statusCode).toBe(400);
      expect(nineResponse.json()).toMatchObject({ error: { code: 'TOO_MANY_IMAGES' } });
    } finally {
      await cleanup();
      await temp.cleanup();
    }
  });

  it('processes a single-image batch', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const multipart = createMultipartPayload({
        files: [
          {
            fieldname: 'images',
            filename: 'only.jpg',
            contentType: 'image/jpeg',
            content: await createJpeg(),
          },
        ],
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-backgrounds',
        headers: multipart.headers,
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        success: true,
        data: { count: 1, completed: 1, failed: 0 },
      });
    } finally {
      await cleanup();
    }
  });

  it('rejects unexpected file fields and invalid options', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const image = await createJpeg();
      const unexpected = createMultipartPayload({
        files: [
          { fieldname: 'photo', filename: 'a.jpg', contentType: 'image/jpeg', content: image },
        ],
      });
      const unexpectedResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-backgrounds',
        headers: unexpected.headers,
        payload: unexpected.payload,
      });
      expect(unexpectedResponse.statusCode).toBe(400);
      expect(unexpectedResponse.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

      const invalid = createMultipartPayload({
        fields: { quality: 'ultra' },
        files: [
          { fieldname: 'images', filename: 'a.jpg', contentType: 'image/jpeg', content: image },
        ],
      });
      const invalidResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-backgrounds',
        headers: invalid.headers,
        payload: invalid.payload,
      });
      expect(invalidResponse.statusCode).toBe(400);
      expect(invalidResponse.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    } finally {
      await cleanup();
    }
  });

  it('returns 503 when the processing queue is full', async () => {
    const provider = new FakeSegmentationProvider();
    provider.inferDelayMs = 250;
    const queue = new AsyncQueue({ concurrency: 1, maxQueueSize: 0 });
    const { app, cleanup } = await buildTestApp({ provider, queue });

    try {
      const image = await createJpeg();
      const single = createMultipartPayload({
        files: [
          { fieldname: 'image', filename: 'a.jpg', contentType: 'image/jpeg', content: image },
        ],
      });
      const bulk = createMultipartPayload({
        files: [
          { fieldname: 'images', filename: 'b.jpg', contentType: 'image/jpeg', content: image },
        ],
      });

      const first = app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: single.headers,
        payload: single.payload,
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });

      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-backgrounds',
        headers: bulk.headers,
        payload: bulk.payload,
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
