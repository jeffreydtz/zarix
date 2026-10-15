import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: process.cwd(),
  cacheDir: process.env.ZARIX_CNF13_ROBUST_CACHE,
  resolve: { alias: { '@': '/tmp/zarix-app-delta-db3cf513-b7ad-4f2b-abcd-a2a44aeed27b' } },
  test: { environment: 'node', pool: 'forks', maxWorkers: 1, watch: false, testTimeout: 180_000,
    include: ['docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/native-delta/runnernative/cnf13-robust-only/robust.test-source.ts'] },
});
