#!/usr/bin/env bash
# Fresh clone (or empty tree): install deps, build, PM2 start — same result as production redeploy.
# Prereq: repo root, .env filled in (see deploy/README.md).
#
#   git clone https://github.com/sherazkdev/api.bgremover.com.git /var/www/background-remover-api
#   cd /var/www/background-remover-api
#   cp .env.example .env && nano .env
#   bash deploy/bootstrap-vps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "REPO=$ROOT"

# shellcheck disable=SC1091
source "$ROOT/deploy/_vps-common.sh"

check_required_env
ensure_node_22
build_api

ENGINE="$(photo_engine)"
echo "REMOVAL_PHOTO_ENGINE=$ENGINE"

if [[ "$ENGINE" == "inspyrenet" ]]; then
  install_inspyrenet_venv
fi

pm2_start_or_reload

if [[ "$ENGINE" == "inspyrenet" ]]; then
  worker_url="$(env_val INSPIRENET_WORKER_URL)"
  worker_url="${worker_url:-http://127.0.0.1:8765}"
  wait_inspyrenet_worker "$worker_url" || true
fi

echo "=== API ready ==="
check_api_ready
echo "Bootstrap done."
