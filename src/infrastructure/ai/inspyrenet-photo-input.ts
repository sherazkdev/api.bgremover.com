import sharp from 'sharp';

/** Fit longest edge to maxEdge before loopback worker infer (upscale RGBA back to original after). */
export function computeInspyrenetWorkerSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; scaled: boolean } {
  if (maxEdge <= 0) {
    return { width, height, scaled: false };
  }
  const long = Math.max(width, height);
  if (long <= maxEdge) {
    return { width, height, scaled: false };
  }
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  };
}

export async function prepareInspyrenetWorkerImage(
  orientedBuffer: Buffer,
  originalWidth: number,
  originalHeight: number,
  maxEdge: number,
): Promise<{ buffer: Buffer; workerWidth: number; workerHeight: number }> {
  const size = computeInspyrenetWorkerSize(originalWidth, originalHeight, maxEdge);
  if (!size.scaled) {
    return { buffer: orientedBuffer, workerWidth: originalWidth, workerHeight: originalHeight };
  }
  const buffer = await sharp(orientedBuffer)
    .rotate()
    .resize(size.width, size.height, { fit: 'fill', kernel: 'lanczos3' })
    .jpeg({ quality: 95 })
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    workerWidth: meta.width ?? size.width,
    workerHeight: meta.height ?? size.height,
  };
}

export async function upscaleInspyrenetWorkerPng(
  workerPng: Buffer,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  return sharp(workerPng)
    .resize(targetWidth, targetHeight, { kernel: 'lanczos3' })
    .png({ compressionLevel: 1 })
    .toBuffer();
}
