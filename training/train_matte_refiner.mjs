/**
 * Matte refiner trainer (pure Node.js — no PyTorch). Weights: private/models/matte-refiner.json
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(path.join(ROOT, 'training/config.json'), 'utf8'));
const LABELS = path.resolve(ROOT, config.labelsDir);
const MODEL_DIR = path.resolve(ROOT, config.modelDir);
const CKPT_DIR = path.resolve(ROOT, config.checkpointDir);
const REPORT_DIR = path.resolve(ROOT, config.reportDir);
const SIZE = 64;
const HIDDEN = 192;
const EPOCHS = Number(config.epochs);
const LR = Number(config.learningRate);

const INPUT_DIM = SIZE * SIZE * 3;
const OUTPUT_DIM = SIZE * SIZE;

function sigmoid(x) {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

function randn(scale) {
  return (Math.random() * 2 - 1) * scale;
}

function initMatrix(rows, cols, scale) {
  const data = new Float32Array(rows * cols);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = randn(scale);
  }
  return data;
}

function initVector(len) {
  return new Float32Array(len);
}

function matVec(M, rows, cols, v) {
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

class MLP {
  constructor() {
    this.w1 = initMatrix(HIDDEN, INPUT_DIM, Math.sqrt(2 / INPUT_DIM));
    this.b1 = initVector(HIDDEN);
    this.w2 = initMatrix(OUTPUT_DIM, HIDDEN, Math.sqrt(2 / HIDDEN));
    this.b2 = initVector(OUTPUT_DIM);
  }

  forward(x) {
    const z1 = matVec(this.w1, HIDDEN, INPUT_DIM, x);
    for (let i = 0; i < HIDDEN; i += 1) {
      z1[i] = (z1[i] ?? 0) + (this.b1[i] ?? 0);
    }
    const h = new Float32Array(HIDDEN);
    for (let i = 0; i < HIDDEN; i += 1) {
      h[i] = Math.max(0, z1[i] ?? 0);
    }
    const z2 = matVec(this.w2, OUTPUT_DIM, HIDDEN, h);
    for (let i = 0; i < OUTPUT_DIM; i += 1) {
      z2[i] = (z2[i] ?? 0) + (this.b2[i] ?? 0);
    }
    const y = new Float32Array(OUTPUT_DIM);
    for (let i = 0; i < OUTPUT_DIM; i += 1) {
      y[i] = sigmoid(z2[i] ?? 0);
    }
    return { y, h, z1, z2 };
  }

  backward(x, cache, target) {
    const { y, h, z2 } = cache;
    const gradY = new Float32Array(OUTPUT_DIM);
    for (let i = 0; i < OUTPUT_DIM; i += 1) {
      gradY[i] = (y[i] ?? 0) - (target[i] ?? 0);
    }

    const gradZ2 = new Float32Array(OUTPUT_DIM);
    for (let i = 0; i < OUTPUT_DIM; i += 1) {
      const s = y[i] ?? 0;
      gradZ2[i] = (gradY[i] ?? 0) * s * (1 - s);
    }

    for (let i = 0; i < OUTPUT_DIM; i += 1) {
      this.b2[i] -= LR * (gradZ2[i] ?? 0);
      const row = i * HIDDEN;
      for (let j = 0; j < HIDDEN; j += 1) {
        this.w2[row + j] -= LR * (gradZ2[i] ?? 0) * (h[j] ?? 0);
      }
    }

    const gradH = new Float32Array(HIDDEN);
    for (let j = 0; j < HIDDEN; j += 1) {
      let sum = 0;
      for (let i = 0; i < OUTPUT_DIM; i += 1) {
        sum += (gradZ2[i] ?? 0) * (this.w2[i * HIDDEN + j] ?? 0);
      }
      gradH[j] = (h[j] ?? 0) > 0 ? sum : 0;
    }

    for (let j = 0; j < HIDDEN; j += 1) {
      this.b1[j] -= LR * (gradH[j] ?? 0);
      const row = j * INPUT_DIM;
      for (let k = 0; k < INPUT_DIM; k += 1) {
        this.w1[row + k] -= LR * (gradH[j] ?? 0) * (x[k] ?? 0);
      }
    }
  }

  toJSON() {
    return {
      version: 1,
      architecture: 'mlp',
      trainSize: SIZE,
      hidden: HIDDEN,
      w1: [...this.w1],
      b1: [...this.b1],
      w2: [...this.w2],
      b2: [...this.b2],
    };
  }
}

async function loadSample(originalPath, maskPath) {
  const rgbBuf = await sharp(originalPath).resize(SIZE, SIZE).removeAlpha().raw().toBuffer();
  const maskBuf = await sharp(maskPath).resize(SIZE, SIZE).grayscale().raw().toBuffer();
  const input = new Float32Array(INPUT_DIM);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    input[i] = (rgbBuf[i * 3] ?? 0) / 255;
    input[SIZE * SIZE + i] = (rgbBuf[i * 3 + 1] ?? 0) / 255;
    input[2 * SIZE * SIZE + i] = (rgbBuf[i * 3 + 2] ?? 0) / 255;
  }
  const target = new Float32Array(OUTPUT_DIM);
  for (let i = 0; i < OUTPUT_DIM; i += 1) {
    target[i] = (maskBuf[i] ?? 0) / 255;
  }
  return { input, target };
}

async function listSamples() {
  const split = path.resolve(ROOT, config.privateRoot, 'splits/train.txt');
  const ids = (await readFile(split, 'utf8')).split(/\r?\n/).filter(Boolean);
  const samples = [];
  for (const id of ids) {
    const dir = path.join(LABELS, id);
    const files = await readdir(dir);
    const origName = files.find((n) => /^original\./i.test(n));
    if (!origName) continue;
    samples.push({ id, originalPath: path.join(dir, origName), finalPath: path.join(dir, 'final.png') });
  }
  return samples;
}

function mse(pred, target) {
  let sum = 0;
  for (let i = 0; i < pred.length; i += 1) {
    const d = (pred[i] ?? 0) - (target[i] ?? 0);
    sum += d * d;
  }
  return sum / pred.length;
}

await mkdir(MODEL_DIR, { recursive: true });
await mkdir(CKPT_DIR, { recursive: true });
await mkdir(REPORT_DIR, { recursive: true });

const sampleMeta = await listSamples();
if (sampleMeta.length === 0) {
  console.error('No samples. Run: npm run train:bootstrap');
  process.exit(1);
}

const loaded = await Promise.all(
  sampleMeta.map(async (s) => ({
    id: s.id,
    ...(await loadSample(s.originalPath, s.finalPath)),
  })),
);

const model = new MLP();
let best = Number.POSITIVE_INFINITY;
const history = [];

for (let epoch = 1; epoch <= EPOCHS; epoch += 1) {
  let total = 0;
  for (const sample of loaded) {
    const cache = model.forward(sample.input);
    total += mse(cache.y, sample.target);
    model.backward(sample.input, cache, sample.target);
  }
  const avg = total / loaded.length;
  history.push({ epoch, loss: Number(avg.toFixed(6)) });
  console.log(`epoch ${epoch}/${EPOCHS} loss=${avg.toFixed(6)}`);
  if (avg < best) {
    best = avg;
    const json = JSON.stringify(model.toJSON());
    await writeFile(path.join(MODEL_DIR, 'matte-refiner.json'), json);
    await writeFile(path.join(CKPT_DIR, 'best.json'), json);
  }
}

const report = {
  samples: loaded.length,
  epochs: EPOCHS,
  bestLoss: best,
  model: path.join(MODEL_DIR, 'matte-refiner.json'),
  history: history.slice(-5),
};
await writeFile(path.join(REPORT_DIR, 'matte-refiner.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
