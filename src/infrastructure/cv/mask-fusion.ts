import type { RemovalMode } from '../../config/constants.js';
import { noRemovableSubjectError } from '../../shared/errors/app-error.js';
import { refineAlphaMatte } from '../ai/mask.js';
import { connectedComponents } from './connected-components.js';
import {
  designPanelMask,
  isCompositeGraphicPhoto,
  trimPhotographicScene,
} from './composite-cutout.js';
import { refineGraphicCutout } from './graphic-matte.js';
import { normalizeRemovalMode } from './mode-utils.js';
import { refinePersonMatte } from './person-matte.js';
import type { PreservationOptions } from './preservation-options.js';
import { isGraphicCutoutMode, isSubjectCutoutMode } from './preservation-options.js';
import { buildTextBackgroundMatte } from './text-background-matte.js';
import { coverage, dilate, erode, fillSmallHoles, maxMasks, removeSmallComponents } from './morphology.js';
import type { FusedForeground, OverlayMasks } from './types.js';

const EMPTY_COVERAGE = 0.035;
const DESTRUCTIVE_KEEP_RATIO = 0.28;
const SUBJECT_LOCK_COVERAGE = 0.1;

export function fuseForegroundMasks(input: {
  subjectMask: Uint8Array;
  overlays: OverlayMasks;
  rgb?: Uint8Array;
  width: number;
  height: number;
  mode: RemovalMode;
  preservation: PreservationOptions;
}): FusedForeground {
  const mode = normalizeRemovalMode(input.mode);
  const subjectCoverage = coverage(input.subjectMask);
  const overlayCoverage = input.overlays.analysis.overlayCoverage;
  const graphicScore = input.overlays.analysis.graphicScore;
  const composite =
    Boolean(input.rgb) &&
    isCompositeGraphicPhoto(input.rgb as Uint8Array, input.width, input.height, input.overlays);
  const textBackgroundMode = input.mode === 'text_background';
  const useGraphicPath = textBackgroundMode
    ? true
    : shouldUseGraphicPath({
        mode,
        subjectCoverage,
        overlayCoverage,
        graphicScore,
        nonBackgroundCoverage: input.overlays.analysis.nonBackgroundCoverage,
        textHeavy: input.overlays.analysis.isTextHeavy,
        composite,
      });

  let subjectMask = useGraphicPath
    ? new Uint8Array(input.subjectMask.length)
    : stripOverheadFixtures(
        cleanSubjectMask(
          tightenMixedSubject(input.subjectMask, overlayCoverage, subjectCoverage),
          input.width,
          input.height,
        ),
        input.width,
        input.height,
      );
  if (composite && !useGraphicPath && input.rgb) {
    subjectMask = trimPhotographicScene(subjectMask, input.rgb, input.width, input.height);
  }

  let fused: Uint8Array;
  const pixelCount = input.width * input.height;
  if (textBackgroundMode && input.rgb) {
    fused = buildTextBackgroundMatte(
      input.rgb,
      input.overlays,
      input.width,
      input.height,
      input.preservation,
    );
  } else {
    const layers: Uint8Array[] = [];
    if (!useGraphicPath) {
      layers.push(subjectMask);
    }
    if (input.preservation.preserveText) {
      layers.push(input.overlays.textMask);
      if (input.preservation.preserveTextContainers) {
        layers.push(input.overlays.textContainerMask);
      }
      if (input.preservation.preserveLogos) {
        layers.push(input.overlays.logoAndOverlayMask);
      }
      if (composite && input.rgb) {
        layers.push(designPanelMask(input.rgb, input.overlays.textMask, input.width, input.height));
      }
    }
    if (useGraphicPath && input.mode !== 'text_background') {
      layers.push(input.overlays.backgroundSubtractMask);
    }
    fused = maxMasks(layers);
    if (useGraphicPath && input.rgb) {
      fused = refineGraphicCutout(input.rgb, fused, input.width, input.height);
    }
  }

  if (!textBackgroundMode && !useGraphicPath) {
    if (pixelCount >= 256) {
      const minArea = Math.max(8, Math.round(pixelCount * 0.00008));
      fused = removeSmallComponents(fused, input.width, input.height, minArea);
    }
    fused = fillSmallHoles(
      fused,
      input.width,
      input.height,
      Math.round(input.width * input.height * 0.008),
    );
    fused = pruneDetachedBackground(fused, {
      ...input,
      subjectMask,
    });
    fused = stripOverheadFixtures(fused, input.width, input.height);
    if (isSubjectCutoutMode(input.mode) && input.rgb) {
      fused = refinePersonMatte(input.rgb, fused, input.width, input.height);
    } else {
      fused = refineAlphaMatte(fused);
    }
  }

  const fusedCoverage = coverage(fused);
  const keepRatio =
    input.overlays.analysis.nonBackgroundCoverage > 0
      ? fusedCoverage / input.overlays.analysis.nonBackgroundCoverage
      : 1;

  if (
    useGraphicPath &&
    keepRatio < DESTRUCTIVE_KEEP_RATIO &&
    input.overlays.analysis.nonBackgroundCoverage > 0.08
  ) {
    fused = refineAlphaMatte(input.overlays.backgroundSubtractMask);
  }

  const recoveredCoverage = coverage(fused);
  if (recoveredCoverage < EMPTY_COVERAGE) {
    throw noRemovableSubjectError({
      subjectCoverage,
      overlayCoverage,
      fusedCoverage: recoveredCoverage,
      mode: input.mode,
    });
  }

  const needsReview =
    textBackgroundMode &&
    coverage(input.overlays.textMask) > 0.002 &&
    recoveredCoverage < input.overlays.analysis.textCoverage * 0.45;

  return {
    alpha: fused,
    needsReview,
    textPreserved:
      input.preservation.preserveText &&
      (coverage(input.overlays.textMask) > 0.002 ||
        coverage(input.overlays.textContainerMask) > 0.002 ||
        coverage(input.overlays.logoAndOverlayMask) > 0.002 ||
        textBackgroundMode ||
        useGraphicPath),
    subjectCoverage,
    overlayCoverage,
    fusedCoverage: recoveredCoverage,
    graphicScore,
    usedGraphicFallback: useGraphicPath,
  };
}

