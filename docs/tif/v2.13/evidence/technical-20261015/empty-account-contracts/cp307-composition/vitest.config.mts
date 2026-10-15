import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  resolve: { alias: { '@': '/tmp/zarix-app-empty-account-20261015' } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'node', include: ['empty-components.spec.tsx'], maxWorkers: 1 },
});
