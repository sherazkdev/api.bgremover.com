import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  createArabicCard,
  createEnglishCaption,
  createGraphicPoster,
  createJpeg,
  createMultipartPayload,
  createPersonWithTextOverlay,
  createSemiTransparentOverlay,
  createTextBesidePerson,
  createTransparentPng,
  createUrduCard,
} from '../fixtures/create-test-image.js';
import { EmptySegmentationProvider } from '../fixtures/fake-provider.js';
import { buildTestApp, createTempUploadRoot, createTestEnv } from '../fixtures/test-app.js';

const posterPath = fileURLToPath(
  new URL('../fixtures/images/d500bd7a-c76f-4c36-aebc-a96f325c3e05.jpeg', import.meta.url),
);

async function alphaStats(filePath: string): Promise<{
  width: number;
  height: number;
  opaqueRatio: number;
  sample: (x: number, y: number) => number;
}> {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  let opaque = 0;
  const pixelCount = info.width * info.height;
  for (let index = 0; index < pixelCount; index += 1) {
    if ((data[index * 4 + 3] ?? 0) > 32) {
      opaque += 1;
    }
  }
  return {
    width: info.width,
    height: info.height,
    opaqueRatio: opaque / pixelCount,
    sample: (x, y) => data[(y * info.width + x) * 4 + 3] ?? 0,
  };
}

async function processImage(
  image: Buffer,
  filename: string,
  contentType: string,
  fields: Record<string, string> = {},
  provider?: EmptySegmentationProvider,
) {
  const temp = await createTempUploadRoot();
  const { app, cleanup, env } = await buildTestApp({
    env: createTestEnv(temp.uploadRoot),
    ...(provider ? { provider } : {}),
  });
  try {
    const multipart = createMultipartPayload({
      fields: { format: 'png', quality: 'fast', responseMode: 'json', ...fields },
      files: [{ fieldname: 'image', filename, contentType, content: image }],
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/remove-background',
      headers: multipart.headers,
      payload: multipart.payload,
    });
    return { response, env, cleanup: async () => { await cleanup(); await temp.cleanup(); } };
  } catch (error) {
    await cleanup();
    await temp.cleanup();
    throw error;
  }
}

