import { describe, expect, it } from 'vitest';

import { mergeSubjectWithRefiner } from '../../infrastructure/ai/matte-refiner.js';

describe('mergeSubjectWithRefiner', () => {
  it('keeps the brighter alpha per pixel', () => {
    const subject = Uint8Array.from([0, 200, 50]);
    const refined = Uint8Array.from([180, 100, 50]);
    const merged = mergeSubjectWithRefiner(subject, refined);
    expect(merged[0]).toBe(180);
    expect(merged[1]).toBe(200);
    expect(merged[2]).toBe(50);
  });
});
