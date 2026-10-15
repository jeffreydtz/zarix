import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: process.cwd(),
  cacheDir: process.env.ZARIX_CNF11_NOMINAL_CACHE,
  resolve: { alias: { '@': process.env.ZARIX_CNF11_SOURCE_COPY } },
  test: { environment: 'node', pool: 'forks', maxWorkers: 1, watch: false,
    testTimeout: 180_000,
    include: ['docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/cnf11-extension/nominal/nominal.test-source.ts'] },
});
