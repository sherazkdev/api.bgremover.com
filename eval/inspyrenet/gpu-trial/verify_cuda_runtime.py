"""Confirm Remover uses CUDA for model and a sample forward pass. FP32, base+static."""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("INSPIRENET_MODE", "base")
os.environ.setdefault("INSPIRENET_RESIZE", "static")
device = os.environ.get("INSPIRENET_DEVICE", "cuda")


def main() -> None:
    import torch
    from PIL import Image
    from transparent_background import Remover

    report: dict = {
        "torch_version": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "cuda_device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
        "requested_device": device,
    }
    if device.startswith("cuda") and not torch.cuda.is_available():
        print(json.dumps({**report, "ok": False, "error": "CUDA requested but not available"}, indent=2))
        sys.exit(1)

    t0 = time.perf_counter()
    remover = Remover(mode="base", resize="static", device=device)
    load_s = time.perf_counter() - t0
    model = getattr(remover, "model", None)
    if model is None:
        print(json.dumps({**report, "ok": False, "error": "no model on Remover"}, indent=2))
        sys.exit(1)

    param = next(model.parameters())
    report["load_seconds"] = round(load_s, 3)
    report["model_device"] = str(param.device)
    report["model_dtype"] = str(param.dtype)

    sample = ROOT / ".test-images/sunglasses-square-800.jpg"
    if not sample.is_file():
        sample = ROOT / ".test-images/sunglasses-square-800.jpg"
    img = Image.open(sample).convert("RGB")
    t1 = time.perf_counter()
    out = remover.process(img, type="rgba")
    infer_ms = (time.perf_counter() - t1) * 1000
    report["warm_infer_ms_one"] = round(infer_ms, 1)
    report["output_size"] = out.size

    if torch.cuda.is_available():
        report["gpu_memory_allocated_mb"] = round(torch.cuda.memory_allocated() / (1024 * 1024), 1)
        report["gpu_memory_reserved_mb"] = round(torch.cuda.memory_reserved() / (1024 * 1024), 1)

    ok = "cuda" in report["model_device"] if device.startswith("cuda") else True
    report["ok"] = ok
    print(json.dumps(report, indent=2))
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
