import { z } from 'zod';

import {
  OUTPUT_FORMATS,
  QUALITY_MODES,
  REMOVAL_MODES,
  RESPONSE_MODES,
} from '../../config/constants.js';
import { parseBooleanField } from '../../shared/utils/boolean-field.js';
import {
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_PRESERVE_TEXT,
  DEFAULT_QUALITY,
  DEFAULT_REMOVAL_MODE,
  DEFAULT_RESPONSE_MODE,
} from './background-removal.constants.js';

const booleanish = z.union([z.boolean(), z.string(), z.number()]).optional();

export const removeBackgroundFieldsSchema = z
  .object({
    format: z.enum(OUTPUT_FORMATS).optional(),
    output_format: z.enum(OUTPUT_FORMATS).optional(),
    quality: z.enum(QUALITY_MODES).default(DEFAULT_QUALITY),
    responseMode: z.enum(RESPONSE_MODES).default(DEFAULT_RESPONSE_MODE),
    mode: z.enum(REMOVAL_MODES).default(DEFAULT_REMOVAL_MODE),
    preserveText: booleanish,
    preserve_text: booleanish,
    preserveLogos: booleanish,
    preserve_logos: booleanish,
    preserveTextContainers: booleanish,
    preserve_text_containers: booleanish,
  })
  .transform((value) => ({
    format: value.format ?? value.output_format ?? DEFAULT_OUTPUT_FORMAT,
    quality: value.quality,
    responseMode: value.responseMode,
    mode: value.mode,
    preserveText: parseBooleanField(
      value.preserveText ?? value.preserve_text,
      DEFAULT_PRESERVE_TEXT,
    ),
    preserveLogos: parseBooleanField(value.preserveLogos ?? value.preserve_logos, true),
    preserveTextContainers: parseBooleanField(
      value.preserveTextContainers ?? value.preserve_text_containers,
      true,
    ),
  }));

export const removeBackgroundsFieldsSchema = z
  .object({
    format: z.enum(OUTPUT_FORMATS).optional(),
    output_format: z.enum(OUTPUT_FORMATS).optional(),
    quality: z.enum(QUALITY_MODES).default(DEFAULT_QUALITY),
    mode: z.enum(REMOVAL_MODES).default(DEFAULT_REMOVAL_MODE),
    preserveText: booleanish,
    preserve_text: booleanish,
    preserveLogos: booleanish,
    preserve_logos: booleanish,
    preserveTextContainers: booleanish,
    preserve_text_containers: booleanish,
    imageOptions: z.string().optional(),
  })
  .transform((value) => ({
    format: value.format ?? value.output_format ?? DEFAULT_OUTPUT_FORMAT,
    quality: value.quality,
    mode: value.mode,
    preserveText: parseBooleanField(
      value.preserveText ?? value.preserve_text,
      DEFAULT_PRESERVE_TEXT,
    ),
    preserveLogos: parseBooleanField(value.preserveLogos ?? value.preserve_logos, true),
    preserveTextContainers: parseBooleanField(
      value.preserveTextContainers ?? value.preserve_text_containers,
      true,
    ),
    ...(value.imageOptions ? { imageOptions: value.imageOptions } : {}),
  }));

export const imageAssetSchema = z.object({
  url: z.string().url(),
  mimeType: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  size: z.number().int().nonnegative(),
});

export const removeBackgroundDataSchema = z.object({
  id: z.string().uuid(),
  original: imageAssetSchema,
  result: imageAssetSchema.extend({
    hasTransparency: z.boolean(),
  }),
  processing: z.object({
    model: z.string(),
    quality: z.enum(QUALITY_MODES),
    durationMs: z.number().nonnegative(),
    mode: z.enum(REMOVAL_MODES),
    preserveText: z.boolean(),
    preserveLogos: z.boolean(),
    preserveTextContainers: z.boolean(),
    textPreserved: z.boolean(),
    needsReview: z.boolean(),
    appliedMode: z.enum(REMOVAL_MODES),
  }),
  createdAt: z.iso.datetime(),
});

export const removeBackgroundJsonSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: removeBackgroundDataSchema,
});

export type RemoveBackgroundFields = z.infer<typeof removeBackgroundFieldsSchema>;
export type RemoveBackgroundsFields = z.infer<typeof removeBackgroundsFieldsSchema>;

const formatEnum = [...OUTPUT_FORMATS];
const qualityEnum = [...QUALITY_MODES];
const responseModeEnum = [...RESPONSE_MODES];
const modeEnum = [...REMOVAL_MODES];

export const removeBackgroundOpenApiBody = {
  type: 'object',
  required: ['image'],
  properties: {
    image: {
      type: 'string',
      format: 'binary',
      description:
        'Source image. Only JPEG, PNG and WebP are accepted. File type is detected from binary content.',
    },
    format: {
      type: 'string',
      enum: formatEnum,
      default: DEFAULT_OUTPUT_FORMAT,
      description: 'Transparent output format',
    },
    quality: {
      type: 'string',
      enum: qualityEnum,
      default: DEFAULT_QUALITY,
      description:
        'hd is the default and uses higher-quality resampling. fast is slightly quicker on resize only. Output size stays the original image size.',
    },
    responseMode: {
      type: 'string',
      enum: responseModeEnum,
      default: DEFAULT_RESPONSE_MODE,
      description:
        'json returns metadata and public URLs. binary streams the processed image after it is saved.',
    },
    mode: {
      type: 'string',
      enum: modeEnum,
      default: DEFAULT_REMOVAL_MODE,
      description:
        'auto uses BiRefNet for people/products/objects and Graphic Cutout for text-heavy posters. text_background removes backgrounds behind lettering while keeping the original raster text. document, graphic, and screenshot use Graphic Cutout.',
    },
    preserveText: {
      type: 'string',
      enum: ['true', 'false'],
      default: 'true',
      description:
        'When true (default), detected text is fused into the alpha mask during person/object cutouts.',
    },
    preserveLogos: {
      type: 'string',
      enum: ['true', 'false'],
      description: 'Preserve detected logos and badges. Defaults to true except in text_background mode.',
    },
    preserveTextContainers: {
      type: 'string',
      enum: ['true', 'false'],
      description:
        'Preserve colored text cards, ribbons, and labels. Defaults to false in text_background mode.',
    },
  },
} as const;

