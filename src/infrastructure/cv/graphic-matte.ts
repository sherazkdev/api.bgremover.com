import { connectedComponents, componentMetrics } from './connected-components.js';
import { chebyshev, luminance, readRgb, saturation, type RgbColor } from './color.js';
import { fillSmallHoles, removeSmallComponents } from './morphology.js';

export function estimatePaperColors(
  rgb: Uint8Array,
  width: number,
  height: number,
  maxColors = 3,
): { colors: RgbColor[]; variance: number } {
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
    return { colors: [{ r: 255, g: 255, b: 255 }], variance: 0 };
  }

  const bins = new Map<number, { count: number; color: RgbColor }>();
  for (const sample of samples) {
    const key =
      (Math.round(sample.r / 14) << 16) |
      (Math.round(sample.g / 14) << 8) |
      Math.round(sample.b / 14);
    const existing = bins.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      bins.set(key, { count: 1, color: sample });
    }
  }

  const ranked = [...bins.values()].sort((left, right) => right.count - left.count);
  const colors: RgbColor[] = [];
  for (const bin of ranked) {
    if (colors.some((color) => chebyshev(color, bin.color) < 28)) {
      continue;
    }
    colors.push(bin.color);
    if (colors.length >= maxColors) {
      break;
    }
  }

  const primary = colors[0] ?? { r: 255, g: 255, b: 255 };
  let variance = 0;
  for (const sample of samples) {
    const dist = Math.min(...colors.map((color) => chebyshev(sample, color)));
    variance += dist * dist;
  }
  variance = Math.sqrt(variance / samples.length);
  return { colors: colors.length > 0 ? colors : [primary], variance };
}

export function subtractPaperBackground(
  rgb: Uint8Array,
  width: number,
  height: number,
  edges: Uint8Array,
  variance: number,
): Uint8Array {
  const { colors } = estimatePaperColors(rgb, width, height);
  const colorLimit = Math.max(18, Math.min(44, 16 + variance * 0.35));
  const edgeLimit = Math.max(18, percentile(edges, 0.93));
  const pixels = width * height;
  const passable = new Uint8Array(pixels);

  for (let index = 0; index < pixels; index += 1) {
    const distance = minPaperDistance(readRgb(rgb, index), colors);
    const edge = edges[index] ?? 0;
    if (distance <= colorLimit * 0.55 || (distance <= colorLimit && edge < edgeLimit)) {
      passable[index] = 1;
    }
  }

  const paper = floodFromBorder(passable, width, height);
  const keep = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) {
    keep[index] = paper[index] ? 0 : 255;
  }
  return dropLoosePaper(keep, rgb, colors, width, height, colorLimit);
}

const REFINE_MAX_EDGE = 1280;

export function refineGraphicCutout(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const work = downscaleForRefine(rgb, alpha, width, height, REFINE_MAX_EDGE);
  const gray = new Uint8Array(work.width * work.height);
  for (let index = 0; index < gray.length; index += 1) {
    const color = readRgb(work.rgb, index);
    gray[index] = Math.round(luminance(color.r, color.g, color.b));
  }
  const edges = sobelMagnitude(gray, work.width, work.height);
  const { colors, variance } = estimatePaperColors(work.rgb, work.width, work.height);
  const paperKeep = subtractPaperBackground(work.rgb, work.width, work.height, edges, variance);
  const merged = new Uint8Array(work.alpha.length);
  for (let index = 0; index < merged.length; index += 1) {
    const ink = minPaperDistance(readRgb(work.rgb, index), colors) > 26 ? (work.alpha[index] ?? 0) : 0;
    merged[index] = Math.max(paperKeep[index] ?? 0, ink);
  }

  const cleaned = defringeAgainstPapers(work.rgb, merged, work.width, work.height, colors, 24, 2);
  const specks = Math.max(6, Math.round(work.width * work.height * 0.00006));
  const despeckled = removeSmallComponents(cleaned, work.width, work.height, specks);
  const refined = fillSmallHoles(
    despeckled,
    work.width,
    work.height,
    Math.max(12, Math.round(work.width * work.height * 0.00025)),
  );
  return upscaleMaskNearest(refined, work.width, work.height, width, height);
}

