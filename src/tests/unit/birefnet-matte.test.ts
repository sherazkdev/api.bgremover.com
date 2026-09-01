import { describe, expect, it } from 'vitest';

import {
  extractAlphaMatte,
  normalizeRgbToNchw,
  resolveModelDisplayName,
} from '../../infrastructure/ai/birefnet.provider.js';

function tensor(data: number[], dims: number[]) {
  return {
    data,
    dims,
    sigmoid() {
      return {
        data: data.map((value) => 1 / (1 + Math.exp(-value))),
        dims,
        sigmoid() {
          return this;
        },
      };
    },
  };
}

describe('extractAlphaMatte', () => {
  it('keeps a soft 0-1 matte without thresholding', () => {
    const matte = extractAlphaMatte({
      output_image: tensor([0, 2, -2, 10], [1, 1, 2, 2]),
    });
    expect(matte.width).toBe(2);
    expect(matte.height).toBe(2);
    expect(matte.data.length).toBe(4);
    expect(matte.data[0]).toBeGreaterThan(100);
    expect(matte.data[0]).toBeLessThan(160);
    expect(matte.data[1]).toBeGreaterThan(200);
    expect(matte.data[2]).toBeLessThan(50);
    expect(matte.data[3]).toBeGreaterThan(250);
  });

  it('rejects unexpected model output', () => {
    expect(() => extractAlphaMatte({ nope: true })).toThrow(/Background removal failed/);
  });
});

describe('normalizeRgbToNchw', () => {
  it('writes ImageNet-normalized CHW planes', () => {
    const pixels = Uint8Array.from([255, 0, 0, 0, 255, 0]);
    const tensor = normalizeRgbToNchw(pixels, 2, 1);
    expect(tensor.dims).toEqual([1, 3, 1, 2]);
    expect(tensor.data[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(tensor.data[1]).toBeCloseTo((0 - 0.485) / 0.229, 5);
    expect(tensor.data[2]).toBeCloseTo((0 - 0.456) / 0.224, 5);
    expect(tensor.data[3]).toBeCloseTo((1 - 0.456) / 0.224, 5);
  });

  it('rejects a buffer that is not packed RGB', () => {
    expect(() => normalizeRgbToNchw(Uint8Array.from([1, 2]), 2, 2)).toThrow(
      /Background removal failed/,
    );
  });
});

describe('resolveModelDisplayName', () => {
  it('labels lite and full BiRefNet models', () => {
    expect(resolveModelDisplayName('onnx-community/BiRefNet_lite-ONNX')).toBe('BiRefNet Lite');
    expect(resolveModelDisplayName('studioludens/birefnet-lite-512')).toBe('BiRefNet Lite');
    expect(resolveModelDisplayName('onnx-community/BiRefNet-ONNX')).toBe('BiRefNet');
  });
});
