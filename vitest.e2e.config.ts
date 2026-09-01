import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/e2e/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
