import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  test: {
    name: '@org/api',
    watch: false,
    globals: true,
    environment: 'node',
    setupFiles: ['../../tools/test-delay/setup.mjs'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    reporters: ['default'],
    // Run spec files one at a time. Nx owns concurrency via --parallel, so the
    // CPU burn in the setup file really does get a single core to itself.
    // (poolOptions.forks.maxForks does NOT do this on Vitest 4.)
    fileParallelism: false,
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
