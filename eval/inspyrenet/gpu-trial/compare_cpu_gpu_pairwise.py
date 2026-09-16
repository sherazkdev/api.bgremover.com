"""Pairwise alpha diff between CPU and GPU output PNGs (same filenames)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]


def diff(a: Path, b: Path) -> dict:
    ia = np.array(Image.open(a).convert("RGBA"))
    ib = np.array(Image.open(b).convert("RGBA"))
    if ia.shape != ib.shape:
        return {"ok": False, "file": a.name, "reason": "shape mismatch"}
    d = np.abs(ia[:, :, 3].astype(np.int16) - ib[:, :, 3].astype(np.int16))
    return {
        "ok": True,
        "file": a.name,
        "max_alpha_delta": int(d.max()),
        "mean_alpha_delta": round(float(d.mean()), 4),
        "pixels_over_2_pct": round(100 * float((d > 2).mean()), 4),
    }


def main() -> None:
    cpu_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "eval/inspyrenet/gpu-trial/outputs/cpu"
    gpu_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "eval/inspyrenet/gpu-trial/outputs/gpu"
    rows = []
    for cpu_png in sorted(cpu_dir.glob("*.png")):
        gpu_png = gpu_dir / cpu_png.name
        if not gpu_png.is_file():
            rows.append({"file": cpu_png.name, "ok": False, "reason": "missing gpu png"})
            continue
        rows.append(diff(cpu_png, gpu_png))
    print(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
