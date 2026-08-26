# test-1 — CU-006 Control Flow Graphs

**Unit:** CU-006 — Execute recurring rules (Vercel Cron)  
**Files:** `lib/cron/cron-job.ts`, `lib/cron/recurring-schedule.ts`, `app/api/cron/recurring/route.ts`

---

## 1. `CronJob.run` (Template Method)

```mermaid
flowchart TD
  N1([N1: ENTRY run request]) --> N2[N2: authHeader = request.headers authorization]
  N2 --> N3{N3: verifyCronBearer authHeader CRON_SECRET?}
  N3 -->|E1 fail| N4[N4: RETURN 401 Unauthorized]
  N3 -->|E2 pass| N5[N5: supabase = createServiceClientSync]
  N5 --> N6[N6: TRY payload = execute supabase]
  N6 -->|E3 success| N7{N7: payload.errors > 0?}
  N7 -->|E4 yes| N8[N8: alertAdmin partial failure]
  N7 -->|E5 no| N9[N9: RETURN 200 success JSON]
  N8 --> N9
  N6 -->|E6 catch| N10[N10: log + alertAdmin failure]
  N10 --> N11[N11: RETURN 500 Internal error]
```

---

## 2. `IterativeCronJob.execute`

Batch template used by `RecurringRulesJob` and other crons.

```mermaid
flowchart TD
  N1([N1: ENTRY]) --> N2[N2: TRY items = fetchItems]
  N2 -->|E1 throw| N3[N3: log fetch error + rethrow]
  N2 -->|E2 ok| N4{N4: items.length === 0?}
  N4 -->|E3 yes| N5[N5: RETURN empty summary]
  N4 -->|E4 no| N6[N6: beforeAll]
  N6 --> N7[N7: FOR EACH item]
  N7 --> N8{N8: shouldProcess item?}
  N8 -->|E5 no| N7
  N8 -->|E6 yes| N9[N9: TRY processItem]
  N9 -->|E7 done !== false| N10[N10: processed++]
  N9 -->|E8 catch| N11[N11: errors++]
  N10 --> N7
  N11 --> N7
  N7 -->|loop done| N12[N12: afterAll]
  N12 --> N13[N13: RETURN total processed errors]
  N13 --> N14([N14: EXIT])
```

---

## 3. `shouldExecuteToday`

Pure scheduler extracted to `lib/cron/recurring-schedule.ts` (used by `RecurringRulesJob.shouldProcess`).

```mermaid
flowchart TD
  N1([N1: ENTRY rule]) --> N2[N2: todayYmd = todayYmdAr]
  N2 --> N3{N3: start_date present?}
  N3 -->|E1 no| Z1([RETURN false])
  N3 -->|E2 yes| N4{N4: today < start?}
  N4 -->|E3 yes| Z1
  N4 -->|E4 no| N5{N5: end_date set AND today > end?}
  N5 -->|E5 yes| Z1
  N5 -->|E6 no| N6{N6: last_executed_date == today?}
  N6 -->|E7 yes| Z1
  N6 -->|E8 no| N7{N7: frequency?}
  N7 -->|daily| Z2([RETURN true])
  N7 -->|weekly| N8{N8: today.dow == start.dow?}
  N7 -->|monthly| N9{N9: today.d == min start.d lastDay?}
  N7 -->|yearly| N10{N10: month match AND day match?}
  N7 -->|other| Z1
  N8 -->|yes| Z2
  N8 -->|no| Z1
  N9 -->|yes| Z2
  N9 -->|no| Z1
  N10 -->|yes| Z2
  N10 -->|no| Z1
```

---

## 4. `RecurringRulesJob` (route handler — reference only)

`app/api/cron/recurring/route.ts` wires `GET → RecurringRulesJob.run`. Its `processItem` performs Supabase claim + `transactionsService.create` + optional Telegram DM. **Not unit-tested** (I/O); scheduling branches are covered via §3.
