# shellcheck shell=bash
# Shared helpers for VPS bootstrap / redeploy. Source from deploy/*.sh — do not execute directly.

env_val() {
  local key="$1"
  grep -E "^${key}=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^["'\''"]//;s/["'\''"]$//' || true
}

check_required_env() {
  local missing=()
  for key in NODE_ENV HOST PORT PUBLIC_BASE_URL API_KEY; do
    local v
    v="$(env_val "$key")"
    if [[ -z "$v" ]]; then
      missing+=("$key")
    fi
  done
  if ((${#missing[@]})); then
    echo "Missing in .env: ${missing[*]}" >&2
    echo "Copy: cp .env.example .env && edit API_KEY (24+ chars for production)." >&2
    exit 1
  fi
  local api_key node_env
  api_key="$(env_val API_KEY)"
  node_env="$(env_val NODE_ENV)"
  if [[ "$node_env" == "production" && ${#api_key} -lt 24 ]]; then
    echo "API_KEY must be at least 24 characters when NODE_ENV=production" >&2
    exit 1
  fi
}

photo_engine() {
  local e
  e="$(env_val REMOVAL_PHOTO_ENGINE)"
  echo "${e:-birefnet}"
}

ensure_node_22() {
  local need=22 cur
  cur="$(node -v 2>/dev/null | sed 's/v//;s/\..*//' || echo 0)"
  if [[ "${cur:-0}" -ge "$need" ]]; then
    node -v
    return 0
  fi
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    echo "Installing nvm (Node 22 required, found $(node -v 2>/dev/null || echo none))..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash
  fi
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm install 22
  nvm alias default 22
  nvm use 22
  node -v
}

build_api() {
  echo "=== npm install + build ==="
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
  npm run build
  npm prune --omit=dev
}

install_inspyrenet_venv() {
  echo "=== InSPyReNet Python venv ==="
  rm -rf eval/inspyrenet/.venv
  python3 -m venv eval/inspyrenet/.venv
  eval/inspyrenet/.venv/bin/pip install -U pip wheel
  eval/inspyrenet/.venv/bin/pip install -r eval/inspyrenet/requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cpu
  eval/inspyrenet/.venv/bin/python -c "from PIL import Image; import torch; print('worker_deps_ok', torch.__version__)"
}

pm2_start_or_reload() {
  local app="${PM2_APP_NAME:-background-remover-api}"
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
    nvm use 22 2>/dev/null || nvm use default 2>/dev/null || true
  fi
  if ! command -v pm2 >/dev/null 2>&1; then
    echo "Install pm2: npm i -g pm2" >&2
    exit 1
  fi
  mkdir -p public/uploads/originals public/uploads/processed public/uploads/archives
  if pm2 describe "$app" >/dev/null 2>&1; then
    pm2 startOrReload deploy/ecosystem.config.cjs --update-env
  else
    pm2 start deploy/ecosystem.config.cjs
  fi
  pm2 save
}

wait_inspyrenet_worker() {
  local url="${1:-http://127.0.0.1:8765}"
  echo "Waiting for worker at $url (first load can take ~90s)..."
  local i
  for i in $(seq 1 36); do
    if curl -sf "${url%/}/health" >/dev/null; then
      curl -sf "${url%/}/health" | python3 -m json.tool || true
      return 0
    fi
    sleep 10
  done
  echo "Worker not ready at $url — check: pm2 logs inspyrenet-worker" >&2
  return 1
}

check_api_ready() {
  local port
  port="$(env_val PORT)"
  port="${port:-3014}"
  sleep 3
  curl -sf "http://127.0.0.1:${port}/api/v1/health/ready" | python3 -m json.tool
}
