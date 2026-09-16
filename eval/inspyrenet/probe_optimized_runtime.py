"""
Isolated runtime probes (does not change production worker).
- Warm PyTorch inference vs optional torch.compile (Linux recommended).
- Attempt ONNX export (expected to fail or be incomplete for this graph).

Usage (from repo root, venv active):
  python eval/inspyrenet/probe_optimized_runtime.py
  INSPIRENET_TORCH_COMPILE=1 python eval/inspyrenet/probe_optimized_runtime.py
"""
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
    ROOT / ".test-images/white-kurta-portrait.jpg",
]


def rss_mb() -> float | None:
    if sys.platform != "linux":
        return None
    try:
        with open("/proc/self/status", encoding="utf-8") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return round(int(line.split()[1]) / 1024, 1)
    except OSError:
        return None
    return None


def configure_threads(n: int) -> None:
    for key in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
        os.environ[key] = str(n)
    import torch

    torch.set_num_threads(n)


def benchmark_remover(threads: int, compile_model: bool, runs: int = 3) -> dict:
    configure_threads(threads)
    from transparent_background import Remover
    import torch

    t_load = time.perf_counter()
    remover = Remover(mode="base", resize="static")
    load_s = time.perf_counter() - t_load
    compiled = False
    if compile_model and hasattr(torch, "compile"):
        try:
            remover.model = torch.compile(remover.model, mode="default")
            compiled = True
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"torch.compile failed: {exc}", "load_s": load_s}

    times = []
    peak_rss = rss_mb()
    for path in IMAGES:
        img = Image.open(path).convert("RGB")
        for i in range(runs):
            t0 = time.perf_counter()
            out = remover.process(img, type="rgba")
            ms = (time.perf_counter() - t0) * 1000
            times.append(ms)
            rss = rss_mb()
            if rss is not None:
                peak_rss = rss if peak_rss is None else max(peak_rss, rss)
            assert out.size == img.size
    return {
        "ok": True,
        "threads": threads,
        "torch_compile": compiled,
        "load_s": round(load_s, 2),
        "warm_ms": [round(t, 1) for t in times],
        "warm_ms_median": round(sorted(times)[len(times) // 2], 1),
        "peak_rss_mb": peak_rss,
    }


def probe_onnx() -> dict:
    try:
        import torch
        from transparent_background import Remover

        configure_threads(int(os.environ.get("INSPIRENET_TORCH_THREADS", "4")))
        remover = Remover(mode="base", resize="static")
        remover.model.eval()
        dummy = torch.rand(1, 3, 1024, 1024)
        out_path = Path(__file__).parent / "tmp-probe.onnx"
        torch.onnx.export(
            remover.model,
            dummy,
            out_path,
            input_names=["input"],
            output_names=["output"],
            opset_version=17,
            dynamic_axes={"input": {0: "batch", 2: "h", 3: "w"}, "output": {0: "batch", 2: "h", 3: "w"}},
        )
        return {"ok": True, "path": str(out_path), "size_bytes": out_path.stat().st_size}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:500]}


def main() -> None:
    threads = int(os.environ.get("INSPIRENET_TORCH_THREADS", os.environ.get("INSPIRENET_VPS_CPU_LIMIT", "4")))
    compile_flag = os.environ.get("INSPIRENET_TORCH_COMPILE", "").lower() in ("1", "true", "yes")
    report = {
        "platform": sys.platform,
        "cpu_count": os.cpu_count(),
        "threads_tested": threads,
        "onnx": probe_onnx(),
        "baseline": benchmark_remover(threads, compile_model=False, runs=2),
    }
    if compile_flag or sys.platform == "linux":
        report["torch_compile"] = benchmark_remover(threads, compile_model=True, runs=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
