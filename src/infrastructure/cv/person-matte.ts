import { refineAlphaMatte } from '../ai/mask.js';
import { estimateBackgroundColor } from './color.js';
import { defringeAlpha } from './defringe.js';
export function refinePersonMatte(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const holeLimit = Math.max(12, Math.round(width * height * 0.00015));
  let refined = fillInteriorBackgroundHoles(alpha, width, height, holeLimit);
  const { color: background } = estimateBackgroundColor(rgb, width, height);
  refined = defringeAlpha(rgb, refined, width, height, background, 28);
  refined = refineAlphaMatte(refined);
  return refined;
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
