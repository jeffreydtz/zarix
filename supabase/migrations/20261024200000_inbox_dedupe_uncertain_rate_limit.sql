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

-- Preflight: historical confirmed duplicates would make the reserved unique
-- index fail with 23505. Keep the newest row's fingerprint; rewrite older
-- collisions to a unique legacy value so legitimate later purchases survive.
UPDATE public.pending_inbox_items AS p
   SET fingerprint = 'legacy-collision:' || p.id::text
 WHERE p.fingerprint IS NOT NULL
   AND p.status IN ('pending', 'confirming', 'confirmed', 'uncertain')
   AND p.id IN (
     SELECT id FROM (
       SELECT id,
              row_number() OVER (
                PARTITION BY user_id, fingerprint
                ORDER BY created_at DESC, id DESC
              ) AS rn
         FROM public.pending_inbox_items
        WHERE fingerprint IS NOT NULL
          AND status IN ('pending', 'confirming', 'confirmed', 'uncertain')
     ) ranked
     WHERE rn > 1
   );

CREATE UNIQUE INDEX IF NOT EXISTS pending_inbox_fingerprint_reserved_unique
  ON public.pending_inbox_items (user_id, fingerprint)
  WHERE status IN ('pending', 'confirming', 'confirmed', 'uncertain');

CREATE OR REPLACE FUNCTION public.claim_pending_inbox_item(
  p_user_id UUID,
  p_item_id UUID
) RETURNS SETOF public.pending_inbox_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':inbox:' || p_item_id::text, 0));
  RETURN QUERY
  UPDATE public.pending_inbox_items
     SET status = 'confirming',
         claim_id = pg_catalog.gen_random_uuid(),
         updated_at = pg_catalog.now()
   WHERE id = p_item_id
     AND user_id = p_user_id
     AND status IN ('pending', 'uncertain')
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_inbox_item(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_pending_inbox_item(UUID, UUID) TO authenticated, service_role;

-- Atomic discard: never confirming. Shared lock order with create_transaction_once
-- (inbox key, then wallet:{item} request key) so a late ledger write cannot land
-- after discard. DEFINER so the receipt lookup can read transaction_requests.
-- Authenticated callers need a non-null auth.uid() matching p_user_id;
-- service_role may call with a null uid. Lookup errors abort (no silent "no tx").
CREATE OR REPLACE FUNCTION public.discard_pending_inbox_item(
  p_user_id UUID,
  p_item_id UUID
) RETURNS SETOF public.pending_inbox_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  rec public.pending_inbox_items%ROWTYPE;
  prior_id TEXT;
  caller_role TEXT := coalesce(auth.role(), '');
BEGIN
  IF p_user_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF caller_role IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  -- Shared with create_transaction_once: inbox then request (deadlock-safe).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':inbox:' || p_item_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':wallet:' || p_item_id::text, 0));
  SELECT * INTO rec
    FROM public.pending_inbox_items
   WHERE id = p_item_id AND user_id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pendiente no encontrado.';
  END IF;
  IF rec.status = 'confirmed' THEN
    RAISE EXCEPTION 'Este pendiente ya fue confirmado.';
  END IF;
  IF rec.status = 'discarded' THEN
    RAISE EXCEPTION 'Este pendiente ya fue descartado.';
  END IF;
  IF rec.status = 'confirming' THEN
    RAISE EXCEPTION 'Este pendiente se está confirmando.';
  END IF;
  IF rec.status NOT IN ('pending', 'uncertain') THEN
    RAISE EXCEPTION 'Este pendiente se está confirmando.';
  END IF;
  SELECT response->>'id' INTO prior_id
    FROM public.transaction_requests
   WHERE user_id = p_user_id
     AND request_id = 'wallet:' || p_item_id::text;
  IF prior_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este pendiente ya tiene un movimiento. No se puede descartar.';
  END IF;
  UPDATE public.pending_inbox_items
     SET status = 'discarded',
         discarded_at = pg_catalog.now(),
         claim_id = NULL,
         updated_at = pg_catalog.now()
   WHERE id = p_item_id
     AND user_id = p_user_id
     AND status = rec.status
  RETURNING * INTO rec;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este pendiente se está confirmando.';
  END IF;
  RETURN NEXT rec;
END;
$$;

