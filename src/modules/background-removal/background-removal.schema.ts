import { z } from 'zod';

import { OUTPUT_FORMATS, QUALITY_MODES, RESPONSE_MODES } from '../../config/constants.js';
import {
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_QUALITY,
  DEFAULT_RESPONSE_MODE,
} from './background-removal.constants.js';

export const removeBackgroundFieldsSchema = z.object({
  format: z.enum(OUTPUT_FORMATS).default(DEFAULT_OUTPUT_FORMAT),
  quality: z.enum(QUALITY_MODES).default(DEFAULT_QUALITY),
  responseMode: z.enum(RESPONSE_MODES).default(DEFAULT_RESPONSE_MODE),
});

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
  }),
  createdAt: z.iso.datetime(),
});

export const removeBackgroundJsonSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: removeBackgroundDataSchema,
});

export type RemoveBackgroundFields = z.infer<typeof removeBackgroundFieldsSchema>;

const formatEnum = [...OUTPUT_FORMATS];
const qualityEnum = [...QUALITY_MODES];
const responseModeEnum = [...RESPONSE_MODES];

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
        original: {
          type: 'object',
          required: ['url', 'mimeType', 'width', 'height', 'size'],
          properties: {
            url: { type: 'string', format: 'uri' },
            mimeType: { type: 'string' },
            width: { type: 'integer' },
            height: { type: 'integer' },
            size: { type: 'integer' },
          },
        },
        result: {
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
        },
        processing: {
          type: 'object',
          required: ['model', 'quality', 'durationMs'],
          properties: {
            model: { type: 'string' },
            quality: { type: 'string', enum: qualityEnum },
            durationMs: { type: 'number' },
          },
        },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;
