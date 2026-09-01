import { writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

import type { OutputFormat, QualityMode } from '../../config/constants.js';
import { AppError, backgroundRemovalFailedError } from '../../shared/errors/app-error.js';
import { assertGrayscaleMask, copyUint8, logMaskDiagnostics, minMax, refineAlphaMatte } from '../ai/mask.js';
import type { AlphaMatte } from '../ai/types.js';
import { computeLetterbox, IMAGENET_PAD_RGB, type LetterboxLayout } from './letterbox.js';

configureSharpRuntime();

export interface OrientedImage {
  buffer: Buffer;
  rgb: Uint8Array;
  width: number;
  height: number;
}

export interface CompositeResult {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/png' | 'image/webp';
  hasTransparency: boolean;
}

export class ImageProcessor {
  public async orientAndDecode(input: Buffer): Promise<OrientedImage> {
    try {
      const { data, info } = await sharp(input)
        .rotate()
        .toColourspace('srgb')
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (info.width < 1 || info.height < 1) {
        throw backgroundRemovalFailedError('Oriented image is missing dimensions');
      }
      const rgb = packRgbChannels(data, info.width, info.height, info.channels);
      return {
        buffer: input,
        rgb,
        width: info.width,
        height: info.height,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Oriented image')) {
        throw error;
      }
      throw backgroundRemovalFailedError();
    }
  }

  public async prepareModelInput(
    orientedImage: Buffer | { rgb: Uint8Array; width: number; height: number },
    quality: QualityMode,
    modelWidth: number,
    modelHeight: number,
  ): Promise<{ pixels: Uint8Array; width: number; height: number; letterbox: LetterboxLayout }> {
    const kernel = quality === 'hd' ? 'lanczos3' : 'cubic';
    let sourceWidth: number;
    let sourceHeight: number;
    let pipeline: ReturnType<typeof sharp>;

    if (isRawRgb(orientedImage)) {
      sourceWidth = orientedImage.width;
      sourceHeight = orientedImage.height;
      pipeline = sharp(orientedImage.rgb, {
        raw: { width: orientedImage.width, height: orientedImage.height, channels: 3 },
      });
    } else {
      const meta = await sharp(orientedImage).rotate().metadata();
      sourceWidth = meta.width ?? modelWidth;
      sourceHeight = meta.height ?? modelHeight;
      pipeline = sharp(orientedImage).rotate().toColourspace('srgb').removeAlpha();
    }

    const letterbox = computeLetterbox(sourceWidth, sourceHeight, modelWidth, modelHeight);

    const padRight = modelWidth - letterbox.contentWidth - letterbox.offsetX;
    const padBottom = modelHeight - letterbox.contentHeight - letterbox.offsetY;
    const { data, info } = await pipeline
      .resize(letterbox.contentWidth, letterbox.contentHeight, { fit: 'fill', kernel })
      .extend({
        top: letterbox.offsetY,
        bottom: padBottom,
        left: letterbox.offsetX,
        right: padRight,
        background: IMAGENET_PAD_RGB,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      pixels: packRgbChannels(data, info.width, info.height, info.channels),
      width: info.width,
      height: info.height,
      letterbox: {
        ...letterbox,
        canvasWidth: info.width,
        canvasHeight: info.height,
      },
    };
  }

  public async applySoftAlphaMask(options: {
    orientedImage?: Buffer;
    rgb?: Uint8Array;
    matte: AlphaMatte;
    quality: QualityMode;
    format: OutputFormat;
    width: number;
    height: number;
  }): Promise<CompositeResult> {
    const { orientedImage, rgb: providedRgb, matte, quality, format, width, height } = options;

    try {
      const maskBytes = copyUint8(matte.data);
      assertGrayscaleMask(maskBytes, matte.width, matte.height, 1);

      const { data: resizedMask, info: maskInfo } = await sharp(maskBytes, {
        raw: { width: matte.width, height: matte.height, channels: 1 },
      })
        .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
        .toColourspace('b-w')
        .raw()
        .toBuffer({ resolveWithObject: true });
      assertGrayscaleMask(resizedMask, width, height, maskInfo.channels);
      const refinedMask = Buffer.from(refineAlphaMatte(copyUint8(resizedMask)));

      const rgb = providedRgb
        ? { data: providedRgb, info: { width, height, channels: 3 } }
        : await sharp(orientedImage)
            .rotate()
            .removeAlpha()
            .toColourspace('srgb')
            .raw()
            .toBuffer({ resolveWithObject: true });
      if (rgb.info.width !== width || rgb.info.height !== height) {
        throw backgroundRemovalFailedError(
          'Oriented image dimensions do not match the mask target',
        );
      }
      if (rgb.info.channels !== 3) {
        throw backgroundRemovalFailedError(
          'Oriented image must be 3-channel sRGB before joining alpha',
        );
      }

      logMaskDiagnostics('resized mask', {
        maskWidth: width,
        maskHeight: height,
        maskChannels: 1,
        maskByteLength: refinedMask.length,
        expectedMaskByteLength: width * height,
        originalOrientedImageWidth: width,
        originalOrientedImageHeight: height,
        minimum: minMax(refinedMask).min,
        maximum: minMax(refinedMask).max,
      });

      const composed = sharp(copyUint8(rgb.data), {
        raw: { width, height, channels: 3 },
      }).joinChannel(refinedMask, {
        raw: { width, height, channels: 1 },
      });

      const encoded =
        format === 'webp'
          ? await composed
              .webp({
                quality: quality === 'hd' ? 95 : 90,
                alphaQuality: 100,
                effort: quality === 'hd' ? 4 : 2,
              })
              .toBuffer()
          : await composed.png({ compressionLevel: quality === 'hd' ? 6 : 3 }).toBuffer();

      if (shouldWriteDebugArtifacts()) {
        await writeDebugArtifacts(
          maskBytes,
          matte.width,
          matte.height,
          resizedMask,
          width,
          height,
          encoded,
        );
      }

      return {
        buffer: encoded,
        width,
        height,
        mimeType: format === 'webp' ? 'image/webp' : 'image/png',
        hasTransparency: hasSoftTransparency(refinedMask),
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown composite error';
      console.error(`Alpha composite failed: ${message}`);
      throw backgroundRemovalFailedError(message);
    }
  }

  public async encodeOriginal(
    orientedImage: Buffer,
    format: 'jpeg' | 'png' | 'webp',
  ): Promise<Buffer> {
    const pipeline = sharp(orientedImage);
    if (format === 'jpeg') {
      return pipeline.jpeg({ quality: 92 }).toBuffer();
    }
    if (format === 'png') {
      return pipeline.png({ compressionLevel: 3 }).toBuffer();
    }
    return pipeline.webp({ quality: 92, effort: 2 }).toBuffer();
  }
}

function isRawRgb(
  value: Buffer | { rgb: Uint8Array; width: number; height: number },
): value is { rgb: Uint8Array; width: number; height: number } {
  return !(value instanceof Buffer) && 'rgb' in value;
}

function configureSharpRuntime(): void {
  sharp.concurrency(Math.min(2, Math.max(1, availableParallelism())));
  sharp.cache({ files: 0, items: 20, memory: 64 });
}

export function packRgbChannels(
  data: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8Array {
  const pixels = width * height;
  const rgb = new Uint8Array(pixels * 3);

  if (channels === 3 && data.length >= rgb.length) {
    rgb.set(data.subarray(0, rgb.length));
    return rgb;
  }

  if (channels === 1) {
    for (let index = 0; index < pixels; index += 1) {
      const value = data[index] ?? 0;
      rgb[index * 3] = value;
      rgb[index * 3 + 1] = value;
      rgb[index * 3 + 2] = value;
    }
    return rgb;
  }

  if (channels === 2) {
    for (let index = 0; index < pixels; index += 1) {
      const value = data[index * 2] ?? 0;
      rgb[index * 3] = value;
      rgb[index * 3 + 1] = value;
      rgb[index * 3 + 2] = value;
    }
    return rgb;
  }

  if (channels === 4) {
    for (let index = 0; index < pixels; index += 1) {
      rgb[index * 3] = data[index * 4] ?? 0;
      rgb[index * 3 + 1] = data[index * 4 + 1] ?? 0;
      rgb[index * 3 + 2] = data[index * 4 + 2] ?? 0;
    }
    return rgb;
  }

  throw backgroundRemovalFailedError('Unsupported channel count for model input');
}

function shouldWriteDebugArtifacts(): boolean {
  return process.env.DEBUG_BG_MASK === '1';
}

async function writeDebugArtifacts(
  modelMask: Uint8Array,
  modelWidth: number,
  modelHeight: number,
  resizedMask: Buffer,
  width: number,
  height: number,
  resultPng: Buffer,
): Promise<void> {
  const modelPng = await sharp(modelMask, {
    raw: { width: modelWidth, height: modelHeight, channels: 1 },
  })
    .png()
    .toBuffer();
  const resizedPng = await sharp(resizedMask, {
    raw: { width, height, channels: 1 },
  })
    .png()
    .toBuffer();
  const magenta = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 255 } },
  })
    .composite([{ input: resultPng, blend: 'over' }])
    .png()
    .toBuffer();

  await Promise.all([
    writeFile(path.resolve(process.cwd(), 'debug-model-mask.png'), modelPng),
    writeFile(path.resolve(process.cwd(), 'debug-resized-mask.png'), resizedPng),
    writeFile(path.resolve(process.cwd(), 'debug-result-on-magenta.png'), magenta),
  ]);
}

function hasSoftTransparency(alpha: Buffer): boolean {
  for (let index = 0; index < alpha.length; index += 1) {
    const value = alpha[index] ?? 255;
    if (value < 255) {
      return true;
    }
  }
  return false;
}
