#!/usr/bin/env bash
# Production worker: higher scheduling priority + optional CPU affinity (INSPIRENET_CPUSET=8-11).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"
PY="$REPO_ROOT/eval/inspyrenet/.venv/bin/python"
WORKER="$REPO_ROOT/eval/inspyrenet/worker.py"

if [[ ! -x "$PY" ]]; then
  echo "Missing venv python: $PY" >&2
  exit 1
fi

TASKSET=()
if [[ -n "${INSPIRENET_CPUSET:-}" ]]; then
  TASKSET=(taskset -c "$INSPIRENET_CPUSET")
fi

exec "${TASKSET[@]}" nice -n -8 "$PY" "$WORKER"
