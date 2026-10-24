-- POST-DEPLOY ONLY. Do not apply with 180000/190000 before the #16 code is live.
--
-- Order (prod):
--   1. PITR marker
--   2. 20261024180000_ai_integrations_foundation.sql (additive)
--   3. 20261024190000_pat_rls_confirm_quotes.sql (additive)
--   4. Deploy #16 code (encrypt-only writes; Vault-aware Telegram readers)
--   5. Pause key edits, run supabase/manual/backfill-user-secrets.sql
--      (copy + verify, never nulls)
--   6. THIS migration (revoke authenticated UPDATE on plaintext/enc secret columns)
--   7. Later follow-up: supabase/manual/null-plaintext-user-secrets.sql
--
-- Applying this before the code deploy breaks key saving in the current app,
-- which still UPDATEs users.gemini_api_key / telegram_bot_token as authenticated.

REVOKE UPDATE (gemini_api_key, telegram_bot_token, gemini_api_key_enc, telegram_bot_token_enc)
  ON public.users FROM PUBLIC, anon, authenticated;
