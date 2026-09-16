"""Cold/warm/concurrent worker benchmark. Auth via WORKER_TOKEN if set."""
from __future__ import annotations

import json
import os
import statistics
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
WORKER = os.environ.get("WORKER_URL", "http://127.0.0.1:8765").rstrip("/")
TOKEN = os.environ.get("WORKER_TOKEN", os.environ.get("INSPIRENET_WORKER_TOKEN", ""))
IMAGE = ROOT / ".test-images/sunglasses-square-800.jpg"
CONCURRENT = int(os.environ.get("BENCH_CONCURRENT", "3"))


def headers() -> dict[str, str]:
    h = {"Content-Type": "application/octet-stream", "X-Request-Id": str(uuid.uuid4())}
    if TOKEN:
        h["Authorization"] = f"Bearer {TOKEN}"
    return h


def get_health() -> dict:
    req = urllib.request.Request(f"{WORKER}/health", headers=headers())
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def post_remove() -> dict:
    body = IMAGE.read_bytes()
    req = urllib.request.Request(f"{WORKER}/remove", data=body, headers=headers(), method="POST")
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=600) as resp:
        infer = float(resp.headers.get("X-Worker-Infer-Ms", 0))
        _ = resp.read()
    wall = (time.perf_counter() - t0) * 1000
    return {"wall_ms": round(wall, 1), "infer_ms": infer}


def median(xs: list[float]) -> float:
    return statistics.median(xs) if xs else 0.0


def main() -> None:
    if not IMAGE.is_file():
        raise SystemExit(f"Missing {IMAGE}")

    health = get_health()
    cold_load = health.get("load_seconds")

    warm = []
    for _ in range(3):
        warm.append(post_remove())

    concurrent = []
    with ThreadPoolExecutor(max_workers=CONCURRENT) as ex:
        futs = [ex.submit(post_remove) for _ in range(CONCURRENT)]
        for f in as_completed(futs):
            concurrent.append(f.result())

    health_after = get_health()
    report = {
        "worker": WORKER,
        "cold_load_seconds": cold_load,
        "warm_runs": warm,
        "warm_median_infer_ms": median([r["infer_ms"] for r in warm]),
        "warm_slowest_wall_ms": max(r["wall_ms"] for r in warm),
        "concurrent_n": CONCURRENT,
        "concurrent_runs": concurrent,
        "concurrent_slowest_wall_ms": max(r["wall_ms"] for r in concurrent),
        "worker_pid": health_after.get("pid"),
        "worker_rss_mb": health_after.get("rss_mb"),
        "worker_gpu_memory_allocated_mb": health_after.get("gpu_memory_allocated_mb"),
        "worker_gpu_memory_reserved_mb": health_after.get("gpu_memory_reserved_mb"),
        "model_device": health_after.get("model_device"),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
