> **Referencia histórica.** La entrega vigente y sus cuatro CU se encuentran en [v2.13](../tif/v2.13/README.md). Este catálogo y sus resultados conservan el contexto anterior.

# Structural testing evidence (SAP-TFI-2026)

This folder holds **test-1 (CFG)**, **test-2 (coverage criterion)**, **test-3 (suite ↔ criterion mapping)**, and **test-4 (measured coverage)** for the Zarix units referenced in EV-COD (PR#6).

## Unit mapping (verified paths)

| Unit | Declared path | Actual path in repo | Notes |
|------|---------------|---------------------|-------|
| **CU-001** | `lib/services/transactions.ts` | `lib/services/transactions.ts` | Core service for movements |
| **CU-001 (DB)** | `update_account_balance` trigger | `supabase/schema.sql` (lines 449–586) | Postgres trigger on `transactions` |
| **CU-006** | `app/api/cron/recurring/route.ts` | `app/api/cron/recurring/route.ts` | Vercel Cron entrypoint |
| **CU-006** | `lib/cron/cron-job.ts` | `lib/cron/cron-job.ts` | Template Method base classes |
| **CU-006** | — | `lib/cron/recurring-schedule.ts` | Pure scheduling helpers extracted from the recurring route for testability |

## Artifacts

| Checklist item | File |
|----------------|------|
| test-1 CFG | [`cu-001-cfg.md`](./cu-001-cfg.md), [`cu-006-cfg.md`](./cu-006-cfg.md) |
| test-2 Coverage criterion | [`coverage-criterion.md`](./coverage-criterion.md) |
| test-3 Suite ↔ CFG mapping | [`test-cfg-mapping.md`](./test-cfg-mapping.md) |
| test-4 Measured coverage | [`coverage-run-output.txt`](./coverage-run-output.txt), [`lcov.info`](./lcov.info) |

## Running the suite

```bash
npm install
npm test                 # 162 Vitest tests (full repo)
npm run test:coverage    # scoped coverage on CU-001 / CU-006 files (see vitest.config.ts)
```

Coverage HTML (local only, gitignored): open `coverage/index.html` after `npm run test:coverage`.

## Scope note

The existing **132/132** Vitest suite (now **162/162**) covers monetary logic across the repo functionally but did **not** previously include CFG diagrams, an explicit coverage criterion, or a branch-to-test mapping for CU-001 / CU-006. This folder closes that gap without turning Zarix into an ERP/Odoo-style integration test project.
