import { describe, expect, it } from 'vitest';

import { mapLimit } from '../../shared/utils/map-limit.js';

describe('mapLimit', () => {
  it('preserves order with bounded concurrency', async () => {
    let running = 0;
    let maxRunning = 0;

    const results = await mapLimit([10, 20, 30, 40], 2, async (value, index) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      running -= 1;
      return value + index;
    });

    expect(results).toEqual([10, 21, 32, 43]);
    expect(maxRunning).toBe(2);
  });

  it('returns an empty array for no items', async () => {
    await expect(mapLimit([], 3, async (value) => value)).resolves.toEqual([]);
  });

  it('rejects a concurrency below 1', async () => {
    await expect(mapLimit([1], 0, async (value) => value)).rejects.toThrow(
      /concurrency must be at least 1/,
    );
  });
});
