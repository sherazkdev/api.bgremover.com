import { describe, expect, it } from 'vitest';

import { buildTextBackgroundMatte } from '../../infrastructure/cv/text-background-matte.js';
import type { OverlayMasks } from '../../infrastructure/cv/types.js';

function rgba(
  width: number,
  height: number,
  fill: [number, number, number],
  textPixels: number[] = [],
): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    rgb[index * 3] = fill[0];
    rgb[index * 3 + 1] = fill[1];
    rgb[index * 3 + 2] = fill[2];
  }
  for (const pixel of textPixels) {
    rgb[pixel * 3] = 0;
    rgb[pixel * 3 + 1] = 0;
    rgb[pixel * 3 + 2] = 0;
  }
  return rgb;
}

function overlays(textMask: Uint8Array): OverlayMasks {
  const empty = new Uint8Array(textMask.length);
  return {
    textMask,
    textContainerMask: empty,
    logoAndOverlayMask: empty,
    backgroundSubtractMask: empty,
    analysis: {
      textCoverage: 0.02,
      overlayCoverage: 0.02,
      nonBackgroundCoverage: 0.02,
      graphicScore: 0.9,
      isTextHeavy: true,
    },
  };
}

describe('buildTextBackgroundMatte', () => {
  it('keeps dark text strokes and removes a flat white background', () => {
    const width = 20;
    const height = 10;
    const textPixels = [55, 56, 57, 75, 76, 77];
    const rgb = rgba(width, height, [250, 250, 250], textPixels);
    const textMask = new Uint8Array(width * height);
    for (const pixel of textPixels) {
      textMask[pixel] = 255;
    }

    const matte = buildTextBackgroundMatte(rgb, overlays(textMask), width, height, {
      preserveText: true,
      preserveLogos: false,
      preserveTextContainers: false,
    });

    for (const pixel of textPixels) {
      expect(matte[pixel]).toBeGreaterThan(200);
    }
    expect(matte[0]).toBeLessThan(32);
    expect(matte[width * height - 1]).toBeLessThan(32);
  });
});
