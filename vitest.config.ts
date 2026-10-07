import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Next.js path alias `@/*` -> repo root (see tsconfig.json `paths`).
// `vite-tsconfig-paths` is intentionally NOT used (not a dependency);
// the alias is resolved manually here to keep the test toolchain minimal.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'lib/services/transactions.ts',
        'lib/cron/cron-job.ts',
        'lib/cron/recurring-schedule.ts',
        'lib/cron/recurring-job.ts',
        'lib/financial-projections.ts',
        'lib/financial-anomalies.ts',
        'lib/services/investments.ts',
        'lib/import/csv.ts',
        'app/api/ai/projections/route.ts',
        'app/api/ai/anomalies/route.ts',
        'app/api/webhooks/mercado-pago/route.ts',
        'lib/billing/plans.ts',
        'app/api/billing/subscription-link/route.ts',
        'app/api/cron/recurring/route.ts',
      ],
    },
  },
});
