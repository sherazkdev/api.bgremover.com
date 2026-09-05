import type {
  OutputFormat,
  QualityMode,
  RemovalMode,
  ResponseMode,
} from '../../config/constants.js';

export type { OutputFormat, QualityMode, RemovalMode, ResponseMode };

export type BulkItemStatus = 'completed' | 'failed';

export interface RemoveBackgroundOptions {
  format: OutputFormat;
  quality: QualityMode;
  responseMode: ResponseMode;
  mode: RemovalMode;
  preserveText: boolean;
}

export interface RemoveBackgroundsOptions {
  format: OutputFormat;
  quality: QualityMode;
  mode: RemovalMode;
  preserveText: boolean;
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
  mode: RemovalMode;
  preserveText: boolean;
  textPreserved: boolean;
}

export interface RemoveBackgroundResult {
  id: string;
  original: ImageAsset;
  result: ProcessedImageAsset;
  processing: ProcessingInfo;
  createdAt: string;
  originalRelativePath: string;
  resultRelativePath: string;
  resultBuffer: Buffer;
}

export interface RemoveBackgroundJsonResponse {
  success: true;
  message: string;
  data: Omit<
    RemoveBackgroundResult,
    'originalRelativePath' | 'resultRelativePath' | 'resultBuffer'
  >;
}

export interface BulkCompletedItem
  extends Omit<
    RemoveBackgroundResult,
    'originalRelativePath' | 'resultRelativePath' | 'resultBuffer'
  > {
  index: number;
  filename: string;
  status: 'completed';
  textPreserved: boolean;
  resultBuffer?: Buffer;
}

export interface BulkFailedItem {
  index: number;
  filename: string;
  status: 'failed';
  errorCode: string;
  message: string;
}

export type BulkRemoveBackgroundItem = BulkCompletedItem | BulkFailedItem;

export interface ZipArchiveAsset {
  url: string;
  mimeType: 'application/zip';
  size: number;
}

export interface RemoveBackgroundsResult {
  items: BulkRemoveBackgroundItem[];
  completed: number;
  failed: number;
  durationMs: number;
  zip: ZipArchiveAsset | null;
  quality: QualityMode;
  mode: RemovalMode;
  preserveText: boolean;
}

export interface RemoveBackgroundsJsonResponse {
  success: boolean;
  message: string;
  data: {
    count: number;
    completed: number;
    failed: number;
    processing: {
      quality: QualityMode;
      mode: RemovalMode;
      preserveText: boolean;
      durationMs: number;
    };
    items: BulkRemoveBackgroundItem[];
    zip: ZipArchiveAsset | null;
  };
}

export interface UploadedImagePart {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  fieldname: string;
}
