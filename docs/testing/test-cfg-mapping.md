# test-3 — Test suite ↔ CFG mapping

Maps each Vitest test (existing or new) to CFG nodes, edges, or branches from [`cu-001-cfg.md`](./cu-001-cfg.md) and [`cu-006-cfg.md`](./cu-006-cfg.md).

**Legend:** ✅ covered · ⚠️ partial / indirect · ❌ not covered by Vitest

---

## CU-001 — `lib/services/transactions.ts`

### `applyArchivedAccountsTransactionFilter`

| Test file | Test name | CFG ref | Branch |
|-----------|-----------|---------|--------|
| `__tests__/transactions-structural.test.ts` | returns impossible id filter when there are no active accounts | N2 → E1 → N3 | Empty `activeIds` |
| `__tests__/transactions-structural.test.ts` | filters by active account ids when list is non-empty | N2 → E2 → N5–N7 | Non-empty filter path |
| `__tests__/transactions-structural.test.ts` | quotes UUIDs for PostgREST reserved characters | N5 (E3) | UUID quoting |

### `buildToArsConverter`

| Test file | Test name | CFG ref | Branch |
|-----------|-----------|---------|--------|
| `__tests__/transactions-structural.test.ts` | uses rate 1 for ARS without calling cotizaciones | N4 → E1 | ARS shortcut |
| `__tests__/transactions-structural.test.ts` | converts foreign currency using live rate | N6 → E3 | Successful FX lookup |
| `__tests__/transactions-structural.test.ts` | excludes currencies when rate lookup fails | N6 → E4 | Catch / exclude |
| `__tests__/transactions-structural.test.ts` | defaults null currency to ARS | N9 `toArs` closure | Null currency edge |

### `excludedCurrenciesNote`

| Test file | Test name | CFG ref | Branch |
|-----------|-----------|---------|--------|
| `__tests__/transactions-structural.test.ts` | returns null when no currencies were excluded | N2 → E1 | Empty list |
| `__tests__/transactions-structural.test.ts` | returns warning text when currencies were excluded | N2 → E2 | Non-empty list |

### Related existing tests (functional, not CFG-scoped)

| Test file | Tests | Maps to | Notes |
|-----------|-------|---------|-------|
| `__tests__/transaction-account-impact.test.ts` | 12 | CU-001 balance arithmetic mirror | Exercises `impactInAccountCurrency` used alongside ledger logic |
| `__tests__/transaction-exchange.test.ts` | 14 | CU-001 FX helpers | Supports `computeAmountInAccountCurrencyForAccount` callers |
| `docs/tif/RESULTADOS-PRUEBAS.md` CP-001-01/02/03/04 | Production Puppeteer | `transactionsService.create`, trigger side-effects | Functional evidence; not Vitest |

### `update_account_balance()` (SQL)

| Evidence | CFG ref | Branch |
|----------|---------|--------|
| CP-001-01 gasto ARS | INSERT → expense | Debit source ✅ (production) |
| CP-001-03 transferencia | INSERT → transfer | Source debit + dest credit ✅ (production) |
| Schema review | adjustment + secondary multicurrency | E1 skip ⚠️ (design only, no automated branch hit) |
| — | UPDATE / DELETE arms | ❌ no dedicated automated test |

---

## CU-006 — Cron infrastructure

### `CronJob.run`

| Test file | Test name | CFG ref | Branch |
|-----------|-----------|---------|--------|
| `__tests__/cron-job-structural.test.ts` | returns 401 when bearer is invalid | N3 → E1 | Auth fail |
| `__tests__/cron-job-structural.test.ts` | returns 401 when authorization header is missing | N3 → E1 | Missing header |
| `__tests__/cron-job-structural.test.ts` | returns success payload when execute succeeds | N3 → E2 → N6 → E3 → N7 → E5 → N9 | Happy path |
| `__tests__/cron-job-structural.test.ts` | alerts admin when execute reports errors | N7 → E4 → N8 | Partial failure alert |
| `__tests__/cron-job-structural.test.ts` | returns 500 and alerts admin when execute throws | N6 → E6 → N10–N11 | Fatal error |
| `__tests__/cron-auth.test.ts` | 6 tests | N3 (via `verifyCronBearer`) | Indirect auth branches ✅ |

