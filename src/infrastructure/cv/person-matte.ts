import { refineAlphaMatte } from '../ai/mask.js';
import {
  chebyshev,
  estimateBackgroundColor,
  luminance,
  readRgb,
  saturation,
  type RgbColor,
} from './color.js';
import { defringeAlpha } from './defringe.js';
import { coverage, erode } from './morphology.js';

export function refinePersonMatte(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const { color: background, variance } = estimateBackgroundColor(rgb, width, height);
  const outdoorLike = variance > 28;
  const holeLimit = outdoorLike
    ? Math.max(256, Math.round(width * height * 0.0012))
    : Math.max(64, Math.round(width * height * 0.00045));
  let refined = peelBackgroundLikeTopBand(rgb, alpha, width, height, background);
  if (coverage(alpha, 128) > 0.28) {
    refined = shrinkBloatedForeground(rgb, refined, width, height, background);
  }
  if (coverage(refined, 128) > 0.34) {
    refined = trimMarginBackground(rgb, refined, width, height, background);
    refined = peelExteriorForeground(rgb, refined, width, height, background);
  }
  refined = restoreHairAgainstBackground(rgb, refined, width, height, background);
  refined = fillInteriorBackgroundHoles(refined, width, height, holeLimit);
  const greenScreenLike =
    background.g > background.r + 18 && background.g > background.b + 12;
  if (!outdoorLike || greenScreenLike) {
    refined = defringeAlpha(
      rgb,
      refined,
      width,
      height,
      background,
      greenScreenLike ? 34 : 28,
    );
  }
  refined = refineAlphaMatte(refined);
  return refined;
}

function peelBackgroundLikeTopBand(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  background: RgbColor,
): Uint8Array {
  const output = new Uint8Array(alpha);
  const topBand = Math.round(height * 0.18);
  for (let y = 0; y < topBand; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if ((alpha[index] ?? 0) < 48) {
        continue;
      }
      if (chebyshev(readRgb(rgb, index), background) < 36) {
        output[index] = 0;
      }
    }
  }
  for (let index = topBand * width; index < alpha.length; index += 1) {
    output[index] = alpha[index] ?? 0;
  }
  return output;
}

function isBackgroundColoredPixel(
  rgb: Uint8Array,
  index: number,
  background: RgbColor,
): boolean {
  const color = readRgb(rgb, index);
  const lum = luminance(color.r, color.g, color.b);
  const sat = saturation(color.r, color.g, color.b);
  if (lum > 168 && sat < 0.16) {
    return false;
  }
  return chebyshev(color, background) < 38 && sat < 0.26;
}

function isPersonSeedPixel(rgb: Uint8Array, index: number, background: RgbColor): boolean {
  const color = readRgb(rgb, index);
  const lum = luminance(color.r, color.g, color.b);
  const sat = saturation(color.r, color.g, color.b);
  if (isBackgroundColoredPixel(rgb, index, background)) {
    return false;
  }
  const skinLike = sat > 0.05 && sat < 0.62 && lum > 30 && lum < 240;
  const hairLike = lum < 108 && sat < 0.4;
  const clothLike = sat > 0.12 || lum < 72 || lum > 165;
  return skinLike || hairLike || clothLike;
}

/** Drop outdoor false-foreground where the model kept sky/ground connected to the body. */
function shrinkBloatedForeground(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  background: RgbColor,
): Uint8Array {
  const binary = new Uint8Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    binary[index] = (alpha[index] ?? 0) >= 128 ? 255 : 0;
  }
  const radius = Math.max(2, Math.round(Math.min(width, height) * 0.005));
  const core = erode(binary, width, height, radius);
  const keep = new Uint8Array(alpha.length);
  const stack: number[] = [];

  for (let index = 0; index < alpha.length; index += 1) {
    if ((alpha[index] ?? 0) < 128) {
      continue;
    }
    if ((core[index] ?? 0) < 48 && !isPersonSeedPixel(rgb, index, background)) {
      continue;
    }
    keep[index] = 1;
    stack.push(index);
  }

  while (stack.length > 0) {
    const current = stack.pop() ?? 0;
    const x = current % width;
    const y = (current - x) / width;
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const;
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const next = ny * width + nx;
      if (keep[next] || (alpha[next] ?? 0) < 48) {
        continue;
      }
      if ((core[next] ?? 0) < 48 && isBackgroundColoredPixel(rgb, next, background)) {
        continue;
      }
      keep[next] = 1;
      stack.push(next);
    }
  }

  const output = new Uint8Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    output[index] = keep[index] ? (alpha[index] ?? 0) : 0;
  }
  return output;
}

/** Clear background-colored pixels along the inside edge of an oversized matte. */
function trimMarginBackground(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  background: RgbColor,
): Uint8Array {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((alpha[y * width + x] ?? 0) < 128) {
        continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) {
    return alpha;
  }
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const marginX = Math.max(2, Math.round(boxW * 0.12));
  const marginY = Math.max(2, Math.round(boxH * 0.12));
  const output = new Uint8Array(alpha);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const index = y * width + x;
      const onMargin =
        x <= minX + marginX ||
        x >= maxX - marginX ||
        y <= minY + marginY ||
        y >= maxY - marginY;
      if (!onMargin || (alpha[index] ?? 0) < 48) {
        continue;
      }
      if (isBackgroundColoredPixel(rgb, index, background)) {
        output[index] = 0;
      }
    }
  }
  return output;
}

