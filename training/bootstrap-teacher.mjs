import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

try {
  process.loadEnvFile('.env');
} catch {
  // optional
}

const config = JSON.parse(await readFile('training/config.json', 'utf8'));
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error('API_KEY missing in .env');
  process.exit(1);
}

const privateRoot = path.resolve(config.privateRoot);
const labelsDir = path.resolve(config.labelsDir);
const inputDirs = config.inputDirs.map((d) => path.resolve(d));

await mkdir(labelsDir, { recursive: true });

function slug(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
}

const ids = [];
for (const dir of inputDirs) {
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    continue;
  }
  for (const name of entries) {
    if (!/\.(jpe?g|png|webp)$/i.test(name)) {
      continue;
    }
    const id = slug(name);
    const sampleDir = path.join(labelsDir, id);
    await mkdir(sampleDir, { recursive: true });
    const src = path.join(dir, name);
    const ext = path.extname(name).toLowerCase();
    const destOriginal = path.join(sampleDir, `original${ext}`);
    await copyFile(src, destOriginal);

    const buf = await readFile(src);
    const mime =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const form = new FormData();
    form.set('image', new Blob([buf], { type: mime }), name);
    form.set('format', 'png');
    form.set('quality', 'hd');
    form.set('mode', 'auto');
    form.set('responseMode', 'binary');

    const res = await fetch(`${config.apiBase}/api/v1/remove-background`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('teacher failed', name, res.status, text.slice(0, 200));
      continue;
    }
    const resultBuf = Buffer.from(await res.arrayBuffer());
    const { data, info } = await sharp(resultBuf).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    const mask = Buffer.alloc(info.width * info.height);
    for (let i = 0; i < mask.length; i += 1) {
      mask[i] = data[i * 4 + 3] ?? 0;
    }
    await writeFile(path.join(sampleDir, 'final.png'), await sharp(mask, {
      raw: { width: info.width, height: info.height, channels: 1 },
    }).png().toBuffer());
    ids.push(id);
    console.log('labeled', id, info.width, 'x', info.height);
  }
}

await mkdir(path.join(privateRoot, 'splits'), { recursive: true });
const splitPath = path.join(privateRoot, 'splits', 'train.txt');
await writeFile(splitPath, `${ids.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ labels: ids.length, split: splitPath }, null, 2));