describe('text and overlay preservation', () => {
  it('keeps a person-like subject when no text is present', async () => {
    const { response, env, cleanup } = await processImage(
      await createJpeg(80, 60),
      'person.jpg',
      'image/jpeg',
    );
    try {
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        data: { result: { url: string }; processing: { textPreserved: boolean; mode: string } };
      };
      expect(body.data.processing.mode).toBe('auto');
      const processed = path.join(
        env.UPLOAD_ROOT,
        new URL(body.data.result.url).pathname.replace(/^\/uploads\//, ''),
      );
      const stats = await alphaStats(processed);
      expect(stats.opaqueRatio).toBeGreaterThan(0.08);
      expect(stats.opaqueRatio).toBeLessThan(0.7);
    } finally {
      await cleanup();
    }
  });

  it('keeps a caption placed over a person-like region', async () => {
    const { response, env, cleanup } = await processImage(
      await createPersonWithTextOverlay(),
      'person-text.png',
      'image/png',
      { preserveText: 'true', mode: 'auto' },
    );
    try {
      expect(response.statusCode).toBe(200);
      const body = response.json() as { data: { result: { url: string }; processing: { textPreserved: boolean } } };
      const processed = path.join(
        env.UPLOAD_ROOT,
        new URL(body.data.result.url).pathname.replace(/^\/uploads\//, ''),
      );
      const stats = await alphaStats(processed);
      expect(stats.opaqueRatio).toBeGreaterThan(0.15);
      expect(stats.sample(80, 90)).toBeGreaterThan(80);
    } finally {
      await cleanup();
    }
  });

  it('keeps a label beside a person-like region', async () => {
    const { response, env, cleanup } = await processImage(
      await createTextBesidePerson(),
      'beside.png',
      'image/png',
    );
    try {
      expect(response.statusCode).toBe(200);
      const body = response.json() as { data: { result: { url: string } } };
      const stats = await alphaStats(
        path.join(env.UPLOAD_ROOT, new URL(body.data.result.url).pathname.replace(/^\/uploads\//, '')),
      );
      expect(stats.sample(130, 80)).toBeGreaterThan(80);
    } finally {
      await cleanup();
    }
  });

  it.each([
    ['Urdu', createUrduCard, 'urdu.png'],
    ['Arabic', createArabicCard, 'arabic.png'],
    ['English', createEnglishCaption, 'english.png'],
  ] as const)('keeps a %s text card', async (_label, factory, filename) => {
    const { response, env, cleanup } = await processImage(await factory(), filename, 'image/png', {
      mode: 'graphic',
    });
    try {
      expect(response.statusCode).toBe(200);
      const body = response.json() as { data: { result: { url: string }; processing: { textPreserved: boolean } } };
      expect(body.data.processing.textPreserved).toBe(true);
      const stats = await alphaStats(
        path.join(env.UPLOAD_ROOT, new URL(body.data.result.url).pathname.replace(/^\/uploads\//, '')),
      );
      expect(stats.opaqueRatio).toBeGreaterThan(0.12);
      expect(stats.sample(100, 60)).toBeGreaterThan(120);
    } finally {
      await cleanup();
    }
  });

  it('keeps logos and colored cards on a synthetic poster', async () => {
    const provider = new EmptySegmentationProvider();
    const { response, env, cleanup } = await processImage(
      await createGraphicPoster(),
      'poster.jpg',
      'image/jpeg',
      { mode: 'auto' },
      provider,
    );
    try {
      expect(response.statusCode).toBe(200);
      const body = response.json() as { data: { result: { url: string; width: number; height: number } } };
      expect(body.data.result.width).toBe(240);
      expect(body.data.result.height).toBe(320);
      const stats = await alphaStats(
        path.join(env.UPLOAD_ROOT, new URL(body.data.result.url).pathname.replace(/^\/uploads\//, '')),
      );
      expect(stats.opaqueRatio).toBeGreaterThan(0.18);
      expect(stats.sample(43, 38)).toBeGreaterThan(80);
      expect(stats.sample(197, 38)).toBeGreaterThan(80);
      expect(stats.sample(120, 85)).toBeGreaterThan(80);
    } finally {
      await cleanup();
    }
  });

  it('keeps a semi-transparent overlay and accepts a transparent PNG input', async () => {
    const overlay = await processImage(
      await createSemiTransparentOverlay(),
      'overlay.png',
      'image/png',
      { mode: 'graphic' },
    );
    try {
      expect(overlay.response.statusCode).toBe(200);
      const body = overlay.response.json() as { data: { result: { url: string } } };
      const stats = await alphaStats(
        path.join(
          overlay.env.UPLOAD_ROOT,
          new URL(body.data.result.url).pathname.replace(/^\/uploads\//, ''),
        ),
      );
      expect(stats.opaqueRatio).toBeGreaterThan(0.1);
    } finally {
      await overlay.cleanup();
    }

    const transparent = await processImage(await createTransparentPng(), 'alpha.png', 'image/png');
    try {
      expect(transparent.response.statusCode).toBe(200);
    } finally {
      await transparent.cleanup();
    }
  });

  it('does not wipe the supplied Urdu poster when no person is found', async () => {
    const provider = new EmptySegmentationProvider();
    const poster = await readFile(posterPath);
    const { response, env, cleanup } = await processImage(
      poster,
      'd500bd7a-c76f-4c36-aebc-a96f325c3e05.jpeg',
      'image/jpeg',
      { mode: 'auto', preserveText: 'true' },
      provider,
    );
    try {
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        data: {
          original: { width: number; height: number };
          result: { url: string; width: number; height: number };
          processing: { textPreserved: boolean };
        };
      };
      expect(body.data.result.width).toBe(body.data.original.width);
      expect(body.data.result.height).toBe(body.data.original.height);
      expect(body.data.processing.textPreserved).toBe(true);
      const stats = await alphaStats(
        path.join(env.UPLOAD_ROOT, new URL(body.data.result.url).pathname.replace(/^\/uploads\//, '')),
      );
      expect(stats.opaqueRatio).toBeGreaterThan(0.2);
      expect(stats.sample(Math.round(stats.width * 0.18), Math.round(stats.height * 0.08))).toBeGreaterThan(
        40,
      );
      expect(stats.sample(Math.round(stats.width * 0.82), Math.round(stats.height * 0.08))).toBeGreaterThan(
        40,
      );
      expect(stats.sample(Math.round(stats.width * 0.12), Math.round(stats.height * 0.28))).toBeGreaterThan(
        40,
      );
    } finally {
      await cleanup();
    }
  });

  it('returns NO_REMOVABLE_SUBJECT for a blank photo with no subject', async () => {
    const provider = new EmptySegmentationProvider();
    const { response, cleanup } = await processImage(
      await createJpeg(64, 48),
      'blank.jpg',
      'image/jpeg',
      { mode: 'person' },
      provider,
    );
    try {
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        error: { code: 'NO_REMOVABLE_SUBJECT' },
      });
    } finally {
      await cleanup();
    }
  });
});
