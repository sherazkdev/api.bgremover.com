import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

export interface MatteRefinerWeights {
  version: number;
  architecture: 'mlp';
  trainSize: number;
  hidden: number;
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number[];
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

function matVec(M: Float32Array, rows: number, cols: number, v: Float32Array): Float32Array {
  const out = new Float32Array(rows);
  for (let r = 0; r < rows; r += 1) {
    let sum = 0;
    const row = r * cols;
    for (let c = 0; c < cols; c += 1) {
      sum += (M[row + c] ?? 0) * (v[c] ?? 0);
    }
    out[r] = sum;
  }
  return out;
}

export class MatteRefiner {
  private readonly size: number;
  private readonly hidden: number;
  private readonly inputDim: number;
  private readonly outputDim: number;
  private readonly w1: Float32Array;
  private readonly b1: Float32Array;
  private readonly w2: Float32Array;
  private readonly b2: Float32Array;

  constructor(weights: MatteRefinerWeights) {
    if (weights.architecture !== 'mlp') {
      throw new Error('Unsupported matte refiner architecture');
    }
    this.size = weights.trainSize;
    this.hidden = weights.hidden;
    this.inputDim = this.size * this.size * 3;
    this.outputDim = this.size * this.size;
    this.w1 = Float32Array.from(weights.w1);
    this.b1 = Float32Array.from(weights.b1);
    this.w2 = Float32Array.from(weights.w2);
    this.b2 = Float32Array.from(weights.b2);
  }

  public static async loadFromFile(filePath: string): Promise<MatteRefiner | null> {
    const resolved = path.resolve(filePath);
    try {
      const info = await stat(resolved);
      if (!info.isFile()) {
        return null;
      }
    } catch {
      return null;
    }
    const raw = JSON.parse(await readFile(resolved, 'utf8')) as MatteRefinerWeights;
    return new MatteRefiner(raw);
  }

  public async predictMask(rgb: Uint8Array, width: number, height: number): Promise<Uint8Array> {
    const resized = await sharp(Buffer.from(rgb), {
      raw: { width, height, channels: 3 },
    })
      .resize(this.size, this.size)
      .removeAlpha()
      .raw()
      .toBuffer();

    const input = new Float32Array(this.inputDim);
    const plane = this.size * this.size;
    for (let i = 0; i < plane; i += 1) {
      input[i] = (resized[i * 3] ?? 0) / 255;
      input[plane + i] = (resized[i * 3 + 1] ?? 0) / 255;
      input[2 * plane + i] = (resized[i * 3 + 2] ?? 0) / 255;
    }

    const z1 = matVec(this.w1, this.hidden, this.inputDim, input);
    for (let i = 0; i < this.hidden; i += 1) {
      z1[i] = Math.max(0, (z1[i] ?? 0) + (this.b1[i] ?? 0));
    }
    const z2 = matVec(this.w2, this.outputDim, this.hidden, z1);
    const small = Buffer.alloc(plane);
    for (let i = 0; i < this.outputDim; i += 1) {
      const value = sigmoid((z2[i] ?? 0) + (this.b2[i] ?? 0));
      small[i] = Math.max(0, Math.min(255, Math.round(value * 255)));
    }

    const upscaled = await sharp(small, {
      raw: { width: this.size, height: this.size, channels: 1 },
    })
      .resize(width, height)
      .raw()
      .toBuffer();

    return new Uint8Array(upscaled);
  }
}

export function mergeSubjectWithRefiner(subject: Uint8Array, refined: Uint8Array): Uint8Array {
  const output = new Uint8Array(subject.length);
  for (let i = 0; i < subject.length; i += 1) {
    const s = subject[i] ?? 0;
    const r = refined[i] ?? 0;
    if (s >= 96) {
      output[i] = Math.max(s, r);
    } else if (s >= 20) {
      output[i] = Math.max(s, Math.min(r, s + 40));
    } else {
      output[i] = s;
    }
  }
  return output;
}
