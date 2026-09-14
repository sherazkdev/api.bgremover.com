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

export function refinePersonMatte(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const holeLimit = Math.max(12, Math.round(width * height * 0.00015));
  const { color: background } = estimateBackgroundColor(rgb, width, height);
  let refined = restoreHairAgainstBackground(rgb, alpha, width, height, background);
  refined = fillInteriorBackgroundHoles(refined, width, height, holeLimit);
  refined = defringeAlpha(rgb, refined, width, height, background, 28);
  refined = refineAlphaMatte(refined);
  return refined;
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
