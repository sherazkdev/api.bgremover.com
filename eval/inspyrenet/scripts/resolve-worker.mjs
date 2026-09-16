/**
 * List loopback listeners on the configured InSPyReNet port and identify this repo's worker PIDs.
 * Does not kill anything — prints safe restart instructions only.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');
const envUrl = process.env.INSPIRENET_WORKER_URL ?? 'http://127.0.0.1:8765';
const port = new URL(envUrl).port || '8765';

function parseDotEnv() {
  try {
    const text = readFileSync(resolve(repoRoot, '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^INSPIRENET_WORKER_URL=(.+)$/);
      if (m) return m[1].trim();
    }
  } catch {
    // optional
  }
  return envUrl;
}

const workerUrl = parseDotEnv();
const targetPort = new URL(workerUrl).port || port;

let netstat = '';
try {
  netstat = execSync(`netstat -ano | findstr :${targetPort}`, { encoding: 'utf8' });
} catch {
  netstat = '';
}

const pids = [...new Set(netstat.match(/\s(\d+)\s*$/gm)?.map((l) => l.trim()) ?? [])];
const workers = [];

for (const pid of pids) {
  let cmd = '';
  try {
    cmd = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").CommandLine"`,
      { encoding: 'utf8' },
    ).trim();
  } catch {
    cmd = '';
  }
  const isOurWorker =
    /inspyrenet[\\/]+worker\.py/i.test(cmd) && cmd.replace(/\\/g, '/').includes('background-remover');
  workers.push({ pid, port: targetPort, isOurWorker, commandLine: cmd.slice(0, 200) });
}

let health = null;
try {
  health = await fetch(`${workerUrl.replace(/\/+$/, '')}/health`).then((r) => r.json());
} catch (error) {
  health = { error: error instanceof Error ? error.message : 'unreachable' };
}

console.log(
  JSON.stringify(
    {
      nodeConfiguredUrl: workerUrl,
      port: targetPort,
      listeners: workers,
      health,
      hint:
        workers.filter((w) => w.isOurWorker).length > 1
          ? 'Multiple repo workers detected — stop extras via Task Manager (only PIDs listed with isOurWorker=true).'
          : 'Single worker or none — restart with npm run worker:inspyrenet from repo root.',
    },
    null,
    2,
  ),
);
