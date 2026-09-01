import { access } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  createCorruptJpeg,
  createGif,
  createJpeg,
  createMultipartPayload,
  createOversizedBuffer,
  createPlainText,
  createPng,
  createWebp,
} from '../fixtures/create-test-image.js';
import { buildTestApp, createTempUploadRoot, createTestEnv } from '../fixtures/test-app.js';

async function expectStored(root: string, url: string): Promise<void> {
  const publicPath = new URL(url).pathname.replace(/^\/+/, '');
  const relative = publicPath.startsWith('uploads/')
    ? publicPath.slice('uploads/'.length)
    : publicPath;
  await access(path.join(root, relative));
}

describe('POST /api/v1/remove-background', () => {
  it('removes a JPEG background and returns JSON with matching dimensions', async () => {
    const temp = await createTempUploadRoot();
    const { app, cleanup, env, provider } = await buildTestApp({
      env: createTestEnv(temp.uploadRoot),
    });
    try {
      const image = await createJpeg(80, 60);
      const multipart = createMultipartPayload({
        fields: { format: 'png', quality: 'fast', responseMode: 'json' },
        files: [
          {
            fieldname: 'image',
            filename: 'client-name.jpg',
            contentType: 'image/jpeg',
            content: image,
          },
        ],
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: multipart.headers,
        payload: multipart.payload,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        success: boolean;
        message: string;
        data: {
          id: string;
          original: { url: string; mimeType: string; width: number; height: number };
          result: {
            url: string;
            mimeType: string;
            width: number;
            height: number;
            hasTransparency: boolean;
          };
          processing: { model: string; quality: string };
        };
      };
      expect(body.success).toBe(true);
      expect(body.data.original.width).toBe(80);
      expect(body.data.original.height).toBe(60);
      expect(body.data.result.width).toBe(80);
      expect(body.data.result.height).toBe(60);
      expect(body.data.result.mimeType).toBe('image/png');
      expect(body.data.result.hasTransparency).toBe(true);
      expect(body.data.processing.model).toBe('BiRefNet Lite');
      expect(body.data.original.url).toContain('/uploads/originals/');
      expect(body.data.result.url).toContain('/uploads/processed/');
      expect(body.data.original.url).not.toContain(env.UPLOAD_ROOT);
      expect(provider.inferCount).toBe(1);
      await expectStored(env.UPLOAD_ROOT, body.data.original.url);
      await expectStored(env.UPLOAD_ROOT, body.data.result.url);

      const processedPath = new URL(body.data.result.url).pathname.replace(/^\/uploads\//, '');
      const meta = await sharp(path.join(env.UPLOAD_ROOT, processedPath)).metadata();
      expect(meta.hasAlpha).toBe(true);
      expect(meta.width).toBe(80);
      expect(meta.height).toBe(60);
    } finally {
      await cleanup();
      await temp.cleanup();
    }
  });

  it('accepts PNG and WebP uploads', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      for (const [factory, filename, contentType] of [
        [createPng, 'photo.png', 'image/png'],
        [createWebp, 'photo.webp', 'image/webp'],
      ] as const) {
        const multipart = createMultipartPayload({
          files: [
            {
              fieldname: 'image',
              filename,
              contentType,
              content: await factory(48, 48),
            },
          ],
        });
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/remove-background',
          headers: multipart.headers,
          payload: multipart.payload,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          success: true,
          data: { result: { hasTransparency: true, width: 48, height: 48 } },
        });
      }
    } finally {
      await cleanup();
    }
  });

  it('streams a binary PNG response after saving the file', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const multipart = createMultipartPayload({
        fields: { responseMode: 'binary', format: 'png' },
        files: [
          {
            fieldname: 'image',
            filename: 'binary.jpg',
            contentType: 'image/jpeg',
            content: await createJpeg(40, 30),
          },
        ],
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: multipart.headers,
        payload: multipart.payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/image\/png/);
      expect(response.headers['x-image-id']).toBeTruthy();
      expect(response.headers['x-processing-duration-ms']).toBeTruthy();
      expect(response.headers['x-result-url']).toContain('/uploads/processed/');
      expect(response.headers['content-disposition']).toContain('background-removed-');

      const meta = await sharp(response.rawPayload).metadata();
      expect(meta.format).toBe('png');
      expect(meta.hasAlpha).toBe(true);
      expect(meta.width).toBe(40);
      expect(meta.height).toBe(30);
    } finally {
      await cleanup();
    }
  });

  it('rejects a missing image', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const multipart = createMultipartPayload({ fields: { format: 'png' } });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
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

  it('rejects unsupported formats and fake MIME types', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const gif = createMultipartPayload({
        files: [
          { fieldname: 'image', filename: 'a.gif', contentType: 'image/gif', content: createGif() },
        ],
      });
      const fake = createMultipartPayload({
        files: [
          {
            fieldname: 'image',
            filename: 'a.jpg',
            contentType: 'image/jpeg',
            content: createPlainText(),
          },
        ],
      });

      const gifResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: gif.headers,
        payload: gif.payload,
      });
      expect(gifResponse.statusCode).toBe(415);
      expect(gifResponse.json()).toMatchObject({ error: { code: 'UNSUPPORTED_IMAGE_TYPE' } });

      const fakeResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: fake.headers,
        payload: fake.payload,
      });
      expect(fakeResponse.statusCode).toBe(415);
      expect(fakeResponse.json()).toMatchObject({ error: { code: 'UNSUPPORTED_IMAGE_TYPE' } });
    } finally {
      await cleanup();
    }
  });

  it('rejects corrupt images and oversized files', async () => {
    const temp = await createTempUploadRoot();
    const { app, cleanup } = await buildTestApp({
      env: createTestEnv(temp.uploadRoot, { MAX_FILE_SIZE_MB: '1' }),
    });
    try {
      const corrupt = createMultipartPayload({
        files: [
          {
            fieldname: 'image',
            filename: 'bad.jpg',
            contentType: 'image/jpeg',
            content: createCorruptJpeg(),
          },
        ],
      });
      const corruptResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: corrupt.headers,
        payload: corrupt.payload,
      });
      expect(corruptResponse.statusCode).toBe(422);
      expect(corruptResponse.json()).toMatchObject({ error: { code: 'CORRUPT_IMAGE' } });

      const oversized = createMultipartPayload({
        files: [
          {
            fieldname: 'image',
            filename: 'big.jpg',
            contentType: 'image/jpeg',
            content: createOversizedBuffer(1.5 * 1024 * 1024),
          },
        ],
      });
      const oversizedResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: oversized.headers,
        payload: oversized.payload,
      });
      expect(oversizedResponse.statusCode).toBe(413);
      expect(oversizedResponse.json()).toMatchObject({ error: { code: 'FILE_TOO_LARGE' } });
    } finally {
      await cleanup();
      await temp.cleanup();
    }
  });

  it('rejects multiple uploaded files', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const image = await createJpeg();
      const multipart = createMultipartPayload({
        files: [
          { fieldname: 'image', filename: 'a.jpg', contentType: 'image/jpeg', content: image },
          { fieldname: 'image', filename: 'b.jpg', contentType: 'image/jpeg', content: image },
        ],
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: multipart.headers,
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'MULTIPLE_IMAGES_NOT_ALLOWED' } });
    } finally {
      await cleanup();
    }
  });

  it('rejects invalid format, quality and responseMode values', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const image = await createJpeg();
      const cases = [{ format: 'jpg' }, { quality: 'ultra' }, { responseMode: 'base64' }];
      for (const fields of cases) {
        const multipart = createMultipartPayload({
          fields,
          files: [
            { fieldname: 'image', filename: 'a.jpg', contentType: 'image/jpeg', content: image },
          ],
        });
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/remove-background',
          headers: multipart.headers,
          payload: multipart.payload,
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
      }
    } finally {
      await cleanup();
    }
  });

  it('does not reload the model between requests', async () => {
    const { app, cleanup, provider } = await buildTestApp();
    try {
      const image = await createJpeg();
      const multipart = createMultipartPayload({
        files: [
          { fieldname: 'image', filename: 'a.jpg', contentType: 'image/jpeg', content: image },
        ],
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: multipart.headers,
        payload: multipart.payload,
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: multipart.headers,
        payload: multipart.payload,
      });
      expect(provider.initializeCount).toBe(1);
      expect(provider.inferCount).toBe(2);
    } finally {
      await cleanup();
    }
  });
});
