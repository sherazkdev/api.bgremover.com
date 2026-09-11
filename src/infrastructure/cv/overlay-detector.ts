import sharp from 'sharp';

import { connectedComponents, componentMetrics } from './connected-components.js';
import {
  chebyshev,
  estimateBackgroundColor,
  luminance,
  readRgb,
  saturation,
  type RgbColor,
} from './color.js';
import { isTextHeavyLayout, subtractPaperBackground } from './graphic-matte.js';
import { closeMask, coverage, dilate, fillSmallHoles, removeSmallComponents } from './morphology.js';
import type { OverlayMasks } from './types.js';

const DETECT_MAX_EDGE = 640;

export async function detectOverlays(
  rgb: Uint8Array,
  width: number,
  height: number,
): Promise<OverlayMasks> {
  const work = await downscaleRgb(rgb, width, height);
  const { color: background, variance } = estimateBackgroundColor(work.rgb, work.width, work.height);
  const maps = buildSignalMaps(work.rgb, work.width, work.height, background, variance);
  const minArea = Math.max(10, Math.round(work.width * work.height * 0.00012));

  const textMask = selectTextComponents(
    removeSmallComponents(
      closeMask(maps.textSeed, work.width, work.height, 1),
      work.width,
      work.height,
      minArea,
    ),
    maps.edges,
    work.width,
    work.height,
  );
  const graphicMask = removeSmallComponents(
    closeMask(maps.graphicSeed, work.width, work.height, 1),
    work.width,
    work.height,
    minArea,
  );
  const containerMask = expandTextContainers(
    work.rgb,
    textMask,
    work.width,
    work.height,
    background,
    maps.threshold,
  );
  const logoMask = selectLogoComponents(graphicMask, textMask, work.width, work.height);
  const paperKeep = subtractPaperBackground(
    work.rgb,
    work.width,
    work.height,
    maps.edges,
    variance,
  );
  const backgroundSubtract = fillSmallHoles(
    paperKeep,
    work.width,
    work.height,
    Math.max(16, Math.round(work.width * work.height * 0.0004)),
  );

  const [textFull, containerFull, logoFull, bgSubFull] = await Promise.all([
    resizeMask(textMask, work.width, work.height, width, height),
    resizeMask(containerMask, work.width, work.height, width, height),
    resizeMask(logoMask, work.width, work.height, width, height),
    resizeMask(backgroundSubtract, work.width, work.height, width, height),
  ]);

  const overlayUnion = new Uint8Array(textFull.length);
  for (let index = 0; index < overlayUnion.length; index += 1) {
    overlayUnion[index] = Math.max(
      textFull[index] ?? 0,
      containerFull[index] ?? 0,
      logoFull[index] ?? 0,
    );
  }

  const textCoverage = coverage(textFull);
  const containerCoverage = coverage(containerFull);
  const overlayCoverage = coverage(overlayUnion);
  const nonBackgroundCoverage = coverage(bgSubFull);
  const graphicScore = computeGraphicScore({
    backgroundVariance: variance,
    overlayCoverage,
    nonBackgroundCoverage,
    textCoverage,
  });
  const isTextHeavy = isTextHeavyLayout(
    overlayUnion,
    width,
    height,
    graphicScore,
    textCoverage,
    overlayCoverage,
  );

  return {
    textMask: textFull,
    textContainerMask: containerFull,
    logoAndOverlayMask: logoFull,
    backgroundSubtractMask: bgSubFull,
    analysis: {
      background,
      backgroundVariance: variance,
      graphicScore,
      textCoverage,
      containerCoverage,
      overlayCoverage,
      nonBackgroundCoverage,
      isTextHeavy,
    },
  };
}

async function downscaleRgb(
  rgb: Uint8Array,
  width: number,
  height: number,
): Promise<{ rgb: Uint8Array; width: number; height: number }> {
  const longest = Math.max(width, height);
  if (longest <= DETECT_MAX_EDGE) {
    return { rgb, width, height };
  }
  const scale = DETECT_MAX_EDGE / longest;
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));
  const { data, info } = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .resize(nextWidth, nextHeight, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgb: new Uint8Array(data), width: info.width, height: info.height };
}

