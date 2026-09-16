import sharp from 'sharp';

import type { QualityMode, RemovalMode } from '../../config/constants.js';
import { isGraphicCutoutMode, isSubjectCutoutMode } from '../cv/preservation-options.js';
import {
  computeCoverCrop,
  computeLetterbox,
  IMAGENET_PAD_RGB,
  type ModelInputLayout,
} from './letterbox.js';
import { packRgbChannels } from './image.processor.js';

/** Pre–stretch-fix subject/auto preprocessing (letterbox tall, cover wide). Validation / regression only. */
export async function prepareLegacySubjectModelInput(
  orientedImage: { rgb: Uint8Array; width: number; height: number },
  quality: QualityMode,
  modelWidth: number,
  modelHeight: number,
  mode: RemovalMode = 'person',
): Promise<{ pixels: Uint8Array; width: number; height: number; layout: ModelInputLayout }> {
  const kernel = quality === 'hd' ? 'lanczos3' : 'cubic';
  const sourceWidth = orientedImage.width;
  const sourceHeight = orientedImage.height;
  const pipeline = sharp(orientedImage.rgb, {
    raw: { width: sourceWidth, height: sourceHeight, channels: 3 },
  });

  const useSubjectLayout = isSubjectCutoutMode(mode) || mode === 'auto';
  if (!useSubjectLayout) {
    throw new Error('prepareLegacySubjectModelInput expects person/auto mode');
  }

  const tallPortrait = sourceHeight / Math.max(1, sourceWidth) >= 1.2;
  if (!isGraphicCutoutMode(mode) && !tallPortrait) {
    const cover = computeCoverCrop(sourceWidth, sourceHeight, modelWidth, modelHeight, 'center');
    const scaledWidth = Math.max(1, Math.round(sourceWidth * cover.scale));
    const scaledHeight = Math.max(1, Math.round(sourceHeight * cover.scale));
    const left = Math.max(0, Math.min(scaledWidth - modelWidth, Math.round(cover.cropLeft)));
    const top = Math.max(0, Math.min(scaledHeight - modelHeight, Math.round(cover.cropTop)));
    const { data, info } = await pipeline
      .resize(scaledWidth, scaledHeight, { fit: 'fill', kernel })
      .extract({ left, top, width: modelWidth, height: modelHeight })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      pixels: packRgbChannels(data, info.width, info.height, info.channels),
      width: info.width,
      height: info.height,
      layout: { mode: 'cover', cover: { ...cover, cropLeft: left, cropTop: top } },
    };
  }

  const letterbox = computeLetterbox(sourceWidth, sourceHeight, modelWidth, modelHeight);
  const padRight = modelWidth - letterbox.contentWidth - letterbox.offsetX;
  const padBottom = modelHeight - letterbox.contentHeight - letterbox.offsetY;
  const { data, info } = await pipeline
    .resize(letterbox.contentWidth, letterbox.contentHeight, { fit: 'fill', kernel })
    .extend({
      top: letterbox.offsetY,
      bottom: padBottom,
      left: letterbox.offsetX,
      right: padRight,
      background: IMAGENET_PAD_RGB,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    pixels: packRgbChannels(data, info.width, info.height, info.channels),
    width: info.width,
    height: info.height,
    layout: {
      mode: 'contain',
      letterbox: { ...letterbox, canvasWidth: info.width, canvasHeight: info.height },
    },
  };
}

/** Official ViT resample=2 (bilinear) stretch for parity checks — separate from hd output quality. */
export async function prepareOfficialStretchModelInput(
  orientedImage: { rgb: Uint8Array; width: number; height: number },
  modelWidth: number,
  modelHeight: number,
): Promise<{ pixels: Uint8Array; width: number; height: number; layout: ModelInputLayout }> {
  const { data, info } = await sharp(orientedImage.rgb, {
    raw: { width: orientedImage.width, height: orientedImage.height, channels: 3 },
  })
    .resize(modelWidth, modelHeight, { fit: 'fill', kernel: 'linear' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    pixels: packRgbChannels(data, info.width, info.height, info.channels),
    width: info.width,
    height: info.height,
    layout: { mode: 'stretch' },
  };
}
