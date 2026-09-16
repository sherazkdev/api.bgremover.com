/**
 * Stage 1: warm API benchmark — 3 sequential runs per image, median stageMs from same JSON response.
 * Requires: API ready (REMOVAL_PHOTO_ENGINE=inspyrenet), worker on INSPIRENET_WORKER_URL.
 *
 *   node eval/inspyrenet/stage1-api-benchmark.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { createMultipartPayload } from '../../src/tests/fixtures/create-test-image.js';
import { TEST_API_KEY } from '../../src/tests/fixtures/test-api-key.js';

const REPO = path.resolve(import.meta.dirname, '../..');
const OUT = path.resolve(REPO, 'eval/inspyrenet/quality-baseline/stage1-api-runs.json');
const API = (process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '') + '/api/v1';
const API_KEY = process.env.API_KEY ?? TEST_API_KEY;

const IMAGES = [
  {
    id: 'beard-white-shirt',
    file: '.test-images/confident-young-western-european-businessman-professional-office-attire-stockgraphy-for-corporate-use-photo.jpg',
  },
  { id: 'sunglasses', file: '.test-images/sunglasses-square-800.jpg' },
  { id: 'white-kurta-portrait', file: '.test-images/white-kurta-portrait.jpg' },
  { id: 'OIP', file: '.test-images/OIP.webp' },
  { id: 'studio', file: '.test-images/synth-studio-portrait.jpg' },
];

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function postPerson(file) {
  const content = await readFile(path.join(REPO, file));
  const multipart = createMultipartPayload({
    fields: {
      mode: 'person',
      quality: 'hd',
      format: 'png',
      responseMode: 'json',
      preserveText: 'false',
      preserveLogos: 'false',
      preserveTextContainers: 'false',
    },
    files: [
      {
        fieldname: 'image',
        filename: path.basename(file),
        contentType: 'application/octet-stream',
        content,
      },
    ],
  });
  const wallStarted = performance.now();
  const resp = await fetch(`${API}/remove-background`, {
    method: 'POST',
    headers: { ...multipart.headers, 'x-api-key': API_KEY },
    body: multipart.payload,
  });
  const wallMs = performance.now() - wallStarted;
  const json = await resp.json();
  return { ok: resp.ok && json.success, wallMs, data: json.data };
}

async function main() {
  const ready = await fetch(`${API}/health/ready`).then((r) => r.json());
  if (!ready?.data?.inspyrenetWorker?.ready) {
    throw new Error('API/worker not ready — check /health/ready and resolve-worker.mjs');
  }

  const report = { at: new Date().toISOString(), ready: ready.data, images: [] };

  for (const img of IMAGES) {
    const runs = [];
    for (let i = 0; i < 3; i += 1) {
      runs.push(await postPerson(img.file));
    }
    const okRuns = runs.filter((r) => r.ok && r.data?.processing?.stageMs);
    const med = (key) =>
      median(okRuns.map((r) => r.data.processing.stageMs[key]).filter((n) => typeof n === 'number'));
    report.images.push({
      id: img.id,
      file: img.file,
      runs: okRuns.map((r) => ({
        wallMs: Math.round(r.wallMs),
        totalMs: r.data.processing.stageMs.totalMs,
        stageMs: r.data.processing.stageMs,
        inferenceMs: r.data.processing.inferenceMs,
      })),
      median: okRuns.length
        ? {
            wallMs: median(okRuns.map((r) => r.wallMs)),
            totalMs: med('totalMs'),
            queueWaitMs: med('queueWaitMs'),
            orientDecodeMs: med('orientDecodeMs'),
            workerInferMs: med('workerInferMs'),
            workerPngMs: med('workerPngMs'),
            workerDecodeMs: med('workerDecodeMs'),
            nodePostMs: med('nodePostMs'),
            resultPersistMs: med('resultPersistMs'),
          }
        : { error: 'all runs failed', last: runs.at(-1) },
    });
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
