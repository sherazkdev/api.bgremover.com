# Private matte training (local only)

Weights live under **`private/`** (gitignored). Copy that folder to production yourself.

## Layout

```text
private/
  labels/<id>/original.* + final.png
  splits/train.txt
  checkpoints/matte-refiner/best.json
  models/matte-refiner.json      ← production file
  reports/matte-refiner.json
```

## Setup

```bash
npm run train:bootstrap   # API must be running; fills private/labels from .test-images
npm run train:matte       # Pure Node trainer (works on Windows; no PyTorch)
```

Optional on Linux VPS with PyTorch: `python training/train_matte_refiner.py` or `bash training/run-on-vps.sh`

## Production

1. Copy **`private/models/matte-refiner.json`** to the server (or whole `private/`).
2. In `.env`:

```bash
MATTE_REFINER_PATH=private/models/matte-refiner.json
```

3. Restart the API.

BiRefNet still runs first; the refiner merges extra foreground from your trained weights (`max(birefnet, refiner)`).

## Notes

- Teacher masks come from the current API (`bootstrap-teacher.mjs`). Replace `final.png` with hand-edited masks for better quality.
- More samples under `private/labels/` improve generalization.
- `private/` is never pushed to GitHub — back it up separately.
