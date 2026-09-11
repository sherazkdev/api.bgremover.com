import {
  MODEL_DISPLAY_NAME_GRAPHIC,
  type OutputFormat,
  type QualityMode,
  type RemovalMode,
} from '../../config/constants.js';
import type { InferenceWorker } from '../../infrastructure/ai/inference-worker.js';
import type { AlphaMatte } from '../../infrastructure/ai/types.js';
import type { ModelManager } from '../../infrastructure/ai/model-manager.js';
import { ForegroundPreserver } from '../../infrastructure/cv/foreground-preservation.js';
import { shouldRouteToGraphicModel } from '../../infrastructure/cv/mask-fusion.js';
import type { PreservationOptions } from '../../infrastructure/cv/preservation-options.js';
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
  preservation: PreservationOptions;
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
  preserveLogos: boolean;
  preserveTextContainers: boolean;
  textPreserved: boolean;
  needsReview: boolean;
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
    const overlays = await this.foregroundPreserver.detectIfNeeded(
      rgb,
      input.width,
      input.height,
      input.mode,
      input.preservation,
    );
    const useGraphicModel = shouldRouteToGraphicModel(
      input.mode,
      overlays,
      rgb,
      input.width,
      input.height,
    );

    let subject: AlphaMatte = {
      data: new Uint8Array(input.width * input.height),
      width: input.width,
      height: input.height,
    };
    let inferenceMs = 0;
    let modelName = MODEL_DISPLAY_NAME_GRAPHIC;

    if (!useGraphicModel) {
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
      subject = cropLetterboxMask(inference.matte.data, {
        ...modelInput.letterbox,
        canvasWidth: inference.matte.width,
        canvasHeight: inference.matte.height,
      });
      inferenceMs = inference.inferenceMs;
      modelName = provider.displayName;
    }

    const preserved = await this.foregroundPreserver.fuse(
      subject,
      overlays,
      rgb,
      input.width,
      input.height,
      input.mode,
      input.preservation,
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
      inferenceMs,
      modelName,
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
  | 'preserveLogos'
  | 'preserveTextContainers'
  | 'textPreserved'
  | 'needsReview'
  | 'subjectCoverage'
  | 'overlayCoverage'
  | 'usedGraphicFallback'
> {
  return {
    mode: input.mode,
    preserveText: input.preservation.preserveText,
    preserveLogos: input.preservation.preserveLogos,
    preserveTextContainers: input.preservation.preserveTextContainers,
    textPreserved: preserved.textPreserved,
    needsReview: preserved.needsReview,
    subjectCoverage: preserved.subjectCoverage,
    overlayCoverage: preserved.overlayCoverage,
    usedGraphicFallback: preserved.usedGraphicFallback,
  };
}
