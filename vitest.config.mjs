import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['js/search.js', 'js/extract.js', 'js/blob.js', 'js/markdown.worker.js'],
    },
    setupFiles: ['./test/setup.js'],
  },
});