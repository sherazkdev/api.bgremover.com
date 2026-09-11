import { describe, expect, it } from 'vitest';

import { defringeAlpha } from '../../infrastructure/cv/defringe.js';

describe('defringeAlpha', () => {
  it('removes a white halo on the object edge without eating the interior', () => {
    const width = 6;
    const height = 6;
    const rgb = new Uint8Array(width * height * 3);
    const alpha = new Uint8Array(width * height);

    for (let y = 1; y <= 4; y += 1) {
      for (let x = 1; x <= 4; x += 1) {
        const index = y * width + x;
        const edge = x === 1 || x === 4 || y === 1 || y === 4;
        rgb[index * 3] = edge ? 250 : 40;
        rgb[index * 3 + 1] = edge ? 250 : 90;
        rgb[index * 3 + 2] = edge ? 250 : 30;
        alpha[index] = 255;
      }
    }

    const cleaned = defringeAlpha(rgb, alpha, width, height, { r: 255, g: 255, b: 255 });
    expect(cleaned[2 * width + 2]).toBe(255);
    expect(cleaned[1 * width + 1]).toBe(0);
    expect(cleaned[1 * width + 3]).toBe(0);
  });
});
