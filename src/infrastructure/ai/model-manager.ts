import { modelLoadingError, modelUnavailableError } from '../../shared/errors/app-error.js';
import type { ModelState, ModelStatus, SegmentationProvider } from './types.js';

export class ModelManager {
  private state: ModelState = 'idle';
  private loadPromise: Promise<void> | null = null;
  private lastError: string | null = null;

  constructor(private readonly provider: SegmentationProvider) {}

  public getStatus(): ModelStatus {
    return {
      state: this.state,
      modelId: this.provider.modelId,
      displayName: this.provider.displayName,
      error: this.lastError,
    };
  }

  public getState(): ModelState {
    return this.state;
  }

  public getProvider(): SegmentationProvider {
    return this.provider;
  }

  public assertReady(): void {
    if (this.state === 'loading' || this.state === 'idle') {
      throw modelLoadingError();
    }
    if (this.state !== 'ready') {
      throw modelUnavailableError();
    }
  }

  public initialize(): Promise<void> {
    if (this.state === 'ready') {
      return Promise.resolve();
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.state = 'loading';
    this.lastError = null;
    this.loadPromise = this.loadOnce();
    return this.loadPromise;
  }

  private async loadOnce(): Promise<void> {
    try {
      await this.provider.initialize();
      this.state = 'ready';
    } catch (error) {
      this.state = 'failed';
      this.lastError = error instanceof Error ? error.message : 'Model initialization failed';
      this.loadPromise = null;
      throw error;
    }
  }
}

let singleton: ModelManager | null = null;

export function getSharedModelManager(factory: () => ModelManager): ModelManager {
  if (!singleton) {
    singleton = factory();
  }
  return singleton;
}

export function resetSharedModelManager(): void {
  singleton = null;
}
