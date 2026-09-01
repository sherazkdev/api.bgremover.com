import { describe, expect, it } from 'vitest';

import { ModelManager } from '../../infrastructure/ai/model-manager.js';
import {
  FakeSegmentationProvider,
  FailingSegmentationProvider,
} from '../fixtures/fake-provider.js';

describe('ModelManager', () => {
  it('loads the provider once even when initialize is called concurrently', async () => {
    const provider = new FakeSegmentationProvider();
    const manager = new ModelManager(provider);
    await Promise.all([manager.initialize(), manager.initialize(), manager.initialize()]);
    expect(provider.initializeCount).toBe(1);
    expect(manager.getState()).toBe('ready');
  });

  it('surfaces loading and failed states', async () => {
    const manager = new ModelManager(new FailingSegmentationProvider());
    expect(manager.getState()).toBe('idle');
    await expect(manager.initialize()).rejects.toThrow('weights missing');
    expect(manager.getState()).toBe('failed');
    expect(() => manager.assertReady()).toThrow(/unavailable/i);
  });

  it('throws MODEL_LOADING before the model is ready', () => {
    const manager = new ModelManager(new FakeSegmentationProvider());
    try {
      manager.assertReady();
      throw new Error('expected assertReady to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'MODEL_LOADING', statusCode: 503 });
    }
  });
});