export const errorResponseOpenApi = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      required: ['code', 'message', 'details', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {},
        requestId: { type: 'string' },
      },
    },
  },
} as const;

const imageAssetOpenApi = {
  type: 'object',
  required: ['url', 'mimeType', 'width', 'height', 'size'],
  properties: {
    url: { type: 'string', format: 'uri' },
    mimeType: { type: 'string' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    size: { type: 'integer' },
  },
} as const;

const resultAssetOpenApi = {
  type: 'object',
  required: ['url', 'mimeType', 'width', 'height', 'size', 'hasTransparency'],
  properties: {
    url: { type: 'string', format: 'uri' },
    mimeType: { type: 'string' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    size: { type: 'integer' },
    hasTransparency: { type: 'boolean' },
  },
} as const;

const itemProcessingOpenApi = {
  type: 'object',
  required: [
    'model',
    'quality',
    'durationMs',
    'mode',
    'appliedMode',
    'status',
    'preserveText',
    'preserveLogos',
    'preserveTextContainers',
    'textPreserved',
    'needsReview',
  ],
  properties: {
    model: { type: 'string' },
    quality: { type: 'string', enum: qualityEnum },
    durationMs: { type: 'number' },
    mode: { type: 'string', enum: modeEnum },
    appliedMode: { type: 'string', enum: modeEnum },
    status: { type: 'string', enum: ['completed', 'needs_review', 'failed'] },
    preserveText: { type: 'boolean' },
    preserveLogos: { type: 'boolean' },
    preserveTextContainers: { type: 'boolean' },
    textPreserved: { type: 'boolean' },
    needsReview: { type: 'boolean' },
  },
} as const;

export const removeBackgroundJsonOpenApi = {
  type: 'object',
  required: ['success', 'message', 'data'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    message: { type: 'string' },
    data: {
      type: 'object',
      required: ['id', 'original', 'result', 'processing', 'createdAt'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        original: imageAssetOpenApi,
        result: resultAssetOpenApi,
        processing: itemProcessingOpenApi,
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;

const bulkItemOpenApi = {
  type: 'object',
  required: ['index', 'filename', 'status'],
  properties: {
    index: { type: 'integer' },
    filename: { type: 'string' },
    status: { type: 'string', enum: ['completed', 'needs_review', 'failed'] },
    needsReview: { type: 'boolean' },
    id: { type: 'string', format: 'uuid' },
    original: imageAssetOpenApi,
    result: resultAssetOpenApi,
    processing: itemProcessingOpenApi,
    createdAt: { type: 'string', format: 'date-time' },
    textPreserved: { type: 'boolean' },
    errorCode: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

export const removeBackgroundsOpenApiBody = {
  type: 'object',
  required: ['images'],
  properties: {
    images: {
      type: 'array',
      items: { type: 'string', format: 'binary' },
      description:
        'One or more JPEG, PNG or WebP images. Repeat the images field, or send image. File type is detected from binary content.',
    },
    format: {
      type: 'string',
      enum: formatEnum,
      default: DEFAULT_OUTPUT_FORMAT,
      description: 'Transparent output format applied to every image',
    },
    quality: {
      type: 'string',
      enum: qualityEnum,
      default: DEFAULT_QUALITY,
      description:
        'Same quality modes as the single-image endpoint. hd is the default. Each image uses the identical BiRefNet path.',
    },
    mode: {
      type: 'string',
      enum: modeEnum,
      default: DEFAULT_REMOVAL_MODE,
      description: 'Applied to every image in the batch',
    },
    preserveText: {
      type: 'string',
      enum: ['true', 'false'],
      default: 'true',
      description: 'Preserve text, logos, and foreground graphics on every image. Default true.',
    },
  },
} as const;

export const removeBackgroundsJsonOpenApi = {
  type: 'object',
  required: ['success', 'message', 'data'],
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: {
      type: 'object',
      required: ['count', 'completed', 'failed', 'processing', 'items', 'zip'],
      properties: {
        count: { type: 'integer' },
        completed: { type: 'integer' },
        failed: { type: 'integer' },
        processing: {
          type: 'object',
          required: ['quality', 'mode', 'preserveText', 'durationMs'],
          properties: {
            quality: { type: 'string', enum: qualityEnum },
            mode: { type: 'string', enum: modeEnum },
            preserveText: { type: 'boolean' },
            durationMs: { type: 'number' },
          },
        },
        items: {
          type: 'array',
          items: bulkItemOpenApi,
        },
        zip: {
          type: ['object', 'null'],
          properties: {
            url: { type: 'string', format: 'uri' },
            mimeType: { type: 'string' },
            size: { type: 'integer' },
          },
        },
      },
    },
  },
} as const;
