/**
 * Real HTTP API baseline capture (real Lite model). Output is immutable baseline dir.
 * Usage: node --import tsx/esm scripts/local-api-validation.mjs baseline
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { loadEnv } from '../src/config/env.js';
import { createMultipartPayload } from '../src/tests/fixtures/create-test-image.js';
import { createTempUploadRoot, createTestEnv } from '../src/tests/fixtures/test-app.js';
import { TEST_API_KEY } from '../src/tests/fixtures/test-api-key.js';

const REPO = path.resolve('.');
const BASELINE_DIR = path.resolve('tmp-verify/review-baseline');
const AFTER_DIR = path.resolve('tmp-verify/review-after');

const SINGLE_CASES = [
  { name: 'OIP-person', file: '.test-images/OIP.webp', fields: { mode: 'person', preserveText: 'false', quality: 'hd', format: 'png' } },
  { name: 'R-person', file: '.test-images/R.jpg', fields: { mode: 'person', preserveText: 'false', quality: 'hd', format: 'png' } },
  { name: 'studio-person', file: '.test-images/synth-studio-portrait.jpg', fields: { mode: 'person', preserveText: 'false', quality: 'hd', format: 'png' } },
  { name: 'kurta-person', file: '.test-images/synth-tall-kurta.jpg', fields: { mode: 'person', preserveText: 'false', quality: 'hd', format: 'png' } },
  { name: 'green-person', file: '.test-images/synth-green-screen-person.jpg', fields: { mode: 'person', preserveText: 'false', quality: 'hd', format: 'png' } },
  { name: '2-person', file: '.test-images/2.webp', fields: { mode: 'person', preserveText: 'false', quality: 'hd', format: 'png' } },
  { name: 'green-product', file: '.test-images/synth-green-product.png', fields: { mode: 'product', preserveText: 'false', quality: 'hd', format: 'png' } },
  { name: 'banner-text', file: '.test-images/synth-banner-photo-text.jpg', fields: { mode: 'text_background', preserveText: 'true', quality: 'hd', format: 'png' } },
];

const BATCH_FILES = [
  '.test-images/OIP.webp',
  '.test-images/R.jpg',
  '.test-images/synth-studio-portrait.jpg',
  '.test-images/synth-tall-kurta.jpg',
  '.test-images/synth-green-screen-person.jpg',
  '.test-images/2.webp',
  '.test-images/synth-green-product.png',
  '.test-images/synth-white-on-white.jpg',
];

async function startServer(uploadRoot, port) {
  const env = {
    ...process.env,
    ...createTestEnv(uploadRoot, {
      MAX_BULK_IMAGES: '8',
      PORT: String(port),
      HOST: '127.0.0.1',
      PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      API_KEY: TEST_API_KEY,
      RATE_LIMIT_MAX: '1000',
    }),
    UPLOAD_ROOT: uploadRoot,
  };
  const child = spawn(process.execPath, ['--import', 'tsx/esm', 'src/server.ts'], {
    cwd: REPO,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}/api/v1`;
  for (let i = 0; i < 180; i += 1) {
    try {
      const ready = await fetch(`${base}/health/ready`);
      if (ready.ok) {
        const body = await ready.json();
        if (body?.data?.status === 'ready' && body?.data?.model?.state === 'ready') {
          return { child, base, runtimeEnv: env };
        }
      }
    } catch {
      // retry
    }
    await sleep(1000);
  }
  child.kill();
  throw new Error('Server or model did not become ready in time');
}

async function downloadResult(uploadRoot, resultUrl, dest) {
  const rel = new URL(resultUrl).pathname.replace(/^\/uploads\//, '');
  await copyFile(path.join(uploadRoot, rel), dest);
}

async function runSingles(base, uploadRoot, outDir) {
  const results = [];
  for (const testCase of SINGLE_CASES) {
    const content = await readFile(path.resolve(testCase.file));
    const multipart = createMultipartPayload({
      fields: { responseMode: 'json', ...testCase.fields },
      files: [{ fieldname: 'image', filename: path.basename(testCase.file), contentType: 'application/octet-stream', content }],
    });
    const response = await fetch(`${base}/remove-background`, {
      method: 'POST',
      headers: { ...multipart.headers, 'x-api-key': TEST_API_KEY },
      body: multipart.payload,
    });
    const body = await response.json();
    const caseDir = path.join(outDir, 'single', testCase.name);
    await mkdir(caseDir, { recursive: true });
    await copyFile(path.resolve(testCase.file), path.join(caseDir, `input${path.extname(testCase.file)}`));
    await writeFile(path.join(caseDir, 'request.json'), JSON.stringify(testCase.fields, null, 2));
    await writeFile(path.join(caseDir, 'response.json'), JSON.stringify(body, null, 2));
    if (response.ok) {
      await downloadResult(uploadRoot, body.data.result.url, path.join(caseDir, 'output.png'));
    }
    results.push({ name: testCase.name, status: response.status, ok: response.ok });
  }
  return results;
}

async function runBatch(base, uploadRoot, outDir) {
  const files = [];
  for (const rel of BATCH_FILES) {
    const content = await readFile(path.resolve(rel));
    files.push({
      fieldname: 'images',
      filename: path.basename(rel),
      contentType: 'application/octet-stream',
      content,
    });
  }
  const multipart = createMultipartPayload({
    fields: { responseMode: 'json', mode: 'person', preserveText: 'false', quality: 'hd', format: 'png' },
    files,
  });
  const response = await fetch(`${base}/remove-backgrounds`, {
    method: 'POST',
    headers: { ...multipart.headers, 'x-api-key': TEST_API_KEY },
    body: multipart.payload,
  });
  const body = await response.json();
  const batchDir = path.join(outDir, 'batch-8');
  await mkdir(batchDir, { recursive: true });
  await writeFile(path.join(batchDir, 'response.json'), JSON.stringify(body, null, 2));
  if (response.ok) {
    for (const item of body.data.items) {
      if (item.status !== 'completed' || !item.result?.url) {
        continue;
      }
      const safe = item.filename.replace(/[^\w.-]+/g, '-');
      await downloadResult(uploadRoot, item.result.url, path.join(batchDir, `out-${safe}.png`));
    }
  }
  const rejectMultipart = createMultipartPayload({
    fields: { responseMode: 'json', mode: 'person', quality: 'hd', format: 'png' },
    files: [...files, { fieldname: 'images', filename: 'extra.jpg', contentType: 'image/jpeg', content: files[0].content }],
  });
  const reject = await fetch(`${base}/remove-backgrounds`, {
    method: 'POST',
    headers: { ...rejectMultipart.headers, 'x-api-key': TEST_API_KEY },
    body: rejectMultipart.payload,
  });
  const rejectBody = await reject.json();
  await writeFile(path.join(batchDir, 'reject-9-response.json'), JSON.stringify(rejectBody, null, 2));
  return {
    batch8Status: response.status,
    batch8Ok: response.ok,
    reject9Status: reject.status,
    reject9Code: rejectBody?.error?.code,
  };
}

async function main() {
  const mode = process.argv[2] ?? 'baseline';
  const outDir = mode === 'after' ? AFTER_DIR : BASELINE_DIR;
  await mkdir(outDir, { recursive: true });
  const temp = await createTempUploadRoot();
  const port = 37641;
  const defaults = loadEnv();
  const { child, base, runtimeEnv } = await startServer(temp.uploadRoot, port);
  try {
    await writeFile(
      path.join(outDir, 'runtime-config.json'),
      JSON.stringify(
        {
          MODEL_ID: defaults.MODEL_ID,
          MODEL_DTYPE: defaults.MODEL_DTYPE,
          HF_ENDPOINT: defaults.HF_ENDPOINT,
          MAX_BULK_IMAGES: runtimeEnv.MAX_BULK_IMAGES ?? '8',
          MATTE_REFINER_PATH: defaults.MATTE_REFINER_PATH ? '(set)' : null,
          PORT: port,
          mode,
        },
        null,
        2,
      ),
    );
    const singles = await runSingles(base, temp.uploadRoot, outDir);
    const batch = await runBatch(base, temp.uploadRoot, outDir);
    const report = { mode, outDir, singles, batch, capturedAt: new Date().toISOString() };
    await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    child.kill();
    await temp.cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
