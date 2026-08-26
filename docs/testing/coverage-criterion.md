# test-2 — Explicit coverage criterion

## Selected criterion

**Decision / branch coverage ≥ 90%** on the **scoped core functions** documented in the CFG artifacts, measured with Vitest + `@vitest/coverage-v8`.

Rationale (aligned with [ADR-0005](../adr/0005-estrategia-testing-risk-based.md)):

- Zarix is a personal-finance PWA; the highest-risk defects are **wrong branches** (balance deltas, cron auth, recurrence windows), not missing line hits in UI code.
- Branch coverage on small, pure or near-pure functions gives the best signal per test for a solo-maintainer codebase.
- Full statement coverage of `transactionsService.create()` would require heavy Supabase mocking and duplicates production functional evidence ([`docs/tif/RESULTADOS-PRUEBAS.md`](../tif/RESULTADOS-PRUEBAS.md) CP-001-xx).

## In-scope functions

### CU-001 (`lib/services/transactions.ts`)

| Function | Type | CFG doc |
|----------|------|---------|
| `applyArchivedAccountsTransactionFilter` | TS, synchronous | [`cu-001-cfg.md#1`](./cu-001-cfg.md#1-applyarchivedaccountstransactionfilter) |
| `buildToArsConverter` | TS, async | [`cu-001-cfg.md#2`](./cu-001-cfg.md#2-buildtoarsconverter) |
| `excludedCurrenciesNote` | TS, synchronous | [`cu-001-cfg.md#3`](./cu-001-cfg.md#3-excludedcurrenciesnote) |

### CU-001 (database)

| Function | Type | CFG doc | Vitest scope |
|----------|------|---------|--------------|
| `update_account_balance()` | PL/pgSQL trigger | [`cu-001-cfg.md#4`](./cu-001-cfg.md#4-update_account_balance-plpgsql) | **Out of Vitest scope** — evidenced by CP-001 production functional tests and schema review |

### CU-006

| Function | File | CFG doc |
|----------|------|---------|
| `CronJob.run` | `lib/cron/cron-job.ts` | [`cu-006-cfg.md#1`](./cu-006-cfg.md#1-cronjobrun-template-method) |
| `IterativeCronJob.execute` | `lib/cron/cron-job.ts` | [`cu-006-cfg.md#2`](./cu-006-cfg.md#2-iterativecronjobexecute) |
| `shouldExecuteToday` | `lib/cron/recurring-schedule.ts` | [`cu-006-cfg.md#3`](./cu-006-cfg.md#3-shouldexecutetoday) |

`RecurringRulesJob` in `app/api/cron/recurring/route.ts` is **integration-heavy** (Supabase + Telegram). Its scheduling decision is covered indirectly via `shouldExecuteToday` unit tests; the route handler itself is excluded from the branch-coverage gate.

## Pass / fail gate

| Scope | Metric | Target | Latest run |
|-------|--------|--------|------------|
| Scoped TS core functions above | Branch coverage | ≥ 90% | **96.82%** (61/63 branches in included files) |
| `lib/cron/recurring-schedule.ts` | Branch coverage | 100% | **100%** |
| `lib/cron/cron-job.ts` | Branch coverage | ≥ 90% | **95.83%** |
| Tested exports in `lib/services/transactions.ts` | Branch coverage | 100% of executed branches | **100%** (only filter/converter/note paths executed) |

**Not a pass criterion:** total statement coverage of entire `transactions.ts` or `route.ts` files (would require mocking the whole Supabase stack).

## Known uncovered branches (honest list)

See [`test-cfg-mapping.md`](./test-cfg-mapping.md) § “Gaps”.
