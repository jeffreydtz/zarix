-- MANUAL. Do not place this file in supabase/migrations/.
-- Run only AFTER the dual-write application code is live.
-- Copies plaintext users.gemini_api_key / telegram_bot_token into Supabase Vault
-- and writes vault:v1:{id} into *_enc. NEVER nulls plaintext.
--
-- Rerun-safe: blanks become NULL; a present plaintext is always re-stored;
-- verified is per-row for this run. Does not keep a plaintext backup table.
--
-- Down / rollback: plaintext columns are untouched. To undo the enc pointers:
--   UPDATE public.users SET gemini_api_key_enc = NULL, telegram_bot_token_enc = NULL
--   WHERE gemini_api_key_enc LIKE 'vault:v1:%' OR telegram_bot_token_enc LIKE 'vault:v1:%';
-- Vault rows named zarix.user.{kind}.{user_id} can then be deleted from vault.secrets.
--
-- Requires schema vault (supabase_vault). Fails closed if missing — will not null.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'vault') THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'Backfill needs Supabase Vault. Do not null plaintext.';
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
  g_ref TEXT;
  t_ref TEXT;
BEGIN
  FOR r IN
    SELECT id,
           NULLIF(btrim(gemini_api_key), '') AS gemini_api_key,
           NULLIF(btrim(telegram_bot_token), '') AS telegram_bot_token,
           gemini_api_key_enc,
           telegram_bot_token_enc
      FROM public.users
     WHERE NULLIF(btrim(gemini_api_key), '') IS NOT NULL
        OR NULLIF(btrim(telegram_bot_token), '') IS NOT NULL
  LOOP
    g_ref := r.gemini_api_key_enc;
    t_ref := r.telegram_bot_token_enc;
    IF r.gemini_api_key IS NOT NULL THEN
      g_ref := zarix_vault.store_user_secret(r.id, 'gemini_api_key', r.gemini_api_key);
      IF zarix_vault.read_user_secret(r.id, 'gemini_api_key') IS DISTINCT FROM r.gemini_api_key THEN
        RAISE EXCEPTION 'zarix_vault_verify_failed' USING HINT = r.id::text;
      END IF;
    END IF;
    IF r.telegram_bot_token IS NOT NULL THEN
      t_ref := zarix_vault.store_user_secret(r.id, 'telegram_bot_token', r.telegram_bot_token);
      IF zarix_vault.read_user_secret(r.id, 'telegram_bot_token') IS DISTINCT FROM r.telegram_bot_token THEN
        RAISE EXCEPTION 'zarix_vault_verify_failed' USING HINT = r.id::text;
      END IF;
    END IF;
    UPDATE public.users
       SET gemini_api_key_enc = g_ref,
           telegram_bot_token_enc = t_ref
     WHERE id = r.id;
  END LOOP;
END $$;
