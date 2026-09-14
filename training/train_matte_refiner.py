#!/usr/bin/env python3
"""Train a small matte refiner; checkpoints stay under private/ (gitignored)."""

from __future__ import annotations

import json
import random
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, Dataset

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "training" / "config.json").read_text(encoding="utf-8"))
LABELS = ROOT / CONFIG["labelsDir"]
CKPT_DIR = ROOT / CONFIG["checkpointDir"]
MODEL_DIR = ROOT / CONFIG["modelDir"]
REPORT_DIR = ROOT / CONFIG["reportDir"]
TRAIN_SIZE = int(CONFIG["trainSize"])
EPOCHS = int(CONFIG["epochs"])
BATCH = int(CONFIG["batchSize"])
LR = float(CONFIG["learningRate"])


class MatteSet(Dataset):
    def __init__(self, ids: list[str]) -> None:
        self.samples: list[tuple[Path, Path]] = []
        for sample_id in ids:
            folder = LABELS / sample_id
            if not folder.is_dir():
                continue
            original = next(folder.glob("original.*"), None)
            final = folder / "final.png"
            if original and final.is_file():
                self.samples.append((original, final))
        if not self.samples:
            raise SystemExit(f"No samples in {LABELS}. Run: node training/bootstrap-teacher.mjs")

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        original_path, final_path = self.samples[index]
        rgb = Image.open(original_path).convert("RGB")
        mask = Image.open(final_path).convert("L")
        rgb = rgb.resize((TRAIN_SIZE, TRAIN_SIZE), Image.Resampling.BILINEAR)
        mask = mask.resize((TRAIN_SIZE, TRAIN_SIZE), Image.Resampling.BILINEAR)
        x = torch.from_numpy(np.array(rgb, dtype=np.float32) / 255.0).permute(2, 0, 1)
        y = torch.from_numpy(np.array(mask, dtype=np.float32) / 255.0).unsqueeze(0)
        return x, y


class ConvBlock(nn.Module):
    def __init__(self, cin: int, cout: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(cin, cout, 3, padding=1),
            nn.BatchNorm2d(cout),
            nn.ReLU(inplace=True),
            nn.Conv2d(cout, cout, 3, padding=1),
            nn.BatchNorm2d(cout),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class MiniMatteUNet(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.down1 = ConvBlock(3, 32)
        self.down2 = ConvBlock(32, 64)
        self.down3 = ConvBlock(64, 128)
        self.pool = nn.MaxPool2d(2)
        self.mid = ConvBlock(128, 128)
        self.up2 = nn.ConvTranspose2d(128, 64, 2, stride=2)
        self.dec2 = ConvBlock(128, 64)
        self.up1 = nn.ConvTranspose2d(64, 32, 2, stride=2)
        self.dec1 = ConvBlock(64, 32)
        self.head = nn.Conv2d(32, 1, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        d1 = self.down1(x)
        d2 = self.down2(self.pool(d1))
        d3 = self.down3(self.pool(d2))
        m = self.mid(self.pool(d3))
        u2 = self.up2(m)
        u2 = self.dec2(torch.cat([u2, d2], dim=1))
        u1 = self.up1(u2)
        u1 = self.dec1(torch.cat([u1, d1], dim=1))
        return torch.sigmoid(self.head(u1))


def dice_loss(pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    smooth = 1.0
    pred = pred.reshape(pred.size(0), -1)
    target = target.reshape(target.size(0), -1)
    inter = (pred * target).sum(dim=1)
    denom = pred.sum(dim=1) + target.sum(dim=1)
    return 1 - ((2 * inter + smooth) / (denom + smooth)).mean()


def load_ids() -> list[str]:
    split = ROOT / CONFIG["privateRoot"] / "splits" / "train.txt"
    if split.is_file():
        return [line.strip() for line in split.read_text(encoding="utf-8").splitlines() if line.strip()]
    return sorted(p.name for p in LABELS.iterdir() if p.is_dir())


def main() -> None:
    CKPT_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    ids = load_ids()
    dataset = MatteSet(ids)
    loader = DataLoader(dataset, batch_size=min(BATCH, len(dataset)), shuffle=True, num_workers=0)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = MiniMatteUNet().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=LR)
    bce = nn.BCELoss()

    best = float("inf")
    history: list[dict[str, float]] = []

    for epoch in range(1, EPOCHS + 1):
        model.train()
        total = 0.0
        for x, y in loader:
            x = x.to(device)
            y = y.to(device)
            opt.zero_grad()
            pred = model(x)
            loss = bce(pred, y) + dice_loss(pred, y)
            loss.backward()
            opt.step()
            total += float(loss.item())
        avg = total / max(1, len(loader))
        history.append({"epoch": epoch, "loss": avg})
        print(f"epoch {epoch}/{EPOCHS} loss={avg:.4f} device={device}")
        torch.save({"model": model.state_dict(), "epoch": epoch, "trainSize": TRAIN_SIZE}, CKPT_DIR / "last.pt")
        if avg < best:
            best = avg
            torch.save({"model": model.state_dict(), "epoch": epoch, "trainSize": TRAIN_SIZE}, CKPT_DIR / "best.pt")

    stamp = datetime.now(UTC).strftime("%Y%m%d")
    tagged = CKPT_DIR / f"matte-refiner-{stamp}.pt"
    torch.save(torch.load(CKPT_DIR / "best.pt", weights_only=False), tagged)

    model.load_state_dict(torch.load(CKPT_DIR / "best.pt", weights_only=False)["model"])
    model.eval()
    dummy = torch.randn(1, 3, TRAIN_SIZE, TRAIN_SIZE)
    onnx_path = MODEL_DIR / "matte-refiner.onnx"
    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        input_names=["rgb"],
        output_names=["alpha"],
        dynamic_axes={"rgb": {0: "batch", 2: "height", 3: "width"}, "alpha": {0: "batch", 2: "height", 3: "width"}},
        opset_version=17,
    )

    report = {
        "samples": len(dataset),
        "epochs": EPOCHS,
        "bestLoss": best,
        "checkpointDir": str(CKPT_DIR),
        "onnx": str(onnx_path),
        "history": history[-5:],
    }
    (REPORT_DIR / "matte-refiner.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
