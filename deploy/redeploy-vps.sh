#!/usr/bin/env bash
# Update existing VPS clone after git push.
# Usage: cd /var/www/background-remover-api && bash deploy/redeploy-vps.sh
set -euo pipefail

find_repo() {
  for d in \
    "/var/www/background-remover-api" \
    "/var/www/api.bgremover.com" \
    "/var/www/background-remover"; do
    if [[ -f "$d/package.json" && -f "$d/deploy/ecosystem.config.cjs" ]]; then
      echo "$d"
      return 0
    fi
  done
  if [[ -f "./package.json" && -f "./deploy/ecosystem.config.cjs" ]]; then
    pwd -P
    return 0
  fi
  echo "Could not find repo under /var/www" >&2
  exit 1
}

REPO="$(find_repo)"
cd "$REPO"
echo "REPO=$REPO"

# shellcheck disable=SC1091
source "$REPO/deploy/_vps-common.sh"

check_required_env
ENGINE="$(photo_engine)"
echo "REMOVAL_PHOTO_ENGINE=$ENGINE"

echo "=== git pull ==="
git pull --ff-only origin main

ensure_node_22
build_api

if [[ "$ENGINE" == "inspyrenet" ]]; then
  if [[ ! -x eval/inspyrenet/.venv/bin/python ]] || ! eval/inspyrenet/.venv/bin/python -c "from PIL import Image" 2>/dev/null; then
    install_inspyrenet_venv
  fi
fi

pm2_start_or_reload

if [[ "$ENGINE" == "inspyrenet" ]]; then
  worker_url="$(env_val INSPIRENET_WORKER_URL)"
  worker_url="${worker_url:-http://127.0.0.1:8765}"
  wait_inspyrenet_worker "$worker_url" || true
fi

if command -v nginx >/dev/null 2>&1; then
  echo "=== nginx ==="
  nginx -t
  systemctl reload nginx
fi

echo "=== health ==="
check_api_ready
echo "Redeploy done."
