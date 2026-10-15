import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Next.js path alias `@/*` -> repo root (see tsconfig.json `paths`).
// `vite-tsconfig-paths` is intentionally NOT used (not a dependency);
// the alias is resolved manually here to keep the test toolchain minimal.
export default defineConfig({
  // Next preserves JSX for its compiler; Vitest needs executable component code.
  oxc: { jsx: { runtime: 'automatic' } },
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
        // Risk-focused instrumentation, not whole-application coverage.
        'lib/plans/**/*.ts',
        'lib/billing/**/*.ts',
        'lib/services/accounts.ts',
        'lib/services/subscriptions.ts',
        'lib/services/mercado-pago-service.ts',
        'lib/services/notification-outbox.ts',
        'lib/services/botSessions.ts',
        'lib/services/cotizaciones.ts',
        'lib/services/internal-ai-chat.ts',
        'lib/offline-transaction-store.ts',
        'lib/hooks/useOfflineQueue.ts',
        'lib/transaction-idempotency.ts',
        'lib/financial-request-context.ts',
        'app/api/billing/cancel/route.ts',
        'app/api/export/backup/route.ts',
        'components/settings/SettingsForm.tsx',
        'lib/services/transactions.ts',
        'lib/services/analytics.ts',
        'lib/services/month-flow.ts',
        'lib/supabase-paginated-read.ts',
        'lib/cron/cron-job.ts',
        'lib/cron/recurring-schedule.ts',
        'lib/cron/recurring-job.ts',
        'lib/financial-projections.ts',
        'lib/financial-anomalies.ts',
        'lib/offline-queue-sync.ts',
        'lib/services/investments.ts',
        'lib/investment-simulation.ts',
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
