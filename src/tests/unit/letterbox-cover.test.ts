import { describe, expect, it } from 'vitest';

import { computeCoverCrop, mapCoverMaskToSource } from '../../infrastructure/image/letterbox.js';

describe('cover crop model input', () => {
  it('uses a larger effective scale than contain for tall portraits', () => {
    const cover = computeCoverCrop(682, 1024, 512, 512);
    const containScale = Math.min(512 / 682, 512 / 1024);
    expect(cover.scale).toBeGreaterThan(containScale);
    expect(cover.scale).toBeCloseTo(512 / 682, 5);
  });

  it('maps a model mask back to the full source size', () => {
    const layout = computeCoverCrop(4, 8, 4, 4);
    const mask = Uint8Array.from([255, 0, 0, 255, 255, 255, 0, 0, 255, 255, 255, 255, 0, 0, 0, 255]);
    const mapped = mapCoverMaskToSource(mask, 4, 4, layout);
    expect(mapped.width).toBe(4);
    expect(mapped.height).toBe(8);
    expect(mapped.data.some((value) => value > 200)).toBe(true);
  });
});
