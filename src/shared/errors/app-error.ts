export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'IMAGE_REQUIRED',
  'MULTIPLE_IMAGES_NOT_ALLOWED',
  'TOO_MANY_IMAGES',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_IMAGE_TYPE',
  'CORRUPT_IMAGE',
  'IMAGE_DIMENSIONS_EXCEEDED',
  'IMAGE_PIXEL_LIMIT_EXCEEDED',
  'MODEL_LOADING',
  'MODEL_UNAVAILABLE',
  'PROCESSING_QUEUE_FULL',
  'BACKGROUND_REMOVAL_FAILED',
  'NO_REMOVABLE_SUBJECT',
  'PROCESSING_FAILED',
  'FILE_STORAGE_FAILED',
  'INVALID_API_KEY',
  'RATE_LIMIT_EXCEEDED',
  'INTERNAL_SERVER_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: unknown;

  constructor(code: ErrorCode, message: string, statusCode: number, details: unknown = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function validationError(message: string, details: unknown = null): AppError {
  return new AppError('VALIDATION_ERROR', message, 400, details);
}

export function imageRequiredError(): AppError {
  return new AppError('IMAGE_REQUIRED', 'An image file is required in the "image" field', 400);
}

export function multipleImagesError(): AppError {
  return new AppError(
    'MULTIPLE_IMAGES_NOT_ALLOWED',
    'Only one image may be uploaded per request',
    400,
  );
}

export function imagesRequiredError(): AppError {
  return new AppError(
    'IMAGE_REQUIRED',
    'At least one image file is required in the "images" field',
    400,
  );
}

export function tooManyImagesError(maxImages: number): AppError {
  return new AppError(
    'TOO_MANY_IMAGES',
    `A maximum of ${maxImages} images may be uploaded per request`,
    400,
  );
}

export function fileTooLargeError(maxFileSizeMb: number): AppError {
  return new AppError(
    'FILE_TOO_LARGE',
    `The uploaded file exceeds the ${maxFileSizeMb}MB limit`,
    413,
  );
}

export function unsupportedImageTypeError(): AppError {
  return new AppError(
    'UNSUPPORTED_IMAGE_TYPE',
    'Only JPEG, PNG and WebP images are supported',
    415,
  );
}

export function corruptImageError(details: unknown = null): AppError {
  return new AppError('CORRUPT_IMAGE', 'The uploaded image is corrupt or unreadable', 422, details);
}

export function imageDimensionsExceededError(maxWidth: number, maxHeight: number): AppError {
  return new AppError(
    'IMAGE_DIMENSIONS_EXCEEDED',
    `Image dimensions exceed the maximum of ${maxWidth}x${maxHeight}`,
    400,
  );
}

export function imagePixelLimitExceededError(maxPixels: number): AppError {
  return new AppError(
    'IMAGE_PIXEL_LIMIT_EXCEEDED',
    `Image exceeds the maximum pixel count of ${maxPixels}`,
    400,
  );
}

export function modelLoadingError(): AppError {
  return new AppError(
    'MODEL_LOADING',
    'The background-removal model is still loading. Try again shortly',
    503,
  );
}

export function modelUnavailableError(): AppError {
  return new AppError('MODEL_UNAVAILABLE', 'The background-removal model is unavailable', 503);
}

export function processingQueueFullError(): AppError {
  return new AppError(
    'PROCESSING_QUEUE_FULL',
    'The processing queue is full. Try again shortly',
    503,
  );
}

export function backgroundRemovalFailedError(details: unknown = null): AppError {
  return new AppError(
    'BACKGROUND_REMOVAL_FAILED',
    'Background removal failed while processing the image',
    500,
    details,
  );
}

export function noRemovableSubjectError(details: unknown = null): AppError {
  return new AppError(
    'NO_REMOVABLE_SUBJECT',
    'No removable background could be identified without deleting the image content',
    422,
    details,
  );
}

export function processingFailedError(message: string, details: unknown = null): AppError {
  return new AppError('PROCESSING_FAILED', message, 500, details);
}

export function fileStorageFailedError(): AppError {
  return new AppError('FILE_STORAGE_FAILED', 'Failed to store the image on disk', 500);
}

export function invalidApiKeyError(): AppError {
  return new AppError(
    'INVALID_API_KEY',
    'A valid x-api-key header is required',
    401,
  );
}

export function rateLimitExceededError(): AppError {
  return new AppError('RATE_LIMIT_EXCEEDED', 'Too many requests. Please slow down', 429);
}

export function internalServerError(): AppError {
  return new AppError('INTERNAL_SERVER_ERROR', 'An unexpected error occurred', 500);
}
