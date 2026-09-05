export const APP_NAME = 'Background Remover API';
export const APP_VERSION = '1.0.0';

export const OUTPUT_FORMATS = ['png', 'webp'] as const;
export const QUALITY_MODES = ['fast', 'hd'] as const;
export const RESPONSE_MODES = ['json', 'binary'] as const;
export const REMOVAL_MODES = ['auto', 'person', 'product', 'document', 'graphic'] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];
export type QualityMode = (typeof QUALITY_MODES)[number];
export type ResponseMode = (typeof RESPONSE_MODES)[number];
export type RemovalMode = (typeof REMOVAL_MODES)[number];

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const IMAGE_EXTENSIONS = {
  jpeg: 'jpg',
  jpg: 'jpg',
  png: 'png',
  webp: 'webp',
} as const;

export const MIME_BY_FORMAT = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

export const DEFAULT_MODEL_INPUT_SIZE = 512;
export const MODEL_DISPLAY_NAME_LITE = 'BiRefNet Lite';
export const MODEL_DISPLAY_NAME_FULL = 'BiRefNet';

export const REQUEST_TIMEOUT_MS = 180_000;
export const BODY_LIMIT_BYTES = 12 * 1024 * 1024;
export const MULTIPART_OVERHEAD_MB = 2;
export const BULK_PROCESS_CONCURRENCY = 4;
export const BULK_TIMEOUT_MS_PER_IMAGE = 30_000;

export function bodyLimitBytes(maxFileSizeMb: number, maxBulkImages: number): number {
  return Math.max(
    BODY_LIMIT_BYTES,
    (maxFileSizeMb * maxBulkImages + MULTIPART_OVERHEAD_MB) * 1024 * 1024,
  );
}

export function requestTimeoutMs(maxBulkImages: number): number {
  return Math.max(REQUEST_TIMEOUT_MS, maxBulkImages * BULK_TIMEOUT_MS_PER_IMAGE);
}

export const SENSITIVE_HEADER_NAMES = [
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
] as const;
