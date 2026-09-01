import { backgroundRemovalFailedError } from '../../shared/errors/app-error.js';

export function copyUint8(source: ArrayLike<number>): Uint8Array {
  const copy = new Uint8Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    copy[index] = source[index] ?? 0;
  }
  return copy;
}

export function copyFloat32Values(source: ArrayLike<number>): Float32Array {
  const copy = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    copy[index] = Number(source[index] ?? 0);
  }
  return copy;
}

export function float01ToUint8(values: ArrayLike<number>): Uint8Array {
  const bytes = new Uint8Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    bytes[index] = Math.max(0, Math.min(255, Math.round((values[index] ?? 0) * 255)));
  }
  return bytes;
}

export function minMax(values: ArrayLike<number>): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index] ?? 0);
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
  };
}

export function assertGrayscaleMask(
  data: ArrayLike<number>,
  width: number,
  height: number,
  channels: number,
): void {
  if (channels !== 1) {
    throw backgroundRemovalFailedError(
      `Alpha mask must be a single grayscale channel, received ${channels}`,
    );
  }
  const expected = width * height;
  if (data.length !== expected) {
    throw backgroundRemovalFailedError(
      `Mask buffer length ${data.length} does not equal width × height (${width} × ${height} = ${expected})`,
    );
  }
}

export function refineAlphaMatte(data: Uint8Array): Uint8Array {
  const refined = new Uint8Array(data.length);
  const low = 18;
  const high = 232;
  const span = high - low;

  for (let index = 0; index < data.length; index += 1) {
    const value = data[index] ?? 0;
    if (value <= low) {
      refined[index] = 0;
      continue;
    }
    if (value >= high) {
      refined[index] = 255;
      continue;
    }
    const t = (value - low) / span;
    refined[index] = Math.round(t * t * (3 - 2 * t) * 255);
  }

  return refined;
}

export function logMaskDiagnostics(label: string, info: Record<string, unknown>): void {
  if (process.env.DEBUG_BG_MASK !== '1') {
    return;
  }
  console.warn(`[mask] ${label}`, info);
}
