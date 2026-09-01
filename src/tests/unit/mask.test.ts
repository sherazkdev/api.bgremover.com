import { describe, expect, it } from 'vitest';

import {
  assertGrayscaleMask,
  copyFloat32Values,
  copyUint8,
  float01ToUint8,
  refineAlphaMatte,
} from '../../infrastructure/ai/mask.js';

describe('mask helpers', () => {
  it('copies uint8 values instead of reusing an ArrayBuffer view', () => {
    const floats = new Float32Array([1, 0, 0.5, 2]);
    const aliased = new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
    const copied = copyUint8(Uint8Array.from([9, 8, 7]));
    expect(copied).toEqual(Uint8Array.from([9, 8, 7]));
    expect(aliased.length).toBe(16);
    expect(copyFloat32Values(floats)).toEqual(floats);
  });

  it('converts 0-1 floats to uint8 without reading raw bytes', () => {
    expect(float01ToUint8([0, 0.5, 1])).toEqual(Uint8Array.from([0, 128, 255]));
  });

  it('rejects a mask whose byte length does not match width × height', () => {
    try {
      assertGrayscaleMask(Uint8Array.from([1, 2, 3]), 2, 2, 1);
      throw new Error('expected assertGrayscaleMask to throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'BACKGROUND_REMOVAL_FAILED',
        details: expect.stringMatching(/does not equal width/),
      });
    }
  });

  it('snaps uncertain alpha toward a clean cutout', () => {
    const refined = refineAlphaMatte(Uint8Array.from([0, 10, 18, 125, 232, 255]));
    expect(refined[0]).toBe(0);
    expect(refined[1]).toBe(0);
    expect(refined[2]).toBe(0);
    expect(refined[3]).toBeGreaterThan(100);
    expect(refined[3]).toBeLessThan(160);
    expect(refined[4]).toBe(255);
    expect(refined[5]).toBe(255);
  });

  it('rejects a multi-channel mask claimed as grayscale', () => {
    try {
      assertGrayscaleMask(new Uint8Array(12), 2, 2, 3);
      throw new Error('expected assertGrayscaleMask to throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'BACKGROUND_REMOVAL_FAILED',
        details: expect.stringMatching(/single grayscale/),
      });
    }
  });
});
