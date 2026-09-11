import { chebyshev, luminance, readRgb } from './color.js';
import {
  defringeAgainstPapers,
  estimatePaperColors,
  refineGraphicCutout,
  subtractPaperBackground,
} from './graphic-matte.js';
import type { PreservationOptions } from './preservation-options.js';
import { dilate, maxMasks } from './morphology.js';
import type { OverlayMasks } from './types.js';

export function buildTextBackgroundMatte(
  rgb: Uint8Array,
  overlays: OverlayMasks,
  width: number,
  height: number,
  options: PreservationOptions,
): Uint8Array {
  const edges = buildEdgeMap(rgb, width, height);
  const { variance } = estimatePaperColors(rgb, width, height);
  const paperKeep = subtractPaperBackground(rgb, width, height, edges, variance);

  let ink = dilate(overlays.textMask, width, height, 1);
  if (options.preserveLogos) {
    ink = maxMasks([ink, overlays.logoAndOverlayMask]);
  }
  if (options.preserveTextContainers) {
    ink = maxMasks([ink, overlays.textContainerMask]);
  }

  const nearInk = dilate(ink, width, height, 3);
  const merged = new Uint8Array(ink.length);
  for (let index = 0; index < merged.length; index += 1) {
    const stroke = ink[index] ?? 0;
    const paper = (paperKeep[index] ?? 0) > 48 && (nearInk[index] ?? 0) > 48 ? paperKeep[index] ?? 0 : 0;
    merged[index] = Math.max(stroke, paper);
  }

  let matte = options.preserveTextContainers
    ? merged
    : stripContainerFill(merged, overlays.textMask, overlays.textContainerMask, width, height);

  matte = refineGraphicCutout(rgb, matte, width, height);
  const { colors } = estimatePaperColors(rgb, width, height);
  return defringeAgainstPapers(rgb, matte, width, height, colors, 22, 2);
}

function stripContainerFill(
  alpha: Uint8Array,
  textMask: Uint8Array,
  containerMask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const protectedInk = dilate(textMask, width, height, 2);
  const output = new Uint8Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    const inContainer = (containerMask[index] ?? 0) > 48;
    const protectedStroke = (protectedInk[index] ?? 0) > 48;
    if (inContainer && !protectedStroke) {
      output[index] = 0;
      continue;
    }
    output[index] = alpha[index] ?? 0;
  }
  return output;
}

function buildEdgeMap(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    const color = readRgb(rgb, index);
    gray[index] = Math.round(luminance(color.r, color.g, color.b));
  }
  const edges = new Uint8Array(gray.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const left = gray[index - 1] ?? 0;
      const right = gray[index + 1] ?? 0;
      const up = gray[index - width] ?? 0;
      const down = gray[index + width] ?? 0;
      edges[index] = Math.min(255, Math.abs(left - right) + Math.abs(up - down));
    }
  }
  return edges;
}

export function enhanceTextInk(
  rgb: Uint8Array,
  textMask: Uint8Array,
  _width: number,
  _height: number,
  background: { r: number; g: number; b: number },
): Uint8Array {
  const output = new Uint8Array(textMask);
  for (let index = 0; index < output.length; index += 1) {
    if ((textMask[index] ?? 0) < 48) {
      continue;
    }
    const distance = chebyshev(readRgb(rgb, index), background);
    if (distance > 18) {
      output[index] = 255;
    }
  }
  return output;
}