REVOKE ALL ON FUNCTION public.discard_pending_inbox_item(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_pending_inbox_item(UUID, UUID) TO authenticated, service_role;

-- Lookup + insert under one advisory lock so a retry that crosses the 15-minute
-- fingerprint bucket cannot insert a second pending item. Lookback is rolling
-- created_at >= now()-p_lookback_ms so genuine purchases more than 15 minutes
-- apart still land as separate rows.
CREATE OR REPLACE FUNCTION public.reserve_pending_inbox_item(
  p_user_id UUID,
  p_lock_key TEXT,
  p_fingerprints TEXT[],
  p_lookback_ms INTEGER,
  p_ingest_key TEXT,
  p_client_keyed BOOLEAN,
  p_fingerprint TEXT,
  p_row JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  rec public.pending_inbox_items%ROWTYPE;
  lookback INTERVAL;
BEGIN
  IF p_user_id IS NULL OR p_lock_key IS NULL OR length(p_lock_key) < 8
     OR p_fingerprint IS NULL OR p_ingest_key IS NULL OR p_row IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':inbox-dedupe:' || p_lock_key, 0));

  IF COALESCE(p_client_keyed, false) THEN
    SELECT * INTO rec
      FROM public.pending_inbox_items
     WHERE user_id = p_user_id AND ingest_key = p_ingest_key;
    IF FOUND THEN
      IF rec.fingerprint IS NOT NULL AND rec.fingerprint IS DISTINCT FROM p_fingerprint THEN
        RAISE EXCEPTION 'Esa Idempotency-Key ya se usó con otro cuerpo.';
      END IF;
      RETURN jsonb_build_object('item', to_jsonb(rec), 'duplicate', true);
    END IF;
  ELSE
    lookback := make_interval(secs => GREATEST(COALESCE(p_lookback_ms, 900000), 0) / 1000.0);
    SELECT * INTO rec
      FROM public.pending_inbox_items
     WHERE user_id = p_user_id
       AND fingerprint = ANY(COALESCE(p_fingerprints, ARRAY[]::text[]))
       AND status IN ('pending', 'confirming', 'confirmed', 'uncertain')
       AND created_at >= now() - lookback
     ORDER BY created_at DESC, id DESC
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('item', to_jsonb(rec), 'duplicate', true);
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.pending_inbox_items (
      user_id, amount, currency, merchant, card_name, account_id, category_id,
      occurred_at, raw_payload, raw_text, status, suggestion_source,
      idempotency_key, ingest_key, direction, amount_ambiguous, source, fingerprint
    ) VALUES (
      p_user_id,
      NULLIF(p_row->>'amount', '')::numeric,
      COALESCE(NULLIF(p_row->>'currency', ''), 'ARS'),
      NULLIF(p_row->>'merchant', ''),
      NULLIF(p_row->>'card_name', ''),
      NULLIF(p_row->>'account_id', '')::uuid,
      NULLIF(p_row->>'category_id', '')::uuid,
      NULLIF(p_row->>'occurred_at', '')::timestamptz,
      CASE WHEN p_row ? 'raw_payload' AND jsonb_typeof(p_row->'raw_payload') <> 'null'
           THEN p_row->'raw_payload' ELSE NULL END,
      NULLIF(p_row->>'raw_text', ''),
      COALESCE(NULLIF(p_row->>'status', ''), 'pending'),
      NULLIF(p_row->>'suggestion_source', ''),
      NULLIF(p_row->>'idempotency_key', ''),
      COALESCE(NULLIF(p_row->>'ingest_key', ''), p_ingest_key),
      COALESCE(NULLIF(p_row->>'direction', ''), 'expense'),
      COALESCE((p_row->>'amount_ambiguous')::boolean, false),
      COALESCE(NULLIF(p_row->>'source', ''), 'wallet'),
      p_fingerprint
    )
    RETURNING * INTO rec;
    RETURN jsonb_build_object('item', to_jsonb(rec), 'duplicate', false);
  EXCEPTION WHEN unique_violation THEN
    IF COALESCE(p_client_keyed, false) THEN
      SELECT * INTO rec
        FROM public.pending_inbox_items
       WHERE user_id = p_user_id AND ingest_key = p_ingest_key;
      IF FOUND THEN
        IF rec.fingerprint IS NOT NULL AND rec.fingerprint IS DISTINCT FROM p_fingerprint THEN
          RAISE EXCEPTION 'Esa Idempotency-Key ya se usó con otro cuerpo.';
        END IF;
        RETURN jsonb_build_object('item', to_jsonb(rec), 'duplicate', true);
      END IF;
    END IF;
    SELECT * INTO rec
      FROM public.pending_inbox_items
     WHERE user_id = p_user_id
       AND (
         fingerprint = p_fingerprint
         OR fingerprint = ANY(COALESCE(p_fingerprints, ARRAY[]::text[]))
       )
       AND status IN ('pending', 'confirming', 'confirmed', 'uncertain')
     ORDER BY created_at DESC, id DESC
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('item', to_jsonb(rec), 'duplicate', true);
    END IF;
    RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_pending_inbox_item(UUID, TEXT, TEXT[], INTEGER, TEXT, BOOLEAN, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_pending_inbox_item(UUID, TEXT, TEXT[], INTEGER, TEXT, BOOLEAN, TEXT, JSONB)
  TO service_role;

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

CREATE INDEX IF NOT EXISTS rate_limit_counters_window_start_idx
  ON public.rate_limit_counters (window_start);

CREATE OR REPLACE FUNCTION public.purge_rate_limit_counters(
  p_older_than INTERVAL DEFAULT INTERVAL '2 hours'
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  deleted INTEGER := 0;
BEGIN
  DELETE FROM public.rate_limit_counters
   WHERE window_start < clock_timestamp() - p_older_than;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_rate_limit_counters(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_rate_limit_counters(INTERVAL) TO service_role;

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
  v_inbox_item UUID;
  v_inbox_status TEXT;
BEGIN
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
     OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid request identifier or fingerprint';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  -- Wallet inbox writes share discard's lock order: inbox key, then request key.
  -- Canonicalize wallet:{uuid} (hyphenated or 32-hex, any case) so lock, receipt
  -- and discarded check share one identity. JS still rejects dashless at entry.
  IF p_request_id ~* '^wallet:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$' THEN
    v_inbox_item := substring(p_request_id from 8)::uuid;
    p_request_id := 'wallet:' || v_inbox_item::text;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':inbox:' || v_inbox_item::text, 0));
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
  IF v_inbox_item IS NOT NULL THEN
    SELECT status INTO v_inbox_status
      FROM public.pending_inbox_items
     WHERE id = v_inbox_item AND user_id = p_user_id
     FOR UPDATE;
    IF FOUND AND v_inbox_status = 'discarded' THEN
      RAISE EXCEPTION 'Este pendiente fue descartado.';
    END IF;
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
