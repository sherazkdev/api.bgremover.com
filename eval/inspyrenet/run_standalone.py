"""Standalone InSPyReNet (transparent-background) eval — bypasses Node CV pipeline."""
from __future__ import annotations

import json
import sys
import time
import tracemalloc
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "eval" / "inspyrenet" / "outputs"
CASES = [
    ("beard-white-shirt", ROOT / ".test-images" / "confident-young-western-european-businessman-professional-office-attire-stockgraphy-for-corporate-use-photo.jpg"),
    ("sunglasses", ROOT / ".test-images" / "sunglasses-square-800.jpg"),
    ("white-kurta", ROOT / ".test-images" / "synth-tall-kurta.jpg"),
    ("OIP", ROOT / ".test-images" / "OIP.webp"),
    ("studio", ROOT / ".test-images" / "synth-studio-portrait.jpg"),
]


def main() -> None:
    from transparent_background import Remover

    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"cases": [], "cold_init_ms": None, "peak_mb": None}

    tracemalloc.start()
    t0 = time.perf_counter()
    remover = Remover(mode="base", resize="static")
    report["cold_init_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    _, peak = tracemalloc.get_traced_memory()
    report["peak_mb_after_init"] = round(peak / (1024 * 1024), 1)

    for name, path in CASES:
        if not path.is_file():
            report["cases"].append({"name": name, "ok": False, "error": f"missing {path}"})
            continue
        img = Image.open(path)
        img.load()
        exif = img.getexif()
        orig_size = img.size
        rgb = img.convert("RGB")
        t1 = time.perf_counter()
        out = remover.process(rgb, type="rgba")
        warm_ms = round((time.perf_counter() - t1) * 1000, 1)
        if out.size != orig_size:
            report["cases"].append(
                {
                    "name": name,
                    "ok": False,
                    "error": f"size mismatch {out.size} vs {orig_size}",
                    "warm_ms": warm_ms,
                }
            )
            continue
        dest = OUT / f"{name}.png"
        out.save(dest, format="PNG")
        alpha = out.getchannel("A")
        hist = alpha.histogram()
        transparent = sum(hist[:16])
        opaque = sum(hist[240:])
        total = alpha.width * alpha.height
        report["cases"].append(
            {
                "name": name,
                "ok": True,
                "input": str(path.relative_to(ROOT)),
                "output": str(dest.relative_to(ROOT)),
                "width": out.width,
                "height": out.height,
                "warm_ms": warm_ms,
                "transparent_pct": round(100 * transparent / total, 2),
                "opaque_pct": round(100 * opaque / total, 2),
                "exif_orientation": exif.get(274) if exif else None,
            }
        )

    _, peak = tracemalloc.get_traced_memory()
    report["peak_mb"] = round(peak / (1024 * 1024), 1)
    tracemalloc.stop()
    (OUT / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
