import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The source is CommonJS, so the test files are too. Globals let them stay that way
    // instead of importing vitest, which cannot be require()d.
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.js'],
    // One shared MySQL database: running the files one at a time keeps the counts each
    // suite asserts on from being moved by another suite's inserts.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
