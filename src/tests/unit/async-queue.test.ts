import { describe, expect, it } from 'vitest';

import { AsyncQueue, QueueFullError } from '../../shared/utils/async-queue.js';

describe('AsyncQueue', () => {
  it('respects concurrency', async () => {
    const queue = new AsyncQueue({ concurrency: 2, maxQueueSize: 10 });
    let running = 0;
    let maxRunning = 0;

    const job = async (): Promise<void> => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
      running -= 1;
    };

    await Promise.all([queue.add(job), queue.add(job), queue.add(job), queue.add(job)]);
    expect(maxRunning).toBe(2);
    expect(queue.stats.active).toBe(0);
    expect(queue.stats.queued).toBe(0);
  });

  it('rejects overflow when the queue is full', async () => {
    const queue = new AsyncQueue({ concurrency: 1, maxQueueSize: 1 });
    let release: (() => void) | undefined;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = queue.add(() => blocker);
    const second = queue.add(async () => 'queued');

    await expect(queue.add(async () => 'overflow')).rejects.toBeInstanceOf(QueueFullError);
    expect(queue.stats.active).toBe(1);
    expect(queue.stats.queued).toBe(1);

    release?.();
    await first;
    await expect(second).resolves.toBe('queued');
  });

  it('reports whether another job can be accepted', async () => {
    const queue = new AsyncQueue({ concurrency: 1, maxQueueSize: 1 });
    expect(queue.canAccept(1)).toBe(true);
    expect(queue.canAccept(2)).toBe(true);

    let release: (() => void) | undefined;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = queue.add(() => blocker);
    expect(queue.canAccept(1)).toBe(true);
    expect(queue.canAccept(2)).toBe(false);

    const second = queue.add(async () => 'queued');
    expect(queue.canAccept(1)).toBe(false);

    release?.();
    await first;
    await second;
    expect(queue.canAccept(1)).toBe(true);
  });

  it('does not stall after a failed job', async () => {
    const queue = new AsyncQueue({ concurrency: 1, maxQueueSize: 5 });
    await expect(
      queue.add(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(queue.add(async () => 42)).resolves.toBe(42);
  });
});
