#!/usr/bin/env bash
# Run ON THE VPS (not local Windows). Measures warm API latency with stageMs + worker health.
# Does not change systemd/pm2 — read-only against running services.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

API="${PUBLIC_BASE_URL:-http://127.0.0.1:3014}/api/v1"
WORKER="${INSPIRENET_WORKER_URL:-http://127.0.0.1:8765}"
CPU_LIMIT="${INSPIRENET_VPS_CPU_LIMIT:-4}"
OUT="eval/inspyrenet/quality-baseline/vps-benchmark-$(date -u +%Y%m%dT%H%M%SZ).json"

echo "=== Worker health ==="
curl -sf "$WORKER/health" | tee /tmp/inspyrenet-health.json
echo

echo "=== API ready ==="
curl -sf "$API/health/ready" | tee /tmp/inspyrenet-ready.json
echo

echo "=== Process RSS (worker python only) ==="
WORKER_PID="$(curl -sf "$WORKER/health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pid',''))" 2>/dev/null || true)"
if [[ -z "$WORKER_PID" ]]; then
  pgrep -af 'inspyrenet/worker.py' || true
else
  ps -o pid,rss,cmd -p "$WORKER_PID" || true
fi

export INSPIRENET_VPS_CPU_LIMIT="$CPU_LIMIT"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://127.0.0.1:3014}"
export API_KEY="${API_KEY:?Set API_KEY for authenticated benchmark}"

echo "=== Stage-1 API benchmark (3 runs/image, median stageMs) ==="
node --import tsx/esm eval/inspyrenet/stage1-api-benchmark.mjs | tee "$OUT"
echo "Wrote $OUT"

echo "=== Optional: isolated runtime probe (same venv, 4 threads) ==="
INSPIRENET_TORCH_THREADS="$CPU_LIMIT" INSPIRENET_VPS_CPU_LIMIT="$CPU_LIMIT" \
  eval/inspyrenet/.venv/bin/python eval/inspyrenet/probe_optimized_runtime.py | tee "eval/inspyrenet/quality-baseline/vps-probe-latest.json"
