# test-1 — CU-001 Control Flow Graphs

**Unit:** CU-001 — Register / list financial movements  
**Primary file:** `lib/services/transactions.ts`  
**Database trigger:** `update_account_balance()` in `supabase/schema.sql`

---

## 1. `applyArchivedAccountsTransactionFilter`

Pure filter applied before global transaction list queries when archived accounts must be excluded.

```mermaid
flowchart TD
  N1([N1: ENTRY]) --> N2{N2: activeIds.length === 0?}
  N2 -->|E1 yes| N3[N3: query.eq id sentinel UUID]
  N3 --> N4([N4: RETURN query])
  N2 -->|E2 no| N5[N5: inList = postgrestQuotedUuidList]
  N5 --> N6[N6: filter account_id IN inList]
  N6 --> N7[N7: OR destination null OR destination IN inList]
  N7 --> N4
```

| Node / edge | Meaning |
|-------------|---------|
| N2 | Decision: no active accounts |
| E1 | Empty active set → impossible id filter (returns zero rows) |
| E2 | Non-empty → include only movements touching active accounts |
| E3 | UUID quoting inside `postgrestQuotedUuidList` (embedded in N5) |

---

## 2. `buildToArsConverter`

Builds a per-transaction ARS converter for dashboard / cron summaries.

```mermaid
flowchart TD
  N1([N1: ENTRY]) --> N2[N2: currencies = unique tx.currency uppercased]
  N2 --> N3[N3: FOR EACH currency c]
  N3 --> N4{N4: c === ARS?}
  N4 -->|E1 yes| N5[N5: rateToArs.set c 1]
  N5 --> N3
  N4 -->|E2 no| N6[N6: TRY getExchangeRate c ARS]
  N6 -->|E3 success| N7[N7: rateToArs.set c rate]
  N7 --> N3
  N6 -->|E4 catch| N8[N8: excludedCurrencies.push c]
  N8 --> N3
  N3 -->|loop done| N9[N9: RETURN toArs + excludedCurrencies]
  N9 --> N10([N10: EXIT])
```

---

## 3. `excludedCurrenciesNote`

User-facing note when some currencies lacked a live quote.

```mermaid
flowchart TD
  N1([N1: ENTRY]) --> N2{N2: excludedCurrencies.length === 0?}
  N2 -->|E1 yes| N3([N3: RETURN null])
  N2 -->|E2 no| N4[N4: RETURN warning string]
  N4 --> N5([N5: EXIT])
```

---

## 4. `update_account_balance()` (PL/pgSQL)

Postgres trigger maintaining `accounts.balance` on `INSERT | UPDATE | DELETE` of `transactions`. Simplified CFG (top level):

```mermaid
flowchart TD
  N1([N1: TRIGGER fires]) --> N2{N2: TG_OP?}
  N2 -->|DELETE| N3[N3: reverse OLD row impact by type]
  N2 -->|UPDATE| N4[N4: compute amount_delta + account move + transfer dest]
  N2 -->|INSERT| N5[N5: apply NEW row impact by type]
  N3 --> N6{N6: type adjustment?}
  N4 --> N6
  N5 --> N6
  N6 -->|yes| N7{N7: secondary multicurrency card?}
  N7 -->|E1 skip| N8([N8: no balance change])
  N7 -->|E2 apply| N9[N9: UPDATE accounts.balance]
  N6 -->|expense/income/transfer| N9
  N9 --> N10([N10: RETURN])
  N8 --> N10
```

**Evidence type:** schema review + production functional tests CP-001-01/03 (saldo observado antes/después). Not executed by Vitest (requires Postgres).

**Key branches inside DELETE/INSERT arms:**

| Branch | Effect |
|--------|--------|
| `expense` | Debit source account |
| `income` | Credit source account |
| `transfer` | Debit source; credit destination if present |
| `adjustment` + not secondary | Apply signed delta |
| `adjustment` + secondary multicurrency | Skip primary balance (RN tarjeta bimonetaria) |

Full source: `supabase/schema.sql` lines 449–586.
