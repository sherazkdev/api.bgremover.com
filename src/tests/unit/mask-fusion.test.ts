import { describe, expect, it } from 'vitest';

import {
  fuseForegroundMasks,
  shouldRouteToGraphicModel,
  shouldUseGraphicPath,
} from '../../infrastructure/cv/mask-fusion.js';
import type { PreservationOptions } from '../../infrastructure/cv/preservation-options.js';
import type { OverlayMasks } from '../../infrastructure/cv/types.js';

function preservation(overrides: Partial<PreservationOptions> = {}): PreservationOptions {
  return {
    preserveText: overrides.preserveText ?? true,
    preserveLogos: overrides.preserveLogos ?? true,
    preserveTextContainers: overrides.preserveTextContainers ?? true,
  };
}

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
      isTextHeavy: fill > 0,
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
      preservation: preservation(),
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
        preservation: preservation(),
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

  it('keeps BiRefNet for text-heavy auto layouts when a subject is already segmented', () => {
    expect(
      shouldUseGraphicPath({
        mode: 'auto',
        subjectCoverage: 0.4,
        overlayCoverage: 0.2,
        graphicScore: 0.7,
        nonBackgroundCoverage: 0.45,
        textHeavy: true,
      }),
    ).toBe(false);
    expect(
      shouldRouteToGraphicModel('auto', overlays(64, 255), new Uint8Array(64 * 3), 8, 8),
    ).toBe(false);
  });

  it('keeps BiRefNet for text-heavy auto layouts when a small subject is present', () => {
    expect(
      shouldUseGraphicPath({
        mode: 'auto',
        subjectCoverage: 0.08,
        overlayCoverage: 0.2,
        graphicScore: 0.7,
        nonBackgroundCoverage: 0.45,
        textHeavy: true,
      }),
    ).toBe(false);
  });

  it('uses the graphic path for text-heavy auto layouts without a subject', () => {
    expect(
      shouldUseGraphicPath({
        mode: 'auto',
        subjectCoverage: 0.04,
        overlayCoverage: 0.2,
        graphicScore: 0.7,
        nonBackgroundCoverage: 0.45,
        textHeavy: true,
      }),
    ).toBe(true);
  });

  it('ignores a BiRefNet header blob on a text-heavy poster', () => {
    const width = 16;
    const height = 16;
    const subject = new Uint8Array(width * height);
    fillRect(subject, width, 0, 0, 3, 0, 255);
    const overlay = overlays(width * height);
    fillRect(overlay.backgroundSubtractMask, width, 3, 6, 12, 12, 255);
    fillRect(overlay.textMask, width, 3, 6, 12, 9, 255);
    overlay.analysis.isTextHeavy = true;
    overlay.analysis.graphicScore = 0.7;
    overlay.analysis.overlayCoverage = 0.2;
    overlay.analysis.textCoverage = 0.08;
    overlay.analysis.nonBackgroundCoverage = 0.25;

    const fused = fuseForegroundMasks({
      subjectMask: subject,
      overlays: overlay,
      width,
      height,
      mode: 'auto',
      preservation: preservation(),
    });

    expect(fused.usedGraphicFallback).toBe(true);
    expect(fused.alpha[2 * width + 8]).toBeLessThan(40);
    expect(fused.alpha[8 * width + 8]).toBeGreaterThan(180);
  });

  it('does not switch auto to graphic when a real subject already exists', () => {
    expect(
      shouldUseGraphicPath({
        mode: 'auto',
        subjectCoverage: 0.35,
        overlayCoverage: 0.12,
        graphicScore: 0.82,
        nonBackgroundCoverage: 0.55,
      }),
    ).toBe(false);
    expect(
      shouldUseGraphicPath({
        mode: 'person',
        subjectCoverage: 0.2,
        overlayCoverage: 0.3,
        graphicScore: 0.9,
        nonBackgroundCoverage: 0.6,
      }),
    ).toBe(false);
  });

  it('drops a detached furniture blob that is not text or the main subject', () => {
    const width = 16;
    const height = 16;
    const subject = new Uint8Array(width * height);
    fillRect(subject, width, 4, 7, 11, 15, 255);
    fillRect(subject, width, 5, 0, 10, 2, 255);

    const overlay = overlays(width * height);
    const fused = fuseForegroundMasks({
      subjectMask: subject,
      overlays: overlay,
      width,
      height,
      mode: 'auto',
      preservation: preservation(),
    });

    expect(fused.alpha[9 * width + 7]).toBeGreaterThan(180);
    expect(fused.alpha[1 * width + 7]).toBeLessThan(40);
    expect(fused.usedGraphicFallback).toBe(false);
  });

  it('keeps dense hair that is not a full-width ceiling bar', () => {
    const width = 20;
    const height = 20;
    const subject = new Uint8Array(width * height);
    fillRect(subject, width, 7, 0, 13, 8, 255);
    fillRect(subject, width, 6, 8, 14, 19, 255);

    const fused = fuseForegroundMasks({
      subjectMask: subject,
      overlays: overlays(width * height),
      width,
      height,
      mode: 'auto',
      preservation: preservation(),
    });

    expect(fused.alpha[1 * width + 10]).toBeGreaterThan(180);
    expect(fused.alpha[12 * width + 10]).toBeGreaterThan(180);
  });

  it('drops a wide ceiling bar even when it touches the person', () => {
    const width = 20;
    const height = 20;
    const subject = new Uint8Array(width * height);
    fillRect(subject, width, 0, 0, 19, 3, 255);
    fillRect(subject, width, 6, 3, 13, 19, 255);

    const fused = fuseForegroundMasks({
      subjectMask: subject,
      overlays: overlays(width * height),
      width,
      height,
      mode: 'auto',
      preservation: preservation(),
    });

    expect(fused.alpha[1 * width + 10]).toBeLessThan(40);
    expect(fused.alpha[12 * width + 10]).toBeGreaterThan(180);
    expect(fused.usedGraphicFallback).toBe(false);
  });

  it('does not send a split text-and-photo banner to Graphic Cutout', () => {
    const width = 32;
    const height = 16;
    const rgb = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (x < 14) {
          rgb[index * 3] = 8;
          rgb[index * 3 + 1] = 8;
          rgb[index * 3 + 2] = 12;
        } else {
          rgb[index * 3] = 240;
          rgb[index * 3 + 1] = 90;
          rgb[index * 3 + 2] = 40;
        }
      }
    }
    const overlay = overlays(width * height, 255);
    expect(shouldRouteToGraphicModel('auto', overlay, rgb, width, height)).toBe(false);
  });

  it('drops overhead fixtures even when they were marked as logos', () => {
    const width = 16;
    const height = 16;
    const subject = new Uint8Array(width * height);
    fillRect(subject, width, 4, 7, 11, 15, 255);
    fillRect(subject, width, 3, 0, 12, 2, 255);

    const overlay = overlays(width * height);
    fillRect(overlay.logoAndOverlayMask, width, 3, 0, 12, 2, 255);
    overlay.analysis.overlayCoverage = 0.08;

    const fused = fuseForegroundMasks({
      subjectMask: subject,
      overlays: overlay,
      width,
      height,
      mode: 'auto',
      preservation: preservation(),
    });

    expect(fused.alpha[10 * width + 8]).toBeGreaterThan(180);
    expect(fused.alpha[1 * width + 8]).toBeLessThan(40);
  });

  it('keeps banner text and a dark person while dropping the sunset', () => {
    const width = 32;
    const height = 16;
    const rgb = new Uint8Array(width * height * 3);
    const subject = new Uint8Array(width * height);
    const overlay = overlays(width * height);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (x < 14) {
          rgb[index * 3] = 0;
          rgb[index * 3 + 1] = 0;
          rgb[index * 3 + 2] = 0;
        } else {
          rgb[index * 3] = 240;
          rgb[index * 3 + 1] = 90;
          rgb[index * 3 + 2] = 40;
          subject[index] = 255;
        }
      }
    }

    fillRect(subject, width, 24, 9, 27, 14, 255);
    for (let y = 9; y <= 14; y += 1) {
      for (let x = 24; x <= 27; x += 1) {
        const index = y * width + x;
        rgb[index * 3] = 18;
        rgb[index * 3 + 1] = 16;
        rgb[index * 3 + 2] = 20;
      }
    }

    fillRect(overlay.textMask, width, 2, 3, 11, 6, 255);
    overlay.analysis.textCoverage = 0.06;
    overlay.analysis.overlayCoverage = 0.06;
    overlay.analysis.isTextHeavy = true;
    overlay.analysis.graphicScore = 0.7;

    const fused = fuseForegroundMasks({
      subjectMask: subject,
      overlays: overlay,
      rgb,
      width,
      height,
      mode: 'auto',
      preservation: preservation(),
    });

    expect(fused.alpha[4 * width + 6]).toBeGreaterThan(180);
    expect(fused.alpha[12 * width + 25]).toBeGreaterThan(180);
    expect(fused.alpha[4 * width + 22]).toBeLessThan(40);
    expect(fused.usedGraphicFallback).toBe(false);
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
