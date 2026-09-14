import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { createMultipartPayload } from '../src/tests/fixtures/create-test-image.js';
import { buildTestApp, createTempUploadRoot, createTestEnv } from '../src/tests/fixtures/test-app.js';

const INPUT_DIR = path.resolve('.test-images');
const OUT_DIR = path.resolve('tmp-verify/test-images');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function contentTypeFor(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function sample(alpha, width, x, y) {
  const sx = Math.min(width - 1, Math.max(0, x));
  const sy = Math.min(Math.floor(alpha.length / width) - 1, Math.max(0, y));
  return alpha[sy * width + sx] ?? 0;
}

function evaluateAlpha(alpha, width, height) {
  let transparent = 0;
  let opaque = 0;
  for (const value of alpha) {
    if (value < 16) transparent += 1;
    if (value > 240) opaque += 1;
  }
  const transparentRatio = transparent / alpha.length;
  const opaqueRatio = opaque / alpha.length;
  const corners = [
    sample(alpha, width, 8, 8),
    sample(alpha, width, width - 9, 8),
    sample(alpha, width, 8, height - 9),
    sample(alpha, width, width - 9, height - 9),
  ];
  const cornerMax = Math.max(...corners);
  const center = sample(alpha, width, Math.floor(width / 2), Math.floor(height / 2));
  const centerUpper = sample(alpha, width, Math.floor(width / 2), Math.floor(height * 0.42));

  const issues = [];
  if (transparentRatio < 0.08) issues.push('background not removed (low transparency)');
  if (opaqueRatio < 0.04) issues.push('subject missing (too transparent)');
  if (opaqueRatio > 0.92) issues.push('almost no cutout (too opaque)');
  if (cornerMax > 200) issues.push('corners still opaque');
  if (center < 80 && centerUpper < 80) issues.push('center not solid (holes in subject)');

  return {
    transparentRatio: Number(transparentRatio.toFixed(4)),
    opaqueRatio: Number(opaqueRatio.toFixed(4)),
    cornerMax,
    center,
    ok: issues.length === 0,
    issues,
  };
}

async function magentaPreview(pngPath, previewPath) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < info.width * info.height; i += 1) {
    const a = data[i * 4 + 3] ?? 0;
    if (a < 32) {
      out[i * 4] = 255;
      out[i * 4 + 1] = 0;
      out[i * 4 + 2] = 255;
      out[i * 4 + 3] = 255;
    } else {
      out[i * 4] = data[i * 4] ?? 0;
      out[i * 4 + 1] = data[i * 4 + 1] ?? 0;
      out[i * 4 + 2] = data[i * 4 + 2] ?? 0;
      out[i * 4 + 3] = 255;
    }
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(previewPath);
}

const entries = (await readdir(INPUT_DIR, { withFileTypes: true }))
  .filter((d) => d.isFile() && IMAGE_EXT.has(path.extname(d.name).toLowerCase()))
  .map((d) => d.name)
  .sort();

if (entries.length === 0) {
  console.error(`No images in ${INPUT_DIR}`);
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

const temp = await createTempUploadRoot();
const { app, env, cleanup } = await buildTestApp({ env: createTestEnv(temp.uploadRoot) });

const results = [];
try {
  for (const name of entries) {
    const inputPath = path.join(INPUT_DIR, name);
    const base = path.basename(name, path.extname(name)).replace(/[^\w.-]+/g, '-');
    const outPng = path.join(OUT_DIR, `out-${base}.png`);
    const previewPng = path.join(OUT_DIR, `preview-${base}.png`);

    const content = await readFile(inputPath);
    const multipart = createMultipartPayload({
      fields: {
        format: 'png',
        quality: 'fast',
        responseMode: 'json',
        mode: 'auto',
        preserveText: 'false',
      },
      files: [
        {
          fieldname: 'image',
          filename: name,
          contentType: contentTypeFor(name),
          content,
        },
      ],
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/remove-background',
      headers: multipart.headers,
      payload: multipart.payload,
    });

    if (response.statusCode !== 200) {
      results.push({ name, ok: false, issues: [`HTTP ${response.statusCode}`] });
      continue;
    }

    const body = response.json();
    const rel = new URL(body.data.result.url).pathname.replace(/^\/uploads\//, '');
    const processed = path.join(env.UPLOAD_ROOT, rel);
    await writeFile(outPng, await readFile(processed));
    await magentaPreview(outPng, previewPng);

    const { data, info } = await sharp(outPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = new Uint8Array(info.width * info.height);
    for (let i = 0; i < alpha.length; i += 1) {
      alpha[i] = data[i * 4 + 3] ?? 0;
    }
    const metrics = evaluateAlpha(alpha, info.width, info.height);
    results.push({ name, ...metrics, outPng, previewPng });
  }
} finally {
  await cleanup();
  await temp.cleanup();
}

console.log('\n.test-images batch (mode=auto, preserveText=false)\n');
let failed = 0;
for (const row of results) {
  const status = row.ok ? 'PASS' : 'FAIL';
  if (!row.ok) failed += 1;
  console.log(`${status}  ${row.name}`);
  if (row.transparentRatio !== undefined) {
    console.log(
      `      transparent=${row.transparentRatio} opaque=${row.opaqueRatio} cornerMax=${row.cornerMax} center=${row.center}`,
    );
  }
  if (row.issues?.length) {
    console.log(`      → ${row.issues.join('; ')}`);
  }
  if (row.previewPng) {
    console.log(`      preview: ${row.previewPng}`);
  }
}

console.log(`\n${results.length - failed}/${results.length} passed. Outputs in ${OUT_DIR}\n`);
process.exit(failed > 0 ? 1 : 0);
