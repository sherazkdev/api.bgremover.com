import { describe, expect, it } from 'vitest';

import {
  buildPublicUrl,
  contentDispositionForImage,
  mimeTypeForFormat,
  relativeUploadUrlPath,
} from '../../shared/utils/image-response.js';

describe('image response URLs', () => {
  it('builds public URLs without exposing filesystem roots', () => {
    const url = buildPublicUrl(
      'http://localhost:3000',
      'originals/2026/09/550e8400-e29b-41d4-a716-446655440000.jpg',
    );
    expect(url).toBe(
      'http://localhost:3000/uploads/originals/2026/09/550e8400-e29b-41d4-a716-446655440000.jpg',
    );
    expect(url.includes('C:')).toBe(false);
    expect(url.includes('/home/')).toBe(false);
  });

  it('does not duplicate the uploads prefix', () => {
    expect(buildPublicUrl('http://localhost:3000/', 'uploads/processed/2026/09/a.png')).toBe(
      'http://localhost:3000/uploads/processed/2026/09/a.png',
    );
  });

  it('maps formats to mime types', () => {
    expect(mimeTypeForFormat('png')).toBe('image/png');
    expect(mimeTypeForFormat('webp')).toBe('image/webp');
    expect(mimeTypeForFormat('jpg')).toBe('image/jpeg');
  });

  it('creates a safe content-disposition header', () => {
    expect(contentDispositionForImage('abc', 'png')).toBe(
      'inline; filename="background-removed-abc.png"',
    );
  });

  it('normalizes storage paths to public upload paths', () => {
    expect(relativeUploadUrlPath('processed/2026/09/a.png')).toBe(
      'uploads/processed/2026/09/a.png',
    );
  });
});
