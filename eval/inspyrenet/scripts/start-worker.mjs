import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');
const workerPy = resolve(repoRoot, 'eval/inspyrenet/worker.py');
const winPy = resolve(repoRoot, 'eval/inspyrenet/.venv/Scripts/python.exe');
const unixPy = resolve(repoRoot, 'eval/inspyrenet/.venv/bin/python');
const python = process.platform === 'win32' ? winPy : unixPy;

if (!existsSync(python)) {
  console.error(`Python venv not found: ${python}`);
  console.error('Create venv under eval/inspyrenet/.venv and install requirements.txt');
  process.exit(1);
}

const child = spawn(python, [workerPy], { stdio: 'inherit', cwd: repoRoot });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