export function shouldUseGraphicPath(input: {
  mode: RemovalMode;
  subjectCoverage: number;
  overlayCoverage: number;
  graphicScore: number;
  nonBackgroundCoverage: number;
  textHeavy?: boolean;
  composite?: boolean;
}): boolean {
  if (isGraphicCutoutMode(input.mode)) {
    return true;
  }
  if (isSubjectCutoutMode(input.mode)) {
    return false;
  }
  if (input.composite) {
    return false;
  }
  if (input.textHeavy) {
    return true;
  }
  if (input.subjectCoverage >= SUBJECT_LOCK_COVERAGE) {
    return false;
  }
  if (input.graphicScore >= 0.58 && input.subjectCoverage < 0.08) {
    return true;
  }
  if (input.subjectCoverage < 0.08 && input.overlayCoverage >= 0.1) {
    return true;
  }
  return input.subjectCoverage < 0.05 && input.nonBackgroundCoverage >= 0.18;
}

export function shouldRouteToGraphicModel(
  mode: RemovalMode,
  overlays: OverlayMasks | null,
  rgb: Uint8Array,
  width: number,
  height: number,
): boolean {
  if (mode === 'text_background' || isGraphicCutoutMode(mode)) {
    return true;
  }
  if (isSubjectCutoutMode(mode) || !overlays) {
    return false;
  }
  if (isCompositeGraphicPhoto(rgb, width, height, overlays ?? undefined)) {
    return false;
  }
  return overlays.analysis.isTextHeavy;
}

export function pruneDetachedBackground(
  fused: Uint8Array,
  input: {
    subjectMask: Uint8Array;
    overlays: OverlayMasks;
    width: number;
    height: number;
  },
): Uint8Array {
  const components = connectedComponents(fused, input.width, input.height, 48);
  if (components.length <= 1) {
    return fused;
  }

  const primary = pickPrimaryBody(components, input.width, input.height);
  if (!primary) {
    return fused;
  }

  const keep = new Uint8Array(fused.length);
  const grow = Math.max(2, Math.round(Math.min(input.width, input.height) * 0.012));
  const textProtect = maxMasks([
    input.overlays.textMask,
    input.overlays.textContainerMask,
  ]);

  for (const component of components) {
    if (isOverheadDebris(component, primary) && !overlapsMask(component, textProtect)) {
      continue;
    }
    const keepComponent =
      component === primary ||
      overlapsMask(component, input.subjectMask) ||
      nearPrimary(component, primary, grow) ||
      overlapsMask(component, textProtect);
    if (!keepComponent) {
      continue;
    }
    for (const index of component.indices) {
      keep[index] = fused[index] ?? 0;
    }
  }

  return keep;
}

function overlapsMask(
  component: { indices: number[] },
  mask: Uint8Array,
): boolean {
  for (const index of component.indices) {
    if ((mask[index] ?? 0) > 48) {
      return true;
    }
  }
  return false;
}

