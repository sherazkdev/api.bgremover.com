export interface LetterboxLayout {
  contentWidth: number;
  contentHeight: number;
  offsetX: number;
  offsetY: number;
  canvasWidth: number;
  canvasHeight: number;
}

/** Center-crop after scaling so the subject fills the model canvas (better for portraits). */
export interface CoverCropLayout {
  sourceWidth: number;
  sourceHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  cropLeft: number;
  cropTop: number;
}

export type ModelInputLayout =
  | { mode: 'contain'; letterbox: LetterboxLayout }
  | { mode: 'cover'; cover: CoverCropLayout };

/** ImageNet mean as 8-bit RGB so padded pixels normalize near zero. */
export const IMAGENET_PAD_RGB = { r: 124, g: 116, b: 104 } as const;

export function computeCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): CoverCropLayout {
  const scale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;
  return {
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight,
    scale,
    cropLeft: (scaledWidth - canvasWidth) / 2,
    cropTop: (scaledHeight - canvasHeight) / 2,
  };
}

export function mapCoverMaskToSource(
  mask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  layout: CoverCropLayout,
): { data: Uint8Array; width: number; height: number } {
  const { sourceWidth, sourceHeight, scale, cropLeft, cropTop } = layout;
  const output = new Uint8Array(sourceWidth * sourceHeight);
  for (let sy = 0; sy < sourceHeight; sy += 1) {
    for (let sx = 0; sx < sourceWidth; sx += 1) {
      const mx = sx * scale - cropLeft;
      const my = sy * scale - cropTop;
      if (mx < 0 || my < 0 || mx >= maskWidth || my >= maskHeight) {
        output[sy * sourceWidth + sx] = 0;
        continue;
      }
      const x0 = Math.floor(mx);
      const y0 = Math.floor(my);
      const x1 = Math.min(maskWidth - 1, x0 + 1);
      const y1 = Math.min(maskHeight - 1, y0 + 1);
      const tx = mx - x0;
      const ty = my - y0;
      const v00 = mask[y0 * maskWidth + x0] ?? 0;
      const v10 = mask[y0 * maskWidth + x1] ?? 0;
      const v01 = mask[y1 * maskWidth + x0] ?? 0;
      const v11 = mask[y1 * maskWidth + x1] ?? 0;
      const top = v00 * (1 - tx) + v10 * tx;
      const bottom = v01 * (1 - tx) + v11 * tx;
      output[sy * sourceWidth + sx] = Math.round(top * (1 - ty) + bottom * ty);
    }
  }
  return { data: output, width: sourceWidth, height: sourceHeight };
}

export function computeLetterbox(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): LetterboxLayout {
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const contentWidth = Math.min(canvasWidth, Math.max(1, Math.round(sourceWidth * scale)));
  const contentHeight = Math.min(canvasHeight, Math.max(1, Math.round(sourceHeight * scale)));
  return {
    contentWidth,
    contentHeight,
    offsetX: Math.floor((canvasWidth - contentWidth) / 2),
    offsetY: Math.floor((canvasHeight - contentHeight) / 2),
    canvasWidth,
    canvasHeight,
  };
}

export function cropLetterboxMask(
  mask: Uint8Array,
  layout: LetterboxLayout,
): { data: Uint8Array; width: number; height: number } {
  const { contentWidth, contentHeight, offsetX, offsetY, canvasWidth, canvasHeight } = layout;
  if (mask.length !== canvasWidth * canvasHeight) {
    return { data: mask, width: canvasWidth, height: canvasHeight };
  }
  if (contentWidth === canvasWidth && contentHeight === canvasHeight) {
    return { data: mask, width: canvasWidth, height: canvasHeight };
  }

  const cropped = new Uint8Array(contentWidth * contentHeight);
  for (let y = 0; y < contentHeight; y += 1) {
    const sourceRow = (y + offsetY) * canvasWidth + offsetX;
    cropped.set(mask.subarray(sourceRow, sourceRow + contentWidth), y * contentWidth);
  }
  return { data: cropped, width: contentWidth, height: contentHeight };
}