function downscaleForRefine(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  maxEdge: number,
): { rgb: Uint8Array; alpha: Uint8Array; width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { rgb, alpha, width, height };
  }
  const scale = maxEdge / longest;
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));
  const nextRgb = new Uint8Array(nextWidth * nextHeight * 3);
  const nextAlpha = new Uint8Array(nextWidth * nextHeight);
  for (let y = 0; y < nextHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.round((y + 0.5) / scale - 0.5));
    for (let x = 0; x < nextWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.round((x + 0.5) / scale - 0.5));
      const source = sourceY * width + sourceX;
      const dest = y * nextWidth + x;
      nextRgb[dest * 3] = rgb[source * 3] ?? 0;
      nextRgb[dest * 3 + 1] = rgb[source * 3 + 1] ?? 0;
      nextRgb[dest * 3 + 2] = rgb[source * 3 + 2] ?? 0;
      nextAlpha[dest] = alpha[source] ?? 0;
    }
  }
  return { rgb: nextRgb, alpha: nextAlpha, width: nextWidth, height: nextHeight };
}

function upscaleMaskNearest(
  mask: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): Uint8Array {
  if (sourceWidth === width && sourceHeight === height) {
    return mask;
  }
  const output = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / width));
      output[y * width + x] = mask[sourceY * sourceWidth + sourceX] ?? 0;
    }
  }
  return output;
}

export function defringeAgainstPapers(
  rgb: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  papers: RgbColor[],
  threshold = 24,
  radius = 1,
): Uint8Array {
  const output = new Uint8Array(alpha);
  const hard = threshold;
  const soft = threshold + 14;
  for (let index = 0; index < alpha.length; index += 1) {
    const value = alpha[index] ?? 0;
    if (value === 0 || !isNearTransparent(alpha, index, width, height, radius)) {
      continue;
    }
    const distance = minPaperDistance(readRgb(rgb, index), papers);
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

export function isTextHeavyLayout(
  overlayUnion: Uint8Array,
  width: number,
  height: number,
  graphicScore: number,
  textCoverage: number,
  overlayCoverage: number,
): boolean {
  if (graphicScore < 0.4) {
    return false;
  }
  const bandHeight = Math.max(1, Math.floor(height / 3));
  let bands = 0;
  for (let band = 0; band < 3; band += 1) {
    const y0 = band * bandHeight;
    const y1 = band === 2 ? height : y0 + bandHeight;
    let visible = 0;
    const total = Math.max(1, (y1 - y0) * width);
    for (let y = y0; y < y1; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        if ((overlayUnion[row + x] ?? 0) > 40) {
          visible += 1;
        }
      }
    }
    if (visible / total >= 0.012) {
      bands += 1;
    }
  }
  return bands >= 2 && (textCoverage >= 0.018 || overlayCoverage >= 0.07);
}

function dropLoosePaper(
  keep: Uint8Array,
  rgb: Uint8Array,
  papers: RgbColor[],
  width: number,
  height: number,
  colorLimit: number,
): Uint8Array {
  const leftover = new Uint8Array(keep.length);
  for (let index = 0; index < keep.length; index += 1) {
    if ((keep[index] ?? 0) < 48) {
      continue;
    }
    if (minPaperDistance(readRgb(rgb, index), papers) <= colorLimit) {
      leftover[index] = 255;
    }
  }

  const output = new Uint8Array(keep);
  const imageArea = width * height;
  for (const component of connectedComponents(leftover, width, height, 48)) {
    const touchesBorder =
      component.minX <= 1 ||
      component.minY <= 1 ||
      component.maxX >= width - 2 ||
      component.maxY >= height - 2;
    const metrics = componentMetrics(component);
    const small = component.area < Math.max(28, Math.round(imageArea * 0.0035));
    if (touchesBorder || small) {
      for (const index of component.indices) {
        output[index] = 0;
      }
      continue;
    }
    const keepFill = hasDesignStroke(component, keep, rgb, papers, width, height);
    const vivid =
      metrics.compactness >= 0.42 &&
      component.area < imageArea * 0.08 &&
      medianSaturation(rgb, component.indices) > 0.34;
    if (keepFill || vivid) {
      continue;
    }
    for (const index of component.indices) {
      output[index] = 0;
    }
  }
  return output;
}

function hasDesignStroke(
  component: { indices: number[]; minX: number; minY: number; maxX: number; maxY: number },
  _keep: Uint8Array,
  rgb: Uint8Array,
  papers: RgbColor[],
  width: number,
  height: number,
): boolean {
  const member = new Set(component.indices);
  let ringPixels = 0;
  let inkRing = 0;
  for (const index of component.indices) {
    const cx = index % width;
    const cy = (index - cx) / width;
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const neighbor = ny * width + nx;
        if (member.has(neighbor)) {
          continue;
        }
        ringPixels += 1;
        if (minPaperDistance(readRgb(rgb, neighbor), papers) > 28) {
          inkRing += 1;
        }
      }
    }
  }
  return ringPixels > 0 && inkRing / ringPixels >= 0.32;
}

