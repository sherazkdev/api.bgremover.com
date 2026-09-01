import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseEnv } from '../../config/env.js';

describe('parseEnv', () => {
  it('applies defaults for a valid empty environment', () => {
    const env = parseEnv({ API_KEY: 'test-api-key' });
    expect(env.NODE_ENV).toBe('development');
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.PORT).toBe(3000);
    expect(env.API_PREFIX).toBe('/api/v1');
    expect(env.MODEL_ID).toBe('studioludens/birefnet-lite-512');
    expect(env.API_KEY).toBe('test-api-key');
    expect(env.BG_REMOVAL_CONCURRENCY).toBe(1);
  });

  it('coerces numeric strings', () => {
    const env = parseEnv({
      API_KEY: 'test-api-key',
      PORT: '4100',
      MAX_FILE_SIZE_MB: '8',
      BG_REMOVAL_QUEUE_LIMIT: '5',
    });
    expect(env.PORT).toBe(4100);
    expect(env.MAX_FILE_SIZE_MB).toBe(8);
    expect(env.BG_REMOVAL_QUEUE_LIMIT).toBe(5);
  });

  it('rejects an invalid port', () => {
    expect(() => parseEnv({ PORT: '70000' })).toThrow(EnvValidationError);
    expect(() => parseEnv({ PORT: '70000' })).toThrow(/Invalid environment configuration/);
  });

  it('rejects an invalid API prefix', () => {
    expect(() => parseEnv({ API_PREFIX: 'api/v1' })).toThrow(EnvValidationError);
  });

  it('rejects an invalid public URL', () => {
    expect(() => parseEnv({ PUBLIC_BASE_URL: 'not-a-url' })).toThrow(EnvValidationError);
  });

  it('rejects an invalid model dtype', () => {
    expect(() => parseEnv({ API_KEY: 'test-api-key', MODEL_DTYPE: 'int8' })).toThrow(
      EnvValidationError,
    );
  });

  it('requires API_KEY', () => {
    expect(() => parseEnv({})).toThrow(EnvValidationError);
    expect(() => parseEnv({ API_KEY: 'short' })).toThrow(/API_KEY/);
  });

  it('requires a longer API_KEY in production', () => {
    expect(() =>
      parseEnv({ NODE_ENV: 'production', API_KEY: 'test-api-key' }),
    ).toThrow(/at least 24 characters in production/);
  });
});
