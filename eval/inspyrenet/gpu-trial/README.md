# InSPyReNet GPU trial (isolated — **not production**)

**Do not switch `REMOVAL_PHOTO_ENGINE` or point production at a GPU worker until this checklist passes.**

**Capped trial cost (estimate, no instance yet):** [TRIAL-BUDGET.md](./TRIAL-BUDGET.md)

Production stays: Node API on current VPS, CPU loopback worker (`127.0.0.1:8765`), rollback = unset remote URL + `REMOVAL_PHOTO_ENGINE=birefnet`.

## Budget gate

**No paid GPU instance without explicit budget approval.** This folder only contains scripts and runbooks. You choose the provider (RunPod, Vast.ai, Lambda, dedicated GPU VPS, etc.), create the VM, then run the steps below.

## Same quality contract as production CPU

| Setting | Value (must match) |
|---------|-------------------|
| Package | `transparent-background==1.3.4` |
| Mode | `base` (`INSPIRENET_MODE=base`) |
| Resize | `static` (`INSPIRENET_RESIZE=static`) |
| Precision | **FP32** (no quant, no smaller internal resize) |
| Output | Full-resolution RGBA PNG |

## 1. GPU machine setup (trial host only)

```bash
git clone https://github.com/sherazkdev/api.bgremover.com.git
cd api.bgremover.com   # or background-remover-api
python3 -m venv eval/inspyrenet/.venv
eval/inspyrenet/.venv/bin/pip install -r eval/inspyrenet/requirements-gpu-trial.txt
```

Install **CUDA-enabled PyTorch** per [pytorch.org](https://pytorch.org) if the GPU index in `requirements-gpu-trial.txt` does not match your driver.

Verify before any benchmark:

```bash
eval/inspyrenet/.venv/bin/python eval/inspyrenet/gpu-trial/verify_cuda_runtime.py
```

Must print `model_device: cuda:*` and `input_tensor_device: cuda:*`.

## 2. Private authenticated worker

On the **GPU host only** (not on shared VPS loopback unless you intentionally expose it):

```bash
export INSPIRENET_DEVICE=cuda
export INSPIRENET_MODE=base
export INSPIRENET_RESIZE=static
export INSPIRENET_WORKER_HOST=0.0.0.0
export INSPIRENET_WORKER_PORT=8765
export INSPIRENET_WORKER_TOKEN='long-random-secret'   # required for remote trial
# Optional: INSPIRENET_VPS_CPU_LIMIT unset on GPU; do not cap GPU with CPU quota
eval/inspyrenet/.venv/bin/python eval/inspyrenet/worker.py
```

**Network:** restrict inbound `:8765` to your API VPS IP (security group / ufw). Never leave `0.0.0.0` open without token + firewall.

**Trial API wiring (staging `.env` only — not production until approved):**

```bash
INSPIRENET_WORKER_URL=https://your-gpu-host:8765   # or VPN IP
INSPIRENET_WORKER_TOKEN=same-secret-as-worker
```

CPU rollback: revert `INSPIRENET_WORKER_URL` to `http://127.0.0.1:8765`, remove token, restart PM2.

## 3. Benchmarks

```bash
export WORKER_URL=http://127.0.0.1:8765
export WORKER_TOKEN=…
eval/inspyrenet/.venv/bin/python eval/inspyrenet/gpu-trial/benchmark_worker.py
```

Reports cold `load_seconds`, warm median/slowest infer, peak RSS / GPU memory, and a small concurrent POST test.

## 4. CPU vs GPU quality (beard, sunglasses, kurta)

On a machine with both CPU and GPU venvs (or run CPU on VPS, copy PNGs from GPU trial):

```bash
eval/inspyrenet/.venv/bin/python eval/inspyrenet/gpu-trial/run_quality_triplet.py \
  --cpu --gpu --out eval/inspyrenet/gpu-trial/outputs
eval/inspyrenet/.venv/bin/python eval/inspyrenet/compare_rgba.py eval/inspyrenet/gpu-trial/outputs/cpu
eval/inspyrenet/.venv/bin/python eval/inspyrenet/compare_rgba.py eval/inspyrenet/gpu-trial/outputs/gpu
```

Compare CPU vs GPU pairwise with `compare_rgba.py` (baseline PNGs in `quality-baseline/pngs/`). **Trial passes** if GPU matches approved baseline within existing tolerances (no pixels |Δα|>2 on canonical set) and latency gain is measured — not assumed.

## 5. Estimated hosting cost (order-of-magnitude — verify at purchase time)

| Option | Typical use | Rough $/month (24/7) | Rough $/hour (on-demand) |
|--------|-------------|----------------------|---------------------------|
| RunPod / Vast T4 16GB | 1 worker | ~$150–280 if always on | ~$0.20–0.45/hr |
| RunPod L4 / 24GB | faster infer | ~$250–400 always on | ~$0.35–0.70/hr |
| Lambda / CoreWeave A10 | production-like | custom quote | ~$0.60–1.20/hr |

**Cost model for API traffic:** if median GPU infer ≈ **3–8 s** (must measure) vs CPU **~35 s**, one GPU can serve ~4–10× more photos/hour. Multiply hourly GPU rate by `(86400 / median_seconds / 3600)` to get rough max photos/day per GPU — then compare to your DAU.

**No 5 s SLA** until measured on your chosen GPU with this checkpoint.

## Production CPU measurement (authoritative)

On the **current VPS** (no setting changes):

```bash
cd /var/www/background-remover-api
export API_KEY=…
export PUBLIC_BASE_URL=http://127.0.0.1:3014
node --import tsx/esm eval/inspyrenet/vps/measure-production-3warm.mjs
```

Artifact: `eval/inspyrenet/quality-baseline/production-cpu-3warm.json`.
