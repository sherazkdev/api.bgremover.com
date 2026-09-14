#!/usr/bin/env bash
# Run on the VPS (Linux + Python 3.11/3.12). Weights stay in private/ — copy there, do not commit.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv training/.venv
source training/.venv/bin/activate
pip install -r training/requirements.txt
npm run train:bootstrap
python training/train_matte_refiner.py
echo "Done. Copy private/models/matte-refiner.onnx to production and set MATTE_REFINER_ONNX."
