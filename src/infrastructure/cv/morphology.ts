export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) {
    return new Uint8Array(mask);
  }
  const horizontal = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let max = 0;
      const start = Math.max(0, x - radius);
      const end = Math.min(width - 1, x + radius);
      const row = y * width;
      for (let cursor = start; cursor <= end; cursor += 1) {
        const value = mask[row + cursor] ?? 0;
        if (value > max) {
          max = value;
        }
      }
      horizontal[row + x] = max;
    }
  }

  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const startY = Math.max(0, y - radius);
    const endY = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      let max = 0;
      for (let cursor = startY; cursor <= endY; cursor += 1) {
        const value = horizontal[cursor * width + x] ?? 0;
        if (value > max) {
          max = value;
        }
      }
      output[y * width + x] = max;
    }
  }
  return output;
}

export function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) {
    return new Uint8Array(mask);
  }
  const inverted = invert(mask);
  const dilated = dilate(inverted, width, height, radius);
  return invert(dilated);
}

export function closeMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  return erode(dilate(mask, width, height, radius), width, height, radius);
}

export function fillSmallHoles(
  mask: Uint8Array,
  width: number,
  height: number,
  maxHoleArea: number,
): Uint8Array {
  const filled = new Uint8Array(mask);
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];

  for (let index = 0; index < mask.length; index += 1) {
    if ((mask[index] ?? 0) > 0 || seen[index]) {
      continue;
    }

    stack.length = 0;
    stack.push(index);
    seen[index] = 1;
    const component: number[] = [];
    let touchesBorder = false;

    while (stack.length > 0) {
      const current = stack.pop() ?? 0;
      component.push(current);
      const x = current % width;
      const y = (current - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesBorder = true;
      }
      visitNeighbor(current, x - 1, y, width, height, mask, seen, stack);
      visitNeighbor(current, x + 1, y, width, height, mask, seen, stack);
      visitNeighbor(current, x, y - 1, width, height, mask, seen, stack);
      visitNeighbor(current, x, y + 1, width, height, mask, seen, stack);
    }

    if (!touchesBorder && component.length <= maxHoleArea) {
      for (const pixel of component) {
        filled[pixel] = 255;
      }
    }
  }

  return filled;
}

export function removeSmallComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea: number,
): Uint8Array {
  const output = new Uint8Array(mask.length);
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];

  for (let index = 0; index < mask.length; index += 1) {
    if ((mask[index] ?? 0) < 32 || seen[index]) {
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
      collectForeground(x - 1, y, width, height, mask, seen, stack);
      collectForeground(x + 1, y, width, height, mask, seen, stack);
      collectForeground(x, y - 1, width, height, mask, seen, stack);
      collectForeground(x, y + 1, width, height, mask, seen, stack);
    }

    if (component.length >= minArea) {
      for (const pixel of component) {
        output[pixel] = mask[pixel] ?? 255;
      }
    }
  }

  return output;
}

export function maxMasks(masks: Uint8Array[]): Uint8Array {
  const first = masks[0];
  if (!first) {
    return new Uint8Array();
  }
  const output = new Uint8Array(first.length);
  for (let index = 0; index < output.length; index += 1) {
    let value = 0;
    for (const mask of masks) {
      const candidate = mask[index] ?? 0;
      if (candidate > value) {
        value = candidate;
      }
    }
    output[index] = value;
  }
  return output;
}

export function coverage(mask: Uint8Array, threshold = 32): number {
  if (mask.length === 0) {
    return 0;
  }
  let count = 0;
  for (const value of mask) {
    if (value > threshold) {
      count += 1;
    }
  }
  return count / mask.length;
}

function invert(mask: Uint8Array): Uint8Array {
  const output = new Uint8Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    output[index] = (mask[index] ?? 0) > 0 ? 0 : 255;
  }
  return output;
}

function visitNeighbor(
  _current: number,
  x: number,
  y: number,
  width: number,
  height: number,
  mask: Uint8Array,
  seen: Uint8Array,
  stack: number[],
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const index = y * width + x;
  if (seen[index] || (mask[index] ?? 0) > 0) {
    return;
  }
  seen[index] = 1;
  stack.push(index);
}

function collectForeground(
  x: number,
  y: number,
  width: number,
  height: number,
  mask: Uint8Array,
  seen: Uint8Array,
  stack: number[],
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const index = y * width + x;
  if (seen[index] || (mask[index] ?? 0) < 32) {
    return;
  }
  seen[index] = 1;
  stack.push(index);
}
