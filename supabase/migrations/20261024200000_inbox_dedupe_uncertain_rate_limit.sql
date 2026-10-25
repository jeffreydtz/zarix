-- Inbox event identity survives confirmation, uncertain confirm state,
-- shared rate-limit counters, installment write-channel, vault assert.
-- Idempotent. Additive. NEVER `supabase db push`.

-- Fail closed if Vault is missing at apply time. PGlite tests stub schema vault.
DO $$
BEGIN
  PERFORM zarix_vault.vault_available();
EXCEPTION
  WHEN undefined_function THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'zarix_vault.vault_available() must exist before this migration.';
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Uncertain inbox status + fingerprint reserved after confirm
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.pending_inbox_items
  DROP CONSTRAINT IF EXISTS pending_inbox_items_status_check;
ALTER TABLE public.pending_inbox_items
  ADD CONSTRAINT pending_inbox_items_status_check
  CHECK (status IN ('pending', 'confirming', 'confirmed', 'discarded', 'uncertain'));

DROP INDEX IF EXISTS pending_inbox_fingerprint_pending_unique;
CREATE UNIQUE INDEX IF NOT EXISTS pending_inbox_fingerprint_reserved_unique
  ON public.pending_inbox_items (user_id, fingerprint)
  WHERE status IN ('pending', 'confirming', 'confirmed', 'uncertain');

CREATE OR REPLACE FUNCTION public.claim_pending_inbox_item(
  p_user_id UUID,
  p_item_id UUID
) RETURNS SETOF public.pending_inbox_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':inbox:' || p_item_id::text, 0));
  RETURN QUERY
  UPDATE public.pending_inbox_items
     SET status = 'confirming',
         claim_id = gen_random_uuid(),
         updated_at = now()
   WHERE id = p_item_id
     AND user_id = p_user_id
     AND status IN ('pending', 'uncertain')
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_inbox_item(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_pending_inbox_item(UUID, UUID) TO authenticated, service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Shared atomic rate-limit counters (token + user)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key TEXT PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 200),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_counters TO service_role;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key TEXT,
  p_max INTEGER,
  p_window_ms INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  rec public.rate_limit_counters%ROWTYPE;
  now_ts TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_key IS NULL OR char_length(p_key) < 1 OR char_length(p_key) > 200 THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;
  IF p_max IS NULL OR p_max < 1 OR p_window_ms IS NULL OR p_window_ms < 1 THEN
    RAISE EXCEPTION 'Invalid rate-limit window';
  END IF;
  INSERT INTO public.rate_limit_counters AS c (key, count, window_start)
  VALUES (p_key, 1, now_ts)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
          WHEN c.window_start <= now_ts - ((p_window_ms::text || ' milliseconds')::interval)
            THEN 1
          ELSE c.count + 1
        END,
        window_start = CASE
          WHEN c.window_start <= now_ts - ((p_window_ms::text || ' milliseconds')::interval)
            THEN now_ts
          ELSE c.window_start
        END
  RETURNING * INTO rec;
  RETURN rec.count <= p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Installment writes keep the originating channel
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DROP FUNCTION IF EXISTS public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.create_installment_transactions(
  p_user_id UUID,
  p_account_id UUID,
  p_total_amount NUMERIC,
  p_currency TEXT,
  p_installments INTEGER,
  p_category_id UUID,
  p_description TEXT,
  p_start_date TIMESTAMPTZ DEFAULT NOW(),
  p_source TEXT DEFAULT 'web'
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  group_id UUID := extensions.uuid_generate_v4();
  base_amount NUMERIC;
  this_amount NUMERIC;
  installment_date TIMESTAMPTZ;
  i INTEGER;
  v_owner UUID;
  v_source TEXT := COALESCE(NULLIF(btrim(p_source), ''), 'web');
BEGIN
  IF p_installments < 2 OR p_installments > 36 THEN
    RAISE EXCEPTION 'Las cuotas tienen que ser entre 2 y 36.';
  END IF;
  IF v_source NOT IN ('web', 'telegram', 'wallet', 'api', 'mcp') THEN
    RAISE EXCEPTION 'Canal de escritura inválido';
  END IF;

  SELECT user_id INTO v_owner FROM accounts WHERE id = p_account_id;
  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RAISE EXCEPTION 'Cuenta no encontrada';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  base_amount := round(p_total_amount / p_installments, 2);

  FOR i IN 1..p_installments LOOP
    installment_date := p_start_date + (i - 1) * INTERVAL '1 month';
    this_amount := CASE WHEN i = p_installments
      THEN p_total_amount - base_amount * (p_installments - 1)
      ELSE base_amount
    END;

    INSERT INTO transactions (
      user_id, type, account_id, amount, currency, amount_in_account_currency,
      category_id, description, transaction_date,
      installment_number, installment_total, installment_group_id, source
    ) VALUES (
      p_user_id, 'expense', p_account_id, this_amount, p_currency, this_amount,
      p_category_id, p_description || ' (' || i || '/' || p_installments || ')',
      installment_date, i, p_installments, group_id, v_source
    );
  END LOOP;

  RETURN group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ, TEXT) TO service_role;

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
      t.amount, t.currency, p_installments, t.category_id, t.description,
      COALESCE(t.transaction_date, now()), COALESCE(t.source, 'web'));
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
