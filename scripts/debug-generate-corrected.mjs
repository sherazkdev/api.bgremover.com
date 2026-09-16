// Generate corrected PNGs into public/debug/bg-removal (corrected-latest.png per case).
// Usage: node --import tsx/esm scripts/debug-generate-corrected.mjs
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { createMultipartPayload } from '../src/tests/fixtures/create-test-image.js';
import { createTempUploadRoot, createTestEnv } from '../src/tests/fixtures/test-app.js';
import { TEST_API_KEY } from '../src/tests/fixtures/test-api-key.js';
import { spawn } from 'node:child_process';

const REPO = path.resolve('.');
const DEBUG = path.join(REPO, 'public/debug/bg-removal');

const CASES = [
  {
    id: 'sunglasses',
    input: 'sunglasses/input-sunglasses-square-800.jpg',
    out: 'sunglasses/corrected-latest.png',
    fields: { mode: 'auto', quality: 'hd', format: 'png', responseMode: 'json' },
  },
  {
    id: 'yellow-shirt',
    input: 'yellow-shirt/17989c2b-335b-4b21-9bc7-6f0328118f3f.webp',
    out: 'yellow-shirt/corrected-latest.png',
    fields: { mode: 'person', quality: 'hd', format: 'png', responseMode: 'json', preserveText: 'false' },
  },
  {
    id: 'zippy-logo',
    input: 'zippy-logo/6f18f901-reference-complete.png',
    out: 'zippy-logo/corrected-latest.png',
    note: 'Submitted asset assumed: reference PNG on black (verify against upload history).',
    fields: {
      mode: 'graphic',
      quality: 'hd',
      format: 'png',
      responseMode: 'json',
      preserveText: 'true',
      preserveLogos: 'true',
    },
  },
];

async function startServer(uploadRoot, port) {
  const env = {
    ...process.env,
    ...createTestEnv(uploadRoot, { PORT: String(port), HOST: '127.0.0.1', API_KEY: TEST_API_KEY, RATE_LIMIT_MAX: '1000' }),
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
        if (body?.data?.status === 'ready') return { child, base, uploadRoot };
      }
    } catch {
      // retry
    }
    await sleep(1000);
  }
  child.kill();
  throw new Error('Server not ready');
}

async function downloadUpload(uploadRoot, url, dest) {
  const rel = new URL(url).pathname.replace(/^\/uploads\//, '');
  const src = path.join(uploadRoot, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(src, dest);
}

async function main() {
  const temp = await createTempUploadRoot();
  const port = 3920 + Math.floor(Math.random() * 80);
  const { child, base, uploadRoot } = await startServer(temp.uploadRoot, port);
  const report = { generatedAt: new Date().toISOString(), cases: [] };
  try {
    for (const testCase of CASES) {
      const inputPath = path.join(DEBUG, testCase.input);
      const content = await import('node:fs/promises').then((fs) => fs.readFile(inputPath));
      const multipart = createMultipartPayload({
        fields: testCase.fields,
        files: [
          {
            fieldname: 'image',
            filename: path.basename(testCase.input),
            contentType: 'application/octet-stream',
            content,
          },
        ],
      });
      const response = await fetch(`${base}/remove-background`, {
        method: 'POST',
        headers: { ...multipart.headers, 'x-api-key': TEST_API_KEY },
        body: multipart.payload,
      });
      const payload = await response.json();
      const entry = {
        id: testCase.id,
        ok: response.ok && payload?.data?.processing?.status === 'completed',
        note: testCase.note,
        processing: payload?.data?.processing,
        request: testCase.fields,
      };
      if (entry.ok) {
        const dest = path.join(DEBUG, testCase.out);
        await downloadUpload(uploadRoot, payload.data.result.url, dest);
        entry.out = testCase.out;
        entry.resultUrl = payload.data.result.url;
      } else {
        entry.error = payload?.error ?? payload;
      }
      report.cases.push(entry);
    }
    await writeFile(path.join(DEBUG, 'generation-report.json'), JSON.stringify(report, null, 2));
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
