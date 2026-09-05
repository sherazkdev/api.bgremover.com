import { describe, expect, it } from 'vitest';

import { fuseForegroundMasks, shouldUseGraphicPath } from '../../infrastructure/cv/mask-fusion.js';
import type { OverlayMasks } from '../../infrastructure/cv/types.js';

function overlays(length: number, fill = 0): OverlayMasks {
  const mask = new Uint8Array(length).fill(fill);
  return {
    textMask: new Uint8Array(mask),
    textContainerMask: new Uint8Array(mask),
    logoAndOverlayMask: new Uint8Array(mask),
    backgroundSubtractMask: new Uint8Array(mask),
    analysis: {
      background: { r: 240, g: 230, b: 200 },
      backgroundVariance: 8,
      graphicScore: fill > 0 ? 0.7 : 0.2,
      textCoverage: fill > 0 ? 0.2 : 0,
      containerCoverage: fill > 0 ? 0.2 : 0,
      overlayCoverage: fill > 0 ? 0.3 : 0,
      nonBackgroundCoverage: fill > 0 ? 0.4 : 0,
    },
  };
}

describe('mask fusion', () => {
  it('keeps the brighter of subject and text masks', () => {
    const subject = Uint8Array.from([0, 200, 0, 0]);
    const overlay = overlays(4);
    overlay.textMask[0] = 255;
    const fused = fuseForegroundMasks({
      subjectMask: subject,
      overlays: overlay,
      width: 2,
      height: 2,
      mode: 'person',
      preserveText: true,
    });
    expect(fused.alpha[0]).toBeGreaterThan(200);
    expect(fused.alpha[1]).toBeGreaterThan(180);
    expect(fused.textPreserved).toBe(true);
  });

  it('throws when a person cutout would be empty', () => {
    expect(() =>
      fuseForegroundMasks({
        subjectMask: new Uint8Array(16),
        overlays: overlays(16),
        width: 4,
        height: 4,
        mode: 'person',
        preserveText: true,
      }),
    ).toThrow(/No removable background/);
  });

  it('uses the graphic path for posters and documents', () => {
    expect(
      shouldUseGraphicPath({
        mode: 'graphic',
        subjectCoverage: 0,
        overlayCoverage: 0.4,
        graphicScore: 0.8,
        nonBackgroundCoverage: 0.5,
      }),
    ).toBe(true);
    expect(
      shouldUseGraphicPath({
        mode: 'auto',
        subjectCoverage: 0.4,
        overlayCoverage: 0.02,
        graphicScore: 0.2,
        nonBackgroundCoverage: 0.1,
      }),
    ).toBe(false);
  });
});
