const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');
const workerPython = path.join(repoRoot, 'eval/inspyrenet/.venv/bin/python');

function readPhotoEngine() {
  try {
    const dotenv = fs.readFileSync(path.join(repoRoot, '.env'), 'utf8');
    const m = dotenv.match(/^REMOVAL_PHOTO_ENGINE=(.+)$/m);
    if (m) {
      return m[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // no .env
  }
  return process.env.REMOVAL_PHOTO_ENGINE || 'birefnet';
}

function resolveNodeInterpreter() {
  if (process.env.PM2_NODE_INTERPRETER) {
    return process.env.PM2_NODE_INTERPRETER;
  }
  try {
    const cmd =
      'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; ' +
      '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; ' +
      'nvm which 22 2>/dev/null || nvm which default 2>/dev/null || command -v node';
    const resolved = execSync(`bash -lc ${JSON.stringify(cmd)}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (resolved) {
      return resolved;
    }
  } catch {
    // fall through
  }
  return 'node';
}

const apps = [
  {
    name: 'background-remover-api',
    cwd: repoRoot,
    script: 'dist/server.js',
    interpreter: resolveNodeInterpreter(),
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: 3014,
      PUBLIC_BASE_URL: 'http://bgremove.recipehubapi.com',
      INSPIRENET_MAX_SOURCE_EDGE: '2048',
      INSPIRENET_WORKER_TIMEOUT_MS: '32000',
      INSPIRENET_WORKER_INIT_TIMEOUT_MS: '180000',
    },
  },
];

if (readPhotoEngine() === 'inspyrenet') {
  apps.push({
    name: 'inspyrenet-worker',
    cwd: repoRoot,
    script: 'eval/inspyrenet/worker.py',
    interpreter: workerPython,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    env: {
      INSPIRENET_WORKER_HOST: '127.0.0.1',
      INSPIRENET_WORKER_PORT: '8765',
      INSPIRENET_MODE: 'base',
      INSPIRENET_RESIZE: 'static',
      INSPIRENET_VPS_CPU_LIMIT: '4',
      INSPIRENET_TORCH_THREADS: '4',
      INSPIRENET_PNG_COMPRESS_LEVEL: '1',
      // torch.compile first load can hang 10+ min or OOM on shared CPU VPS — keep off in PM2.
      INSPIRENET_TORCH_COMPILE: '0',
    },
  });
}

module.exports = { apps };
