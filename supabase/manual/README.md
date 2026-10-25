# Integrations (#16) production runbook

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
   `discard_pending_inbox_item`). Without it, REST/Wallet PAT auth fail-closed with HTTP 429.
5. Verify before deploying application code:
   ```sql
   SELECT proname FROM pg_proc
    WHERE proname IN ('rate_limit_hit','claim_pending_inbox_item','discard_pending_inbox_item','purge_rate_limit_counters')
    ORDER BY 1;
   -- expect 4 rows. GET /api/health must not return rateLimit=missing_rpc.
   ```
6. Deploy the #16 application code (encrypt-only writes; Vault-aware Telegram readers).
7. Pause key edits. Run `supabase/manual/backfill-user-secrets.sql` (copy + verify; never nulls).
8. Run `supabase/manual/20261025120000_revoke_plaintext_secret_updates.sql`
   (this directory is not a migration folder — a blind `db push` cannot apply it early).
9. Later, after verification and a fresh PITR marker:
   `supabase/manual/null-plaintext-user-secrets.sql`.

Do not put the REVOKE file back into `supabase/migrations/`.

## Rollback to main (`dpl_9Dq25TNT5g87278wtTwZZmKPk5iX` / `7651817`)

Keys saved after step 4 have plaintext NULLed. Main reads only
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

#16 versions to record after `apply_migration`: `20261024180000`, `20261024190000`, `20261024200000`.
The REVOKE file has no migration version.
