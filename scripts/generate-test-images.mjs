/**
 * Synthetic regression photos for .test-images (committed alongside real samples).
 * Each scene targets a known failure mode we fixed or still monitor.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const OUT_DIR = path.resolve('.test-images');

async function writeImage(fileName, buffer) {
  await writeFile(path.join(OUT_DIR, fileName), buffer);
  console.log('wrote', fileName);
}

/** Green ecommerce-style product shot */
async function greenProduct() {
  const w = 512;
  const h = 512;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#22A559"/>
    <ellipse cx="256" cy="290" rx="118" ry="132" fill="#F97316"/>
    <ellipse cx="256" cy="250" rx="95" ry="88" fill="#FB923C"/>
    <rect x="198" y="118" width="116" height="28" rx="12" fill="#166534" opacity="0.35"/>
  </svg>`;
  await writeImage('synth-green-product.png', await sharp(Buffer.from(svg)).png().toBuffer());
}

/** Studio portrait: person-like blob on flat cyan backdrop */
async function studioPortrait() {
  const w = 480;
  const h = 640;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#89CFF0"/>
    <ellipse cx="240" cy="200" rx="72" ry="88" fill="#3D2314"/>
    <ellipse cx="240" cy="230" rx="58" ry="68" fill="#D4A574"/>
    <rect x="152" y="300" width="176" height="260" rx="48" fill="#1E3A8A"/>
    <ellipse cx="240" cy="330" rx="62" ry="40" fill="#2563EB"/>
  </svg>`;
  await writeImage(
    'synth-studio-portrait.jpg',
    await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer(),
  );
}

/** Tall portrait aspect (cover vs contain regression) */
async function tallPortrait() {
  const w = 540;
  const h = 960;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#E8E4DF"/>
    <rect x="0" y="0" width="540" height="120" fill="#F5F5F5"/>
    <rect x="80" y="24" width="380" height="48" rx="8" fill="#D4D4D4"/>
    <ellipse cx="270" cy="280" rx="80" ry="96" fill="#2C1810"/>
    <ellipse cx="270" cy="310" rx="64" ry="76" fill="#C68642"/>
    <path d="M170 420 L370 420 L340 820 L200 820 Z" fill="#FAFAFA"/>
    <path d="M200 420 L340 420 L320 780 L220 780 Z" fill="#FFFFFF"/>
  </svg>`;
  await writeImage(
    'synth-tall-kurta.jpg',
    await sharp(Buffer.from(svg)).jpeg({ quality: 91 }).toBuffer(),
  );
}

/** White subject on off-white wall (low contrast) */
async function whiteOnWhite() {
  const w = 420;
  const h = 560;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#EEEBE6"/>
    <ellipse cx="210" cy="175" rx="68" ry="82" fill="#1A1410"/>
    <ellipse cx="210" cy="200" rx="54" ry="62" fill="#B8896A"/>
    <path d="M130 270 L290 270 L270 520 L150 520 Z" fill="#FEFEFE"/>
    <path d="M150 290 L270 290 L255 500 L165 500 Z" fill="#FFFFFF"/>
  </svg>`;
  await writeImage(
    'synth-white-on-white.jpg',
    await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer(),
  );
}

/** Marketing banner: text block + photo (BiRefNet must run, not graphic-only) */
async function bannerPhotoText() {
  const w = 900;
  const h = 320;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="420" height="320" fill="#0F172A"/>
    <text x="36" y="92" fill="#FFFFFF" font-size="42" font-family="Arial" font-weight="700">Your Future</text>
    <text x="36" y="138" fill="#A78BFA" font-size="42" font-family="Arial" font-weight="700">Starts Today</text>
    <rect x="36" y="168" width="200" height="44" rx="8" fill="#FFFFFF"/>
    <text x="52" y="198" fill="#0F172A" font-size="16" font-family="Arial">Download App</text>
    <rect x="420" y="0" width="480" height="320" fill="#94A3B8"/>
    <ellipse cx="660" cy="110" rx="52" ry="62" fill="#3D2314"/>
    <ellipse cx="660" cy="132" rx="42" ry="48" fill="#D4A574"/>
    <rect x="590" y="190" width="140" height="150" rx="36" fill="#334155"/>
    <path d="M420 40 Q520 0 620 40 T820 20 L900 0 L900 320 L420 320 Z" fill="#64748B"/>
  </svg>`;
  await writeImage(
    'synth-banner-photo-text.jpg',
    await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer(),
  );
}

/** Green-screen person (defringe regression) */
async function greenScreenPerson() {
  const w = 400;
  const h = 520;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#00B140"/>
    <ellipse cx="200" cy="155" rx="62" ry="74" fill="#241610"/>
    <ellipse cx="200" cy="178" rx="50" ry="56" fill="#C9856A"/>
    <rect x="118" y="240" width="164" height="210" rx="40" fill="#14B8A6"/>
    <rect x="136" y="260" width="128" height="24" rx="6" fill="#0D9488"/>
  </svg>`;
  await writeImage(
    'synth-green-screen-person.jpg',
    await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer(),
  );
}

await mkdir(OUT_DIR, { recursive: true });
await greenProduct();
await studioPortrait();
await tallPortrait();
await whiteOnWhite();
await bannerPhotoText();
await greenScreenPerson();
console.log('\nDone. Run: npm run test:images\n');
