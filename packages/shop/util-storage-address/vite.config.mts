import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/packages/shop/util-storage-address',
  plugins: [],
  test: {
    name: '@org/shop-util-storage-address',
    watch: false,
    globals: true,
    environment: 'node',
    setupFiles: ['../../../tools/test-delay/setup.mjs'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // Run spec files one at a time. Nx owns concurrency via --parallel, so the
    // CPU burn in the setup file really does get a single core to itself.
    // (poolOptions.forks.maxForks does NOT do this on Vitest 4.)
    fileParallelism: false,
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      include: ['src/**/*.{ts,tsx}'],
    },
  },
}));
