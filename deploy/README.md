# VPS deploy (clone → build → start)

Use this when you **delete the server folder**, **push from local Git**, and **clone again** — same steps every time.

Repo: `https://github.com/sherazkdev/api.bgremover.com.git`  
Typical path: `/var/www/background-remover-api`

## What Git does / does not include

| In Git | Not in Git (you must backup separately) |
|--------|----------------------------------------|
| Code, `deploy/*`, `.env.example` | **`.env`** (API key, engine choice) |
| | Hugging Face ONNX cache (`.cache/`) |
| | Uploads (`public/uploads/`) |
| | Python venv (`eval/inspyrenet/.venv/`) — recreated by script |

**Before deleting the project on VPS:** copy `.env` somewhere safe (password manager, encrypted backup, or local file never committed).

```bash
scp root@YOUR_HOST:/var/www/background-remover-api/.env ./background-remover.env.backup
```

---

## First time on a new folder (full flow)

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/sherazkdev/api.bgremover.com.git background-remover-api
cd background-remover-api
```

### 1. Environment

```bash
cp .env.example .env
nano .env
```

Production minimum:

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=3014
PUBLIC_BASE_URL=http://bgremove.recipehubapi.com
API_KEY=your-secret-at-least-24-chars
```

Photo engine (match what you want on this server):

```bash
# BiRefNet only (no Python worker):
REMOVAL_PHOTO_ENGINE=birefnet

# InSPyReNet (needs worker — bootstrap installs venv + PM2 worker):
REMOVAL_PHOTO_ENGINE=inspyrenet
INSPIRENET_WORKER_URL=http://127.0.0.1:8765
```

Use **quotes** for values with spaces (important if you ever `source .env` in shell):

```bash
RATE_LIMIT_WINDOW="1 minute"
```

Or restore backup:

```bash
# from your PC
scp ./background-remover.env.backup root@YOUR_HOST:/var/www/background-remover-api/.env
```

### 2. Bootstrap (Node 22, build, PM2)

Requires **Node 22+** (script installs via **nvm** if the system Node is older).

```bash
bash deploy/bootstrap-vps.sh
```

This will:

- `npm ci` → `npm run build` → `npm prune --omit=dev`
- If `REMOVAL_PHOTO_ENGINE=inspyrenet`: recreate `eval/inspyrenet/.venv` and install PyTorch CPU stack (~few minutes)
- Start **PM2**: `background-remover-api` and (when InSPyReNet) `inspyrenet-worker`
- Wait for worker health (first model load ~60–90s)
- Print `/api/v1/health/ready`

### 3. Nginx (once per server, or after OS reinstall)

```bash
sudo bash deploy/install-nginx-site.sh
```

Site file: `deploy/background-remover-api` → upstream `127.0.0.1:3014`.

HTTPS (optional):

```bash
sudo certbot --nginx -d bgremove.recipehubapi.com
# Skip www if DNS has no www record
```

---

## After `git push` (update existing clone)

```bash
cd /var/www/background-remover-api
bash deploy/redeploy-vps.sh
```

Same build + PM2 reload as bootstrap, plus `git pull --ff-only origin main`.

---

## PM2 apps

| Name | Role |
|------|------|
| `background-remover-api` | `dist/server.js` (reads `.env` from repo root) |
| `inspyrenet-worker` | Python loopback `:8765` when using InSPyReNet |

```bash
pm2 status
pm2 logs background-remover-api --lines 50
pm2 logs inspyrenet-worker --lines 50
```

Ecosystem: `deploy/ecosystem.config.cjs` (Node 22 via nvm when installed).

---

## Rollback photo engine

In `.env`:

```bash
REMOVAL_PHOTO_ENGINE=birefnet
```

Then:

```bash
bash deploy/redeploy-vps.sh
# optional: pm2 stop inspyrenet-worker
```

---

## Local dev vs VPS

| | Local (Windows) | VPS (Linux) |
|--|-----------------|-------------|
| API | `npm run dev` | PM2 + `dist/server.js` |
| InSPyReNet worker | `npm run worker:inspyrenet` | PM2 `inspyrenet-worker` |
| Engine switch | `.env` `REMOVAL_PHOTO_ENGINE` | same |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `tsc: not found` on build | Use `bootstrap-vps.sh` (full `npm ci`, not `--omit=dev` before build) |
| `/health/ready` → 503, inspyrenet | Worker down: `pm2 restart inspyrenet-worker`, wait 90s, check logs |
| `ModuleNotFoundError: PIL` | Re-run `bash deploy/bootstrap-vps.sh` (recreates venv) |
| `API_KEY` errors | Production key length ≥ 24 |
| Nginx 502 | API not on 3014: `curl -s http://127.0.0.1:3014/api/v1/health` |
