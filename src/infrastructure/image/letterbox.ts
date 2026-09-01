export interface LetterboxLayout {
  contentWidth: number;
  contentHeight: number;
  offsetX: number;
  offsetY: number;
  canvasWidth: number;
  canvasHeight: number;
}

/** ImageNet mean as 8-bit RGB so padded pixels normalize near zero. */
export const IMAGENET_PAD_RGB = { r: 124, g: 116, b: 104 } as const;

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
