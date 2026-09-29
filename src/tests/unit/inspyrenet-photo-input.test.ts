import { describe, expect, it } from 'vitest';

import { computeInspyrenetWorkerSize } from '../../infrastructure/ai/inspyrenet-photo-input.js';

describe('computeInspyrenetWorkerSize', () => {
  it('keeps small images unchanged', () => {
    expect(computeInspyrenetWorkerSize(480, 640, 2048)).toEqual({
      width: 480,
      height: 640,
      scaled: false,
    });
  });

  it('scales down when longest edge exceeds max', () => {
    const r = computeInspyrenetWorkerSize(4000, 3000, 2048);
    expect(r.scaled).toBe(true);
    expect(Math.max(r.width, r.height)).toBe(2048);
  });

  it('disables cap when maxEdge is 0', () => {
    expect(computeInspyrenetWorkerSize(5000, 4000, 0).scaled).toBe(false);
  });
});
