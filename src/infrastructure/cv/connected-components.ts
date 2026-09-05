export interface Component {
  indices: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

export function connectedComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  threshold = 32,
): Component[] {
  const seen = new Uint8Array(mask.length);
  const components: Component[] = [];
  const stack: number[] = [];

  for (let index = 0; index < mask.length; index += 1) {
    if ((mask[index] ?? 0) < threshold || seen[index]) {
      continue;
    }

    stack.length = 0;
    stack.push(index);
    seen[index] = 1;
    const indices: number[] = [];
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (stack.length > 0) {
      const current = stack.pop() ?? 0;
      indices.push(current);
      const x = current % width;
      const y = (current - x) / width;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      enqueue(x - 1, y, width, height, mask, seen, stack, threshold);
      enqueue(x + 1, y, width, height, mask, seen, stack, threshold);
      enqueue(x, y - 1, width, height, mask, seen, stack, threshold);
      enqueue(x, y + 1, width, height, mask, seen, stack, threshold);
    }

    components.push({
      indices,
      minX,
      minY,
      maxX,
      maxY,
      area: indices.length,
    });
  }

  return components;
}

export function componentMetrics(component: Component): {
  width: number;
  height: number;
  aspect: number;
  compactness: number;
} {
  const width = component.maxX - component.minX + 1;
  const height = component.maxY - component.minY + 1;
  const boxArea = Math.max(1, width * height);
  return {
    width,
    height,
    aspect: width / height,
    compactness: component.area / boxArea,
  };
}

function enqueue(
  x: number,
  y: number,
  width: number,
  height: number,
  mask: Uint8Array,
  seen: Uint8Array,
  stack: number[],
  threshold: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const index = y * width + x;
  if (seen[index] || (mask[index] ?? 0) < threshold) {
    return;
  }
  seen[index] = 1;
  stack.push(index);
}
