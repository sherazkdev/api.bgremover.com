import {
  MODEL_DISPLAY_NAME_GRAPHIC,
  MODEL_DISPLAY_NAME_INSPYRENET,
  type OutputFormat,
  type PhotoRemovalEngine,
  type QualityMode,
  type RemovalMode,
} from '../../config/constants.js';

/** Person/photo uploads only — graphic, text, and product/object modes keep BiRefNet paths. */
const INSPIRENET_PHOTO_MODES = new Set<RemovalMode>(['auto', 'person']);

import type { InspyrenetWorkerClient } from '../../infrastructure/ai/inspyrenet-worker.client.js';
import { processingFailedError } from '../../shared/errors/app-error.js';
import sharp from 'sharp';
import type { InferenceWorker } from '../../infrastructure/ai/inference-worker.js';
import type { MatteRefiner } from '../../infrastructure/ai/matte-refiner.js';
import { mergeSubjectWithRefiner } from '../../infrastructure/ai/matte-refiner.js';
import type { AlphaMatte } from '../../infrastructure/ai/types.js';
import type { ModelManager } from '../../infrastructure/ai/model-manager.js';
import { ForegroundPreserver } from '../../infrastructure/cv/foreground-preservation.js';
import { estimateBackgroundColor } from '../../infrastructure/cv/color.js';
import { shouldRouteToGraphicModel } from '../../infrastructure/cv/mask-fusion.js';
import type { PreservationOptions } from '../../infrastructure/cv/preservation-options.js';
import type { FusedForeground } from '../../infrastructure/cv/types.js';
import type { ImageProcessor } from '../../infrastructure/image/image.processor.js';
import { cropLetterboxMask, mapCoverMaskToSource, mapStretchMaskToSource } from '../../infrastructure/image/letterbox.js';

export interface RemovalProcessInput {
  orientedBuffer: Buffer;
  orientedRgb?: Uint8Array;
  width: number;
  height: number;
  quality: QualityMode;
  format: OutputFormat;
  mode: RemovalMode;
  preservation: PreservationOptions;
  requestId?: string;
}

export interface ProcessingStageMs {
  workerRoundTripMs: number;
  workerDecodeMs: number;
  workerInferMs: number;
  workerPngMs: number;
  nodePostMs: number;
}

export interface RemovalProcessOutput {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/png' | 'image/webp';
  hasTransparency: boolean;
  inferenceMs: number;
  stageMs?: ProcessingStageMs;
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
    private readonly photoEngine: PhotoRemovalEngine,
    private readonly inspyrenetClient: InspyrenetWorkerClient | null = null,
    private readonly foregroundPreserver: ForegroundPreserver = new ForegroundPreserver(),
    private readonly matteRefiner: MatteRefiner | null = null,
  ) {}

  public async process(input: RemovalProcessInput): Promise<RemovalProcessOutput> {
    this.modelManager.assertReady();

    if (
      this.photoEngine === 'inspyrenet' &&
      INSPIRENET_PHOTO_MODES.has(input.mode) &&
      this.inspyrenetClient
    ) {
      return this.processInspyrenetPhoto(input);
    }

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

    if (
      !useGraphicModel &&
      this.photoEngine === 'inspyrenet' &&
      INSPIRENET_PHOTO_MODES.has(input.mode)
    ) {
      return this.processInspyrenetPhoto(input);
    }

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
        input.mode,
      );
      const inference = await this.inferenceWorker.run({
        pixels: modelInput.pixels,
        width: modelInput.width,
        height: modelInput.height,
        quality: input.quality,
        originalWidth: input.width,
        originalHeight: input.height,
      });
      if (modelInput.layout.mode === 'stretch') {
        subject = mapStretchMaskToSource(
          inference.matte.data,
          inference.matte.width,
          inference.matte.height,
          input.width,
          input.height,
        );
      } else if (modelInput.layout.mode === 'cover') {
        subject = mapCoverMaskToSource(
          inference.matte.data,
          inference.matte.width,
          inference.matte.height,
          modelInput.layout.cover,
        );
      } else {
        subject = cropLetterboxMask(inference.matte.data, {
          ...modelInput.layout.letterbox,
          canvasWidth: inference.matte.width,
          canvasHeight: inference.matte.height,
        });
      }
      if (this.matteRefiner) {
        const { variance } = estimateBackgroundColor(rgb, input.width, input.height);
        if (variance <= 28) {
          const refined = await this.matteRefiner.predictMask(rgb, input.width, input.height);
          subject = {
            ...subject,
            data: mergeSubjectWithRefiner(subject.data, refined),
          };
        }
      }
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
      subjectCutout: !preserved.usedGraphicFallback,
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

  /** Photo path: worker RGBA only — no overlay fusion, refiner, or BiRefNet matte CV. */
  private async processInspyrenetPhoto(input: RemovalProcessInput): Promise<RemovalProcessOutput> {
    if (!this.inspyrenetClient) {
      throw processingFailedError('InSPyReNet worker is not configured');
    }
    const requestId = input.requestId ?? crypto.randomUUID();
    const worker = await this.inspyrenetClient.removePhoto(input.orientedBuffer, requestId);
    const nodePostStarted = Date.now();
    const { subjectCoverage, hasTransparency } = await inspectWorkerPng(
      worker.buffer,
      input.width,
      input.height,
    );
    let buffer: Buffer = worker.buffer;
    let mimeType: 'image/png' | 'image/webp' = 'image/png';
    if (input.format === 'webp') {
      buffer = await sharp(worker.buffer)
        .webp({ quality: input.quality === 'hd' ? 92 : 82, effort: 4 })
        .toBuffer();
      mimeType = 'image/webp';
    }
    const nodePostMs = Date.now() - nodePostStarted;
    const preserved: FusedForeground = {
      alpha: new Uint8Array(0),
      needsReview: false,
      textPreserved: false,
      subjectCoverage,
      overlayCoverage: 0,
      fusedCoverage: subjectCoverage,
      graphicScore: 0,
      usedGraphicFallback: false,
    };
    return {
      buffer,
      width: input.width,
      height: input.height,
      mimeType,
      hasTransparency,
      inferenceMs: worker.workerInferMs || worker.durationMs,
      stageMs: {
        workerRoundTripMs: worker.roundTripMs,
        workerDecodeMs: worker.workerDecodeMs,
        workerInferMs: worker.workerInferMs || worker.durationMs,
        workerPngMs: worker.workerPngMs,
        nodePostMs,
      },
      modelName: MODEL_DISPLAY_NAME_INSPYRENET,
      ...preservationMeta(input, preserved),
    };
  }
}

async function inspectWorkerPng(
  png: Buffer,
  expectedWidth: number,
  expectedHeight: number,
): Promise<{ subjectCoverage: number; hasTransparency: boolean }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== expectedWidth || info.height !== expectedHeight) {
    throw processingFailedError('InSPyReNet worker returned unexpected dimensions');
  }
  const pixels = info.width * info.height;
  let opaque = 0;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i] ?? 0;
    if (a === 0) transparent += 1;
    else if (a === 255) opaque += 1;
  }
  const subjectCoverage = opaque / pixels;
  return { subjectCoverage, hasTransparency: transparent > pixels * 0.02 };
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
