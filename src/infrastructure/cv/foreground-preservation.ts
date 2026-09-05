import sharp from 'sharp';

import type { RemovalMode } from '../../config/constants.js';
import type { AlphaMatte } from '../ai/types.js';
import { fuseForegroundMasks } from './mask-fusion.js';
import { detectOverlays } from './overlay-detector.js';
import type { FusedForeground } from './types.js';

export interface PreserveForegroundInput {
  rgb: Uint8Array;
  width: number;
  height: number;
  subjectMatte: AlphaMatte;
  mode: RemovalMode;
  preserveText: boolean;
}

export class ForegroundPreserver {
  public detectIfNeeded(
    rgb: Uint8Array,
    width: number,
    height: number,
    mode: RemovalMode,
    preserveText: boolean,
  ): Promise<Awaited<ReturnType<typeof detectOverlays>> | null> {
    if (!preserveText && (mode === 'person' || mode === 'product')) {
      return Promise.resolve(null);
    }
    return detectOverlays(rgb, width, height);
  }

  public async fuse(
    subjectMatte: AlphaMatte,
    overlays: Awaited<ReturnType<typeof detectOverlays>> | null,
    width: number,
    height: number,
    mode: RemovalMode,
    preserveText: boolean,
  ): Promise<FusedForeground> {
    const subjectMask = await resizeMaskTo(
      subjectMatte.data,
      subjectMatte.width,
      subjectMatte.height,
      width,
      height,
    );
    return fuseForegroundMasks({
      subjectMask,
      overlays: overlays ?? emptyOverlays(subjectMask.length),
      width,
      height,
      mode,
      preserveText,
    });
  }

  public async preserve(input: PreserveForegroundInput): Promise<FusedForeground> {
    const overlays = await this.detectIfNeeded(
      input.rgb,
      input.width,
      input.height,
      input.mode,
      input.preserveText,
    );
    return this.fuse(
      input.subjectMatte,
      overlays,
      input.width,
      input.height,
      input.mode,
      input.preserveText,
    );
  }
}

async function resizeMaskTo(
  data: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (sourceWidth === width && sourceHeight === height) {
    return new Uint8Array(data);
  }
  const { data: resized, info } = await sharp(data, {
    raw: { width: sourceWidth, height: sourceHeight, channels: 1 },
  })
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || resized.length !== width * height) {
    const single = new Uint8Array(width * height);
    const channels = Math.max(1, info.channels);
    for (let index = 0; index < single.length; index += 1) {
      single[index] = resized[index * channels] ?? 0;
    }
    return single;
  }
  return new Uint8Array(resized);
}

function emptyOverlays(length: number) {
  const empty = new Uint8Array(length);
  return {
    textMask: empty,
    textContainerMask: empty,
    logoAndOverlayMask: empty,
    backgroundSubtractMask: empty,
    analysis: {
      background: { r: 0, g: 0, b: 0 },
      backgroundVariance: 0,
      graphicScore: 0,
      textCoverage: 0,
      containerCoverage: 0,
      overlayCoverage: 0,
      nonBackgroundCoverage: 0,
    },
  };
}
