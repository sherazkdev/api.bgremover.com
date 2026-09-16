"""Warm inference timing vs torch thread count (same checkpoint/mode/resize)."""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

IMAGES = [
    ROOT / ".test-images/sunglasses-square-800.jpg",
    ROOT / ".test-images/OIP.webp",
]


def run_once(threads: int, repeats: int = 2) -> dict:
    os.environ["OMP_NUM_THREADS"] = str(threads)
    os.environ["MKL_NUM_THREADS"] = str(threads)
    os.environ["OPENBLAS_NUM_THREADS"] = str(threads)
    import torch

    torch.set_num_threads(threads)
    try:
        torch.set_num_interop_threads(max(1, threads // 2))
    except RuntimeError:
        pass

    from transparent_background import Remover

    remover = Remover(mode="base", resize="static")
    times = []
    for path in IMAGES:
        img = Image.open(path).convert("RGB")
        for _ in range(repeats):
            t0 = time.perf_counter()
            out = remover.process(img, type="rgba")
            times.append((time.perf_counter() - t0) * 1000)
            assert out.size == img.size
    return {
        "threads": threads,
        "warm_ms_avg": round(sum(times) / len(times), 1),
        "warm_ms_min": round(min(times), 1),
        "samples": len(times),
    }


def main() -> None:
    cpu = os.cpu_count() or 4
    candidates = sorted({4, cpu}) if cpu != 4 else [4, 8]
    results = [run_once(t) for t in candidates]
    print(json.dumps({"cpu_count": cpu, "results": results}, indent=2))


if __name__ == "__main__":
    main()