function peelExteriorForeground(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  background: RgbColor,
): Uint8Array {
  const coreMinX = Math.floor(width * 0.28);
  const coreMaxX = Math.ceil(width * 0.72);
  const output = new Uint8Array(alpha.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = alpha[index] ?? 0;
      if (value < 48) {
        output[index] = value;
        continue;
      }
      const inCore = x >= coreMinX && x <= coreMaxX;
      if (inCore) {
        output[index] = value;
        continue;
      }
      const dist = chebyshev(readRgb(rgb, index), background);
      if (dist < 46 && isBackgroundColoredPixel(rgb, index, background)) {
        output[index] = 0;
        continue;
      }
      if (dist < 52 && !isPersonSeedPixel(rgb, index, background)) {
        output[index] = 0;
        continue;
      }
      output[index] = value;
    }
  }
  return output;
}

export function restoreHairAgainstBackground(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  background: RgbColor,
): Uint8Array {
  const output = new Uint8Array(alpha);
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let index = 0; index < alpha.length; index += 1) {
    if ((alpha[index] ?? 0) < 160) {
      continue;
    }
    const x = index % width;
    const y = (index - x) / width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (maxX < minX) {
    return output;
  }

  const bodyHeight = maxY - minY + 1;
  const bodyWidth = maxX - minX + 1;
  const headCx = (minX + maxX) / 2;
  const halfWidth = Math.max(4, Math.round(bodyWidth * 0.42));
  const searchBottom = Math.min(height - 1, minY + Math.round(bodyHeight * 0.28));
  const backgroundLum = luminance(background.r, background.g, background.b);

  const left = Math.max(0, Math.round(headCx - halfWidth));
  const right = Math.min(width - 1, Math.round(headCx + halfWidth));
  const candidates = new Uint8Array(alpha.length);

  for (let y = 0; y <= searchBottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const index = y * width + x;
      if ((output[index] ?? 0) >= 200) {
        continue;
      }
      const color = readRgb(rgb, index);
      if (chebyshev(color, background) < 38) {
        continue;
      }
      const lum = luminance(color.r, color.g, color.b);
      const sat = saturation(color.r, color.g, color.b);
      const looksLikeHair = lum < 96 && sat < 0.34 && lum + 40 < backgroundLum;
      if (!looksLikeHair) {
        continue;
      }
      candidates[index] = 1;
    }
  }

  const maxGrow = Math.max(6, Math.round(Math.min(width, height) * 0.04));
  for (let step = 0; step < maxGrow; step += 1) {
    let grew = false;
    for (let y = 0; y <= searchBottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const index = y * width + x;
        if (!candidates[index] || (output[index] ?? 0) >= 200) {
          continue;
        }
        if (!touchesOpaque(output, width, height, x, y)) {
          continue;
        }
        output[index] = 255;
        grew = true;
      }
    }
    if (!grew) {
      break;
    }
  }

  return output;
}

function touchesOpaque(
  alpha: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ] as const;
  for (const [nx, ny] of neighbors) {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
      continue;
    }
    if ((alpha[ny * width + nx] ?? 0) >= 200) {
      return true;
    }
  }
  return false;
}

export function fillInteriorBackgroundHoles(
  alpha: Uint8Array,
  width: number,
  height: number,
  maxHoleArea: number,
): Uint8Array {
  const background = new Uint8Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    background[index] = (alpha[index] ?? 0) < 32 ? 1 : 0;
  }

  const exterior = floodFromBorder(background, width, height);
  const output = new Uint8Array(alpha);
  const seen = new Uint8Array(alpha.length);
  const stack: number[] = [];

  for (let index = 0; index < alpha.length; index += 1) {
    if (!background[index] || seen[index] || exterior[index]) {
      continue;
    }

    stack.length = 0;
    stack.push(index);
    seen[index] = 1;
    const component: number[] = [];

    while (stack.length > 0) {
      const current = stack.pop() ?? 0;
      component.push(current);
      const x = current % width;
      const y = (current - x) / width;
      visitHole(x - 1, y, width, height, background, exterior, seen, stack);
      visitHole(x + 1, y, width, height, background, exterior, seen, stack);
      visitHole(x, y - 1, width, height, background, exterior, seen, stack);
      visitHole(x, y + 1, width, height, background, exterior, seen, stack);
    }

    if (component.length <= maxHoleArea) {
      for (const pixel of component) {
        output[pixel] = 255;
      }
    }
  }

  return output;
}

function floodFromBorder(passable: Uint8Array, width: number, height: number): Uint8Array {
  const filled = new Uint8Array(passable.length);
  const stack: number[] = [];
  const push = (x: number, y: number): void => {
    const index = y * width + x;
    if (!passable[index] || filled[index]) {
      return;
    }
    filled[index] = 1;
    stack.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length > 0) {
    const current = stack.pop() ?? 0;
    const x = current % width;
    const y = (current - x) / width;
    if (x > 0) push(x - 1, y);
    if (x + 1 < width) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < height) push(x, y + 1);
  }

  return filled;
}

function visitHole(
  x: number,
  y: number,
  width: number,
  height: number,
  background: Uint8Array,
  exterior: Uint8Array,
  seen: Uint8Array,
  stack: number[],
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const index = y * width + x;
  if (seen[index] || exterior[index] || !background[index]) {
    return;
  }
  seen[index] = 1;
  stack.push(index);
}
