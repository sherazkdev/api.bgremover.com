#!/usr/bin/env bash
# Run ON THE VPS (read-only). Prints exact repo path, Node port, worker URL from pm2 + .env.
set -euo pipefail

APP_NAME="${PM2_APP_NAME:-background-remover-api}"

echo "=== pm2 app (authorized: $APP_NAME only) ==="
if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found"
  exit 1
fi
pm2 describe "$APP_NAME" 2>/dev/null | sed -n '1,25p' || { echo "App $APP_NAME not in pm2"; exit 1; }

REPO="$(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
apps=json.load(sys.stdin)
for a in apps:
  if a.get('name')=='${APP_NAME}':
    print(a.get('pm2_env',{}).get('pm_cwd',''))
    break
" 2>/dev/null || true)"

if [[ -z "$REPO" || ! -d "$REPO" ]]; then
  REPO="$(readlink -f "/proc/$(pgrep -f 'node.*dist/server.js' 2>/dev/null | head -1)/cwd" 2>/dev/null || true)"
fi

echo "REPO=$REPO"
if [[ ! -f "$REPO/.env" ]]; then
  echo "Missing $REPO/.env — cannot confirm INSPIRENET_WORKER_URL"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$REPO/.env"
set +a

PORT="${PORT:-3014}"
WORKER="${INSPIRENET_WORKER_URL:-http://127.0.0.1:8765}"
ENGINE="${REMOVAL_PHOTO_ENGINE:-birefnet}"

echo "PORT=$PORT"
echo "PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-}"
echo "REMOVAL_PHOTO_ENGINE=$ENGINE"
echo "INSPIRENET_WORKER_URL=$WORKER"

echo "=== Worker health (loopback) ==="
curl -sf "${WORKER%/}/health" | python3 -m json.tool || echo "WORKER_NOT_REACHABLE"

echo "=== API ready ==="
curl -sf "http://127.0.0.1:${PORT}/api/v1/health/ready" | python3 -m json.tool || echo "API_NOT_READY"

echo "=== inspyrenet worker process (this repo only) ==="
pgrep -af 'inspyrenet/worker.py' || echo "NO_WORKER_PROCESS"

echo "=== Worker venv ==="
test -x "$REPO/eval/inspyrenet/.venv/bin/python" && echo "VENV_OK=$REPO/eval/inspyrenet/.venv/bin/python" || echo "VENV_MISSING"
