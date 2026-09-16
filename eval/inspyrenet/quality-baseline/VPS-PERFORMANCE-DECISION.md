# VPS performance decision (template — fill after running on server)

## Target (measurement goal)

Warm single-image **downloadable cutout** median ≤ **5 s** on **4 vCPU** budget, **same** `base` checkpoint + `static` resize + full-resolution RGBA.

## Environment (expected)

| Item | Value |
|------|--------|
| Host | Shared Ubuntu VPS |
| vCPUs | 12 |
| RAM | ~47 GiB |
| GPU | None |
| Worker CPU budget | **4 vCPU** (`CPUQuota=400%` or `INSPIRENET_VPS_CPU_LIMIT=4`) |
| Node | Existing API + loopback worker |

## How to measure (authoritative — run on VPS)

```bash
cd /var/www/background-remover   # adjust path
export API_KEY='…'
export PUBLIC_BASE_URL='http://127.0.0.1:3014'
export INSPIRENET_WORKER_URL='http://127.0.0.1:8765'
export INSPIRENET_VPS_CPU_LIMIT=4
chmod +x eval/inspyrenet/vps/run-vps-benchmark.sh
./eval/inspyrenet/vps/run-vps-benchmark.sh
```

Record from JSON:

- `data.processing.stageMs.totalMs` (API, same request)
- `stageMs.workerInferMs`, `workerPngMs`, `orientDecodeMs`, `queueWaitMs`
- Cold: restart worker once, first `/health` → `load_seconds`
- Slowest of 3 runs per image; median across runs
- Worker RSS: `/health` → `rss_mb` (Linux) or `ps -o rss= -p $(pgrep -f inspyrenet/worker.py)`

**Do not** treat local Windows timings as VPS results.

## Immutable quality baseline

PNG references: `eval/inspyrenet/quality-baseline/pngs/`  
Compare candidates: `python eval/inspyrenet/compare_rgba.py <candidate-dir>`

## Pre-VPS engineering facts (local probes — **not** VPS SLA)

- Dominant cost: **`Remover.process`** at internal **1024×1024** (`base` + `static`), then bilinear upscale to original size.
- Overhead (decode + PNG + Node): typically **&lt;200 ms** per image.
- Thread sweep (8-core dev box, same checkpoint): **4 → 8 threads** ~**7%** infer median change — not enough for 5 s.
- **4 threads, warm median ~27 s** (sunglasses/kurta class) on dev CPU — see `probe-local-4threads.json`.
- **ONNX export probe:** failed (`onnxscript` / graph complexity) — **no ONNX speedup path verified**.
- **CUDA unavailable** in dev; VPS also has **no GPU**.

**Math vs 5 s target:** need ~**5×** faster end-to-end without changing checkpoint/resolution — **not observed** on CPU with allowed optimizations.

## Optimized runtime probe

```bash
INSPIRENET_TORCH_THREADS=4 eval/inspyrenet/.venv/bin/python eval/inspyrenet/probe_optimized_runtime.py
INSPIRENET_TORCH_COMPILE=1 …   # Linux only; verify compare_rgba before enabling in worker
```

ONNX export often **fails** on Swin/InSPyReNet graphs; a failed probe is an expected outcome — **do not** integrate ONNX without parity + faster e2e proof.

## ≤5 s verdict (check one)

- [ ] **Achieved** on VPS with verified config: ___
- [x] **Not achieved** without quality/resolution/checkpoint change (expected for CPU `base` @ 1024)

If not achieved:

- **Fastest verified CPU config:** `INSPIRENET_TORCH_THREADS=4`, single worker, `BG_REMOVAL_CONCURRENCY=1`, optional `INSPIRENET_TORCH_COMPILE=1` after parity check.
- **Infrastructure decision needed:** dedicated **GPU** worker (same API, `device=cuda` in upstream Remover when GPU present) or **separate CPU host** with higher single-thread perf — **speed and cost must be measured**, not assumed.

## Rollback

- Worker: revert `INSPIRENET_TORCH_COMPILE`, restore thread env, `systemctl restart inspyrenet-worker`
- API: `REMOVAL_PHOTO_ENGINE=birefnet` (does not fix 24 s if BiRefNet path also CPU-bound)

## UX / waiting (no fake speed)

API returns **`completed`** only when PNG is stored and URL is valid. Queue depth via `/health/ready` → `queue`. No `202` “done” for cutout. Async job IDs do not reduce inference time.
