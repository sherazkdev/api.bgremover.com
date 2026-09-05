import { describe, expect, it } from 'vitest';

import { buildTestApp } from '../fixtures/test-app.js';

describe('GET /', () => {
  it('serves a fast landing page without an API key', async () => {
    const { app, cleanup } = await buildTestApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.body).toContain('x-api-key');
      expect(response.body).toContain('/api/v1/remove-background');
      expect(response.body).toContain('/api/v1/remove-backgrounds');
      expect(response.body).toContain('Try the API');
      expect(response.body).toContain('Quick Integration');
      expect(response.body).toContain('Remove backgrounds with one API call');
      expect(response.body).toContain('Batch up to');
      expect(response.body).toContain('Preserve text, logos, and foreground graphics');
      expect(response.body).toContain('Select up to');
      expect(response.body).toContain('Download All');
      expect(response.headers['strict-transport-security']).toBeUndefined();
      expect(String(response.headers['content-security-policy'] ?? '')).not.toMatch(
        /upgrade-insecure-requests/i,
      );
    } finally {
      await cleanup();
    }
  });
});
