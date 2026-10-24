-- MANUAL. Do not place this file in supabase/migrations/.
-- Run only AFTER backfill-user-secrets.sql AND after the dual-write code has
-- been live long enough that every writer uses Vault/AES.
-- Nulls plaintext ONLY when Vault decrypts to a non-empty value.
-- A missing Vault/pgcrypto cannot null anything: this script aborts first.
--
-- Down / rollback: restore from PITR / a logical backup taken immediately
-- before this script. There is no plaintext backup table on purpose.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'vault') THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'Refusing to null plaintext without Vault.';
  END IF;
END $$;

UPDATE public.users u
   SET gemini_api_key = NULL
 WHERE NULLIF(btrim(u.gemini_api_key), '') IS NOT NULL
   AND u.gemini_api_key_enc LIKE 'vault:v1:%'
   AND zarix_vault.read_user_secret(u.id, 'gemini_api_key') IS NOT NULL
   AND zarix_vault.read_user_secret(u.id, 'gemini_api_key') IS NOT DISTINCT FROM u.gemini_api_key;

UPDATE public.users u
   SET telegram_bot_token = NULL
 WHERE NULLIF(btrim(u.telegram_bot_token), '') IS NOT NULL
   AND u.telegram_bot_token_enc LIKE 'vault:v1:%'
   AND zarix_vault.read_user_secret(u.id, 'telegram_bot_token') IS NOT NULL
   AND zarix_vault.read_user_secret(u.id, 'telegram_bot_token') IS NOT DISTINCT FROM u.telegram_bot_token;
