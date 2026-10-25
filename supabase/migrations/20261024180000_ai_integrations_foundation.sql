-- AI-first public integrations: write channel, PATs, encrypted secrets,
-- pending inbox, card maps, audit log. Idempotent. Additive for secrets:
-- plaintext columns are NOT copied or nulled here (staged rollout).
--
-- Prod apply order (do not skip). NEVER `supabase db push`.
-- Prod migration history recorded #15 as 20261024182913 (investment_type_on)
-- and 20261024182923 (investment_backlog), not the filenames 20261024170000 /
-- 170100. `db push` would try to re-apply those files. Apply #16 one file at
-- a time with `apply_migration` (version = the filename timestamp).
--
--   1. PITR marker
--   2. apply_migration 20261024180000_ai_integrations_foundation.sql
--   3. apply_migration 20261024190000_pat_rls_confirm_quotes.sql
--   4. apply_migration 20261024200000_inbox_dedupe_uncertain_rate_limit.sql
--   5. Deploy #16 code (encrypt-only writes; Vault-aware Telegram readers)
--   6. Pause key edits, run supabase/manual/backfill-user-secrets.sql
--   7. Run supabase/manual/20261025120000_revoke_plaintext_secret_updates.sql
--      (not a timestamped migration — db push cannot apply it early)
--   8. Later follow-up: supabase/manual/null-plaintext-user-secrets.sql
--
-- Rollback to main (dpl_9Dq25… / 7651817): keys saved after step 5 have
-- plaintext NULLed. Before rolling the app back, run
-- supabase/manual/restore-plaintext-from-vault.sql so main can still read
-- Gemini/Telegram secrets. Do not roll back until that restore verifies.
-- PAT hashes are SHA-256 (hash_version=1). v2 is reserved and not enabled.

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
  hash_version SMALLINT NOT NULL DEFAULT 1 CHECK (hash_version IN (1, 2)),
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT personal_access_tokens_scopes_check CHECK (
    scopes <@ ARRAY['read','write','ingest','write:confirm']::TEXT[]
    AND array_length(scopes, 1) >= 1
  )
);

ALTER TABLE public.personal_access_tokens
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.personal_access_tokens
  ADD COLUMN IF NOT EXISTS hash_version SMALLINT;
UPDATE public.personal_access_tokens SET hash_version = 1 WHERE hash_version IS NULL;
ALTER TABLE public.personal_access_tokens ALTER COLUMN hash_version SET DEFAULT 1;
ALTER TABLE public.personal_access_tokens ALTER COLUMN hash_version SET NOT NULL;
ALTER TABLE public.personal_access_tokens DROP CONSTRAINT IF EXISTS personal_access_tokens_hash_version_check;
ALTER TABLE public.personal_access_tokens ADD CONSTRAINT personal_access_tokens_hash_version_check
  CHECK (hash_version IN (1, 2));
ALTER TABLE public.personal_access_tokens DROP CONSTRAINT IF EXISTS personal_access_tokens_scopes_check;
ALTER TABLE public.personal_access_tokens ADD CONSTRAINT personal_access_tokens_scopes_check CHECK (
  scopes <@ ARRAY['read','write','ingest','write:confirm']::TEXT[]
  AND array_length(scopes, 1) >= 1
);
UPDATE public.personal_access_tokens
  SET expires_at = created_at + interval '365 days'
  WHERE expires_at IS NULL;
ALTER TABLE public.personal_access_tokens
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '365 days');
ALTER TABLE public.personal_access_tokens ALTER COLUMN expires_at SET NOT NULL;

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
GRANT SELECT (id, user_id, name, token_prefix, scopes, expires_at, last_used_at, revoked_at, created_at, updated_at)
  ON public.personal_access_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_access_tokens TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Encrypted user secrets (Supabase Vault; fail closed)
-- Additive only. Plaintext columns stay until later manual migrations:
--   supabase/manual/backfill-user-secrets.sql  (copy+verify, never nulls)
--   supabase/manual/null-plaintext-user-secrets.sql (null only after verify)
-- Those must run AFTER encrypted writes are live. They are not applied here.
-- Recovery if a preview DB applied old commit 925b46c (user_secret_backup +
-- public.decrypt_user_secret / envelope:v0): this migration DROPs that backup
-- table and the public decrypt function. Prod never ran 925b46c. Do not copy
-- leftover envelope ciphertext forward; re-save secrets so _enc is vault/AES.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gemini_api_key_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_bot_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS wallet_auto_confirm BOOLEAN NOT NULL DEFAULT FALSE;

GRANT SELECT (wallet_auto_confirm), UPDATE (wallet_auto_confirm)
  ON public.users TO authenticated;
