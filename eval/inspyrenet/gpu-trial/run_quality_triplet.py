"""Generate PNGs for beard / sunglasses / kurta on CPU and/or GPU (same Remover settings)."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

TRIPLET = [
    (
        "beard-white-shirt.png",
        ".test-images/confident-young-western-european-businessman-professional-office-attire-stockgraphy-for-corporate-use-photo.jpg",
    ),
    ("sunglasses.png", ".test-images/sunglasses-square-800.jpg"),
    ("white-kurta.png", ".test-images/white-kurta-portrait.jpg"),
]


def run_device(device: str, out_dir: Path) -> dict:
    from PIL import Image
    from transparent_background import Remover

    os.environ["INSPIRENET_MODE"] = "base"
    os.environ["INSPIRENET_RESIZE"] = "static"
    t0 = time.perf_counter()
    remover = Remover(mode="base", resize="static", device=device)
    load_s = time.perf_counter() - t0
    out_dir.mkdir(parents=True, exist_ok=True)
    timings = []
    for name, rel in TRIPLET:
        path = ROOT / rel
        img = Image.open(path).convert("RGB")
        t1 = time.perf_counter()
        rgba = remover.process(img, type="rgba")
        ms = (time.perf_counter() - t1) * 1000
        rgba.save(out_dir / name)
        timings.append({"file": name, "infer_ms": round(ms, 1)})
    import torch

    meta = {
        "device": device,
        "load_seconds": round(load_s, 3),
        "timings": timings,
        "model_device": str(next(remover.model.parameters()).device),
    }
    if torch.cuda.is_available() and device.startswith("cuda"):
        meta["gpu_memory_allocated_mb"] = round(torch.cuda.memory_allocated() / (1024 * 1024), 1)
    (out_dir / "_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--cpu", action="store_true")
    p.add_argument("--gpu", action="store_true")
    p.add_argument("--out", type=Path, default=ROOT / "eval/inspyrenet/gpu-trial/outputs")
    args = p.parse_args()
    if not args.cpu and not args.gpu:
        args.cpu = args.gpu = True
    summary = {}
    if args.cpu:
        summary["cpu"] = run_device("cpu", args.out / "cpu")
    if args.gpu:
        summary["gpu"] = run_device(os.environ.get("INSPIRENET_DEVICE", "cuda"), args.out / "gpu")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
