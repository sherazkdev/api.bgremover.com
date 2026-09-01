import { z } from 'zod';

import { ERROR_CODES } from '../errors/app-error.js';

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown(),
    requestId: z.string(),
  }),
});

export const successEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.unknown(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
