-- MANUAL. Do not place this file in supabase/migrations/.
-- Run BEFORE rolling the app back to main (dpl_9Dq25… / 7651817) after #16
-- encrypt-only writes. Main reads only users.gemini_api_key / telegram_bot_token.
-- Copies Vault secrets back into those plaintext columns. Never nulls _enc.
--
-- Numbered runbook (rollback):
--   1. PITR marker
--   2. Pause key edits
--   3. Run THIS file (copy Vault → plaintext, verify, abort if a pointer
--      cannot be read)
--   4. Deploy main
--   5. Users can re-save a key if a row still has NULL plaintext
--
-- Fails closed if Vault is missing. Does not apply the REVOKE rollback;
-- re-GRANT UPDATE (gemini_api_key, telegram_bot_token) ON users TO authenticated
-- only if you also need old-code key saves before #16 is gone.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'vault') THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'Cannot restore plaintext without Vault.';
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
  g_plain TEXT;
  t_plain TEXT;
BEGIN
  FOR r IN
    SELECT id, gemini_api_key, telegram_bot_token, gemini_api_key_enc, telegram_bot_token_enc
      FROM public.users
     WHERE gemini_api_key_enc IS NOT NULL
        OR telegram_bot_token_enc IS NOT NULL
  LOOP
    g_plain := r.gemini_api_key;
    t_plain := r.telegram_bot_token;
    IF r.gemini_api_key_enc IS NOT NULL THEN
      g_plain := zarix_vault.read_user_secret(r.id, 'gemini_api_key');
      IF g_plain IS NULL THEN
        RAISE EXCEPTION 'zarix_vault_restore_failed'
          USING HINT = r.id::text || ' gemini';
      END IF;
    END IF;
    IF r.telegram_bot_token_enc IS NOT NULL THEN
      t_plain := zarix_vault.read_user_secret(r.id, 'telegram_bot_token');
      IF t_plain IS NULL THEN
        RAISE EXCEPTION 'zarix_vault_restore_failed'
          USING HINT = r.id::text || ' telegram';
      END IF;
    END IF;
    UPDATE public.users
       SET gemini_api_key = COALESCE(g_plain, gemini_api_key),
           telegram_bot_token = COALESCE(t_plain, telegram_bot_token)
     WHERE id = r.id;
  END LOOP;
END $$;
