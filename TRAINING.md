# Fine-tuning the foreground-preservation pipeline

The production API uses pretrained BiRefNet Lite for subject matting and a computer-vision overlay detector for text, badges, logos, and graphic containers. No project-specific model has been trained yet. This guide is the path to improve text-region recall without replacing the current Node.js serving stack.

## Why a second training stage helps

BiRefNet is trained to keep people and products. It treats posters, captions, date cards, and watermarks as background. The current fusion layer recovers those regions with edges, color contrast, and connected components. Fine-tuning a lightweight overlay head on real labeled masks is the next accuracy step.

Prefer a small extra recall of background over deleting text. Text-region recall is the primary metric.

## Dataset layout

Create one folder per image under `datasets/`:

```text
datasets/
  raw/
    people-text-over-clothes/
    people-text-beside/
    urdu-typography/
    arabic-typography/
    english-typography/
    outlined-shadow-text/
    transparent-overlays/
    ribbons-cards-badges/
    logos-watermarks/
    low-contrast-text/
    compressed-posters/
    busy-backgrounds/
    multiple-people/
    no-person/
    no-removable-background/
  labels/
    <image-id>/
      original.png
      subject.png
      text.png
      text_container.png
      logo_overlay.png
      final.png
  splits/
    train.txt
    val.txt
    test.txt
```

Each mask is a single-channel PNG. `255` is foreground to keep. `0` is removable background. Soft edges may use intermediate alpha.

Never put near-duplicate crops of the same poster into more than one split. Split by source document or photoshoot, not by random file name.

## Annotation format

`datasets/templates/sample.json`:

```json
{
  "id": "poster-001",
  "original": "labels/poster-001/original.png",
  "masks": {
    "subject": "labels/poster-001/subject.png",
    "text": "labels/poster-001/text.png",
    "text_container": "labels/poster-001/text_container.png",
    "logo_overlay": "labels/poster-001/logo_overlay.png",
    "final": "labels/poster-001/final.png"
  },
  "languages": ["urdu", "english"],
  "mode": "graphic",
  "notes": "Date badges must stay intact, including colored bars."
}
```

Recommended tools: any pixel editor, CVAT, or Label Studio with four mask layers plus a merged final layer.

## Coverage the dataset must include

- People with text on clothing
- Text beside people
- Urdu, Arabic, and English typography
- Outlined and shadowed letters
- Transparent overlays
- Ribbons, cards, circles, and badges
- Logos and watermarks
- Light text on light backgrounds and dark text on dark backgrounds
- Low-resolution and heavily compressed social-media posters
- Busy photographic backgrounds
- Multiple people
- Images with no person
- Images with no removable background

## Augmentations

Apply these only on the training split:

- Scale `0.7–1.3`
- Rotation `±12°`
- JPEG quality `35–90`
- Gaussian blur `0–1.2px`
- Gaussian noise
- Brightness and contrast jitter
- Extra fonts and point sizes
- Shadow / outline thickness changes
- Overlay opacity `0.35–1.0`
- Card, ribbon, circle, and diamond containers

## Suggested commands

These commands are placeholders until a training environment is added. Keep checkpoints out of the API process until evaluation passes.

```bash
python train.py --data datasets/splits/train.txt --val datasets/splits/val.txt --out checkpoints/overlay-v1
python eval.py --data datasets/splits/val.txt --ckpt checkpoints/overlay-v1/best.pt --report reports/overlay-v1.json
python export_onnx.py --ckpt checkpoints/overlay-v1/best.pt --out models/overlay-v1.onnx
```

Load an exported ONNX overlay detector beside BiRefNet in `src/infrastructure/cv/` and keep the current fusion formula:

```text
finalAlpha = max(subjectMask, textMask, textContainerMask, logoAndOverlayMask)
```

## Metrics

| Metric | Target |
| --- | --- |
| Subject IoU | ≥ 0.90 on person photos |
| Text-region recall | ≥ 0.95 |
| Text-container recall | ≥ 0.90 |
| Boundary F-score | ≥ 0.85 |
| Alpha-matting MAE | ≤ 0.03 |
| OCR box coverage after / before | ≥ 0.95 |
| Accidental foreground deletion | ≤ 5% |

If text-region recall and deletion rate disagree, keep the more conservative mask.

## Versioning and rollback

1. Name checkpoints `overlay-YYYYMMDD-rN`.
2. Store the evaluation JSON next to the ONNX file.
3. Pin the file name in `.env` only after validation.
4. Rollback by restoring the previous ONNX path and restarting the API. The fusion code must still run if the overlay model fails to load.

## Evaluation report

`eval.py` should print:

- Per-split metric table
- Worst 20 images by text-region recall
- Before/after OCR box coverage
- A note if any test image lost more than 20% of non-background pixels

Use `src/tests/fixtures/images/d500bd7a-c76f-4c36-aebc-a96f325c3e05.jpeg` as a permanent graphic-poster regression sample.
