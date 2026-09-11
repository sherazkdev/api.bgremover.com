export interface GrayMask {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface OverlayAnalysis {
  background: { r: number; g: number; b: number };
  backgroundVariance: number;
  graphicScore: number;
  textCoverage: number;
  containerCoverage: number;
  overlayCoverage: number;
  nonBackgroundCoverage: number;
  isTextHeavy: boolean;
}

export interface OverlayMasks {
  textMask: Uint8Array;
  textContainerMask: Uint8Array;
  logoAndOverlayMask: Uint8Array;
  backgroundSubtractMask: Uint8Array;
  analysis: OverlayAnalysis;
}

export interface FusedForeground {
  alpha: Uint8Array;
  textPreserved: boolean;
  needsReview: boolean;
  subjectCoverage: number;
  overlayCoverage: number;
  fusedCoverage: number;
  graphicScore: number;
  usedGraphicFallback: boolean;
}
