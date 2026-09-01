import { describe, expect, it } from 'vitest';

import { apiKeyMatches, isPublicRequest } from '../../plugins/api-key.plugin.js';

function request(method: string, url: string): { method: string; url: string } {
  return { method, url };
}

describe('api-key helpers', () => {
  it('treats health, docs, uploads and OPTIONS as public', () => {
    expect(isPublicRequest(request('GET', '/api/v1/health'), '/api/v1')).toBe(true);
    expect(isPublicRequest(request('GET', '/api/v1/health/ready'), '/api/v1')).toBe(true);
    expect(isPublicRequest(request('GET', '/'), '/api/v1')).toBe(true);
    expect(isPublicRequest(request('GET', '/docs/json'), '/api/v1')).toBe(true);
    expect(isPublicRequest(request('GET', '/uploads/processed/a.png'), '/api/v1')).toBe(true);
    expect(isPublicRequest(request('OPTIONS', '/api/v1/remove-background'), '/api/v1')).toBe(true);
    expect(isPublicRequest(request('POST', '/api/v1/remove-background'), '/api/v1')).toBe(false);
  });

  it('compares keys without accepting a different value', () => {
    expect(apiKeyMatches('test-api-key', 'test-api-key')).toBe(true);
    expect(apiKeyMatches('wrong-key', 'test-api-key')).toBe(false);
    expect(apiKeyMatches(undefined, 'test-api-key')).toBe(false);
  });
});
