export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

export function chebyshev(left: RgbColor, right: RgbColor): number {
  return Math.max(
    Math.abs(left.r - right.r),
    Math.abs(left.g - right.g),
    Math.abs(left.b - right.b),
  );
}

export function readRgb(rgb: Uint8Array, index: number): RgbColor {
  const offset = index * 3;
  return {
    r: rgb[offset] ?? 0,
    g: rgb[offset + 1] ?? 0,
    b: rgb[offset + 2] ?? 0,
  };
}

export function estimateBackgroundColor(
  rgb: Uint8Array,
  width: number,
  height: number,
): { color: RgbColor; variance: number } {
  const border = Math.max(2, Math.round(Math.min(width, height) * 0.06));
  const samples: RgbColor[] = [];

  const push = (x: number, y: number): void => {
    samples.push(readRgb(rgb, y * width + x));
  };

  for (let x = 0; x < width; x += 2) {
    for (let y = 0; y < border; y += 1) {
      push(x, y);
      push(x, height - 1 - y);
    }
  }
  for (let y = border; y < height - border; y += 2) {
    for (let x = 0; x < border; x += 1) {
      push(x, y);
      push(width - 1 - x, y);
    }
  }

  if (samples.length === 0) {
    return { color: { r: 255, g: 255, b: 255 }, variance: 0 };
  }

  const bins = new Map<number, { count: number; color: RgbColor }>();
  for (const sample of samples) {
    const key =
      (Math.round(sample.r / 12) << 16) |
      (Math.round(sample.g / 12) << 8) |
      Math.round(sample.b / 12);
    const existing = bins.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      bins.set(key, { count: 1, color: sample });
    }
  }

  let best = { count: 0, color: samples[0] ?? { r: 255, g: 255, b: 255 } };
  for (const bin of bins.values()) {
    if (bin.count > best.count) {
      best = bin;
    }
  }

  let variance = 0;
  for (const sample of samples) {
    const dist = chebyshev(sample, best.color);
    variance += dist * dist;
  }
  variance = Math.sqrt(variance / samples.length);

  return { color: best.color, variance };
}
