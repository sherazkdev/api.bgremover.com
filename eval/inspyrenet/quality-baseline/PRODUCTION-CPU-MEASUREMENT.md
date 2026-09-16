# Production CPU measurement (2026-09-16)

**Host:** `13.140.131.209` / `/var/www/background-remover-api`  
**Settings:** unchanged (InSPyReNet, 4 torch threads, loopback worker).  
**Method:** 1 discard warm-up + **3 sequential** `POST /remove-background` (`mode=person`, `hd`, `png`) per image.  
**Raw JSON:** [production-cpu-3warm.json](./production-cpu-3warm.json)

## Worker / PM2

| Metric | Value |
|--------|--------|
| Worker PID | 3910582 |
| Worker PM2 restarts | 0 |
| API PM2 restarts | 10 |
| Peak worker RSS | **1433 MB** |
| Worker cold load (from `/health`, not re-run) | **82.6 s** |
| `queueWaitMs` (median) | **0** |

## Latency (warm, median of 3 runs)

| Image | Median wall (ms) | Slowest wall (ms) | Median workerInferMs* |
|-------|------------------|-------------------|------------------------|
| beard-white-shirt | 26,923 | 28,315 | 26,923 |
| sunglasses | 23,675 | 33,170 | 23,675 |
| white-kurta-portrait | 21,902 | 22,560 | 21,902 |

\*At capture time, live JSON had empty `processing.stageMs` because Fastify response schema omitted `stageMs`/`inferenceMs` (fixed in `background-removal.schema.ts` — deploy API only). Until redeploy, treat **`wallMs` as measured end-to-end**, not `workerInferMs` from JSON.

### Measured vs estimated

| | |
|--|--|
| **Measured (this file, VPS 2026-09-16)** | Median wall **21.9–26.9 s**; slowest **33.2 s**; queue **0 ms**; worker RSS **1433 MB** |
| **Estimated (GPU trial, not run)** | See [../gpu-trial/TRIAL-BUDGET.md](../gpu-trial/TRIAL-BUDGET.md) — **no GPU seconds measured yet** |

**Triplet median of medians (approx. typical warm request):** ~**24 s**  
**Slowest single run in session:** **33,170 ms** (sunglasses)

## Verdict (step 1)

**Inference dominates** (~22–33 s wall, zero queue wait). No production setting change recommended from this data alone.

## GPU trial

Not run (no GPU provisioned). Prep: [../gpu-trial/README.md](../gpu-trial/README.md).
