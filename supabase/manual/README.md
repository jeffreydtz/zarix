# Integrations (#16) production runbook

#16/#17 are live. Prod has `20261024180000`–`20261024240000` applied.
Never edit those files. Forward-only from
`supabase/migrations/20261025010000_inbox_claim_category_search_path.sql`.

Never `supabase db push` against production. Prod's `schema_migrations` recorded
#15 as `20261024182913` (`investment_type_on`) and `20261024182923`
(`investment_backlog`), not the filenames `20261024170000` / `20261024170100`.
`db push` would try to re-apply those files and would also apply any timestamped
file still sitting in `supabase/migrations/`.

Apply #16 **one file at a time** with `apply_migration`, using the **filename**
timestamp as the version. Do not touch prod from this repository's CI.

## Forward (encrypt-only stays; plaintext is nulled on save)

1. PITR marker.
2. `apply_migration` `supabase/migrations/20261024180000_ai_integrations_foundation.sql`
3. `apply_migration` `supabase/migrations/20261024190000_pat_rls_confirm_quotes.sql`
4. `apply_migration` `supabase/migrations/20261024200000_inbox_dedupe_uncertain_rate_limit.sql`
   (required before this build: `rate_limit_hit`, `uncertain` inbox, fingerprint reservation,
   `discard_pending_inbox_item`). Without it, REST/Wallet/MCP PAT auth fail-closed with HTTP 503.
5. `apply_migration` `supabase/migrations/20261024210000_inbox_possible_duplicate.sql`
6. `apply_migration` `supabase/migrations/20261024220000_inbox_request_canonical.sql`
7. `apply_migration` `supabase/migrations/20261024230000_inbox_possible_duplicate_owner_fk.sql`
8. `apply_migration` `supabase/migrations/20261024240000_installments_cordoba_calendar.sql`
9. Verify before deploying application code:
   ```sql
   SELECT proname FROM pg_proc
    WHERE proname IN ('rate_limit_hit','claim_pending_inbox_item','discard_pending_inbox_item','purge_rate_limit_counters')
    ORDER BY 1;
   -- expect 4 rows. GET /api/health must not return rateLimit=missing_rpc.
   ```
10. Deploy the #16 application code (encrypt-only writes; Vault-aware Telegram readers).
11. Pause key edits. Run `supabase/manual/backfill-user-secrets.sql` (copy + verify; never nulls).
12. Run `supabase/manual/20261025120000_revoke_plaintext_secret_updates.sql`
   (this directory is not a migration folder — a blind `db push` cannot apply it early).
13. Later, after verification and a fresh PITR marker:
   `supabase/manual/null-plaintext-user-secrets.sql`.

Do not put the REVOKE file back into `supabase/migrations/`.

## Rollback to main (`dpl_9Dq25TNT5g87278wtTwZZmKPk5iX` / `7651817`)

Keys saved after the #16 deploy step have plaintext NULLed. Main reads only
`users.gemini_api_key` / `users.telegram_bot_token`.

1. PITR marker.
2. Pause key edits.
3. Run `supabase/manual/restore-plaintext-from-vault.sql` (Vault → plaintext; abort if a pointer cannot be read).
4. Only then deploy main.
5. Re-GRANT `UPDATE (gemini_api_key, telegram_bot_token) ON public.users TO authenticated`
   only if old-code key saves must work before #16 is gone.

Keep the encrypt-only write path until #16 is stable. Do not roll the app back
to main until the restore-from-vault step verifies.

## Optional history reconcile (do not run on prod from this PR)

If an operator later wants filenames recorded next to the apply-time versions,
that is a one-off `schema_migrations` insert, not a `db push`. Suggested mapping
only; never rewrite or delete the existing prod rows:

- `20261024182913` ↔ `20261024170000_investment_type_on.sql` (already applied)
- `20261024182923` ↔ `20261024170100_investment_backlog.sql` (already applied)

#16 versions to record after `apply_migration`: `20261024180000`, `20261024190000`, `20261024200000`, `20261024210000`, `20261024220000`, `20261024230000`, `20261024240000`.
The REVOKE file has no migration version.

`20261024220000` backfills existing keyed inbox rows as `legacy:<id>`. Those keys stay bound and retry with a JS canonical as 409; they are never released. Query bounds use UTC−03 (Córdoba since 2009). Historical DST (−02) is out of the supported range; grouping still uses the IANA zone.

Follow-up (after #16/#17), one file at a time:
1. `apply_migration` `supabase/migrations/20261025010000_inbox_claim_category_search_path.sql`
2. `apply_migration` `supabase/migrations/20261025020000_budget_status_cordoba.sql`
3. `apply_migration` `supabase/migrations/20261025030000_category_system_select.sql`
