#!/usr/bin/env python3
"""Production CPU: 1 warm-up + 3 sequential API runs per triplet image. Stdlib only."""
from __future__ import annotations

import json
import os
import subprocess
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "eval/inspyrenet/quality-baseline/production-cpu-3warm.json"
API = os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:3014").rstrip("/") + "/api/v1"
WORKER = os.environ.get("INSPIRENET_WORKER_URL", "http://127.0.0.1:8765").rstrip("/")
API_KEY = os.environ.get("API_KEY", "")
if not API_KEY:
    raise SystemExit("Set API_KEY")

IMAGES = [
    (
        "beard-white-shirt",
        ".test-images/confident-young-western-european-businessman-professional-office-attire-stockgraphy-for-corporate-use-photo.jpg",
    ),
    ("sunglasses", ".test-images/sunglasses-square-800.jpg"),
    ("white-kurta-portrait", ".test-images/white-kurta-portrait.jpg"),
]


def median(nums: list[float]) -> float:
    s = sorted(nums)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


def pm2_stats() -> dict:
    try:
        raw = subprocess.check_output(["pm2", "jlist"], text=True)
        apps = json.loads(raw)
        out = {}
        for name in ("background-remover-api", "inspyrenet-worker"):
            x = next((a for a in apps if a.get("name") == name), None)
            if not x:
                out[name] = None
                continue
            e = x.get("pm2_env") or {}
            out[name] = {
                "pid": x.get("pid"),
                "status": e.get("status"),
                "restartCount": e.get("restart_time", e.get("unstable_restarts", 0)),
            }
        return out
    except (subprocess.CalledProcessError, json.JSONDecodeError, FileNotFoundError):
        return {"error": "pm2 unavailable"}


def worker_health() -> dict:
    with urlopen(f"{WORKER}/health", timeout=30) as resp:
        return json.loads(resp.read().decode())


def multipart_body(field: str, filename: str, content: bytes, fields: dict[str, str]) -> tuple[bytes, str]:
    boundary = f"----Boundary{uuid.uuid4().hex}"
    parts: list[bytes] = []
    for k, v in fields.items():
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    parts.append(
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
            f"Content-Type: application/octet-stream\r\n\r\n"
        ).encode()
        + content
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    return body, boundary


def post_person(rel: str) -> dict:
    path = ROOT / rel
    content = path.read_bytes()
    fields = {
        "mode": "person",
        "quality": "hd",
        "format": "png",
        "responseMode": "json",
        "preserveText": "false",
    }
    body, boundary = multipart_body("image", path.name, content, fields)
    req = Request(
        f"{API}/remove-background",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "x-api-key": API_KEY,
        },
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urlopen(req, timeout=600) as resp:
            payload = json.loads(resp.read().decode())
    except HTTPError as exc:
        return {"ok": False, "error": exc.read().decode()[:500]}
    wall_ms = round((time.perf_counter() - t0) * 1000)
    if not payload.get("success"):
        return {"ok": False, "wallMs": wall_ms, "payload": payload}
    proc = payload.get("data", {}).get("processing", {})
    st = proc.get("stageMs") or {}
    infer = st.get("workerInferMs")
    if infer is None:
        infer = proc.get("inferenceMs")
    if infer is None:
        infer = wall_ms
    q = st.get("queueWaitMs")
    if q is None:
        q = 0
    total = st.get("totalMs")
    if total is None:
        total = wall_ms
    return {
        "ok": True,
        "wallMs": wall_ms,
        "workerInferMs": float(infer),
        "queueWaitMs": float(q),
        "totalMs": float(total),
        "stageMs": st,
    }


def main() -> None:
    report = {
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "host": os.environ.get("VPS_HOST_LABEL", "production-vps"),
        "pm2Before": pm2_stats(),
        "workerHealthBefore": worker_health(),
        "images": [],
        "peakWorkerRssMb": worker_health().get("rss_mb"),
    }
    for img_id, rel in IMAGES:
        post_person(rel)
        runs = [post_person(rel) for _ in range(3)]
        ok = [r for r in runs if r.get("ok")]
        h = worker_health()
        rss = h.get("rss_mb")
        if isinstance(rss, (int, float)):
            report["peakWorkerRssMb"] = max(report["peakWorkerRssMb"] or 0, rss)
        med = None
        if ok:
            med = {
                "workerInferMs": median([r["workerInferMs"] for r in ok]),
                "queueWaitMs": median([r["queueWaitMs"] for r in ok]),
                "totalMs": median([r["totalMs"] for r in ok]),
                "wallMs": median([r["wallMs"] for r in ok]),
            }
        report["images"].append(
            {
                "id": img_id,
                "runs": ok,
                "median": med,
                "slowestWallMs": max(r["wallMs"] for r in ok) if ok else None,
            }
        )
    report["workerHealthAfter"] = worker_health()
    report["pm2After"] = pm2_stats()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
