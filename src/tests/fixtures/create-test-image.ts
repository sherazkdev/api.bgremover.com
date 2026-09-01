import sharp from 'sharp';

import { TEST_API_KEY } from './test-api-key.js';

export async function createJpeg(width = 64, height = 48): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 220, g: 40, b: 40 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function createPng(width = 64, height = 48): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 180, b: 80 },
    },
  })
    .png()
    .toBuffer();
}

export async function createWebp(width = 64, height = 48): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 80, b: 220 },
    },
  })
    .webp({ quality: 90 })
    .toBuffer();
}

export function createCorruptJpeg(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00, 0x00]);
}

export function createPlainText(): Buffer {
  return Buffer.from('this is not an image');
}

export function createSvg(): Buffer {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
  );
}

export function createGif(): Buffer {
  return Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;');
}

export function createEmptyFile(): Buffer {
  return Buffer.alloc(0);
}

export function createOversizedBuffer(bytes: number): Buffer {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, bytes - header.length), 0x41)]);
}

export function createMultipartPayload(options: {
  fields?: Record<string, string>;
  files?: Array<{
    fieldname: string;
    filename: string;
    contentType: string;
    content: Buffer;
  }>;
}): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----VitestBoundary7MA4YWxkTrZu0gW';
  const chunks: Buffer[] = [];

  for (const [name, value] of Object.entries(options.fields ?? {})) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }

  for (const file of options.files ?? []) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
    );
    chunks.push(file.content);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'x-api-key': TEST_API_KEY,
    },
  };
}