function medianSaturation(rgb: Uint8Array, indices: number[]): number {
  if (indices.length === 0) {
    return 0;
  }
  const values: number[] = [];
  const step = Math.max(1, Math.floor(indices.length / 80));
  for (let index = 0; index < indices.length; index += step) {
    const color = readRgb(rgb, indices[index] ?? 0);
    values.push(saturation(color.r, color.g, color.b));
  }
  values.sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)] ?? 0;
}

function minPaperDistance(color: RgbColor, papers: RgbColor[]): number {
  let best = 255;
  for (const paper of papers) {
    const distance = chebyshev(color, paper);
    if (distance < best) {
      best = distance;
    }
  }
  return best;
}

function floodFromBorder(passable: Uint8Array, width: number, height: number): Uint8Array {
  const filled = new Uint8Array(passable.length);
  const stack: number[] = [];
  const push = (x: number, y: number): void => {
    const index = y * width + x;
    if (!passable[index] || filled[index]) {
      return;
    }
    filled[index] = 255;
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
    if (x > 0) {
      push(x - 1, y);
    }
    if (x + 1 < width) {
      push(x + 1, y);
    }
    if (y > 0) {
      push(x, y - 1);
    }
    if (y + 1 < height) {
      push(x, y + 1);
    }
  }

  return filled;
}

function isNearTransparent(
  alpha: Uint8Array,
  index: number,
  width: number,
  height: number,
  radius: number,
): boolean {
  const x = index % width;
  const y = (index - x) / width;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      if ((alpha[ny * width + nx] ?? 0) < 24) {
        return true;
      }
    }
  }
  return false;
}

function sobelMagnitude(gray: Uint8Array, width: number, height: number): Uint8Array {
  const output = new Uint8Array(gray.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const a = gray[(y - 1) * width + (x - 1)] ?? 0;
      const b = gray[(y - 1) * width + x] ?? 0;
      const c = gray[(y - 1) * width + (x + 1)] ?? 0;
      const d = gray[y * width + (x - 1)] ?? 0;
      const f = gray[y * width + (x + 1)] ?? 0;
      const g = gray[(y + 1) * width + (x - 1)] ?? 0;
      const h = gray[(y + 1) * width + x] ?? 0;
      const i = gray[(y + 1) * width + (x + 1)] ?? 0;
      const gx = -a + c - 2 * d + 2 * f - g + i;
      const gy = -a - 2 * b - c + g + 2 * h + i;
      output[y * width + x] = Math.min(255, Math.round(Math.hypot(gx, gy)));
    }
  }
  return output;
}

function percentile(values: Uint8Array, ratio: number): number {
  const copy = Uint8Array.from(values);
  copy.sort((left, right) => left - right);
  const index = Math.min(copy.length - 1, Math.max(0, Math.floor((copy.length - 1) * ratio)));
  return copy[index] ?? 0;
}
