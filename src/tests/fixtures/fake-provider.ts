import type {
  InferenceInput,
  InferenceOutput,
  SegmentationProvider,
} from '../../infrastructure/ai/types.js';

export class FakeSegmentationProvider implements SegmentationProvider {
  public readonly modelId = 'onnx-community/BiRefNet_lite-ONNX';
  public readonly displayName = 'BiRefNet Lite';
  public readonly inputWidth = 64;
  public readonly inputHeight = 64;
  public initializeCount = 0;
  public inferCount = 0;
  public inferDelayMs = 0;

  public async initialize(): Promise<void> {
    this.initializeCount += 1;
  }

  public async infer(_input: InferenceInput): Promise<InferenceOutput> {
    this.inferCount += 1;
    if (this.inferDelayMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, this.inferDelayMs);
      });
    }

    const width = this.inputWidth;
    const height = this.inputHeight;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = x / width - 0.5;
        const dy = y / height - 0.5;
        const distance = Math.sqrt(dx * dx + dy * dy);
        data[y * width + x] = distance < 0.28 ? 255 : distance < 0.4 ? 115 : 10;
      }
    }

    return {
      matte: { data, width, height },
      inferenceMs: 1,
      modelInputWidth: width,
      modelInputHeight: height,
    };
  }
}

export class EmptySegmentationProvider extends FakeSegmentationProvider {
  public override async infer(_input: InferenceInput): Promise<InferenceOutput> {
    this.inferCount += 1;
    const width = this.inputWidth;
    const height = this.inputHeight;
    return {
      matte: { data: new Uint8Array(width * height), width, height },
      inferenceMs: 1,
      modelInputWidth: width,
      modelInputHeight: height,
    };
  }
}

export class FailingSegmentationProvider extends FakeSegmentationProvider {
  public override async initialize(): Promise<void> {
    this.initializeCount += 1;
    throw new Error('weights missing');
  }
}
