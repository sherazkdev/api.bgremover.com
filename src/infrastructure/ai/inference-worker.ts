import { AppError, backgroundRemovalFailedError } from '../../shared/errors/app-error.js';
import type { ModelManager } from './model-manager.js';
import type { InferenceInput, InferenceOutput } from './types.js';

/**
 * Serializes inference against a single shared model instance.
 * A dedicated worker thread is intentionally not used: loading BiRefNet ONNX
 * twice (main + worker) would duplicate a large CPU model without benefit.
 * HTTP concurrency is bounded by AsyncQueue; this mutex keeps the ONNX session safe.
 */
export class InferenceWorker {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly modelManager: ModelManager) {}

  public async run(input: InferenceInput): Promise<InferenceOutput> {
    this.modelManager.assertReady();

    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.chain;
    this.chain = previous.then(
      () => gate,
      () => gate,
    );

    await previous.catch(() => undefined);
    try {
      return await this.modelManager.getProvider().infer(input);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw backgroundRemovalFailedError();
    } finally {
      release?.();
    }
  }
}