### `IterativeCronJob.execute`

| Test file | Test name | CFG ref | Branch |
|-----------|-----------|---------|--------|
| `__tests__/cron-job-structural.test.ts` | returns empty summary when fetch yields no items | N4 → E3 → N5 | Empty batch |
| `__tests__/cron-job-structural.test.ts` | skips items filtered by shouldProcess | N8 → E5 | Filter skip |
| `__tests__/cron-job-structural.test.ts` | counts per-item failures without aborting the batch | N9 → E7/E8 | Item error tolerance |
| `__tests__/cron-job-structural.test.ts` | rethrows when fetchItems fails | N2 → E1 → N3 | Fetch failure |

### `shouldExecuteToday`

| Test file | Test name | CFG ref | Branch |
|-----------|-----------|---------|--------|
| `__tests__/recurring-schedule.test.ts` | returns false when start_date is missing | N3 → E1 | No start |
| `__tests__/recurring-schedule.test.ts` | returns false before start_date | N4 → E3 | Before window |
| `__tests__/recurring-schedule.test.ts` | returns false after end_date | N5 → E5 | After window |
| `__tests__/recurring-schedule.test.ts` | returns false when already executed today | N6 → E7 | Idempotency |
| `__tests__/recurring-schedule.test.ts` | returns true for daily frequency inside window | N7 daily → Z2 | Daily |
| `__tests__/recurring-schedule.test.ts` | matches weekly rules on start weekday | N7 weekly → N8 | Weekly match / no-match |
| `__tests__/recurring-schedule.test.ts` | matches monthly rules on target day, clamped | N7 monthly → N9 | Monthly + clamp |
| `__tests__/recurring-schedule.test.ts` | matches yearly rules only in start month | N7 yearly → N10 | Yearly match / no-match |
| `__tests__/recurring-schedule.test.ts` | returns false for unknown frequency | N7 other → Z1 | Unknown freq |
| `__tests__/recurring-schedule.test.ts` | todayYmdAr / ymdParts / lastDayOfMonth | Helper nodes | Date plumbing ✅ |

### `RecurringRulesJob` (`app/api/cron/recurring/route.ts`)

| Concern | Vitest | Notes |
|---------|--------|-------|
| `shouldProcess` (inactive account skip) | ❌ | Would need Supabase mock |
| `processItem` (claim + create + Telegram) | ❌ | Integration; out of structural scope |
| Scheduling decision | ✅ indirect | Via `shouldExecuteToday` tests |

---

## Gaps — CFG branches still without a Vitest test

| Unit | Function / location | Branch | Mitigation |
|------|---------------------|--------|------------|
| CU-001 | `transactionsService.create` | All validation / transfer / installment arms | CP-001 production functional tests |
| CU-001 | `update_account_balance` UPDATE/DELETE | Delta recomputation | Not automated; schema-reviewed |
| CU-001 | `update_account_balance` secondary adjustment skip | E1 skip path | Design + migration review |
| CU-006 | `CronJob` default hooks | `shouldProcess` default true (L107–108), `emptyMessage` default (L118–119) | Base-class defaults; subclasses override in production jobs |
| CU-006 | `IterativeCronJob` | `beforeAll` / `afterAll` non-empty hooks | No production job failure path requires unit test here |
| CU-006 | `RecurringRulesJob.processItem` | Claim race, Telegram notify | Future selective integration test |

---

## Suite vs criterion (test-3 summary)

| Criterion (see [`coverage-criterion.md`](./coverage-criterion.md)) | Result |
|---------------------------------------------------------------------|--------|
| Branch coverage ≥ 90% on scoped TS functions | **PASS** (96.82% on included files) |
| Every documented CFG decision branch for scoped functions has ≥1 mapped test | **PASS** except gaps table above |
| Full-file statement coverage | **NOT REQUIRED** — 23.27% statements reflects large untested `create()` body |
