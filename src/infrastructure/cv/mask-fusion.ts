import type { RemovalMode } from '../../config/constants.js';
import { noRemovableSubjectError } from '../../shared/errors/app-error.js';
import { refineAlphaMatte } from '../ai/mask.js';
import { closeMask, coverage, fillSmallHoles, maxMasks, removeSmallComponents } from './morphology.js';
import type { FusedForeground, OverlayMasks } from './types.js';

const EMPTY_COVERAGE = 0.035;
const DESTRUCTIVE_KEEP_RATIO = 0.28;

export function fuseForegroundMasks(input: {
  subjectMask: Uint8Array;
  overlays: OverlayMasks;
  width: number;
  height: number;
  mode: RemovalMode;
  preserveText: boolean;
}): FusedForeground {
  const subjectCoverage = coverage(input.subjectMask);
  const overlayCoverage = input.overlays.analysis.overlayCoverage;
  const graphicScore = input.overlays.analysis.graphicScore;
  const useGraphicPath = shouldUseGraphicPath({
    mode: input.mode,
    subjectCoverage,
    overlayCoverage,
    graphicScore,
    nonBackgroundCoverage: input.overlays.analysis.nonBackgroundCoverage,
  });

  const layers = [input.subjectMask];
  if (input.preserveText) {
    layers.push(
      input.overlays.textMask,
      input.overlays.textContainerMask,
      input.overlays.logoAndOverlayMask,
    );
  }
  if (useGraphicPath) {
    layers.push(input.overlays.backgroundSubtractMask);
  }

  let fused = maxMasks(layers);
  const pixelCount = input.width * input.height;
  if (pixelCount >= 256) {
    const minArea = Math.max(8, Math.round(pixelCount * 0.00008));
    fused = removeSmallComponents(fused, input.width, input.height, minArea);
  }
  fused = closeMask(fused, input.width, input.height, 1);
  fused = fillSmallHoles(
    fused,
    input.width,
    input.height,
    Math.round(input.width * input.height * 0.012),
  );
  fused = refineAlphaMatte(fused);

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
  if (recoveredCoverage < EMPTY_COVERAGE && !useGraphicPath) {
    throw noRemovableSubjectError({
      subjectCoverage,
      overlayCoverage,
      fusedCoverage: recoveredCoverage,
      mode: input.mode,
    });
  }
  if (recoveredCoverage < EMPTY_COVERAGE && useGraphicPath) {
    throw noRemovableSubjectError({
      subjectCoverage,
      overlayCoverage,
      fusedCoverage: recoveredCoverage,
      mode: input.mode,
      reason: 'graphic-fallback-empty',
    });
  }

  return {
    alpha: fused,
    textPreserved:
      input.preserveText &&
      (coverage(input.overlays.textMask) > 0.002 ||
        coverage(input.overlays.textContainerMask) > 0.002 ||
        coverage(input.overlays.logoAndOverlayMask) > 0.002 ||
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
}): boolean {
  if (input.mode === 'graphic' || input.mode === 'document') {
    return true;
  }
  if (input.mode === 'person' || input.mode === 'product') {
    return false;
  }
  if (input.graphicScore >= 0.52) {
    return true;
  }
  if (input.subjectCoverage < 0.08 && input.overlayCoverage >= 0.08) {
    return true;
  }
  return input.subjectCoverage < 0.05 && input.nonBackgroundCoverage >= 0.12;
}
