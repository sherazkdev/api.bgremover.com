import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_PREFIX: z
    .string()
    .regex(/^\/[A-Za-z0-9/_-]*$/, 'API_PREFIX must be a path starting with /')
    .default('/api/v1'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  UPLOAD_ROOT: z.string().min(1).default('public/uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().max(100).default(10),
  MAX_IMAGE_WIDTH: z.coerce.number().int().positive().default(6000),
  MAX_IMAGE_HEIGHT: z.coerce.number().int().positive().default(6000),
  MAX_IMAGE_PIXELS: z.coerce.number().int().positive().default(25_000_000),
  BG_REMOVAL_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  BG_REMOVAL_QUEUE_LIMIT: z.coerce.number().int().min(0).max(10_000).default(20),
  MODEL_ID: z.string().min(1).default('studioludens/birefnet-lite-512'),
  MODEL_DTYPE: z.enum(['fp32', 'fp16', 'q8', 'q4']).default('fp32'),
  API_KEY: z.string().min(8, 'API_KEY must be at least 8 characters'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),
  HF_ENDPOINT: z.string().url().default('https://huggingface.co'),
});

export type Env = z.infer<typeof envSchema>;
export type EnvInput = Record<string, string | undefined>;

export class EnvValidationError extends Error {
  public readonly details: unknown;

  constructor(message: string, details: unknown) {
    super(message);
    this.name = 'EnvValidationError';
    this.details = details;
  }
}

export function parseEnv(source: EnvInput): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new EnvValidationError(
      `Invalid environment configuration:\n${formatted}`,
      result.error.flatten(),
    );
  }
  if (result.data.NODE_ENV === 'production' && result.data.API_KEY.length < 24) {
    throw new EnvValidationError(
      'Invalid environment configuration:\nAPI_KEY: must be at least 24 characters in production',
      { fieldErrors: { API_KEY: ['must be at least 24 characters in production'] } },
    );
  }

  return result.data;
}

export function loadDotEnvFile(filePath = '.env'): void {
  try {
    process.loadEnvFile(filePath);
  } catch {
    // .env is optional; the process environment or defaults may already be valid.
  }
}

export function loadEnv(source?: EnvInput): Env {
  if (!source) {
    loadDotEnvFile();
  }
  return parseEnv(source ?? process.env);
}
