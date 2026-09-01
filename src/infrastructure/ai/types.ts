import type { QualityMode } from '../../config/constants.js';

export type ModelState = 'idle' | 'loading' | 'ready' | 'failed';

export interface AlphaMatte {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface InferenceInput {
  pixels: Uint8Array;
  width: number;
  height: number;
  quality: QualityMode;
  originalWidth?: number;
  originalHeight?: number;
}

export interface InferenceOutput {
  matte: AlphaMatte;
  inferenceMs: number;
  modelInputWidth: number;
  modelInputHeight: number;
}

export interface SegmentationProvider {
  readonly modelId: string;
  readonly displayName: string;
  readonly inputWidth: number;
  readonly inputHeight: number;
  initialize(): Promise<void>;
  infer(input: InferenceInput): Promise<InferenceOutput>;
}

export interface ModelStatus {
  state: ModelState;
  modelId: string;
  displayName: string;
  error: string | null;
}