function pickPrimaryBody(
  components: Array<{ minX: number; minY: number; maxX: number; maxY: number; area: number }>,
  _width: number,
  height: number,
): { minX: number; minY: number; maxX: number; maxY: number; area: number } | undefined {
  if (components.length === 0) {
    return undefined;
  }
  const ranked = components.slice().sort((left, right) => right.area - left.area);
  const bodyLike = ranked.filter(
    (component) => component.maxY > height * 0.34 || component.minY > height * 0.18,
  );
  return bodyLike[0] ?? ranked[0];
}

function isOverheadDebris(
  component: { minX: number; minY: number; maxX: number; maxY: number },
  primary: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  const primaryHeight = Math.max(1, primary.maxY - primary.minY + 1);
  const headLine = primary.minY + primaryHeight * 0.14;
  return component.maxY <= headLine && component.minY < primary.minY;
}

function nearPrimary(
  component: { minX: number; minY: number; maxX: number; maxY: number },
  primary: { minX: number; minY: number; maxX: number; maxY: number },
  grow: number,
): boolean {
  return !(
    component.maxX < primary.minX - grow ||
    component.minX > primary.maxX + grow ||
    component.maxY < primary.minY - grow ||
    component.minY > primary.maxY + grow
  );
}

function tightenMixedSubject(
  subject: Uint8Array,
  overlayCoverage: number,
  subjectCoverage: number,
): Uint8Array {
  if (overlayCoverage < 0.015 || subjectCoverage < 0.18) {
    return subject;
  }
  const tightened = new Uint8Array(subject.length);
  for (let index = 0; index < subject.length; index += 1) {
    const value = subject[index] ?? 0;
    tightened[index] = value >= 168 ? value : 0;
  }
  return tightened;
}

export function stripOverheadFixtures(
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (width * height < 256) {
    return mask;
  }
  const components = connectedComponents(mask, width, height, 48);
  const primary = pickPrimaryBody(components, width, height);
  if (!primary) {
    return mask;
  }

  const torso = torsoBox(mask, width, height, primary);
  const output = new Uint8Array(mask);
  const topLimit = Math.min(torso.minY, Math.round(height * 0.22));

  for (let y = 0; y < topLimit; y += 1) {
    let minX = width;
    let maxX = -1;
    let count = 0;
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if ((output[row + x] ?? 0) > 48) {
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    const wide = maxX >= minX && maxX - minX + 1 > Math.max(torso.maxX - torso.minX + 1, width * 0.3);
    const dense = count / width > 0.18;
    if (!wide && !dense) {
      continue;
    }
    output.fill(0, row, row + width);
  }

  const remaining = connectedComponents(output, width, height, 48);
  const body = pickPrimaryBody(remaining, width, height);
  for (const component of remaining) {
    if (component === body) {
      continue;
    }
    if (component.maxY < torso.minY && component.maxX - component.minX + 1 > width * 0.28) {
      for (const index of component.indices) {
        output[index] = 0;
      }
    }
  }

  return output;
}

function torsoBox(
  mask: Uint8Array,
  width: number,
  _height: number,
  primary: { minX: number; minY: number; maxX: number; maxY: number },
): { minX: number; minY: number; maxX: number; maxY: number } {
  const startY = Math.max(primary.minY, Math.round(primary.minY + (primary.maxY - primary.minY + 1) * 0.35));
  let minX = primary.maxX;
  let maxX = primary.minX;
  let minY = primary.maxY;
  for (let y = startY; y <= primary.maxY; y += 1) {
    for (let x = primary.minX; x <= primary.maxX; x += 1) {
      if ((mask[y * width + x] ?? 0) < 48) {
        continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
    }
  }
  if (maxX < minX) {
    return primary;
  }
  return { minX, minY, maxX, maxY: primary.maxY };
}

export function cleanSubjectMask(
  subject: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const pixelCount = width * height;
  if (pixelCount < 256) {
    return subject;
  }

  const radius = Math.max(1, Math.min(3, Math.round(Math.min(width, height) / 220)));
  const opened = dilate(erode(subject, width, height, radius), width, height, radius);
  const components = connectedComponents(opened, width, height, 48);
  if (components.length <= 1) {
    return subject;
  }

  const primary = pickPrimaryBody(components, width, height);
  if (!primary) {
    return subject;
  }

  const minKeepArea = Math.max(24, Math.round(primary.area * 0.4));
  const kept = new Uint8Array(opened.length);
  for (const component of components) {
    if (component === primary || (component.area >= minKeepArea && !isOverheadDebris(component, primary))) {
      for (const index of component.indices) {
        kept[index] = 255;
      }
    }
  }

  const restored = new Uint8Array(subject.length);
  const halo = dilate(kept, width, height, Math.max(1, radius + 1));
  for (let index = 0; index < subject.length; index += 1) {
    if ((halo[index] ?? 0) > 0) {
      restored[index] = subject[index] ?? 0;
    }
  }
  return restored;
}

