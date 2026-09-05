import { inflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { createZipBuffer, sanitizeZipName } from '../../shared/utils/zip.js';

describe('zip utilities', () => {
  it('sanitizes entry names', () => {
    expect(sanitizeZipName('../a/b photo.png')).toBe('b_photo.png');
    expect(sanitizeZipName('')).toBe('file');
  });

  it('creates a readable zip archive', () => {
    const zip = createZipBuffer([
      { name: 'one.png', data: Buffer.from('hello-one') },
      { name: 'two.png', data: Buffer.from('hello-two') },
    ]);
    expect(zip.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(zip.includes(Buffer.from('one.png'))).toBe(true);
    expect(zip.includes(Buffer.from('two.png'))).toBe(true);
    expect(inflateFirstEntry(zip).toString()).toBe('hello-one');
  });
});

function inflateFirstEntry(zip: Buffer): Buffer {
  const nameLength = zip.readUInt16LE(26);
  const extraLength = zip.readUInt16LE(28);
  const compressedSize = zip.readUInt32LE(18);
  const start = 30 + nameLength + extraLength;
  return inflateRawSync(zip.subarray(start, start + compressedSize));
}
