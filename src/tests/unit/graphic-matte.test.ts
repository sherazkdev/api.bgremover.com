import { describe, expect, it } from 'vitest';

import {
  isTextHeavyLayout,
  refineGraphicCutout,
  subtractPaperBackground,
} from '../../infrastructure/cv/graphic-matte.js';

describe('graphic matte', () => {
  it('removes a two-tone paper border and keeps ink', () => {
    const width = 24;
    const height = 24;
    const rgb = new Uint8Array(width * height * 3);
    const edges = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const header = y < 6;
        rgb[index * 3] = header ? 230 : 210;
        rgb[index * 3 + 1] = header ? 190 : 200;
        rgb[index * 3 + 2] = header ? 80 : 170;
      }
    }
    for (let y = 10; y <= 14; y += 1) {
      for (let x = 6; x <= 17; x += 1) {
        const index = y * width + x;
        rgb[index * 3] = 20;
        rgb[index * 3 + 1] = 20;
        rgb[index * 3 + 2] = 20;
        edges[index] = 200;
      }
    }

    const keep = subtractPaperBackground(rgb, width, height, edges, 18);
    expect(keep[2 * width + 12]).toBe(0);
    expect(keep[12 * width + 10]).toBe(255);
  });

  it('flags a poster with overlay in two bands as text-heavy', () => {
    const width = 12;
    const height = 12;
    const overlay = new Uint8Array(width * height);
    for (let x = 2; x < 10; x += 1) {
      overlay[1 * width + x] = 255;
      overlay[8 * width + x] = 255;
    }
    expect(isTextHeavyLayout(overlay, width, height, 0.6, 0.03, 0.1)).toBe(true);
    expect(isTextHeavyLayout(overlay, width, height, 0.2, 0.03, 0.1)).toBe(false);
  });

  it('clears paper pockets between ink and keeps a stroked badge fill', () => {
    const width = 28;
    const height = 28;
    const rgb = new Uint8Array(width * height * 3);
    const alpha = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        rgb[index * 3] = 236;
        rgb[index * 3 + 1] = 220;
        rgb[index * 3 + 2] = 190;
        alpha[index] = 255;
      }
    }
    for (let y = 8; y <= 11; y += 1) {
      for (let x = 4; x <= 23; x += 1) {
        const index = y * width + x;
        rgb[index * 3] = 18;
        rgb[index * 3 + 1] = 18;
        rgb[index * 3 + 2] = 18;
      }
    }
    for (let y = 16; y <= 23; y += 1) {
      for (let x = 16; x <= 23; x += 1) {
        const index = y * width + x;
        const ring = x === 16 || x === 23 || y === 16 || y === 23;
        rgb[index * 3] = ring ? 200 : 40;
        rgb[index * 3 + 1] = ring ? 30 : 80;
        rgb[index * 3 + 2] = ring ? 30 : 200;
      }
    }

    const cleaned = refineGraphicCutout(rgb, alpha, width, height);
    expect(cleaned[2 * width + 4]).toBe(0);
    expect(cleaned[13 * width + 10]).toBe(0);
    expect(cleaned[9 * width + 10]).toBeGreaterThan(180);
    expect(cleaned[19 * width + 19]).toBeGreaterThan(180);
  });
});