async function resizeMask(
  mask: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (sourceWidth === width && sourceHeight === height) {
    return new Uint8Array(mask);
  }
  const { data, info } = await sharp(mask, {
    raw: { width: sourceWidth, height: sourceHeight, channels: 1 },
  })
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || data.length !== width * height) {
    const single = new Uint8Array(width * height);
    const channels = Math.max(1, info.channels);
    for (let index = 0; index < single.length; index += 1) {
      single[index] = data[index * channels] ?? 0;
    }
    return single;
  }
  return new Uint8Array(data);
}

function buildSignalMaps(
  rgb: Uint8Array,
  width: number,
  height: number,
  background: RgbColor,
  variance: number,
): {
  textSeed: Uint8Array;
  graphicSeed: Uint8Array;
  nonBackground: Uint8Array;
  edges: Uint8Array;
  threshold: number;
} {
  const pixels = width * height;
  const gray = new Uint8Array(pixels);
  const colorDist = new Uint8Array(pixels);
  const sat = new Float32Array(pixels);
  const threshold = Math.max(20, Math.min(46, 18 + variance * 0.45));

  for (let index = 0; index < pixels; index += 1) {
    const color = readRgb(rgb, index);
    gray[index] = Math.round(luminance(color.r, color.g, color.b));
    colorDist[index] = Math.min(255, Math.round(chebyshev(color, background)));
    sat[index] = saturation(color.r, color.g, color.b);
  }

  const edges = sobelMagnitude(gray, width, height);
  const edgeThreshold = percentile(edges, 0.82);
  const textSeed = new Uint8Array(pixels);
  const graphicSeed = new Uint8Array(pixels);
  const nonBackground = new Uint8Array(pixels);

  for (let index = 0; index < pixels; index += 1) {
    const distance = colorDist[index] ?? 0;
    const edge = edges[index] ?? 0;
    const chroma = sat[index] ?? 0;
    const farFromBackground = distance >= threshold;
    const strongEdge = edge >= edgeThreshold;
    if (farFromBackground) {
      nonBackground[index] = Math.min(255, 90 + distance);
    }
    if (farFromBackground && strongEdge) {
      textSeed[index] = 255;
    }
    if (farFromBackground && chroma > 0.34 && strongEdge) {
      graphicSeed[index] = 255;
    }
  }

  return { textSeed, graphicSeed, nonBackground, edges, threshold };
}

function expandTextContainers(
  rgb: Uint8Array,
  textMask: Uint8Array,
  width: number,
  height: number,
  background: RgbColor,
  threshold: number,
): Uint8Array {
  const output = new Uint8Array(textMask);
  const components = connectedComponents(textMask, width, height, 64);
  const maxArea = Math.round(width * height * 0.06);

  for (const component of components) {
    const metrics = componentMetrics(component);
    const pad = Math.max(
      3,
      Math.min(28, Math.round(0.12 * Math.max(metrics.width, metrics.height))),
    );
    const seed = medianColor(rgb, component.indices);
    if (chebyshev(seed, background) < threshold * 0.45) {
      continue;
    }

    const minX = Math.max(0, component.minX - pad * 2);
    const minY = Math.max(0, component.minY - pad * 2);
    const maxX = Math.min(width - 1, component.maxX + pad * 2);
    const maxY = Math.min(height - 1, component.maxY + pad * 2);
    const colorLimit = Math.max(18, Math.min(36, threshold));
    const stack: number[] = [...component.indices];
    const seen = new Uint8Array(width * height);
    for (const index of component.indices) {
      seen[index] = 1;
    }
    let area = component.area;

    while (stack.length > 0 && area < maxArea) {
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
        if (nx < minX || ny < minY || nx > maxX || ny > maxY) {
          continue;
        }
        const index = ny * width + nx;
        if (seen[index]) {
          continue;
        }
        seen[index] = 1;
        const color = readRgb(rgb, index);
        if (chebyshev(color, seed) > colorLimit) {
          continue;
        }
        if (chebyshev(color, background) < 10) {
          continue;
        }
        output[index] = 255;
        stack.push(index);
        area += 1;
      }
    }
  }

  return output;
}

