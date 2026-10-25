-- MANUAL. Do not place this file in supabase/migrations/.
-- A blind `supabase db push` / migration replay must NOT apply this before the #16
-- code is live (old code still UPDATEs users.gemini_api_key / telegram_bot_token
-- as authenticated).
--
-- Numbered runbook (prod): follow supabase/manual/README.md. Condensed:
--   1. PITR marker
--   2. Apply supabase/migrations/20261024180000_ai_integrations_foundation.sql
--   3. Apply supabase/migrations/20261024190000_pat_rls_confirm_quotes.sql
--   4. Apply supabase/migrations/20261024200000_inbox_dedupe_uncertain_rate_limit.sql
--   5. Apply supabase/migrations/20261024210000_inbox_possible_duplicate.sql
--   6. Apply supabase/migrations/20261024220000_inbox_request_canonical.sql
--   7. Apply supabase/migrations/20261024230000_inbox_possible_duplicate_owner_fk.sql
--   8. Apply supabase/migrations/20261024240000_installments_cordoba_calendar.sql
--   9. Deploy the #16 application code (encrypt-only writes; Vault-aware Telegram)
--  10. Pause key edits, run supabase/manual/backfill-user-secrets.sql
--      (copy + verify, never nulls)
--  11. Run THIS file (revoke authenticated UPDATE on plaintext/enc secret columns)
--  12. Later follow-up only: supabase/manual/null-plaintext-user-secrets.sql
--
-- Rollback of this step: GRANT UPDATE (gemini_api_key, telegram_bot_token)
-- ON public.users TO authenticated;

REVOKE UPDATE (gemini_api_key, telegram_bot_token, gemini_api_key_enc, telegram_bot_token_enc)
  ON public.users FROM PUBLIC, anon, authenticated;
