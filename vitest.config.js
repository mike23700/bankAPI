import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'frontend/**', 
        'vitest.config.js',
        'swagger.yaml',
        '*.test.js',
        'fix_coverage.js'
      ]
    }
  }
});
