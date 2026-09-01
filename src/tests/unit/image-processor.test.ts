import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { ImageProcessor, packRgbChannels } from '../../infrastructure/image/image.processor.js';
import { createJpeg } from '../fixtures/create-test-image.js';

const processor = new ImageProcessor();

describe('packRgbChannels', () => {
  it('copies tightly packed RGB without sharing the source buffer', () => {
    const source = Buffer.from([10, 20, 30, 40, 50, 60, 99]);
    const packed = packRgbChannels(source, 2, 1, 3);
    expect(packed).toEqual(Uint8Array.from([10, 20, 30, 40, 50, 60]));
    source[0] = 1;
    expect(packed[0]).toBe(10);
  });

  it('expands grayscale into RGB', () => {
    expect(packRgbChannels(Uint8Array.from([7, 8]), 2, 1, 1)).toEqual(
      Uint8Array.from([7, 7, 7, 8, 8, 8]),
    );
  });
});

describe('ImageProcessor.applySoftAlphaMask', () => {
  it('joins one grayscale channel onto sRGB RGB without shifting the mask', async () => {
    const oriented = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .png()
      .toBuffer();
    const matte = {
      data: Uint8Array.from([255, 0, 0, 0]),
      width: 2,
      height: 2,
    };
    const result = await processor.applySoftAlphaMask({
      orientedImage: oriented,
      matte,
      quality: 'fast',
      format: 'png',
      width: 8,
      height: 8,
    });
    const { data, info } = await sharp(result.buffer).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    expect(info.width).toBe(8);
    expect(info.height).toBe(8);
    expect(info.channels).toBe(4);
    expect(data[3]).toBeGreaterThan(200);
    expect(data[(7 * 8 + 7) * 4 + 3]).toBeLessThan(20);
  });

  it('rejects a float32-sized buffer used as a 1-channel mask', async () => {
    const oriented = await createJpeg(8, 8);
    await expect(
      processor.applySoftAlphaMask({
        orientedImage: oriented,
        matte: { data: new Uint8Array(2 * 2 * 4), width: 2, height: 2 },
        quality: 'fast',
        format: 'png',
        width: 8,
        height: 8,
      }),
    ).rejects.toMatchObject({ code: 'BACKGROUND_REMOVAL_FAILED' });
  });
});

describe('ImageProcessor.prepareModelInput', () => {
  it('always resizes to the model input as packed RGB', async () => {
    const jpeg = await createJpeg(80, 40);
    const input = await processor.prepareModelInput(jpeg, 'fast', 32, 16);
    expect(input.width).toBe(32);
    expect(input.height).toBe(16);
    expect(input.pixels.length).toBe(32 * 16 * 3);
    expect(input.letterbox).toMatchObject({
      contentWidth: 32,
      contentHeight: 16,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('converts grayscale sources to three channels', async () => {
    const gray = await sharp({
      create: {
        width: 20,
        height: 10,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .grayscale()
      .png()
      .toBuffer();
    const input = await processor.prepareModelInput(gray, 'hd', 8, 8);
    expect(input.width).toBe(8);
    expect(input.height).toBe(8);
    expect(input.pixels.length).toBe(8 * 8 * 3);
    expect(input.letterbox.offsetY).toBeGreaterThan(0);
    const center = ((input.letterbox.offsetY + 1) * 8 + 4) * 3;
    expect(input.pixels[center]).toBeGreaterThan(100);
    expect(input.pixels[center + 1]).toBe(input.pixels[center]);
    expect(input.pixels[center + 2]).toBe(input.pixels[center]);
  });
});
