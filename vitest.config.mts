import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Next.js path alias `@/*` -> repo root (see tsconfig.json `paths`).
// `vite-tsconfig-paths` is intentionally NOT used (not a dependency);
// the alias is resolved manually here to keep the test toolchain minimal.
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
