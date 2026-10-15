-- Financial effect, reply receipt and recurring notification commit together.
-- These APIs are server-only; caller identity always comes from verified auth.
CREATE TABLE public.transaction_requests (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  request_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.transaction_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transaction_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.transaction_requests TO service_role;
-- Deliberately no TTL: deleting a receipt would allow a delayed replay to debit again.

CREATE FUNCTION public.create_transaction_once(
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
  -- Transaction-scoped lock arbitrates simultaneous retries, including first insert.
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
      exchange_rate, category_id, description, notes, tags, transaction_date, is_recurring, recurring_rule_id)
    VALUES (p_user_id, t.type, t.account_id, t.destination_account_id, t.amount, t.currency,
      t.amount_in_account_currency, t.destination_amount_in_account_currency, t.exchange_rate,
      t.category_id, t.description, t.notes, t.tags, COALESCE(t.transaction_date, now()),
      COALESCE(t.is_recurring, false), t.recurring_rule_id)
    RETURNING to_jsonb(transactions.*) INTO result;
  END IF;
  INSERT INTO public.transaction_requests (user_id, request_id, request_hash, response)
    VALUES (p_user_id, p_request_id, p_request_hash, result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_transaction_once(UUID, TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_transaction_once(UUID, TEXT, TEXT, JSONB, INTEGER) TO service_role;

CREATE TABLE public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);
CREATE INDEX notification_outbox_pending ON public.notification_outbox (available_at, created_at)
  WHERE delivered_at IS NULL;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_outbox TO service_role;

CREATE FUNCTION public.enqueue_recurring_notification() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  rule public.recurring_rules%ROWTYPE;
  occurrence DATE;
BEGIN
  IF NEW.recurring_rule_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO rule FROM public.recurring_rules
    WHERE id = NEW.recurring_rule_id AND user_id = NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Regla recurrente no encontrada'; END IF;
  occurrence := timezone('America/Argentina/Buenos_Aires', NEW.transaction_date)::date;
  UPDATE public.recurring_rules SET last_executed_date = occurrence
    WHERE id = rule.id AND user_id = NEW.user_id
      AND (last_executed_date IS NULL OR last_executed_date < occurrence);
  IF rule.notification_enabled THEN
    INSERT INTO public.notification_outbox (user_id, event_key, payload)
    VALUES (NEW.user_id, 'recurring:' || rule.id || ':' || occurrence,
      jsonb_build_object('kind', 'recurring', 'transactionId', NEW.id,
        'type', NEW.type, 'description', NEW.description, 'amount', NEW.amount,
        'currency', NEW.currency, 'frequency', rule.frequency))
    ON CONFLICT (user_id, event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_recurring_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_recurring_notification() TO service_role;
CREATE TRIGGER transaction_recurring_outbox AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_recurring_notification();

CREATE FUNCTION public.claim_notification_outbox(p_limit INTEGER DEFAULT 20)
RETURNS SETOF public.notification_outbox LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    WITH candidates AS (
      SELECT id FROM public.notification_outbox
      WHERE delivered_at IS NULL AND available_at <= now()
        AND (lease_until IS NULL OR lease_until <= now())
      ORDER BY available_at, created_at
      FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit, 1), 100)
    )
    UPDATE public.notification_outbox o
    SET lease_token = gen_random_uuid(), lease_until = now() + interval '5 minutes',
        attempts = attempts + 1
    FROM candidates c WHERE o.id = c.id RETURNING o.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_notification_outbox(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox(INTEGER) TO service_role;

-- Release only claims that this worker never started, in one bounded DB request.
CREATE FUNCTION public.release_notification_outbox(p_claims JSONB)
RETURNS VOID LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.notification_outbox o SET lease_until = NULL, lease_token = NULL
  FROM jsonb_to_recordset(p_claims) AS claim(id UUID, lease_token UUID)
  WHERE o.id = claim.id AND o.lease_token = claim.lease_token AND o.delivered_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.release_notification_outbox(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_notification_outbox(JSONB) TO service_role;