-- Do NOT REVOKE UPDATE on plaintext secret columns here. Old code (main)
-- still writes gemini_api_key / telegram_bot_token as authenticated.
-- Apply supabase/manual/20261025120000_revoke_plaintext_secret_updates.sql
-- AFTER the #16 code deploy. It is not a timestamped migration so db push
-- cannot apply it early. See that file for the numbered runbook.

CREATE SCHEMA IF NOT EXISTS zarix_vault;
REVOKE ALL ON SCHEMA zarix_vault FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA zarix_vault TO service_role;

DROP TABLE IF EXISTS zarix_vault.user_secret_backup;
DROP FUNCTION IF EXISTS public.decrypt_user_secret(TEXT);
DROP FUNCTION IF EXISTS zarix_vault.encrypt_secret(TEXT);
DROP FUNCTION IF EXISTS zarix_vault.decrypt_secret(TEXT);
DROP FUNCTION IF EXISTS zarix_vault.copy_user_secrets();
DROP FUNCTION IF EXISTS zarix_vault.finalize_plaintext_null();
DROP FUNCTION IF EXISTS zarix_vault.rollback_plaintext();

CREATE OR REPLACE FUNCTION zarix_vault.assert_kind(p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('gemini_api_key', 'telegram_bot_token') THEN
    RAISE EXCEPTION 'zarix_vault_invalid_kind';
  END IF;
  RETURN p_kind;
END;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.secret_name(p_user_id UUID, p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'zarix.user.' || zarix_vault.assert_kind(p_kind) || '.' || p_user_id::text;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.vault_available()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'vault') THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'Supabase Vault (schema vault) is required. pgcrypto/envelope is not a fallback.';
  END IF;
  RETURN TRUE;
END;
$$;

-- Fail closed: never envelope, never a repo-hardcoded key, never pgcrypto
-- with a published passphrase. Production uses supabase_vault.
CREATE OR REPLACE FUNCTION zarix_vault.store_user_secret(p_user_id UUID, p_kind TEXT, p_plain TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  secret_name TEXT;
  secret_id TEXT;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'zarix_vault_invalid_user'; END IF;
  IF p_plain IS NULL OR p_plain = '' THEN
    RETURN zarix_vault.delete_user_secret(p_user_id, p_kind);
  END IF;
  IF NOT zarix_vault.vault_available() THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'Supabase Vault (schema vault) is required in production. Tests may use app AES-GCM with ZARIX_SECRETS_MASTER_KEY.';
  END IF;
  secret_name := zarix_vault.secret_name(p_user_id, p_kind);
  BEGIN
    EXECUTE 'SELECT id::text FROM vault.secrets WHERE name = $1' INTO secret_id USING secret_name;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE EXCEPTION 'zarix_vault_unavailable';
  END;
  IF secret_id IS NOT NULL THEN
    EXECUTE 'SELECT vault.update_secret($1::uuid, $2, $3, $4)' USING secret_id::uuid, p_plain, secret_name, 'zarix user secret';
    RETURN 'vault:v1:' || secret_id;
  END IF;
  EXECUTE 'SELECT vault.create_secret($1, $2, $3)::text' INTO secret_id USING p_plain, secret_name, 'zarix user secret';
  IF secret_id IS NULL OR secret_id = '' THEN
    RAISE EXCEPTION 'zarix_vault_store_failed';
  END IF;
  RETURN 'vault:v1:' || secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.read_user_secret(p_user_id UUID, p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  secret_name TEXT;
  val TEXT;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'zarix_vault_invalid_user'; END IF;
  IF NOT zarix_vault.vault_available() THEN
    RAISE EXCEPTION 'zarix_vault_unavailable';
  END IF;
  secret_name := zarix_vault.secret_name(p_user_id, p_kind);
  BEGIN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO val USING secret_name;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE EXCEPTION 'zarix_vault_unavailable';
  END;
  RETURN val;
END;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.delete_user_secret(p_user_id UUID, p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  secret_name TEXT;
  secret_id UUID;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'zarix_vault_invalid_user'; END IF;
  PERFORM zarix_vault.vault_available();
  secret_name := zarix_vault.secret_name(p_user_id, p_kind);
  BEGIN
    EXECUTE 'SELECT id FROM vault.secrets WHERE name = $1' INTO secret_id USING secret_name;
    IF secret_id IS NOT NULL THEN
      EXECUTE 'DELETE FROM vault.secrets WHERE id = $1' USING secret_id;
    END IF;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE EXCEPTION 'zarix_vault_unavailable';
  END;
  RETURN NULL;
END;
$$;

-- PostgREST trampolines: implementation lives in zarix_vault. EXECUTE is
-- revoked from anon/authenticated. There is no public.decrypt_user_secret.
CREATE OR REPLACE FUNCTION public.zarix_vault_store(p_user_id UUID, p_kind TEXT, p_plain TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, zarix_vault, pg_temp
AS $$
  SELECT zarix_vault.store_user_secret(p_user_id, p_kind, p_plain);
$$;

CREATE OR REPLACE FUNCTION public.zarix_vault_read(p_user_id UUID, p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, zarix_vault, pg_temp
AS $$
  SELECT zarix_vault.read_user_secret(p_user_id, p_kind);
$$;

REVOKE ALL ON FUNCTION zarix_vault.assert_kind(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.secret_name(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.vault_available() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.store_user_secret(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.read_user_secret(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.delete_user_secret(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zarix_vault_store(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zarix_vault_read(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zarix_vault.vault_available() TO service_role;
GRANT EXECUTE ON FUNCTION zarix_vault.store_user_secret(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION zarix_vault.read_user_secret(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION zarix_vault.delete_user_secret(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.zarix_vault_store(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.zarix_vault_read(UUID, TEXT) TO service_role;

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
  tool_payload JSONB,
  raw_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'discarded')),
  suggestion_source TEXT CHECK (suggestion_source IS NULL OR suggestion_source IN ('history', 'heuristic', 'none', 'gemini')),
  idempotency_key TEXT,
  ingest_key TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  direction TEXT NOT NULL DEFAULT 'expense' CHECK (direction IN ('expense', 'income')),
  amount_ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'wallet' CHECK (source IN ('web', 'telegram', 'wallet', 'api', 'mcp')),
  fingerprint TEXT NOT NULL,
  confirmed_transaction_id UUID,
  discarded_at TIMESTAMPTZ,
  claim_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pending_inbox_amount_nonneg CHECK (amount IS NULL OR amount > 0),
  FOREIGN KEY (account_id, user_id) REFERENCES public.accounts(id, user_id)
);

ALTER TABLE public.pending_inbox_items ADD COLUMN IF NOT EXISTS ingest_key TEXT;
ALTER TABLE public.pending_inbox_items ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE public.pending_inbox_items ADD COLUMN IF NOT EXISTS amount_ambiguous BOOLEAN;
ALTER TABLE public.pending_inbox_items ADD COLUMN IF NOT EXISTS tool_payload JSONB;
ALTER TABLE public.pending_inbox_items ADD COLUMN IF NOT EXISTS claim_id UUID;
UPDATE public.pending_inbox_items
   SET ingest_key = COALESCE(NULLIF(ingest_key, ''), idempotency_key, id::text)
 WHERE ingest_key IS NULL OR ingest_key = '';
UPDATE public.pending_inbox_items SET direction = 'expense' WHERE direction IS NULL;
UPDATE public.pending_inbox_items SET amount_ambiguous = FALSE WHERE amount_ambiguous IS NULL;
ALTER TABLE public.pending_inbox_items ALTER COLUMN ingest_key SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public.pending_inbox_items ALTER COLUMN ingest_key SET NOT NULL;
ALTER TABLE public.pending_inbox_items ALTER COLUMN direction SET DEFAULT 'expense';
ALTER TABLE public.pending_inbox_items ALTER COLUMN direction SET NOT NULL;
ALTER TABLE public.pending_inbox_items ALTER COLUMN amount_ambiguous SET DEFAULT FALSE;
ALTER TABLE public.pending_inbox_items ALTER COLUMN amount_ambiguous SET NOT NULL;
ALTER TABLE public.pending_inbox_items DROP CONSTRAINT IF EXISTS pending_inbox_direction_check;
ALTER TABLE public.pending_inbox_items ADD CONSTRAINT pending_inbox_direction_check
  CHECK (direction IN ('expense', 'income'));

CREATE UNIQUE INDEX IF NOT EXISTS pending_inbox_idempotency_unique
  ON public.pending_inbox_items (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pending_inbox_ingest_key_unique
  ON public.pending_inbox_items (user_id, ingest_key);
CREATE UNIQUE INDEX IF NOT EXISTS pending_inbox_fingerprint_pending_unique
  ON public.pending_inbox_items (user_id, fingerprint)
  WHERE status IN ('pending', 'confirming');
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
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integration_audit_outcome_check CHECK (
    outcome IS NULL OR outcome IN ('ok', 'error', 'thrown', 'denied')
  )
);
ALTER TABLE public.integration_audit_log ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE public.integration_audit_log DROP CONSTRAINT IF EXISTS integration_audit_outcome_check;
ALTER TABLE public.integration_audit_log ADD CONSTRAINT integration_audit_outcome_check CHECK (
  outcome IS NULL OR outcome IN ('ok', 'error', 'thrown', 'denied')
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
