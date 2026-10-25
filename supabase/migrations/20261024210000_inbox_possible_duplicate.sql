-- Silent duplicate is Idempotency-Key replay only. Anonymous (no key, including
-- date-only) always inserts; a 15-minute match is flagged possible_duplicate_of.
-- Forward-only and re-runnable. NEVER `supabase db push`.
-- Fail closed if Vault is missing at apply time. PGlite tests stub schema vault.

DO $$
BEGIN
  PERFORM zarix_vault.vault_available();
EXCEPTION
  WHEN undefined_function THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'zarix_vault.vault_available() must exist before this migration.';
END $$;

-- Drop the anonymous fingerprint unique indexes. Keyed uniqueness stays on
-- (user_id, idempotency_key) and (user_id, ingest_key).
DROP INDEX IF EXISTS public.pending_inbox_fingerprint_reserved_unique;
DROP INDEX IF EXISTS public.pending_inbox_fingerprint_pending_unique;

ALTER TABLE public.pending_inbox_items
  ADD COLUMN IF NOT EXISTS possible_duplicate_of UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'pending_inbox_possible_duplicate_fk'
       AND conrelid = 'public.pending_inbox_items'::regclass
  ) THEN
    ALTER TABLE public.pending_inbox_items
      ADD CONSTRAINT pending_inbox_possible_duplicate_fk
      FOREIGN KEY (possible_duplicate_of)
      REFERENCES public.pending_inbox_items(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pending_inbox_possible_duplicate_idx
  ON public.pending_inbox_items (user_id, possible_duplicate_of)
  WHERE possible_duplicate_of IS NOT NULL;

-- Canonical tool_payload for keyed replay vs 409. Null stored vs incoming is a mismatch.
CREATE OR REPLACE FUNCTION public.inbox_canonical_tool_payload(p JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) = 'null' THEN NULL
    ELSE jsonb_build_object(
      'type', p->>'type',
      'amount', p->'amount',
      'currency', p->>'currency',
      'description', p->>'description',
      'account', p->>'account',
      'accountId', p->>'accountId',
      'category', p->>'category',
      'categoryId', p->>'categoryId',
      'destinationAccount', p->>'destinationAccount',
      'destinationAccountId', p->>'destinationAccountId',
      'transactionDate', COALESCE(p->>'transactionDate', p->>'date'),
      'installments', p->'installments'
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.inbox_canonical_tool_payload(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inbox_canonical_tool_payload(JSONB) TO service_role;

-- Replace the fingerprint-window reserve. Old 8-arg signature must go first.
DROP FUNCTION IF EXISTS public.reserve_pending_inbox_item(UUID, TEXT, TEXT[], INTEGER, TEXT, BOOLEAN, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.reserve_pending_inbox_item(
  p_user_id UUID,
  p_lock_key TEXT,
  p_ingest_key TEXT,
  p_client_keyed BOOLEAN,
  p_lookback_ms INTEGER,
  p_row JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  rec public.pending_inbox_items%ROWTYPE;
  match_id UUID;
  lookback INTERVAL;
  incoming_amount NUMERIC;
  incoming_currency TEXT;
  incoming_direction TEXT;
  incoming_merchant TEXT;
  incoming_account UUID;
  incoming_source TEXT;
  incoming_payload JSONB;
BEGIN
  IF p_user_id IS NULL OR p_lock_key IS NULL OR length(p_lock_key) < 8
     OR p_ingest_key IS NULL OR p_row IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':inbox-dedupe:' || p_lock_key, 0));

  incoming_amount := NULLIF(p_row->>'amount', '')::numeric;
  incoming_currency := COALESCE(NULLIF(p_row->>'currency', ''), 'ARS');
  incoming_direction := COALESCE(NULLIF(p_row->>'direction', ''), 'expense');
  incoming_merchant := COALESCE(NULLIF(p_row->>'merchant', ''), '');
  incoming_account := NULLIF(p_row->>'account_id', '')::uuid;
  incoming_source := COALESCE(NULLIF(p_row->>'source', ''), 'wallet');
  incoming_payload := public.inbox_canonical_tool_payload(
    CASE WHEN p_row ? 'tool_payload' AND jsonb_typeof(p_row->'tool_payload') <> 'null'
         THEN p_row->'tool_payload' ELSE NULL END);

  IF COALESCE(p_client_keyed, false) THEN
    SELECT * INTO rec
      FROM public.pending_inbox_items
     WHERE user_id = p_user_id AND ingest_key = p_ingest_key;
    IF NOT FOUND THEN
      SELECT * INTO rec
        FROM public.pending_inbox_items
       WHERE user_id = p_user_id AND idempotency_key = p_ingest_key;
    END IF;
    IF FOUND THEN
      IF rec.source IS DISTINCT FROM incoming_source
         OR rec.amount IS DISTINCT FROM incoming_amount
         OR rec.currency IS DISTINCT FROM incoming_currency
         OR rec.direction IS DISTINCT FROM incoming_direction
         OR lower(coalesce(rec.merchant, '')) IS DISTINCT FROM lower(incoming_merchant)
         OR rec.account_id IS DISTINCT FROM incoming_account
         OR public.inbox_canonical_tool_payload(rec.tool_payload) IS DISTINCT FROM incoming_payload THEN
        RAISE EXCEPTION 'Esa Idempotency-Key ya se usó con otro cuerpo.';
      END IF;
      RETURN jsonb_build_object('item', to_jsonb(rec), 'duplicate', true);
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.pending_inbox_items (
      user_id, amount, currency, merchant, card_name, account_id, category_id,
      occurred_at, raw_payload, raw_text, status, suggestion_source,
      idempotency_key, ingest_key, direction, amount_ambiguous, source, fingerprint,
      tool_payload
    ) VALUES (
      p_user_id,
      incoming_amount,
      incoming_currency,
      NULLIF(incoming_merchant, ''),
      NULLIF(p_row->>'card_name', ''),
      incoming_account,
      NULLIF(p_row->>'category_id', '')::uuid,
      NULLIF(p_row->>'occurred_at', '')::timestamptz,
      CASE WHEN p_row ? 'raw_payload' AND jsonb_typeof(p_row->'raw_payload') <> 'null'
           THEN p_row->'raw_payload' ELSE NULL END,
      NULLIF(p_row->>'raw_text', ''),
      COALESCE(NULLIF(p_row->>'status', ''), 'pending'),
      NULLIF(p_row->>'suggestion_source', ''),
      CASE WHEN COALESCE(p_client_keyed, false) THEN NULLIF(p_row->>'idempotency_key', '') ELSE NULL END,
      COALESCE(NULLIF(p_row->>'ingest_key', ''), p_ingest_key),
      incoming_direction,
      COALESCE((p_row->>'amount_ambiguous')::boolean, false),
      incoming_source,
      COALESCE(NULLIF(p_row->>'fingerprint', ''), p_ingest_key),
      CASE WHEN p_row ? 'tool_payload' AND jsonb_typeof(p_row->'tool_payload') <> 'null'
           THEN p_row->'tool_payload' ELSE NULL END
    )
    RETURNING * INTO rec;
  EXCEPTION WHEN unique_violation THEN
    IF COALESCE(p_client_keyed, false) THEN
      SELECT * INTO rec
        FROM public.pending_inbox_items
       WHERE user_id = p_user_id AND ingest_key = p_ingest_key;
      IF NOT FOUND THEN
        SELECT * INTO rec
          FROM public.pending_inbox_items
         WHERE user_id = p_user_id AND idempotency_key = p_ingest_key;
      END IF;
      IF FOUND THEN
        IF rec.source IS DISTINCT FROM incoming_source
           OR rec.amount IS DISTINCT FROM incoming_amount
           OR rec.currency IS DISTINCT FROM incoming_currency
           OR rec.direction IS DISTINCT FROM incoming_direction
           OR lower(coalesce(rec.merchant, '')) IS DISTINCT FROM lower(incoming_merchant)
           OR rec.account_id IS DISTINCT FROM incoming_account
           OR public.inbox_canonical_tool_payload(rec.tool_payload) IS DISTINCT FROM incoming_payload THEN
          RAISE EXCEPTION 'Esa Idempotency-Key ya se usó con otro cuerpo.';
        END IF;
        RETURN jsonb_build_object('item', to_jsonb(rec), 'duplicate', true);
      END IF;
    END IF;
    RAISE;
  END;

  -- Anonymous: never duplicate:true. Flag a rolling 15-minute match instead.
  IF NOT COALESCE(p_client_keyed, false) THEN
    lookback := make_interval(secs => GREATEST(COALESCE(p_lookback_ms, 900000), 0) / 1000.0);
    SELECT id INTO match_id
      FROM public.pending_inbox_items
     WHERE user_id = p_user_id
       AND id <> rec.id
       AND amount IS NOT DISTINCT FROM incoming_amount
       AND currency = incoming_currency
       AND direction = incoming_direction
       AND (
         (incoming_account IS NOT NULL AND account_id IS NOT DISTINCT FROM incoming_account)
         OR (incoming_merchant <> '' AND lower(coalesce(merchant, '')) = lower(incoming_merchant))
       )
       AND status IN ('pending', 'confirming', 'confirmed', 'uncertain')
       AND created_at >= now() - lookback
     ORDER BY created_at ASC, id ASC
     LIMIT 1;
    IF match_id IS NOT NULL THEN
      UPDATE public.pending_inbox_items
         SET possible_duplicate_of = match_id,
             updated_at = now()
       WHERE id = rec.id
         AND user_id = p_user_id
      RETURNING * INTO rec;
    END IF;
  END IF;

  RETURN jsonb_build_object('item', to_jsonb(rec), 'duplicate', false);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_pending_inbox_item(UUID, TEXT, TEXT, BOOLEAN, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_pending_inbox_item(UUID, TEXT, TEXT, BOOLEAN, INTEGER, JSONB)
  TO service_role;
