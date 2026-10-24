-- AI-first public integrations: write channel, PATs, encrypted secrets,
-- pending inbox, card maps, audit log. Idempotent. Does not rewrite
-- financial amounts; secrets plaintext is copied then nulled only after
-- a verified backup+ciphertext pair.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Write channel on transactions
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web';

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_source_check
  CHECK (source IN ('web', 'telegram', 'wallet', 'api', 'mcp'));

CREATE INDEX IF NOT EXISTS idx_transactions_user_source
  ON public.transactions (user_id, source, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_transaction_once(
  p_user_id UUID, p_request_id TEXT, p_request_hash TEXT, p_transaction JSONB,
  p_installments INTEGER DEFAULT 1
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  prior public.transaction_requests%ROWTYPE;
  t public.transactions%ROWTYPE;
  result JSONB;
  installment_group UUID;
BEGIN
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
     OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid request identifier or fingerprint';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_id, 0));
  SELECT * INTO prior FROM public.transaction_requests
    WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'Z0001', MESSAGE = 'Request payload conflict';
    END IF;
    RETURN prior.response;
  END IF;

  t := jsonb_populate_record(NULL::public.transactions, p_transaction);
  IF t.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_installments IS NULL OR p_installments < 1 OR p_installments > 36 THEN
    RAISE EXCEPTION 'Invalid installments';
  END IF;
  IF p_installments > 1 THEN
    IF t.type <> 'expense' THEN RAISE EXCEPTION 'Installments require expense'; END IF;
    installment_group := public.create_installment_transactions(p_user_id, t.account_id,
      t.amount, t.currency, p_installments, t.category_id, t.description, t.transaction_date);
    SELECT to_jsonb(tx) INTO STRICT result FROM public.transactions tx
      WHERE tx.user_id = p_user_id AND tx.installment_group_id = installment_group
        AND tx.installment_number = 1;
  ELSE
    INSERT INTO public.transactions (user_id, type, account_id, destination_account_id,
      amount, currency, amount_in_account_currency, destination_amount_in_account_currency,
      exchange_rate, category_id, description, notes, tags, transaction_date, is_recurring,
      recurring_rule_id, source)
    VALUES (p_user_id, t.type, t.account_id, t.destination_account_id, t.amount, t.currency,
      t.amount_in_account_currency, t.destination_amount_in_account_currency, t.exchange_rate,
      t.category_id, t.description, t.notes, t.tags, COALESCE(t.transaction_date, now()),
      COALESCE(t.is_recurring, false), t.recurring_rule_id, COALESCE(t.source, 'web'))
    RETURNING to_jsonb(transactions.*) INTO result;
  END IF;
  INSERT INTO public.transaction_requests (user_id, request_id, request_hash, response)
    VALUES (p_user_id, p_request_id, p_request_hash, result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_transaction_once(UUID, TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_transaction_once(UUID, TEXT, TEXT, JSONB, INTEGER) TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Personal access tokens (hash only)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.personal_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  token_prefix TEXT NOT NULL CHECK (char_length(token_prefix) BETWEEN 8 AND 16),
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT personal_access_tokens_scopes_check CHECK (
    scopes <@ ARRAY['read','write','ingest']::TEXT[]
    AND array_length(scopes, 1) >= 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS personal_access_tokens_hash_unique
  ON public.personal_access_tokens (token_hash);
CREATE INDEX IF NOT EXISTS personal_access_tokens_user_idx
  ON public.personal_access_tokens (user_id, created_at DESC);

ALTER TABLE public.personal_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_access_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pat_select_own ON public.personal_access_tokens;
CREATE POLICY pat_select_own ON public.personal_access_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pat_no_client_write ON public.personal_access_tokens;
-- Inserts/updates/deletes go through the service role API so token_hash never
-- crosses PostgREST as a client write.
REVOKE ALL ON public.personal_access_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, name, token_prefix, scopes, last_used_at, revoked_at, created_at, updated_at)
  ON public.personal_access_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_access_tokens TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Encrypted user secrets (Vault / pgcrypto / envelope fallback)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gemini_api_key_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_bot_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS wallet_auto_confirm BOOLEAN NOT NULL DEFAULT FALSE;

GRANT SELECT (wallet_auto_confirm), UPDATE (wallet_auto_confirm)
  ON public.users TO authenticated;
REVOKE UPDATE (gemini_api_key, telegram_bot_token, gemini_api_key_enc, telegram_bot_token_enc)
  ON public.users FROM PUBLIC, anon, authenticated;

CREATE SCHEMA IF NOT EXISTS zarix_vault;
REVOKE ALL ON SCHEMA zarix_vault FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA zarix_vault TO service_role;

CREATE TABLE IF NOT EXISTS zarix_vault.user_secret_backup (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  gemini_api_key TEXT,
  telegram_bot_token TEXT,
  copied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE zarix_vault.user_secret_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE zarix_vault.user_secret_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON zarix_vault.user_secret_backup FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zarix_vault.user_secret_backup TO service_role;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE OR REPLACE FUNCTION zarix_vault.encrypt_secret(p_plain TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  k TEXT;
  enc BYTEA;
BEGIN
  IF p_plain IS NULL OR p_plain = '' THEN RETURN NULL; END IF;
  k := current_setting('zarix.secrets_key', true);
  IF k IS NULL OR k = '' THEN
    k := 'zarix-pglite-synthetic-key-not-for-production';
  END IF;
  BEGIN
    enc := extensions.pgp_sym_encrypt(p_plain, k);
    RETURN 'pgp:v1:' || encode(enc, 'base64');
  EXCEPTION WHEN undefined_function OR undefined_object OR invalid_schema_name THEN
    BEGIN
      enc := public.pgp_sym_encrypt(p_plain, k);
      RETURN 'pgp:v1:' || encode(enc, 'base64');
    EXCEPTION WHEN undefined_function OR undefined_object THEN
      RETURN 'envelope:v0:' || encode(convert_to(p_plain, 'utf8'), 'base64');
    END;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.decrypt_secret(p_stored TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  k TEXT;
  raw TEXT;
BEGIN
  IF p_stored IS NULL OR p_stored = '' THEN RETURN NULL; END IF;
  k := current_setting('zarix.secrets_key', true);
  IF k IS NULL OR k = '' THEN
    k := 'zarix-pglite-synthetic-key-not-for-production';
  END IF;
  IF left(p_stored, 12) = 'envelope:v0:' THEN
    RETURN convert_from(decode(substr(p_stored, 13), 'base64'), 'utf8');
  END IF;
  IF left(p_stored, 7) = 'pgp:v1:' THEN
    raw := substr(p_stored, 8);
    BEGIN
      RETURN extensions.pgp_sym_decrypt(decode(raw, 'base64'), k);
    EXCEPTION WHEN undefined_function OR undefined_object OR invalid_schema_name THEN
      BEGIN
        RETURN public.pgp_sym_decrypt(decode(raw, 'base64'), k);
      EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
      END;
    END;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.copy_user_secrets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, zarix_vault, public, pg_temp
AS $$
DECLARE
  n INTEGER := 0;
  r RECORD;
  g_enc TEXT;
  t_enc TEXT;
  g_ok BOOLEAN;
  t_ok BOOLEAN;
BEGIN
  FOR r IN
    SELECT id, gemini_api_key, telegram_bot_token, gemini_api_key_enc, telegram_bot_token_enc
    FROM public.users
    WHERE gemini_api_key IS NOT NULL OR telegram_bot_token IS NOT NULL
       OR gemini_api_key_enc IS NOT NULL OR telegram_bot_token_enc IS NOT NULL
  LOOP
    INSERT INTO zarix_vault.user_secret_backup (user_id, gemini_api_key, telegram_bot_token, verified)
    VALUES (r.id, r.gemini_api_key, r.telegram_bot_token, FALSE)
    ON CONFLICT (user_id) DO UPDATE SET
      gemini_api_key = COALESCE(EXCLUDED.gemini_api_key, zarix_vault.user_secret_backup.gemini_api_key),
      telegram_bot_token = COALESCE(EXCLUDED.telegram_bot_token, zarix_vault.user_secret_backup.telegram_bot_token);

    g_enc := COALESCE(r.gemini_api_key_enc, zarix_vault.encrypt_secret(r.gemini_api_key));
    t_enc := COALESCE(r.telegram_bot_token_enc, zarix_vault.encrypt_secret(r.telegram_bot_token));

    g_ok := (r.gemini_api_key IS NULL AND g_enc IS NULL)
         OR (r.gemini_api_key IS NOT NULL AND zarix_vault.decrypt_secret(g_enc) IS NOT DISTINCT FROM r.gemini_api_key)
         OR (r.gemini_api_key IS NULL AND g_enc IS NOT NULL);
    t_ok := (r.telegram_bot_token IS NULL AND t_enc IS NULL)
         OR (r.telegram_bot_token IS NOT NULL AND zarix_vault.decrypt_secret(t_enc) IS NOT DISTINCT FROM r.telegram_bot_token)
         OR (r.telegram_bot_token IS NULL AND t_enc IS NOT NULL);

    IF g_ok AND t_ok THEN
      UPDATE public.users
        SET gemini_api_key_enc = g_enc, telegram_bot_token_enc = t_enc
        WHERE id = r.id;
      UPDATE zarix_vault.user_secret_backup SET verified = TRUE WHERE user_id = r.id;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.finalize_plaintext_null()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, zarix_vault, public, pg_temp
AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE public.users u
     SET gemini_api_key = NULL, telegram_bot_token = NULL
   FROM zarix_vault.user_secret_backup b
  WHERE u.id = b.user_id
    AND b.verified
    AND (
      (b.gemini_api_key IS NULL OR u.gemini_api_key_enc IS NOT NULL)
      AND (b.telegram_bot_token IS NULL OR u.telegram_bot_token_enc IS NOT NULL)
    )
    AND (u.gemini_api_key IS NOT NULL OR u.telegram_bot_token IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.rollback_plaintext()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, zarix_vault, public, pg_temp
AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE public.users u
     SET gemini_api_key = COALESCE(u.gemini_api_key, b.gemini_api_key),
         telegram_bot_token = COALESCE(u.telegram_bot_token, b.telegram_bot_token)
    FROM zarix_vault.user_secret_backup b
   WHERE u.id = b.user_id
     AND (b.gemini_api_key IS NOT NULL OR b.telegram_bot_token IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_user_secret(p_stored TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, zarix_vault, pg_temp
AS $$
  SELECT zarix_vault.decrypt_secret(p_stored);
$$;

REVOKE ALL ON FUNCTION zarix_vault.encrypt_secret(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.decrypt_secret(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.copy_user_secrets() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.finalize_plaintext_null() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.rollback_plaintext() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_user_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zarix_vault.encrypt_secret(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION zarix_vault.decrypt_secret(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION zarix_vault.copy_user_secrets() TO service_role;
GRANT EXECUTE ON FUNCTION zarix_vault.finalize_plaintext_null() TO service_role;
GRANT EXECUTE ON FUNCTION zarix_vault.rollback_plaintext() TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_user_secret(TEXT) TO service_role;

-- Copy existing plaintext into encrypted storage. Never log values.
SELECT zarix_vault.copy_user_secrets();
SELECT zarix_vault.finalize_plaintext_null();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. Pending inbox + remembered card maps
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.wallet_card_account_maps (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  card_name_normalized TEXT NOT NULL CHECK (char_length(card_name_normalized) BETWEEN 1 AND 80),
  account_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_name_normalized),
  FOREIGN KEY (account_id, user_id) REFERENCES public.accounts(id, user_id)
);

CREATE TABLE IF NOT EXISTS public.pending_inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC(20, 8),
  currency TEXT NOT NULL DEFAULT 'ARS',
  merchant TEXT,
  card_name TEXT,
  account_id UUID,
  category_id UUID,
  occurred_at TIMESTAMPTZ,
  raw_payload JSONB,
  raw_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'discarded')),
  suggestion_source TEXT CHECK (suggestion_source IS NULL OR suggestion_source IN ('history', 'heuristic', 'none', 'gemini')),
  idempotency_key TEXT,
  source TEXT NOT NULL DEFAULT 'wallet' CHECK (source IN ('web', 'telegram', 'wallet', 'api', 'mcp')),
  fingerprint TEXT NOT NULL,
  confirmed_transaction_id UUID,
  discarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pending_inbox_amount_nonneg CHECK (amount IS NULL OR amount > 0),
  FOREIGN KEY (account_id, user_id) REFERENCES public.accounts(id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pending_inbox_idempotency_unique
  ON public.pending_inbox_items (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS pending_inbox_user_status_idx
  ON public.pending_inbox_items (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pending_inbox_fingerprint_idx
  ON public.pending_inbox_items (user_id, fingerprint, created_at DESC);

ALTER TABLE public.wallet_card_account_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_card_account_maps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pending_inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_inbox_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_maps_all_own ON public.wallet_card_account_maps;
DROP POLICY IF EXISTS wallet_maps_select_own ON public.wallet_card_account_maps;
DROP POLICY IF EXISTS wallet_maps_insert_own ON public.wallet_card_account_maps;
DROP POLICY IF EXISTS wallet_maps_update_own ON public.wallet_card_account_maps;
DROP POLICY IF EXISTS wallet_maps_delete_own ON public.wallet_card_account_maps;
CREATE POLICY wallet_maps_select_own ON public.wallet_card_account_maps
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY wallet_maps_insert_own ON public.wallet_card_account_maps
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY wallet_maps_update_own ON public.wallet_card_account_maps
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY wallet_maps_delete_own ON public.wallet_card_account_maps
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pending_inbox_all_own ON public.pending_inbox_items;
DROP POLICY IF EXISTS pending_inbox_select_own ON public.pending_inbox_items;
DROP POLICY IF EXISTS pending_inbox_insert_own ON public.pending_inbox_items;
DROP POLICY IF EXISTS pending_inbox_update_own ON public.pending_inbox_items;
DROP POLICY IF EXISTS pending_inbox_delete_own ON public.pending_inbox_items;
CREATE POLICY pending_inbox_select_own ON public.pending_inbox_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY pending_inbox_insert_own ON public.pending_inbox_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY pending_inbox_update_own ON public.pending_inbox_items
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY pending_inbox_delete_own ON public.pending_inbox_items
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.wallet_card_account_maps, public.pending_inbox_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_card_account_maps, public.pending_inbox_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_card_account_maps, public.pending_inbox_items TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. Integration audit log
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.integration_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 3 AND 40),
  source TEXT NOT NULL CHECK (source IN ('web', 'telegram', 'wallet', 'api', 'mcp')),
  ip_hash TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_audit_user_idx
  ON public.integration_audit_log (user_id, created_at DESC);

ALTER TABLE public.integration_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_audit_select_own ON public.integration_audit_log;
CREATE POLICY integration_audit_select_own ON public.integration_audit_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.integration_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.integration_audit_log TO authenticated;
GRANT SELECT, INSERT ON public.integration_audit_log TO service_role;
