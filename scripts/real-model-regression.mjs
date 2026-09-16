/**
 * Real ONNX regression (not the fake circular test provider).
 * Usage: node --import tsx/esm scripts/real-model-regression.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { BiRefNetProvider } from '../src/infrastructure/ai/birefnet.provider.js';
import { ModelManager } from '../src/infrastructure/ai/model-manager.js';
import { createMultipartPayload } from '../src/tests/fixtures/create-test-image.js';
import { createTempUploadRoot, createTestEnv } from '../src/tests/fixtures/test-app.js';
import { TEST_API_KEY } from '../src/tests/fixtures/test-api-key.js';

const OUT = path.resolve('tmp-verify/real-model-regression');
const CASES = [
  { file: '.test-images/OIP.webp', mode: 'person', preserveText: 'false' },
  { file: '.test-images/R.jpg', mode: 'person', preserveText: 'false' },
  { file: '.test-images/synth-tall-kurta.jpg', mode: 'person', preserveText: 'false' },
  { file: '.test-images/synth-studio-portrait.jpg', mode: 'person', preserveText: 'false' },
  { file: '.test-images/2.webp', mode: 'person', preserveText: 'false' },
];

async function alphaStats(filePath) {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  let soft = 0;
  let opaque = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i += 1) {
    const a = data[i * 4 + 3] ?? 0;
    if (a < 16) transparent += 1;
    else if (a > 240) opaque += 1;
    else soft += 1;
  }
  return {
    transparentRatio: transparent / n,
    opaqueRatio: opaque / n,
    softEdgeRatio: soft / n,
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const temp = await createTempUploadRoot();
  const defaults = loadEnv();
  const env = createTestEnv(temp.uploadRoot, {
    HF_ENDPOINT: defaults.HF_ENDPOINT,
    MODEL_ID: defaults.MODEL_ID,
    MODEL_DTYPE: defaults.MODEL_DTYPE,
    MATTE_REFINER_PATH: defaults.MATTE_REFINER_PATH,
  });
  const modelManager = new ModelManager(new BiRefNetProvider(env));
  await modelManager.initialize();
  const app = await buildApp({ env, logger: false, dependencies: { modelManager } });

  const results = [];
  try {
    for (const testCase of CASES) {
      const inputPath = path.resolve(testCase.file);
      const content = await readFile(inputPath);
      const ext = path.extname(inputPath).toLowerCase();
      const multipart = createMultipartPayload({
        fields: {
          format: 'png',
          quality: 'hd',
          responseMode: 'json',
          mode: testCase.mode,
          preserveText: testCase.preserveText,
        },
        files: [
          {
            fieldname: 'image',
            filename: path.basename(inputPath),
            contentType: ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg',
            content,
          },
        ],
      });
      const started = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/remove-background',
        headers: { ...multipart.headers, 'x-api-key': TEST_API_KEY },
        payload: multipart.payload,
      });
      const durationMs = Date.now() - started;
      const base = path.basename(testCase.file, ext).replace(/[^\w.-]+/g, '-');
      const entry = {
        file: testCase.file,
        status: response.statusCode,
        durationMs,
        ok: response.statusCode === 200,
      };
      if (response.statusCode === 200) {
        const body = response.json();
        const rel = new URL(body.data.result.url).pathname.replace(/^\/uploads\//, '');
        const processed = path.join(env.UPLOAD_ROOT, rel);
        const outPath = path.join(OUT, `${base}-out.png`);
        await writeFile(outPath, await readFile(processed));
        entry.stats = await alphaStats(outPath);
        entry.processing = body.data.processing;
      } else {
        entry.error = response.json();
      }
      results.push(entry);
    }
  } finally {
    await app.close();
    await temp.cleanup();
  }

  const report = {
    modelId: env.MODEL_ID,
    hfEndpoint: env.HF_ENDPOINT,
    matteRefiner: env.MATTE_REFINER_PATH ?? null,
    results,
    outputDir: OUT,
  };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
