"""Compare decoded RGBA vs quality-baseline PNGs (alpha channel diff %)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BASE = Path(__file__).resolve().parent / "quality-baseline" / "pngs"


def alpha_diff_pct(a: Path, b: Path) -> dict:
    ia = np.array(Image.open(a).convert("RGBA"))
    ib = np.array(Image.open(b).convert("RGBA"))
    if ia.shape != ib.shape:
        return {"ok": False, "reason": "shape mismatch", "a": a.name, "b": b.name}
    da = ia[:, :, 3].astype(np.int16)
    db = ib[:, :, 3].astype(np.int16)
    diff = np.abs(da - db)
    return {
        "ok": True,
        "file": a.name,
        "max_alpha_delta": int(diff.max()),
        "mean_alpha_delta": round(float(diff.mean()), 4),
        "pixels_over_2": round(100 * float((diff > 2).mean()), 4),
    }


def main() -> None:
    candidate_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tmp-verify" / "perf-after"
    rows = []
    for base_png in sorted(BASE.glob("*.png")):
        cand = candidate_dir / base_png.name
        if not cand.is_file():
            rows.append({"file": base_png.name, "ok": False, "reason": "missing candidate"})
            continue
        rows.append(alpha_diff_pct(cand, base_png))
    print(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
