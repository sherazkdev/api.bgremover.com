import { chebyshev, readRgb, type RgbColor } from './color.js';

export function defringeAlpha(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  background: RgbColor,
  threshold = 30,
): Uint8Array {
  const output = new Uint8Array(alpha);
  const hard = threshold;
  const soft = threshold + 16;

  for (let index = 0; index < alpha.length; index += 1) {
    const value = alpha[index] ?? 0;
    if (value === 0) {
      continue;
    }
    if (!isBoundaryPixel(alpha, index, width, height)) {
      continue;
    }
    const distance = chebyshev(readRgb(rgb, index), background);
    if (distance <= hard) {
      output[index] = 0;
      continue;
    }
    if (distance <= soft) {
      output[index] = Math.round(value * ((distance - hard) / (soft - hard)));
    }
  }

  return output;
}

function isBoundaryPixel(
  alpha: Uint8Array,
  index: number,
  width: number,
  height: number,
): boolean {
  const x = index % width;
  const y = (index - x) / width;
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
    [x - 1, y - 1],
    [x + 1, y - 1],
    [x - 1, y + 1],
    [x + 1, y + 1],
  ] as const;
  for (const [nx, ny] of neighbors) {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
      continue;
    }
    if ((alpha[ny * width + nx] ?? 0) < 24) {
      return true;
    }
  }
  return false;
}
