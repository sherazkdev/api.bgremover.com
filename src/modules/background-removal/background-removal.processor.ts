import type { OutputFormat, QualityMode, RemovalMode } from '../../config/constants.js';
import type { InferenceWorker } from '../../infrastructure/ai/inference-worker.js';
import type { ModelManager } from '../../infrastructure/ai/model-manager.js';
import { ForegroundPreserver } from '../../infrastructure/cv/foreground-preservation.js';
import type { FusedForeground } from '../../infrastructure/cv/types.js';
import type { ImageProcessor } from '../../infrastructure/image/image.processor.js';
import { cropLetterboxMask } from '../../infrastructure/image/letterbox.js';

export interface RemovalProcessInput {
  orientedBuffer: Buffer;
  orientedRgb?: Uint8Array;
  width: number;
  height: number;
  quality: QualityMode;
  format: OutputFormat;
  mode: RemovalMode;
  preserveText: boolean;
}

export interface RemovalProcessOutput {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/png' | 'image/webp';
  hasTransparency: boolean;
  inferenceMs: number;
  modelName: string;
  mode: RemovalMode;
  preserveText: boolean;
  textPreserved: boolean;
  subjectCoverage: number;
  overlayCoverage: number;
  usedGraphicFallback: boolean;
}

export class BackgroundRemovalProcessor {
  constructor(
    private readonly modelManager: ModelManager,
    private readonly inferenceWorker: InferenceWorker,
    private readonly imageProcessor: ImageProcessor,
    private readonly foregroundPreserver: ForegroundPreserver = new ForegroundPreserver(),
  ) {}

  public async process(input: RemovalProcessInput): Promise<RemovalProcessOutput> {
    this.modelManager.assertReady();
    const provider = this.modelManager.getProvider();

    const rgb = input.orientedRgb ?? (await this.decodeRgb(input.orientedBuffer));
    const overlayPromise = this.foregroundPreserver.detectIfNeeded(
      rgb,
      input.width,
      input.height,
      input.mode,
      input.preserveText,
    );

    const modelInput = await this.imageProcessor.prepareModelInput(
      { rgb, width: input.width, height: input.height },
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

    const preserved = await this.foregroundPreserver.fuse(
      cropped,
      await overlayPromise,
      input.width,
      input.height,
      input.mode,
      input.preserveText,
    );

    const composed = await this.imageProcessor.applySoftAlphaMask({
      orientedImage: input.orientedBuffer,
      rgb,
      matte: {
        data: preserved.alpha,
        width: input.width,
        height: input.height,
      },
      quality: input.quality,
      format: input.format,
      width: input.width,
      height: input.height,
    });

    return {
      ...composed,
      inferenceMs: inference.inferenceMs,
      modelName: provider.displayName,
      ...preservationMeta(input, preserved),
    };
  }

  private async decodeRgb(orientedBuffer: Buffer): Promise<Uint8Array> {
    const oriented = await this.imageProcessor.orientAndDecode(orientedBuffer);
    return oriented.rgb;
  }
}

function preservationMeta(
  input: RemovalProcessInput,
  preserved: FusedForeground,
): Pick<
  RemovalProcessOutput,
  | 'mode'
  | 'preserveText'
  | 'textPreserved'
  | 'subjectCoverage'
  | 'overlayCoverage'
  | 'usedGraphicFallback'
> {
  return {
    mode: input.mode,
    preserveText: input.preserveText,
    textPreserved: preserved.textPreserved,
    subjectCoverage: preserved.subjectCoverage,
    overlayCoverage: preserved.overlayCoverage,
    usedGraphicFallback: preserved.usedGraphicFallback,
  };
}
