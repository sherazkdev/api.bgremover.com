import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { detectOverlays } from '../../infrastructure/cv/overlay-detector.js';
import { packRgbChannels } from '../../infrastructure/image/image.processor.js';
import {
  createEnglishCaption,
  createGraphicPoster,
  createPersonWithTextOverlay,
} from '../fixtures/create-test-image.js';

async function rgbFrom(buffer: Buffer): Promise<{ rgb: Uint8Array; width: number; height: number }> {
  const { data, info } = await sharp(buffer)
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    rgb: packRgbChannels(data, info.width, info.height, info.channels),
    width: info.width,
    height: info.height,
  };
}

function regionCoverage(
  mask: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  let visible = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      total += 1;
      if ((mask[y * width + x] ?? 0) > 40) {
        visible += 1;
      }
    }
  }
  return total === 0 ? 0 : visible / total;
}

describe('overlay detector', () => {
  it('keeps colored cards and logos on a cream poster', async () => {
    const poster = await rgbFrom(await createGraphicPoster(240, 320));
    const overlays = await detectOverlays(poster.rgb, poster.width, poster.height);
    const union = overlays.backgroundSubtractMask;
    expect(overlays.analysis.graphicScore).toBeGreaterThan(0.35);
    expect(overlays.analysis.nonBackgroundCoverage).toBeGreaterThan(0.12);
    expect(regionCoverage(union, poster.width, 20, 70, 220, 110)).toBeGreaterThan(0.5);
    expect(regionCoverage(union, poster.width, 10, 15, 70, 55)).toBeGreaterThan(0.35);
  });

  it('finds a caption bar placed over a person-like region', async () => {
    const image = await rgbFrom(await createPersonWithTextOverlay());
    const overlays = await detectOverlays(image.rgb, image.width, image.height);
    expect(overlays.analysis.overlayCoverage + overlays.analysis.nonBackgroundCoverage).toBeGreaterThan(
      0.08,
    );
    expect(
      regionCoverage(overlays.textContainerMask, image.width, 30, 80, 130, 110) +
        regionCoverage(overlays.logoAndOverlayMask, image.width, 30, 80, 130, 110) +
        regionCoverage(overlays.backgroundSubtractMask, image.width, 30, 80, 130, 110),
    ).toBeGreaterThan(0.25);
  });

  it('keeps an English caption card', async () => {
    const image = await rgbFrom(await createEnglishCaption());
    const overlays = await detectOverlays(image.rgb, image.width, image.height);
    expect(overlays.analysis.nonBackgroundCoverage).toBeGreaterThan(0.1);
    expect(regionCoverage(overlays.backgroundSubtractMask, image.width, 20, 40, 180, 80)).toBeGreaterThan(
      0.4,
    );
  });
});