function selectTextComponents(
  mask: Uint8Array,
  edges: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const output = new Uint8Array(mask.length);
  const imageArea = width * height;
  for (const component of connectedComponents(mask, width, height, 64)) {
    const metrics = componentMetrics(component);
    const areaRatio = component.area / imageArea;
    let edgePixels = 0;
    for (const index of component.indices) {
      if ((edges[index] ?? 0) > 24) {
        edgePixels += 1;
      }
    }
    const edgeDensity = edgePixels / Math.max(1, component.area);
    if (isSolidFurniture(component, metrics, edgeDensity, width, height)) {
      continue;
    }
    const textLike =
      areaRatio <= 0.08 &&
      edgeDensity >= 0.18 &&
      metrics.compactness <= 0.72;
    const captionLike =
      areaRatio <= 0.04 &&
      metrics.height <= Math.max(18, height * 0.12) &&
      edgeDensity >= 0.28 &&
      metrics.compactness <= 0.7;
    if (textLike || captionLike) {
      for (const index of component.indices) {
        output[index] = mask[index] ?? 255;
      }
    }
  }
  return output;
}

function selectLogoComponents(
  mask: Uint8Array,
  textMask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const output = new Uint8Array(mask.length);
  const components = connectedComponents(mask, width, height, 64);
  const imageArea = width * height;
  const dilatedText = dilate(textMask, width, height, Math.max(3, Math.round(Math.min(width, height) * 0.02)));

  for (const component of components) {
    const metrics = componentMetrics(component);
    const areaRatio = component.area / imageArea;
    const nearTop = component.minY < height * 0.22;
    const overheadFixture =
      nearTop &&
      metrics.compactness >= 0.5 &&
      (metrics.aspect > 1.55 || areaRatio > 0.01);
    const logoLike =
      areaRatio >= 0.0004 &&
      areaRatio <= 0.035 &&
      metrics.compactness >= 0.28 &&
      metrics.aspect >= 0.35 &&
      metrics.aspect <= 2.2 &&
      !overheadFixture;
    const nearText = overlapsMask(component.indices, dilatedText);
    if (logoLike || (nearText && areaRatio <= 0.02 && !overheadFixture)) {
      for (const index of component.indices) {
        output[index] = mask[index] ?? 255;
      }
    }
  }

  return output;
}

function isSolidFurniture(
  component: { minX: number; minY: number; maxX: number; maxY: number; area: number },
  metrics: { width: number; height: number; aspect: number; compactness: number },
  edgeDensity: number,
  _width: number,
  height: number,
): boolean {
  const nearTop = component.minY < height * 0.28;
  const solid = metrics.compactness >= 0.68 && edgeDensity < 0.32;
  const topBar =
    nearTop &&
    metrics.aspect >= 1.45 &&
    metrics.compactness >= 0.5 &&
    edgeDensity < 0.4;
  return solid || topBar;
}

function overlapsMask(indices: number[], mask: Uint8Array): boolean {
  for (const index of indices) {
    if ((mask[index] ?? 0) > 48) {
      return true;
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

function medianColor(rgb: Uint8Array, indices: number[]): RgbColor {
  if (indices.length === 0) {
    return { r: 0, g: 0, b: 0 };
  }
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  const step = Math.max(1, Math.floor(indices.length / 80));
  for (let index = 0; index < indices.length; index += step) {
    const pixel = indices[index] ?? 0;
    const color = readRgb(rgb, pixel);
    reds.push(color.r);
    greens.push(color.g);
    blues.push(color.b);
  }
  reds.sort((left, right) => left - right);
  greens.sort((left, right) => left - right);
  blues.sort((left, right) => left - right);
  const mid = Math.floor(reds.length / 2);
  return {
    r: reds[mid] ?? 0,
    g: greens[mid] ?? 0,
    b: blues[mid] ?? 0,
  };
}

function computeGraphicScore(input: {
  backgroundVariance: number;
  overlayCoverage: number;
  nonBackgroundCoverage: number;
  textCoverage: number;
}): number {
  const uniformBackground = clamp01(1 - input.backgroundVariance / 55);
  const overlay = clamp01(input.overlayCoverage / 0.28);
  const ink = clamp01(input.nonBackgroundCoverage / 0.45);
  const text = clamp01(input.textCoverage / 0.12);
  return clamp01(uniformBackground * 0.38 + overlay * 0.24 + ink * 0.22 + text * 0.16);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
