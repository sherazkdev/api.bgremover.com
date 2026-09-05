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

export async function createGraphicPoster(width = 240, height = 320): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#F3E6C8"/>
    <circle cx="${Math.round(width * 0.18)}" cy="${Math.round(height * 0.12)}" r="${Math.round(width * 0.09)}" fill="#1D4ED8"/>
    <circle cx="${Math.round(width * 0.82)}" cy="${Math.round(height * 0.12)}" r="${Math.round(width * 0.09)}" fill="#DC2626"/>
    <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.24)}" width="${Math.round(width * 0.84)}" height="${Math.round(height * 0.1)}" rx="8" fill="#E11D48"/>
    <rect x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.42)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.2)}" rx="8" fill="#CA8A04"/>
    <rect x="${Math.round(width * 0.39)}" y="${Math.round(height * 0.42)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.2)}" rx="8" fill="#16A34A"/>
    <rect x="${Math.round(width * 0.68)}" y="${Math.round(height * 0.42)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.2)}" rx="8" fill="#DB2777"/>
    <rect x="${Math.round(width * 0.12)}" y="${Math.round(height * 0.72)}" width="${Math.round(width * 0.76)}" height="${Math.round(height * 0.05)}" fill="#0F172A"/>
    <rect x="${Math.round(width * 0.2)}" y="${Math.round(height * 0.82)}" width="${Math.round(width * 0.6)}" height="${Math.round(height * 0.035)}" fill="#1E3A8A"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

export async function createPersonWithTextOverlay(
  width = 160,
  height = 200,
): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#87B5E8"/>
    <circle cx="${Math.round(width / 2)}" cy="${Math.round(height * 0.52)}" r="${Math.round(width * 0.28)}" fill="#E8B89A"/>
    <rect x="${Math.round(width * 0.18)}" y="${Math.round(height * 0.42)}" width="${Math.round(width * 0.64)}" height="${Math.round(height * 0.12)}" rx="6" fill="#FACC15"/>
    <rect x="${Math.round(width * 0.22)}" y="${Math.round(height * 0.45)}" width="${Math.round(width * 0.56)}" height="${Math.round(height * 0.06)}" fill="#111827"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function createTextBesidePerson(width = 180, height = 160): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#9AD0F5"/>
    <circle cx="${Math.round(width * 0.32)}" cy="${Math.round(height * 0.55)}" r="${Math.round(height * 0.28)}" fill="#E8B89A"/>
    <rect x="${Math.round(width * 0.58)}" y="${Math.round(height * 0.28)}" width="${Math.round(width * 0.36)}" height="${Math.round(height * 0.44)}" rx="10" fill="#16A34A"/>
    <rect x="${Math.round(width * 0.62)}" y="${Math.round(height * 0.36)}" width="${Math.round(width * 0.28)}" height="${Math.round(height * 0.08)}" fill="#FFFFFF"/>
    <rect x="${Math.round(width * 0.62)}" y="${Math.round(height * 0.5)}" width="${Math.round(width * 0.28)}" height="${Math.round(height * 0.08)}" fill="#FFFFFF"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function createUrduCard(width = 200, height = 120): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#F8F1DE"/>
    <rect x="16" y="24" width="168" height="72" rx="12" fill="#16A34A"/>
    <text x="100" y="68" text-anchor="middle" font-size="28" fill="#FFFFFF" font-family="Arial">سلام</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function createArabicCard(width = 200, height = 120): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#F8F1DE"/>
    <rect x="16" y="24" width="168" height="72" rx="12" fill="#1D4ED8"/>
    <text x="100" y="68" text-anchor="middle" font-size="28" fill="#FFFFFF" font-family="Arial">سلام</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function createEnglishCaption(width = 200, height = 120): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#E2E8F0"/>
    <rect x="18" y="36" width="164" height="48" rx="8" fill="#111827"/>
    <text x="100" y="68" text-anchor="middle" font-size="22" fill="#F8FAFC" font-family="Arial">HELLO</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function createTransparentPng(width = 64, height = 48): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inside = x > width * 0.25 && x < width * 0.75 && y > height * 0.2 && y < height * 0.8;
      pixels[offset] = 40;
      pixels[offset + 1] = 180;
      pixels[offset + 2] = 80;
      pixels[offset + 3] = inside ? 255 : 0;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

export async function createSemiTransparentOverlay(width = 160, height = 160): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#F8F1DE"/>
    <circle cx="${Math.round(width / 2)}" cy="${Math.round(height / 2)}" r="${Math.round(width * 0.28)}" fill="#1D4ED8" fill-opacity="0.45"/>
    <rect x="${Math.round(width * 0.15)}" y="${Math.round(height * 0.72)}" width="${Math.round(width * 0.7)}" height="18" fill="#111827"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
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
