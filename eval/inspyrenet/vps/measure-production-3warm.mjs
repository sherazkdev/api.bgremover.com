/**
 * Production CPU measurement: 1 discard warm-up + 3 sequential runs per canonical image.
 * Does not change server settings. Run ON VPS (loopback):
 *
 *   export API_KEY=…
 *   export PUBLIC_BASE_URL=http://127.0.0.1:3014
 *   node --import tsx/esm eval/inspyrenet/vps/measure-production-3warm.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

import { createMultipartPayload } from '../../../src/tests/fixtures/create-test-image.js';

const REPO = path.resolve(import.meta.dirname, '../../..');
const OUT = path.resolve(REPO, 'eval/inspyrenet/quality-baseline/production-cpu-3warm.json');
const API = (process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3014').replace(/\/+$/, '') + '/api/v1';
const WORKER = (process.env.INSPIRENET_WORKER_URL ?? 'http://127.0.0.1:8765').replace(/\/+$/, '');
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error('Set API_KEY from server .env');
}

const IMAGES = [
  {
    id: 'beard-white-shirt',
    file: '.test-images/confident-young-western-european-businessman-professional-office-attire-stockgraphy-for-corporate-use-photo.jpg',
  },
  { id: 'sunglasses', file: '.test-images/sunglasses-square-800.jpg' },
  { id: 'white-kurta-portrait', file: '.test-images/white-kurta-portrait.jpg' },
];

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pm2Stats() {
  try {
    const raw = execSync('pm2 jlist', { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const apps = JSON.parse(raw);
    const pick = (name) => {
      const x = apps.find((a) => a.name === name);
      if (!x) return null;
      const e = x.pm2_env ?? {};
      return {
        name,
        pid: x.pid,
        status: e.status,
        restartCount: e.restart_time ?? e.unstable_restarts ?? 0,
        pmUptime: e.pm_uptime,
        execPath: e.pm_exec_path,
      };
    };
    return {
      backgroundRemoverApi: pick('background-remover-api'),
      inspyrenetWorker: pick('inspyrenet-worker'),
    };
  } catch {
    return { error: 'pm2 jlist failed' };
  }
}

async function workerHealth() {
  const r = await fetch(`${WORKER}/health`, { signal: AbortSignal.timeout(15000) });
  return r.json();
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
  const json = await resp.json();
  let downloadMs = 0;
  if (json.success && json.data?.result?.url) {
    const dlStart = performance.now();
    const dl = await fetch(json.data.result.url);
    await dl.arrayBuffer();
    downloadMs = performance.now() - dlStart;
  }
  const wallMs = performance.now() - wallStarted;
  const st = json.data?.processing?.stageMs ?? {};
  return {
    ok: resp.ok && json.success,
    wallMs: Math.round(wallMs),
    downloadMs: Math.round(downloadMs),
    workerInferMs: st.workerInferMs ?? json.data?.processing?.inferenceMs,
    queueWaitMs: st.queueWaitMs ?? 0,
    totalMs: st.totalMs ?? Math.round(wallMs),
    stageMs: st,
  };
}

async function main() {
  const ready = await fetch(`${API}/health/ready`).then((r) => r.json());
  const healthBefore = await workerHealth();
  const pm2Before = pm2Stats();

  const report = {
    at: new Date().toISOString(),
    host: process.env.VPS_HOST_LABEL ?? 'production-vps',
    protocol: '3 sequential warm runs per image after 1 discard warm-up',
    pm2Before,
    workerHealthBefore: healthBefore,
    ready: ready.data,
    images: [],
    peakWorkerRssMb: healthBefore.rss_mb,
  };

  for (const img of IMAGES) {
    await postPerson(img.file);
    const runs = [];
    for (let i = 0; i < 3; i += 1) {
      runs.push(await postPerson(img.file));
    }
    const ok = runs.filter((r) => r.ok);
    const h = await workerHealth();
    if (typeof h.rss_mb === 'number') {
      report.peakWorkerRssMb = Math.max(report.peakWorkerRssMb ?? 0, h.rss_mb);
    }
    report.images.push({
      id: img.id,
      runs: ok,
      median: ok.length
        ? {
            workerInferMs: median(ok.map((r) => r.workerInferMs)),
            queueWaitMs: median(ok.map((r) => r.queueWaitMs)),
            totalMs: median(ok.map((r) => r.totalMs)),
            wallMs: median(ok.map((r) => r.wallMs)),
          }
        : null,
      slowestWallMs: ok.length ? Math.max(...ok.map((r) => r.wallMs)) : null,
    });
  }

  report.workerHealthAfter = await workerHealth();
  report.pm2After = pm2Stats();

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
