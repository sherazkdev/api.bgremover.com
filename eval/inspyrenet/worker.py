"""Loopback-only InSPyReNet worker. Loads Remover once; POST /remove returns RGBA PNG."""
from __future__ import annotations

import io
import json
import os
import re
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PORT = int(os.environ.get("INSPIRENET_WORKER_PORT", "8765"))
HOST = os.environ.get("INSPIRENET_WORKER_HOST", "127.0.0.1")
MODE = os.environ.get("INSPIRENET_MODE", "base")
RESIZE = os.environ.get("INSPIRENET_RESIZE", "static")
PNG_COMPRESS_LEVEL = int(os.environ.get("INSPIRENET_PNG_COMPRESS_LEVEL", "1"))

remover = None
loaded_at: float | None = None
torch_threads: int | None = None


def configure_compute_threads() -> int:
    n = int(os.environ.get("INSPYRENET_TORCH_THREADS", os.cpu_count() or 4))
    for key in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        os.environ.setdefault(key, str(n))
    import torch

    torch.set_num_threads(n)
    try:
        torch.set_num_interop_threads(max(1, n // 2))
    except RuntimeError:
        pass
    return n


def read_image_bytes(content_type: str, body: bytes) -> bytes:
    if content_type.startswith("multipart/form-data"):
        match = re.search(r"boundary=([^;\s]+)", content_type)
        if not match:
            raise ValueError("multipart missing boundary")
        boundary = match.group(1).strip().strip('"').encode("latin-1")
        marker = b"--" + boundary
        for chunk in body.split(marker):
            if b'name="image"' not in chunk and b"name='image'" not in chunk:
                continue
            header_end = chunk.find(b"\r\n\r\n")
            if header_end < 0:
                header_end = chunk.find(b"\n\n")
                sep = 2
            else:
                sep = 4
            if header_end < 0:
                continue
            payload = chunk[header_end + sep :]
            return payload.rstrip(b"\r\n")
        raise ValueError("Missing image field")
    if content_type.startswith("application/octet-stream") or content_type.startswith("image/"):
        return body
    raise ValueError("Expected multipart/form-data, application/octet-stream, or image/*")


def load_model() -> None:
    global remover, loaded_at, torch_threads
    torch_threads = configure_compute_threads()
    from transparent_background import Remover

    t0 = time.perf_counter()
    remover = Remover(mode=MODE, resize=RESIZE)
    loaded_at = time.perf_counter() - t0


class Handler(BaseHTTPRequestHandler):
    server_version = "inspyrenet-worker/1.0"
    requests_served = 0

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/health":
            body = {
                "ready": remover is not None,
                "mode": MODE,
                "resize": RESIZE,
                "load_seconds": loaded_at,
                "torch_threads": torch_threads,
                "requests_served": getattr(Handler, "requests_served", 0),
            }
            data = json.dumps(body).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_error(404)

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/remove":
            self.send_error(404)
            return
        if remover is None:
            self.send_error(503, "Model not loaded")
            return
        request_id = self.headers.get("X-Request-Id") or str(uuid.uuid4())
        try:
            content_type = self.headers.get("Content-Type", "")
            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length)
            raw = read_image_bytes(content_type, body)
            if not raw:
                self.send_error(400, "Empty image")
                return
            t_decode = time.perf_counter()
            img = Image.open(io.BytesIO(raw))
            img.load()
            orig_size = img.size
            rgb = img.convert("RGB")
            decode_ms = round((time.perf_counter() - t_decode) * 1000, 1)
            t_infer = time.perf_counter()
            out = remover.process(rgb, type="rgba")
            infer_ms = round((time.perf_counter() - t_infer) * 1000, 1)
            if out.size != orig_size:
                self.send_error(500, f"Size mismatch {out.size} vs {orig_size}")
                return
            t_png = time.perf_counter()
            buf = io.BytesIO()
            out.save(buf, format="PNG", compress_level=PNG_COMPRESS_LEVEL)
            png = buf.getvalue()
            png_ms = round((time.perf_counter() - t_png) * 1000, 1)
            Handler.requests_served += 1
            alpha = out.getchannel("A")
            hist = alpha.histogram()
            transparent = sum(hist[:16])
            total = alpha.width * alpha.height
            if transparent < total * 0.02:
                self.send_error(422, "Output has almost no transparency")
                return
            if transparent > total * 0.98:
                self.send_error(422, "Output is nearly fully transparent")
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("X-Request-Id", request_id)
            self.send_header("X-Processing-Duration-Ms", str(infer_ms))
            self.send_header("X-Worker-Decode-Ms", str(decode_ms))
            self.send_header("X-Worker-Infer-Ms", str(infer_ms))
            self.send_header("X-Worker-Png-Ms", str(png_ms))
            self.send_header("X-Engine", "inspyrenet-transparent-background")
            self.send_header("Content-Length", str(len(png)))
            self.end_headers()
            self.wfile.write(png)
        except Exception as exc:  # noqa: BLE001
            self.send_error(500, str(exc))


def main() -> None:
    load_model()
    # Single-threaded: PyTorch Remover is not safe for concurrent inference on CPU.
    httpd = HTTPServer((HOST, PORT), Handler)
    print(
        json.dumps(
            {
                "listening": f"http://{HOST}:{PORT}",
                "mode": MODE,
                "resize": RESIZE,
                "load_seconds": loaded_at,
            }
        ),
        flush=True,
    )
    httpd.serve_forever()


if __name__ == "__main__":
    main()
