import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/unit/**/*.test.ts', 'src/tests/integration/**/*.test.ts'],
    exclude: ['src/tests/e2e/**', 'node_modules/**', 'dist/**'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/tests/**', 'src/server.ts', 'src/shared/types/**'],
    },
  },
});
