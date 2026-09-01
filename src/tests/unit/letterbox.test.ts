import { describe, expect, it } from 'vitest';

import { computeLetterbox, cropLetterboxMask } from '../../infrastructure/image/letterbox.js';

describe('computeLetterbox', () => {
  it('pads a wide image into a square canvas', () => {
    const layout = computeLetterbox(1600, 1200, 512, 512);
    expect(layout.contentWidth).toBe(512);
    expect(layout.contentHeight).toBe(384);
    expect(layout.offsetX).toBe(0);
    expect(layout.offsetY).toBe(64);
  });

  it('keeps a matching aspect ratio unpadded', () => {
    const layout = computeLetterbox(80, 40, 32, 16);
    expect(layout).toMatchObject({
      contentWidth: 32,
      contentHeight: 16,
      offsetX: 0,
      offsetY: 0,
    });
  });
});

describe('cropLetterboxMask', () => {
  it('extracts the content window from a padded mask', () => {
    const layout = computeLetterbox(4, 2, 4, 4);
    const mask = new Uint8Array(16);
    mask.set([9, 8, 7, 6], 4);
    mask.set([5, 4, 3, 2], 8);
    const cropped = cropLetterboxMask(mask, layout);
    expect(cropped.width).toBe(4);
    expect(cropped.height).toBe(2);
    expect(cropped.data).toEqual(Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2]));
  });
});
