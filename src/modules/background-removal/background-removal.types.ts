import type { OutputFormat, QualityMode, ResponseMode } from '../../config/constants.js';

export type { OutputFormat, QualityMode, ResponseMode };

export interface RemoveBackgroundOptions {
  format: OutputFormat;
  quality: QualityMode;
  responseMode: ResponseMode;
}

export interface ImageAsset {
  url: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
}

export interface ProcessedImageAsset extends ImageAsset {
  hasTransparency: boolean;
}

export interface ProcessingInfo {
  model: string;
  quality: QualityMode;
  durationMs: number;
}

export interface RemoveBackgroundResult {
  id: string;
  original: ImageAsset;
  result: ProcessedImageAsset;
  processing: ProcessingInfo;
  createdAt: string;
  originalRelativePath: string;
  resultRelativePath: string;
}

export interface RemoveBackgroundJsonResponse {
  success: true;
  message: string;
  data: Omit<RemoveBackgroundResult, 'originalRelativePath' | 'resultRelativePath'>;
}

export interface UploadedImagePart {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  fieldname: string;
}
