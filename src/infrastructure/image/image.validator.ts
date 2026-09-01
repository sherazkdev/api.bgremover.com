import sharp from 'sharp';

import type { Env } from '../../config/env.js';
import {
  corruptImageError,
  fileTooLargeError,
  imageDimensionsExceededError,
  imagePixelLimitExceededError,
  unsupportedImageTypeError,
} from '../../shared/errors/app-error.js';

export type DetectedImageFormat = 'jpeg' | 'png' | 'webp';

export interface ValidatedImage {
  buffer: Buffer;
  format: DetectedImageFormat;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  size: number;
}

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export class ImageValidator {
  constructor(private readonly env: Env) {}

  public async validate(buffer: Buffer): Promise<ValidatedImage> {
    if (buffer.byteLength === 0) {
      throw corruptImageError('The uploaded file is empty');
    }

    const maxBytes = this.env.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (buffer.byteLength > maxBytes) {
      throw fileTooLargeError(this.env.MAX_FILE_SIZE_MB);
    }

    const detected = detectImageFormat(buffer);
    if (!detected) {
      throw unsupportedImageTypeError();
    }

    let metadata;
    try {
      metadata = await sharp(buffer, {
        failOn: 'error',
        limitInputPixels: this.env.MAX_IMAGE_PIXELS,
      }).metadata();
    } catch (error) {
      if (isPixelLimitError(error)) {
        throw imagePixelLimitExceededError(this.env.MAX_IMAGE_PIXELS);
      }
      throw corruptImageError();
    }

    const sharpFormat = normalizeSharpFormat(metadata.format);
    if (!sharpFormat || sharpFormat !== detected) {
      throw corruptImageError('Image contents do not match a supported format');
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width < 1 || height < 1) {
      throw corruptImageError('Image dimensions are missing');
    }

    if (width > this.env.MAX_IMAGE_WIDTH || height > this.env.MAX_IMAGE_HEIGHT) {
      throw imageDimensionsExceededError(this.env.MAX_IMAGE_WIDTH, this.env.MAX_IMAGE_HEIGHT);
    }

    if (width * height > this.env.MAX_IMAGE_PIXELS) {
      throw imagePixelLimitExceededError(this.env.MAX_IMAGE_PIXELS);
    }

    return {
      buffer,
      format: detected,
      mimeType: mimeTypeForDetectedFormat(detected),
      width,
      height,
      size: buffer.byteLength,
    };
  }
}

export function detectImageFormat(buffer: Buffer): DetectedImageFormat | null {
  if (matchesSignature(buffer, JPEG_SIGNATURE)) {
    return 'jpeg';
  }
  if (matchesSignature(buffer, PNG_SIGNATURE)) {
    return 'png';
  }
  if (isWebp(buffer)) {
    return 'webp';
  }
  return null;
}

export function isRejectedBinaryType(buffer: Buffer): boolean {
  if (buffer.byteLength === 0) {
    return true;
  }
  if (looksLikeSvg(buffer) || looksLikeGif(buffer) || looksLikeBmp(buffer)) {
    return true;
  }
  if (looksLikeTiff(buffer) || looksLikePdf(buffer) || looksLikeExecutable(buffer)) {
    return true;
  }
  return detectImageFormat(buffer) === null;
}

function matchesSignature(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.byteLength < signature.length) {
    return false;
  }
  return signature.every((byte, index) => buffer[index] === byte);
}

function isWebp(buffer: Buffer): boolean {
  if (buffer.byteLength < 12) {
    return false;
  }
  return (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  );
}

function looksLikeGif(buffer: Buffer): boolean {
  return buffer.byteLength >= 6 && buffer.subarray(0, 3).toString('ascii') === 'GIF';
}

function looksLikeBmp(buffer: Buffer): boolean {
  return buffer.byteLength >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d;
}

function looksLikeTiff(buffer: Buffer): boolean {
  if (buffer.byteLength < 4) {
    return false;
  }
  const le = buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;
  const be = buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;
  return le || be;
}

function looksLikePdf(buffer: Buffer): boolean {
  return buffer.byteLength >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function looksLikeExecutable(buffer: Buffer): boolean {
  if (buffer.byteLength >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return true;
  }
  return (
    buffer.byteLength >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  );
}

function looksLikeSvg(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 512).toString('utf8').trim().toLowerCase();
  return head.startsWith('<svg') || head.startsWith('<?xml') || head.includes('<svg');
}

function normalizeSharpFormat(format: string | undefined): DetectedImageFormat | null {
  if (format === 'jpeg' || format === 'jpg') {
    return 'jpeg';
  }
  if (format === 'png' || format === 'webp') {
    return format;
  }
  return null;
}

function mimeTypeForDetectedFormat(
  format: DetectedImageFormat,
): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (format === 'jpeg') {
    return 'image/jpeg';
  }
  if (format === 'png') {
    return 'image/png';
  }
  return 'image/webp';
}

function isPixelLimitError(error: unknown): boolean {
  return error instanceof Error && /pixel(s)? limit/i.test(error.message);
}
