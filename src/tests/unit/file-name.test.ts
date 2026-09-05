import { describe, expect, it } from 'vitest';

import {
  assertSafeExtension,
  buildDatedRelativePath,
  generateImageId,
  normalizeExtension,
  sanitizeContentDispositionFilename,
} from '../../shared/utils/file-name.js';

describe('file-name utilities', () => {
  it('generates UUID filenames', () => {
    const id = generateImageId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('normalizes jpeg to jpg', () => {
    expect(normalizeExtension('JPEG')).toBe('jpg');
    expect(normalizeExtension('.png')).toBe('png');
  });

  it('builds dated upload paths from server-side ids only', () => {
    const date = new Date(Date.UTC(2026, 8, 1));
    const relative = buildDatedRelativePath(
      'originals',
      '550e8400-e29b-41d4-a716-446655440000',
      'jpg',
      date,
    );
    expect(relative).toBe('originals/2026/09/550e8400-e29b-41d4-a716-446655440000.jpg');
    expect(buildDatedRelativePath('archives', '550e8400-e29b-41d4-a716-446655440000', 'zip', date)).toBe(
      'archives/2026/09/550e8400-e29b-41d4-a716-446655440000.zip',
    );
  });

  it('strips client path segments from the id', () => {
    const date = new Date(Date.UTC(2026, 8, 1));
    const relative = buildDatedRelativePath('processed', '../evil/id', 'png', date);
    expect(relative).toBe('processed/2026/09/id.png');
    expect(relative.includes('..')).toBe(false);
  });

  it('rejects unsafe extensions', () => {
    expect(() => assertSafeExtension('svg')).toThrow(/Unsafe file extension/);
    expect(() => assertSafeExtension('exe')).toThrow();
  });

  it('sanitizes content-disposition filenames', () => {
    expect(sanitizeContentDispositionFilename('a/b\\c.png')).toBe('c.png');
    expect(sanitizeContentDispositionFilename('photo; filename=hi.png')).toBe(
      'photo__filename_hi.png',
    );
  });
});
