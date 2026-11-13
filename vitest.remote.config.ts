import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/remote/*.remote.ts'],
    testTimeout: 15_000,
    retry: 0,
    fileParallelism: false,
  },
});
