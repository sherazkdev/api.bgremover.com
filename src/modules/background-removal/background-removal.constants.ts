import {
  OUTPUT_FORMATS,
  QUALITY_MODES,
  REMOVAL_MODES,
  RESPONSE_MODES,
} from '../../config/constants.js';

export const REMOVE_BACKGROUND_PATH = '/remove-background';
export const REMOVE_BACKGROUNDS_PATH = '/remove-backgrounds';
export const IMAGE_FIELD_NAME = 'image';
export const IMAGES_FIELD_NAME = 'images';
export const IMAGE_FIELD_NAMES = new Set([IMAGE_FIELD_NAME, IMAGES_FIELD_NAME]);

export const DEFAULT_OUTPUT_FORMAT = OUTPUT_FORMATS[0];
export const DEFAULT_QUALITY = QUALITY_MODES[1];
export const DEFAULT_RESPONSE_MODE = RESPONSE_MODES[0];
export const DEFAULT_REMOVAL_MODE = REMOVAL_MODES[0];
export const DEFAULT_PRESERVE_TEXT = true;

export const SUCCESS_MESSAGE = 'Background removed successfully';
export const BULK_SUCCESS_MESSAGE = 'Backgrounds removed successfully';
export const BULK_PARTIAL_MESSAGE = 'Backgrounds removed with some failures';
export const BULK_FAILED_MESSAGE = 'No images could be processed';
