import { describe, expect, it } from 'vitest';

import { restoreHairAgainstBackground } from '../../infrastructure/cv/person-matte.js';

describe('restoreHairAgainstBackground', () => {
  it('fills a missing hair band above the face on a bright studio backdrop', () => {
    const width = 12;
    const height = 16;
    const rgb = new Uint8Array(width * height * 3);
    const alpha = new Uint8Array(width * height);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        rgb[index * 3] = 90;
        rgb[index * 3 + 1] = 210;
        rgb[index * 3 + 2] = 180;
      }
    }

    for (let y = 1; y <= 5; y += 1) {
      for (let x = 3; x <= 8; x += 1) {
        const index = y * width + x;
        rgb[index * 3] = 18;
        rgb[index * 3 + 1] = 14;
        rgb[index * 3 + 2] = 12;
      }
    }

    fillRect(alpha, width, 3, 6, 8, 15, 255);
    for (let y = 6; y <= 8; y += 1) {
      for (let x = 3; x <= 8; x += 1) {
        const index = y * width + x;
        rgb[index * 3] = 180;
        rgb[index * 3 + 1] = 130;
        rgb[index * 3 + 2] = 110;
      }
    }

    const restored = restoreHairAgainstBackground(
      rgb,
      alpha,
      width,
      height,
      { r: 90, g: 210, b: 180 },
    );

    expect(restored[3 * width + 5]).toBe(255);
    expect(restored[12 * width + 5]).toBe(255);
    expect(restored[3 * width + 1]).toBe(0);
  });
});

function fillRect(
  mask: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: number,
): void {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      mask[y * width + x] = value;
    }
  }
}
