import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Socket tests open real ports; keep files isolated but run them one at a time on slow CI boxes.
    fileParallelism: false,
  },
});
