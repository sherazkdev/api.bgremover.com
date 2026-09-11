import { connectedComponents, componentMetrics } from './connected-components.js';
import { luminance, readRgb, saturation } from './color.js';
import { coverage } from './morphology.js';
import type { OverlayMasks } from './types.js';

export function isCompositeGraphicPhoto(
  rgb: Uint8Array,
  width: number,
  height: number,
  overlays?: OverlayMasks,
): boolean {
  if (isSplitPanelPhoto(rgb, width, height)) {
    return true;
  }
  const hasOverlay =
    overlays !== undefined &&
    (overlays.analysis.overlayCoverage > 0.008 || overlays.analysis.textCoverage > 0.004);
  if (!hasOverlay) {
    return false;
  }

  let dark = 0;
  let colorful = 0;
  const pixels = width * height;
  for (let index = 0; index < pixels; index += 1) {
    const color = readRgb(rgb, index);
    const luma = luminance(color.r, color.g, color.b);
    const chroma = saturation(color.r, color.g, color.b);
    if (luma < 28) {
      dark += 1;
    }
    if (chroma > 0.22 && luma > 40) {
      colorful += 1;
    }
  }
  return dark / pixels > 0.12 && colorful / pixels > 0.12;
}

export function isSplitPanelPhoto(rgb: Uint8Array, width: number, height: number): boolean {
  const mid = Math.floor(width / 2);
  const left = columnStats(rgb, width, height, 0, mid);
  const right = columnStats(rgb, width, height, mid, width);
  return (
    (left.dark > 0.42 && right.colorful > 0.22) ||
    (right.dark > 0.42 && left.colorful > 0.22)
  );
}

export function designPanelMask(
  rgb: Uint8Array,
  textMask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const dark = new Uint8Array(width * height);
  for (let index = 0; index < dark.length; index += 1) {
    const color = readRgb(rgb, index);
    if (luminance(color.r, color.g, color.b) < 24) {
      dark[index] = 255;
    }
  }

  const output = new Uint8Array(dark.length);
  const imageArea = width * height;
  for (const component of connectedComponents(dark, width, height, 64)) {
    const ratio = component.area / imageArea;
    if (ratio < 0.08 || ratio > 0.62) {
      continue;
    }
    if (!overlapsMask(component.indices, textMask)) {
      continue;
    }
    for (const index of component.indices) {
      output[index] = 255;
    }
  }
  return output;
}

export function trimPhotographicScene(
  subject: Uint8Array,
  rgb: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const photo = photoRegionMask(rgb, width, height);
  if (coverage(photo) < 0.1) {
    return subject;
  }

  const darkSubject = new Uint8Array(subject.length);
  for (let index = 0; index < subject.length; index += 1) {
    const color = readRgb(rgb, index);
    if ((subject[index] ?? 0) > 48 && luminance(color.r, color.g, color.b) < 90) {
      darkSubject[index] = 255;
    }
  }
  const person = personLikeMask(darkSubject, width, height);
  if (coverage(person) < 0.0015) {
    return subject;
  }

  const output = new Uint8Array(subject.length);
  for (let index = 0; index < subject.length; index += 1) {
    if ((photo[index] ?? 0) > 0 && (person[index] ?? 0) === 0) {
      continue;
    }
    output[index] = subject[index] ?? 0;
  }
  return output;
}

export function photoRegionMask(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const mid = Math.floor(width / 2);
  const left = columnStats(rgb, width, height, 0, mid);
  const right = columnStats(rgb, width, height, mid, width);
  const output = new Uint8Array(width * height);
  const photoOnRight = right.colorful > left.colorful + 0.12 && right.colorful > 0.18;
  const photoOnLeft = left.colorful > right.colorful + 0.12 && left.colorful > 0.18;
  if (!photoOnRight && !photoOnLeft) {
    return output;
  }
  const start = photoOnRight ? findSplitColumn(rgb, width, height, true) : 0;
  const end = photoOnRight ? width : findSplitColumn(rgb, width, height, false);
  for (let y = 0; y < height; y += 1) {
    for (let x = start; x < end; x += 1) {
      output[y * width + x] = 255;
    }
  }
  return output;
}

function findSplitColumn(
  rgb: Uint8Array,
  width: number,
  height: number,
  photoOnRight: boolean,
): number {
  const scores = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    scores[x] = columnStats(rgb, width, height, x, x + 1).colorful;
  }
  if (photoOnRight) {
    for (let x = Math.floor(width * 0.2); x < width * 0.8; x += 1) {
      if ((scores[x] ?? 0) > 0.2) {
        return Math.max(0, x - 2);
      }
    }
    return Math.floor(width / 2);
  }
  for (let x = Math.floor(width * 0.8); x > width * 0.2; x -= 1) {
    if ((scores[x] ?? 0) > 0.2) {
      return Math.min(width, x + 3);
    }
  }
  return Math.ceil(width / 2);
}

function columnStats(
  rgb: Uint8Array,
  width: number,
  height: number,
  x0: number,
  x1: number,
): { dark: number; colorful: number } {
  let dark = 0;
  let colorful = 0;
  const total = Math.max(1, (x1 - x0) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const color = readRgb(rgb, y * width + x);
      const luma = luminance(color.r, color.g, color.b);
      const chroma = saturation(color.r, color.g, color.b);
      if (luma < 32) {
        dark += 1;
      }
      if (chroma > 0.2 && luma > 36) {
        colorful += 1;
      }
    }
  }
  return { dark: dark / total, colorful: colorful / total };
}

function personLikeMask(darkSubject: Uint8Array, width: number, height: number): Uint8Array {
  const output = new Uint8Array(darkSubject.length);
  const imageArea = width * height;
  for (const component of connectedComponents(darkSubject, width, height, 64)) {
    const metrics = componentMetrics(component);
    const areaRatio = component.area / imageArea;
    const borderHits =
      (component.minX <= 1 ? 1 : 0) +
      (component.minY <= 1 ? 1 : 0) +
      (component.maxX >= width - 2 ? 1 : 0) +
      (component.maxY >= height - 2 ? 1 : 0);
    const personLike =
      areaRatio >= 0.0008 &&
      areaRatio <= 0.12 &&
      metrics.aspect >= 0.22 &&
      metrics.aspect <= 2.8 &&
      metrics.width < width * 0.3 &&
      metrics.height < height * 0.6 &&
      borderHits < 3;
    if (!personLike) {
      continue;
    }
    for (const index of component.indices) {
      output[index] = 255;
    }
  }
  return output;
}

function overlapsMask(indices: number[], mask: Uint8Array): boolean {
  for (const index of indices) {
    if ((mask[index] ?? 0) > 48) {
      return true;
    }
  }
  return false;
}
