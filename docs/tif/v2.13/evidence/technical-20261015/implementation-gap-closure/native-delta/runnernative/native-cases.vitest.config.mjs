// Preparation only. The launcher validates a frozen local target before Vitest.
import { defineConfig } from 'vitest/config';
const root = process.cwd();
export default defineConfig({
  root,
  cacheDir: process.env.ZARIX_DELTA_NATIVE_CACHE,
  resolve: { alias: { '@': root } },
  test: {
    environment: 'node',
    include: ['docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/native-delta/runnernative/native-cases.test-source.ts'],
    maxWorkers: 1,
    pool: 'forks',
    watch: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
