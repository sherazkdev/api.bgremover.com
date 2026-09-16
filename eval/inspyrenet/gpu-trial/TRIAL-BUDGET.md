# GPU trial — RunPod pricing & spend control (no instance yet)

**Not a hard spending cap.** RunPod does **not** offer a built-in “stop at $5” trial mode. You control cost via **credit deposited**, **manual teardown**, and optional **alerts**. Confirm live rates in [RunPod Console → Deploy](https://console.runpod.io/deploy) before approving trial.

## RunPod list prices (public pricing page / docs — verify in dashboard)

**Trial GPU recommendation:** **NVIDIA L4 24GB** (same InSPyReNet `base` FP32; enough VRAM).

| Item | Secure Cloud | Community Cloud |
|------|----------------|-----------------|
| **L4 on-demand compute** | **$0.49/hr** | **$0.44/hr** |
| Billing granularity | Per **second** while Pod runs | Same |

Other reference GPUs (if L4 unavailable in your region):

| GPU | Secure | Community |
|-----|--------|-----------|
| RTX 4090 | $0.69/hr | $0.34/hr |
| L40 | $0.82/hr | $0.69/hr |

Source: [runpod.io/pricing](https://www.runpod.io/pricing) structured rates (Sep 2026). **Dashboard deploy screen is authoritative** (region/stock can differ).

### Minimum deposit / balance to start

| Rule | Detail |
|------|--------|
| **New account credits** | Docs: evaluate from **~$10** minimum top-up ([billing overview](https://docs.runpod.io/references/billing-information)) |
| **Deploy a Pod** | Balance must cover **≥ 1 hour** of the **selected GPU + attached storage** configuration |
| **Prepaid cards** | Stripe may require **≥ $100** per deposit (docs) |
| **Default account spend limit** | **$80/hour** across resources (misconfig protection — **not** a trial budget; contact support to raise) |

There is **no monthly GPU commitment** on on-demand Pods.

### Storage & idle charges (continue after GPU stops)

| Storage type | Rate | When billed |
|--------------|------|-------------|
| Container / volume disk (Pod **running**) | **$0.10/GB/month** | Per second |
| Volume disk (Pod **stopped**) | **$0.20/GB/month** | Per second |
| Network volume (&lt; 1 TB) | **$0.07/GB/month** | Hourly while volume exists |
| Network volume (&gt; 1 TB) | **$0.05/GB/month** | Hourly |
| Ingress / egress | **$0** | — |

**Idle bleed:** Stopping a Pod **does not** stop network-volume charges. At **$0 balance**, RunPod **stops** Pods (volume data kept if network volume attached); prolonged $0 can **terminate** volumes ([billing docs](https://docs.runpod.io/references/billing-information)).

### Example trial math (estimate only — not a cap)

Assume **Secure L4** **$0.49/hr**, **3 hours** active benchmark + **40 GB** network volume **2 days**:

| Line | Estimate USD |
|------|----------------|
| Compute 3 × $0.49 | ~**$1.47** |
| 40 GB network × $0.07/mo × (2/30) | ~**$0.19** |
| Stopped volume overhead (if any) | ~**$0.05–0.15** |
| **Rough total if torn down promptly** | **~$2–3** |

Add buffer for extra hour, cold-start, and dashboard rate drift. **Deposit only what you approve** (e.g. $10–15), not an automatic $5 ceiling.

## Auto-stop & cleanup arrangement (you configure — not auto by RunPod)

RunPod **will** stop all Pods when balance hits **$0** (does not replace a deliberate trial plan).

**Recommended trial checklist:**

1. **Before start:** Note Pod name, GPU, and **hourly rate** from deploy UI; deposit fixed credits (e.g. $10).
2. **Low balance alert:** Billing → enable alert at threshold **above** zero (e.g. $3 remaining).
3. **Do not enable auto-pay** for one-off trial unless you want refills.
4. **Firewall:** Allow `:8765` only from production VPS IP; set `INSPIRENET_WORKER_TOKEN` on trial worker only.
5. **After benchmarks:** Export `gpu-trial/outputs` + JSON logs to your PC.
6. **Teardown order:** Terminate Pod → delete network volume (if created) → confirm Billing Explorer shows compute stopped.
7. **Optional safety:** Set a phone/calendar reminder for **max runtime** (e.g. 4h) to manually terminate — RunPod has no native “kill Pod after N hours” without your script/cron on the Pod itself.

**Production:** Do **not** change `INSPIRENET_WORKER_URL` until trial pass + explicit approval.

## Measured vs estimated latency

| | |
|--|--|
| **Measured (CPU production VPS)** | See [../quality-baseline/PRODUCTION-CPU-MEASUREMENT.md](../quality-baseline/PRODUCTION-CPU-MEASUREMENT.md) |
| **Measured (GPU trial)** | **None yet** — run `benchmark_worker.py` + same triplet E2E after approval |
| **Estimated GPU speed** | **Not stated** until trial metrics exist |
