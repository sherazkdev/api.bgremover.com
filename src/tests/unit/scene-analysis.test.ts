import { describe, expect, it } from 'vitest';

import {
  analyzeSceneBackground,
  isOutdoorLikeScene,
  resolveBackgroundVariance,
} from '../../infrastructure/cv/scene-analysis.js';

describe('scene-analysis', () => {
  it('derives border variance when overlay analysis is absent', () => {
    const rgb = new Uint8Array(64 * 64 * 3);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const index = (y * 64 + x) * 3;
        const onBorder = x < 4 || y < 4 || x >= 60 || y >= 60;
        rgb[index] = onBorder ? 20 : 200;
        rgb[index + 1] = onBorder ? 180 : 40;
        rgb[index + 2] = onBorder ? 240 : 60;
      }
    }
    const scene = analyzeSceneBackground(rgb, 64, 64);
    expect(scene.variance).toBeGreaterThanOrEqual(0);
    expect(resolveBackgroundVariance(0, rgb, 64, 64)).toBe(scene.variance);
    expect(resolveBackgroundVariance(55, rgb, 64, 64)).toBe(55);
  });

  it('prefers overlay variance when already computed', () => {
    expect(resolveBackgroundVariance(52, new Uint8Array(12), 2, 2)).toBe(52);
  });
});
