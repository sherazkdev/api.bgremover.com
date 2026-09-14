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

function expectedProfile(fileName) {
  const base = fileName.toLowerCase();
  if (base.includes('synth-banner')) {
    return {
      kind: 'banner',
      minTransparent: 0.35,
      maxOpaque: 0.55,
      maxPhotoPaneMean: 85,
    };
  }
  if (base.includes('synth-green-product') || base === '2.webp') {
    return {
      kind: 'portrait',
      minTransparent: 0.45,
      maxOpaque: 0.35,
      maxSideMean: 80,
      minCenter: 200,
      maxBorderMean: 48,
      maxCorner: 200,
    };
  }
  if (base.includes('synth-studio') || base.includes('synth-white') || base.includes('synth-tall-kurta')) {
    return {
      kind: 'portrait',
      minTransparent: 0.28,
      maxOpaque: 0.42,
      maxSideMean: 45,
      minCenter: 180,
      maxBorderMean: 48,
      maxCorner: 200,
    };
  }
  if (base.includes('synth-green-screen')) {
    return {
      kind: 'portrait',
      minTransparent: 0.55,
      maxOpaque: 0.35,
      maxSideMean: 40,
      minCenter: 180,
      maxBorderMean: 48,
      maxCorner: 200,
    };
  }
  return {
    kind: 'portrait',
    minTransparent: 0.08,
    maxOpaque: 0.42,
    maxSideMean: 52,
    minCenter: 80,
    maxBorderMean: 48,
    maxCorner: 200,
  };
}

function photoPaneMean(alpha, width, height) {
  let sum = 0;
  let count = 0;
  const x0 = Math.floor(width * 0.52);
  const x1 = Math.floor(width * 0.96);
  const y0 = Math.floor(height * 0.08);
  const y1 = Math.floor(height * 0.92);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      sum += sample(alpha, width, x, y);
      count += 1;
    }
  }
  return count > 0 ? sum / count : 255;
}

function evaluateAlpha(alpha, width, height, fileName) {
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

  const profile = expectedProfile(fileName);

  const sideBand = Math.max(2, Math.round(width * 0.08));
  let sideSum = 0;
  let sideCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= sideBand && x < width - sideBand) continue;
      sideSum += sample(alpha, width, x, y);
      sideCount += 1;
    }
  }
  const sideMean = sideCount > 0 ? sideSum / sideCount : 0;

  const borderBandX = Math.max(2, Math.round(width * 0.04));
  const borderBandY = Math.max(2, Math.round(height * 0.04));
  let borderSum = 0;
  let borderCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onBorder =
        x < borderBandX ||
        x >= width - borderBandX ||
        y < borderBandY ||
        y >= height - borderBandY;
      if (!onBorder) continue;
      borderSum += sample(alpha, width, x, y);
      borderCount += 1;
    }
  }
  const borderMean = borderCount > 0 ? borderSum / borderCount : 0;

  const issues = [];
  if (transparentRatio < profile.minTransparent) {
    issues.push('background not removed (low transparency)');
  }
  if (opaqueRatio < 0.04) issues.push('subject missing (too transparent)');
  if (opaqueRatio > profile.maxOpaque) issues.push('mask too large (background kept as foreground)');

  if (profile.kind === 'banner') {
    const paneMean = photoPaneMean(alpha, width, height);
    if (paneMean > profile.maxPhotoPaneMean) {
      issues.push('photo pane still mostly foreground');
    }
    return {
      transparentRatio: Number(transparentRatio.toFixed(4)),
      opaqueRatio: Number(opaqueRatio.toFixed(4)),
      cornerMax,
      center,
      sideMean: Number(sideMean.toFixed(1)),
      borderMean: Number(borderMean.toFixed(1)),
      photoPaneMean: Number(paneMean.toFixed(1)),
      ok: issues.length === 0,
      issues,
    };
  }

  if (sideMean > profile.maxSideMean) issues.push('left/right edges still foreground');
  if (cornerMax > profile.maxCorner) issues.push('corners still opaque');
  if (center < profile.minCenter && centerUpper < profile.minCenter) {
    issues.push('center not solid (holes in subject)');
  }
  if (borderMean > profile.maxBorderMean) issues.push('outer frame still foreground');

  return {
    transparentRatio: Number(transparentRatio.toFixed(4)),
    opaqueRatio: Number(opaqueRatio.toFixed(4)),
    cornerMax,
    center,
    sideMean: Number(sideMean.toFixed(1)),
    borderMean: Number(borderMean.toFixed(1)),
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

function requestOptionsFor(fileName) {
  const base = fileName.toLowerCase();
  if (base.includes('banner')) {
    return { mode: 'auto', preserveText: 'true' };
  }
  if (base.includes('green-product')) {
    return { mode: 'product', preserveText: 'false' };
  }
  return { mode: 'person', preserveText: 'false' };
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
    const req = requestOptionsFor(name);
    const multipart = createMultipartPayload({
      fields: {
        format: 'png',
        quality: 'fast',
        responseMode: 'json',
        mode: req.mode,
        preserveText: req.preserveText,
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
      results.push({
        name,
        ok: false,
        issues: [`HTTP ${response.statusCode}: ${response.body?.slice?.(0, 120) ?? ''}`],
      });
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
    const metrics = evaluateAlpha(alpha, info.width, info.height, name);
    results.push({
      name,
      ...metrics,
      appliedMode: body.data.processing?.appliedMode,
      needsReview: body.data.processing?.needsReview,
      outPng,
      previewPng,
    });
  }
} finally {
  await cleanup();
  await temp.cleanup();
}

console.log('\n.test-images batch (per-image mode, preserveText=false)\n');
let failed = 0;
for (const row of results) {
  const status = row.ok ? 'PASS' : 'FAIL';
  if (!row.ok) failed += 1;
  console.log(`${status}  ${row.name}`);
  if (row.transparentRatio !== undefined) {
    console.log(
      `      transparent=${row.transparentRatio} opaque=${row.opaqueRatio} borderMean=${row.borderMean} sideMean=${row.sideMean ?? '-'} center=${row.center}`,
    );
  }
  if (row.appliedMode !== undefined) {
    console.log(`      appliedMode=${row.appliedMode} needsReview=${row.needsReview}`);
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
