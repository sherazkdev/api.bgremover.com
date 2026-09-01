import type { OutputFormat, QualityMode } from '../../config/constants.js';
import type { InferenceWorker } from '../../infrastructure/ai/inference-worker.js';
import type { ModelManager } from '../../infrastructure/ai/model-manager.js';
import type { ImageProcessor } from '../../infrastructure/image/image.processor.js';
import { cropLetterboxMask } from '../../infrastructure/image/letterbox.js';

export interface RemovalProcessInput {
  orientedBuffer: Buffer;
  orientedRgb?: Uint8Array;
  width: number;
  height: number;
  quality: QualityMode;
  format: OutputFormat;
}

export interface RemovalProcessOutput {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/png' | 'image/webp';
  hasTransparency: boolean;
  inferenceMs: number;
  modelName: string;
}

export class BackgroundRemovalProcessor {
  constructor(
    private readonly modelManager: ModelManager,
    private readonly inferenceWorker: InferenceWorker,
    private readonly imageProcessor: ImageProcessor,
  ) {}

  public async process(input: RemovalProcessInput): Promise<RemovalProcessOutput> {
    this.modelManager.assertReady();
    const provider = this.modelManager.getProvider();

    const modelInput = await this.imageProcessor.prepareModelInput(
      input.orientedRgb
        ? { rgb: input.orientedRgb, width: input.width, height: input.height }
        : input.orientedBuffer,
      input.quality,
      provider.inputWidth,
      provider.inputHeight,
    );

    const inference = await this.inferenceWorker.run({
      pixels: modelInput.pixels,
      width: modelInput.width,
      height: modelInput.height,
      quality: input.quality,
      originalWidth: input.width,
      originalHeight: input.height,
    });

    const cropped = cropLetterboxMask(inference.matte.data, {
      ...modelInput.letterbox,
      canvasWidth: inference.matte.width,
      canvasHeight: inference.matte.height,
    });

    const composed = await this.imageProcessor.applySoftAlphaMask({
      orientedImage: input.orientedBuffer,
      ...(input.orientedRgb ? { rgb: input.orientedRgb } : {}),
      matte: cropped,
      quality: input.quality,
      format: input.format,
      width: input.width,
      height: input.height,
    });

    return {
      ...composed,
      inferenceMs: inference.inferenceMs,
      modelName: provider.displayName,
    };
  }
}
