import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../../app.js';
import { ModelManager, resetSharedModelManager } from '../../infrastructure/ai/model-manager.js';
import { BiRefNetProvider } from '../../infrastructure/ai/birefnet.provider.js';
import { createMultipartPayload } from '../fixtures/create-test-image.js';
import { createTempUploadRoot, createTestEnv } from '../fixtures/test-app.js';

const enabled = process.env.RUN_E2E === '1';
const portraitPath = fileURLToPath(new URL('../fixtures/portrait-960x1280.jpg', import.meta.url));

describe.skipIf(!enabled)('end-to-end BiRefNet inference', () => {
  it('keeps the 960x1280 portrait subject intact without stripe artifacts', async () => {
    resetSharedModelManager();
    const temp = await createTempUploadRoot();
    const env = createTestEnv(temp.uploadRoot);
    process.env.DEBUG_BG_MASK = '1';
    const modelManager = new ModelManager(new BiRefNetProvider(env));
    await modelManager.initialize();
    const app = await buildApp({
      env,
      logger: false,
      dependencies: { modelManager },
    });

    try {
      const image = await readFile(portraitPath);
      const multipart = createMultipartPayload({
        fields: { format: 'png', quality: 'hd', responseMode: 'json' },
        files: [
          {
            fieldname: 'image',
            filename: 'portrait-960x1280.jpg',
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
        data: {
          original: { width: number; height: number };
          result: { url: string; width: number; height: number; hasTransparency: boolean };
        };
      };
      expect(body.data.original.width).toBe(960);
      expect(body.data.original.height).toBe(1280);
      expect(body.data.result.width).toBe(960);
      expect(body.data.result.height).toBe(1280);

      const processedRelative = new URL(body.data.result.url).pathname.replace(/^\/uploads\//, '');
      const processedPath = path.join(env.UPLOAD_ROOT, processedRelative);
      const { data, info } = await sharp(processedPath).ensureAlpha().raw().toBuffer({
        resolveWithObject: true,
      });
      expect(info.width).toBe(960);
      expect(info.height).toBe(1280);
      expect(info.channels).toBe(4);

      const alpha = new Uint8Array(info.width * info.height);
      for (let index = 0; index < alpha.length; index += 1) {
        alpha[index] = data[index * 4 + 3] ?? 0;
      }

      expect(sampleAlpha(alpha, 960, 30, 30)).toBeLessThan(40);
      expect(sampleAlpha(alpha, 960, 930, 30)).toBeLessThan(40);
      expect(sampleAlpha(alpha, 960, 480, 430)).toBeGreaterThan(220);
      expect(sampleAlpha(alpha, 960, 480, 260)).toBeGreaterThan(180);
      expect(sampleAlpha(alpha, 960, 480, 900)).toBeGreaterThan(220);

      const range = minMax(alpha);
      expect(range.min).toBeLessThanOrEqual(15);
      expect(range.max).toBeGreaterThanOrEqual(240);
      expect(hasHorizontalStripes(alpha, 960, 1280)).toBe(false);
      expect(alphaBoundingBoxTop(alpha, 960, 1280)).toBeLessThan(260);

      const checkerboard = await compositeCheckerboard(processedPath, 960, 1280);
      await sharp(checkerboard).toFile(path.join(temp.uploadRoot, 'e2e-checkerboard.png'));
    } finally {
      delete process.env.DEBUG_BG_MASK;
      await app.close();
      await temp.cleanup();
      resetSharedModelManager();
    }
  }, 180_000);
});

function sampleAlpha(alpha: Uint8Array, width: number, x: number, y: number): number {
  return alpha[y * width + x] ?? 0;
}

function minMax(values: Uint8Array): { min: number; max: number } {
  let min = 255;
  let max = 0;
  for (const value of values) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  return { min, max };
}

function alphaBoundingBoxTop(alpha: Uint8Array, width: number, height: number): number {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((alpha[y * width + x] ?? 0) > 32) {
        return y;
      }
    }
  }
  return height;
}

function hasHorizontalStripes(alpha: Uint8Array, width: number, height: number): boolean {
  const y = Math.floor(height * 0.72);
  let flips = 0;
  for (let x = 1; x < width; x += 1) {
    const previous = alpha[y * width + x - 1] ?? 0;
    const current = alpha[y * width + x] ?? 0;
    if (Math.abs(previous - current) > 200) {
      flips += 1;
    }
  }
  return flips > width * 0.25;
}

async function compositeCheckerboard(
  processedPath: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const tile = 32;
  const cells = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const light = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0;
      const offset = (y * width + x) * 3;
      const value = light ? 220 : 40;
      cells[offset] = value;
      cells[offset + 1] = value;
      cells[offset + 2] = value;
    }
  }
  const background = await sharp(cells, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
  return sharp(background)
    .composite([{ input: processedPath, blend: 'over' }])
    .png()
    .toBuffer();
}
