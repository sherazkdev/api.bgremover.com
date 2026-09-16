import { estimateBackgroundColor, type RgbColor } from './color.js';

/** Scene stats independent of OCR / overlay detection (same border sampling as person-matte). */
export function analyzeSceneBackground(
  rgb: Uint8Array,
  width: number,
  height: number,
): { color: RgbColor; variance: number } {
  return estimateBackgroundColor(rgb, width, height);
}

export function isOutdoorLikeScene(variance: number): boolean {
  return variance > 28;
}

/** Prefer overlay analysis when present; otherwise derive from the image borders. */
export function resolveBackgroundVariance(
  overlayVariance: number,
  rgb: Uint8Array | undefined,
  width: number,
  height: number,
): number {
  if (overlayVariance > 0) {
    return overlayVariance;
  }
  if (rgb && width > 0 && height > 0) {
    return analyzeSceneBackground(rgb, width, height).variance;
  }
  return 0;
}
