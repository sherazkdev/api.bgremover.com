import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  DEFAULT_MODEL_INPUT_SIZE,
  MODEL_DISPLAY_NAME_FULL,
  MODEL_DISPLAY_NAME_LITE,
} from '../../config/constants.js';
import type { Env } from '../../config/env.js';
import {
  AppError,
  backgroundRemovalFailedError,
  modelUnavailableError,
} from '../../shared/errors/app-error.js';
import {
  assertGrayscaleMask,
  copyFloat32Values,
  copyUint8,
  float01ToUint8,
  logMaskDiagnostics,
  minMax,
} from './mask.js';
import type { InferenceInput, InferenceOutput, SegmentationProvider } from './types.js';

export type { AlphaMatte } from './types.js';

interface TensorLike {
  data: ArrayLike<number>;
  dims: number[];
  sigmoid: () => TensorLike;
}

interface ModelLike {
  (inputs: { input_image: unknown }): Promise<unknown>;
}

interface RawImageLike {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channels: number;
  grayscale: () => RawImageLike;
}

interface RawImageApi {
  new (data: Uint8Array, width: number, height: number, channels: number): unknown;
  fromTensor: (tensor: unknown, channelFormat?: string) => RawImageLike;
}

interface QuantizableTensor extends TensorLike {
  type?: string;
  mul: (value: number) => QuantizableTensor;
  to: (dtype: string) => QuantizableTensor;
}

interface TensorConstructor {
  new (type: string, data: Float32Array, dims: number[]): unknown;
}

const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];
const DEFAULT_RESCALE = 1 / 255;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTensorLike(value: unknown): value is TensorLike {
  return (
    isRecord(value) &&
    'data' in value &&
    'dims' in value &&
    Array.isArray(value.dims) &&
    typeof value.sigmoid === 'function'
  );
}

export function resolveModelDisplayName(modelId: string): string {
  const normalized = modelId.toLowerCase();
  if (normalized.includes('lite')) {
    return MODEL_DISPLAY_NAME_LITE;
  }
  if (normalized.includes('birefnet')) {
    return MODEL_DISPLAY_NAME_FULL;
  }
  return modelId;
}

export function extractAlphaMatte(output: unknown): {
  data: Uint8Array;
  width: number;
  height: number;
} {
  const tensor = selectOutputTensor(output);
  const activated = tensor.sigmoid();
  const values = copyFloat32Values(activated.data);
  const squeezed = squeezeMatte(values, activated.dims);
  const data = float01ToUint8(squeezed.data);
  assertGrayscaleMask(data, squeezed.width, squeezed.height, 1);
  return { data, width: squeezed.width, height: squeezed.height };
}

function dropBatchDim(tensor: TensorLike): TensorLike {
  if (tensor.dims.length !== 4) {
    return tensor;
  }
  const first = (tensor as unknown as Record<number, unknown>)[0];
  return isTensorLike(first) ? first : tensor;
}

function toQuantizedMaskTensor(tensor: TensorLike): QuantizableTensor {
  const activated = tensor.sigmoid();
  const quantizable = activated as QuantizableTensor;
  if (typeof quantizable.mul !== 'function' || typeof quantizable.to !== 'function') {
    throw backgroundRemovalFailedError('Model tensor does not support official mask quantization');
  }
  return quantizable.mul(255).to('uint8');
}

function selectOutputTensor(output: unknown): TensorLike {
  if (isTensorLike(output)) {
    return output;
  }
  if (!isRecord(output)) {
    throw backgroundRemovalFailedError('Model returned an unexpected output');
  }

  const candidate =
    output.output_image ??
    output.logits ??
    output.pred ??
    output.output ??
    output.last_hidden_state;

  if (Array.isArray(candidate) && isTensorLike(candidate[0])) {
    return candidate[0];
  }
  if (isTensorLike(candidate)) {
    return candidate;
  }

  throw backgroundRemovalFailedError('Model output did not contain an alpha matte tensor');
}

function parseTensorLayout(dims: number[]): {
  batch: number;
  channels: number;
  height: number;
  width: number;
} {
  if (dims.length === 4) {
    return {
      batch: dims[0] ?? 1,
      channels: dims[1] ?? 1,
      height: dims[2] ?? DEFAULT_MODEL_INPUT_SIZE,
      width: dims[3] ?? DEFAULT_MODEL_INPUT_SIZE,
    };
  }
  if (dims.length === 3) {
    return {
      batch: 1,
      channels: dims[0] ?? 1,
      height: dims[1] ?? DEFAULT_MODEL_INPUT_SIZE,
      width: dims[2] ?? DEFAULT_MODEL_INPUT_SIZE,
    };
  }
  if (dims.length === 2) {
    return {
      batch: 1,
      channels: 1,
      height: dims[0] ?? DEFAULT_MODEL_INPUT_SIZE,
      width: dims[1] ?? DEFAULT_MODEL_INPUT_SIZE,
    };
  }
  throw backgroundRemovalFailedError('Model tensor has an unsupported shape');
}

