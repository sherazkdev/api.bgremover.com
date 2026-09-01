import { describe, expect, it } from 'vitest';

import {
  ImageValidator,
  detectImageFormat,
  isRejectedBinaryType,
} from '../../infrastructure/image/image.validator.js';
import { parseEnv } from '../../config/env.js';
import {
  createCorruptJpeg,
  createEmptyFile,
  createGif,
  createJpeg,
  createPlainText,
  createPng,
  createSvg,
  createWebp,
} from '../fixtures/create-test-image.js';

const validator = new ImageValidator(
  parseEnv({
    API_KEY: 'test-api-key',
    MAX_FILE_SIZE_MB: '1',
    MAX_IMAGE_WIDTH: '100',
    MAX_IMAGE_HEIGHT: '100',
    MAX_IMAGE_PIXELS: '4000',
  }),
);

describe('detectImageFormat', () => {
  it('detects jpeg, png and webp signatures', async () => {
    expect(detectImageFormat(await createJpeg())).toBe('jpeg');
    expect(detectImageFormat(await createPng())).toBe('png');
    expect(detectImageFormat(await createWebp())).toBe('webp');
  });

  it('rejects unsupported signatures', () => {
    expect(detectImageFormat(createPlainText())).toBeNull();
    expect(detectImageFormat(createSvg())).toBeNull();
    expect(detectImageFormat(createGif())).toBeNull();
  });
});

describe('isRejectedBinaryType', () => {
  it('rejects svg, gif and empty files', () => {
    expect(isRejectedBinaryType(createSvg())).toBe(true);
    expect(isRejectedBinaryType(createGif())).toBe(true);
    expect(isRejectedBinaryType(createEmptyFile())).toBe(true);
  });
});

describe('ImageValidator', () => {
  it('accepts a valid jpeg and reports metadata', async () => {
    const image = await createJpeg(32, 24);
    const result = await validator.validate(image);
    expect(result.format).toBe('jpeg');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.width).toBe(32);
    expect(result.height).toBe(24);
    expect(result.size).toBe(image.byteLength);
  });

  it('rejects empty files as corrupt', async () => {
    await expect(validator.validate(createEmptyFile())).rejects.toMatchObject({
      code: 'CORRUPT_IMAGE',
      statusCode: 422,
    });
  });

  it('rejects unsupported types even when a client might claim image/jpeg', async () => {
    await expect(validator.validate(createPlainText())).rejects.toMatchObject({
      code: 'UNSUPPORTED_IMAGE_TYPE',
      statusCode: 415,
    });
    await expect(validator.validate(createSvg())).rejects.toMatchObject({
      code: 'UNSUPPORTED_IMAGE_TYPE',
    });
  });

  it('rejects corrupt jpeg payloads', async () => {
    await expect(validator.validate(createCorruptJpeg())).rejects.toMatchObject({
      code: 'CORRUPT_IMAGE',
      statusCode: 422,
    });
  });

  it('rejects images that exceed dimension limits', async () => {
    const image = await createPng(120, 20);
    await expect(validator.validate(image)).rejects.toMatchObject({
      code: 'IMAGE_DIMENSIONS_EXCEEDED',
      statusCode: 400,
    });
  });

  it('rejects images that exceed the pixel budget', async () => {
    const image = await createPng(80, 80);
    await expect(validator.validate(image)).rejects.toMatchObject({
      code: 'IMAGE_PIXEL_LIMIT_EXCEEDED',
      statusCode: 400,
    });
  });

  it('rejects files that exceed the configured byte limit', async () => {
    const huge = Buffer.concat([await createJpeg(32, 24), Buffer.alloc(2 * 1024 * 1024)]);
    await expect(validator.validate(huge)).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      statusCode: 413,
    });
  });
});