function squeezeMatte(
  values: Float32Array,
  dims: number[],
): {
  data: Float32Array;
  width: number;
  height: number;
} {
  const { width, height } = parseTensorLayout(dims);
  if (values.length === width * height) {
    return { data: values, width, height };
  }
  const data = new Float32Array(width * height);
  const stride = Math.max(1, Math.floor(values.length / (width * height)));
  for (let index = 0; index < data.length; index += 1) {
    data[index] = values[index * stride] ?? 0;
  }
  return { data, width, height };
}

export function normalizeRgbToNchw(
  pixels: Uint8Array,
  width: number,
  height: number,
  mean: number[] = IMAGENET_MEAN,
  std: number[] = IMAGENET_STD,
  rescale: number = DEFAULT_RESCALE,
): { data: Float32Array; dims: [number, number, number, number] } {
  if (pixels.length !== width * height * 3) {
    throw backgroundRemovalFailedError('Model input pixel buffer has the wrong size');
  }

  const plane = width * height;
  const data = new Float32Array(3 * plane);
  for (let index = 0; index < plane; index += 1) {
    const red = (pixels[index * 3] ?? 0) * rescale;
    const green = (pixels[index * 3 + 1] ?? 0) * rescale;
    const blue = (pixels[index * 3 + 2] ?? 0) * rescale;
    data[index] = (red - (mean[0] ?? 0)) / (std[0] ?? 1);
    data[plane + index] = (green - (mean[1] ?? 0)) / (std[1] ?? 1);
    data[2 * plane + index] = (blue - (mean[2] ?? 0)) / (std[2] ?? 1);
  }

  return { data, dims: [1, 3, height, width] };
}

export class BiRefNetProvider implements SegmentationProvider {
  public readonly modelId: string;
  public readonly displayName: string;
  public inputWidth = DEFAULT_MODEL_INPUT_SIZE;
  public inputHeight = DEFAULT_MODEL_INPUT_SIZE;

  private readonly dtype: Env['MODEL_DTYPE'];
  private readonly hubEndpoint: string;
  private model: ModelLike | null = null;
  private rawImage: RawImageApi | null = null;
  private Tensor: TensorConstructor | null = null;

  constructor(env: Pick<Env, 'MODEL_ID' | 'MODEL_DTYPE' | 'HF_ENDPOINT'>) {
    this.modelId = env.MODEL_ID;
    this.dtype = env.MODEL_DTYPE;
    this.hubEndpoint = env.HF_ENDPOINT.replace(/\/+$/, '');
    this.displayName = resolveModelDisplayName(env.MODEL_ID);
  }

  public async initialize(): Promise<void> {
    const transformers = await import('@huggingface/transformers');
    const cacheDir = path.resolve(process.cwd(), '.cache');
    transformers.env.allowLocalModels = true;
    transformers.env.cacheDir = cacheDir;
    transformers.env.useFSCache = true;
    transformers.env.remoteHost = `${this.hubEndpoint}/`;

    await this.prefetchModelFiles(cacheDir);

    const [model, processor] = await Promise.all([
      transformers.AutoModel.from_pretrained(this.modelId, {
        dtype: this.dtype,
        session_options: buildOnnxSessionOptions(),
        progress_callback: logModelProgress,
      }),
      transformers.AutoProcessor.from_pretrained(this.modelId, {
        progress_callback: logModelProgress,
      }),
    ]);

    this.model = model as unknown as ModelLike;
    this.rawImage = transformers.RawImage as unknown as RawImageApi;
    this.Tensor = transformers.Tensor as unknown as TensorConstructor;
    this.readProcessorInputSize(processor);
  }

  public async infer(input: InferenceInput): Promise<InferenceOutput> {
    if (!this.model || !this.Tensor || !this.rawImage) {
      throw modelUnavailableError();
    }

    const started = Date.now();
    try {
      const normalized = normalizeRgbToNchw(input.pixels, input.width, input.height);
      const pixelValues = new this.Tensor('float32', normalized.data, [...normalized.dims]);
      const rawOutput = await this.model({ input_image: pixelValues });
      const matte = this.maskFromOfficialOutput(
        rawOutput,
        input.originalWidth,
        input.originalHeight,
      );
      return {
        matte,
        inferenceMs: Date.now() - started,
        modelInputWidth: this.inputWidth,
        modelInputHeight: this.inputHeight,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown inference error';
      console.error(`BiRefNet inference failed: ${message}`);
      throw backgroundRemovalFailedError();
    }
  }

  private maskFromOfficialOutput(
    rawOutput: unknown,
    originalWidth?: number,
    originalHeight?: number,
  ): {
    data: Uint8Array;
    width: number;
    height: number;
  } {
    if (!this.rawImage) {
      throw modelUnavailableError();
    }

    const head = dropBatchDim(selectOutputTensor(rawOutput));
    const range = minMax(head.data);
    logMaskDiagnostics('output tensor', {
      dimensions: [...head.dims],
      dtype: 'type' in head && typeof head.type === 'string' ? head.type : 'unknown',
      elementCount: head.data.length,
      minimum: range.min,
      maximum: range.max,
    });

    const quantized = toQuantizedMaskTensor(head);
    const maskImage = this.rawImage.fromTensor(quantized);
    const gray = maskImage.channels === 1 ? maskImage : maskImage.grayscale();
    const data = copyUint8(gray.data);
    assertGrayscaleMask(data, gray.width, gray.height, gray.channels);
    logMaskDiagnostics('model mask', {
      width: gray.width,
      height: gray.height,
      channels: gray.channels,
      byteLength: data.length,
      expectedByteLength: gray.width * gray.height,
      originalOrientedImageWidth: originalWidth ?? null,
      originalOrientedImageHeight: originalHeight ?? null,
      minimum: minMax(data).min,
      maximum: minMax(data).max,
    });
    return { data, width: gray.width, height: gray.height };
  }

  private async prefetchModelFiles(cacheDir: string): Promise<void> {
    const weightFile = this.dtype === 'fp16' ? 'model_fp16.onnx' : 'model.onnx';
    const files = ['config.json', 'preprocessor_config.json', `onnx/${weightFile}`];
    for (const relative of files) {
      const destination = path.join(cacheDir, this.modelId, relative);
      const source = `${this.hubEndpoint}/${this.modelId}/resolve/main/${relative}`;
      if (await fileExistsWithSize(destination)) {
        continue;
      }
      await downloadToFile(source, destination);
    }
  }

  private readProcessorInputSize(processor: unknown): void {
    const config = readProcessorConfig(processor);
    const size = isRecord(config.size) ? config.size : null;
    if (!size) {
      return;
    }
    const width = typeof size.width === 'number' ? size.width : this.inputWidth;
    const height = typeof size.height === 'number' ? size.height : this.inputHeight;
    this.inputWidth = width;
    this.inputHeight = height;
  }
}

function readProcessorConfig(processor: unknown): Record<string, unknown> {
  if (!isRecord(processor)) {
    return {};
  }
  const nested = isRecord(processor.image_processor)
    ? processor.image_processor
    : isRecord(processor.feature_extractor)
      ? processor.feature_extractor
      : processor;
  if (isRecord(nested.config)) {
    return nested.config;
  }
  return nested;
}

async function fileExistsWithSize(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function downloadToFile(url: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.download`;
  const attempts = 5;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await downloadAttempt(url, destination, temporaryPath);
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `Model download attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to download ${url}`);
}

async function downloadAttempt(
  url: string,
  destination: string,
  temporaryPath: string,
): Promise<void> {
  let existing: number;
  try {
    existing = (await stat(temporaryPath)).size;
  } catch {
    existing = 0;
  }

  const headers = new Headers();
  if (existing > 0) {
    headers.set('Range', `bytes=${existing}-`);
  }

  const response = await fetch(url, { headers });
  if (response.status === 200 && existing > 0) {
    await rm(temporaryPath, { force: true });
    existing = 0;
  }
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }

  const total = existing + Number(response.headers.get('content-length') ?? '0');
  let loaded = existing;
  let lastLogged = existing > 0 ? Math.floor((existing / Math.max(total, 1)) * 100) : -10;
  const nodeStream = Readable.fromWeb(response.body);
  nodeStream.on('data', (chunk: Buffer) => {
    loaded += chunk.byteLength;
    if (total > 0) {
      const percent = Math.floor((loaded / total) * 100);
      if (percent >= lastLogged + 10) {
        lastLogged = percent;
        console.warn(`Downloading model weights: ${percent}% (${loaded}/${total})`);
      }
    }
  });

  const fileStream = createWriteStream(temporaryPath, { flags: existing > 0 ? 'a' : 'w' });
  await pipeline(nodeStream, fileStream);
  const finalSize = (await stat(temporaryPath)).size;
  if (total > 0 && finalSize < total) {
    throw new Error(`Incomplete download: received ${finalSize} of ${total} bytes`);
  }
  await rename(temporaryPath, destination);
}

function buildOnnxSessionOptions(): {
  graphOptimizationLevel: 'all';
  enableCpuMemArena: boolean;
  enableMemPattern: boolean;
  intraOpNumThreads: number;
  interOpNumThreads: number;
} {
  const threads = Math.min(4, Math.max(1, availableParallelism()));
  return {
    graphOptimizationLevel: 'all',
    enableCpuMemArena: true,
    enableMemPattern: true,
    intraOpNumThreads: threads,
    interOpNumThreads: 1,
  };
}

function logModelProgress(info: unknown): void {
  if (!isRecord(info)) {
    return;
  }
  const status = typeof info.status === 'string' ? info.status : 'progress';
  const file = typeof info.file === 'string' ? info.file : 'model';
  if (status === 'ready' || status === 'done' || status === 'initiate') {
    console.warn(`Model ${status}: ${file}`);
  }
}
