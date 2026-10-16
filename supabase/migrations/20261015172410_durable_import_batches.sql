-- Import is intentionally partial per row. Bind the batch before any financial
-- write; each row has an atomic transaction_requests receipt retained forever.
CREATE TABLE public.import_batches (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  intent_hash TEXT NOT NULL CHECK (intent_hash ~ '^[0-9a-f]{64}$'),
  context JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, batch_id)
);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.import_batches TO service_role;

CREATE FUNCTION public.begin_import_batch(p_user_id UUID, p_batch_id UUID, p_intent_hash TEXT, p_context JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prior public.import_batches%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_batch_id IS NULL OR p_intent_hash IS NULL
     OR p_intent_hash !~ '^[0-9a-f]{64}$' OR p_context IS NULL THEN
    RAISE EXCEPTION 'Invalid import batch';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('import:' || p_user_id::text || ':' || p_batch_id::text, 0));
  SELECT * INTO prior FROM public.import_batches WHERE user_id=p_user_id AND batch_id=p_batch_id;
  IF FOUND THEN
    IF prior.intent_hash <> p_intent_hash THEN
      RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Import batch payload conflict';
    END IF;
    RETURN prior.context;
  END IF;
  INSERT INTO public.import_batches(user_id,batch_id,intent_hash,context)
    VALUES(p_user_id,p_batch_id,p_intent_hash,p_context);
  RETURN p_context;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_import_batch(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_import_batch(UUID, UUID, TEXT, JSONB) TO service_role;

CREATE FUNCTION public.create_import_transaction_once(
  p_user_id UUID, p_batch_id UUID, p_request_id TEXT, p_request_hash TEXT,
  p_transaction JSONB, p_skip_duplicates BOOLEAN DEFAULT false
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prior public.transaction_requests%ROWTYPE; t public.transactions%ROWTYPE; result JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_request_id IS NULL OR p_request_id !~ ('^import:' || p_batch_id::text || ':(transaction|transfer):[0-9]+$')
     OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid import request';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.import_batches WHERE user_id=p_user_id AND batch_id=p_batch_id) THEN
    RAISE EXCEPTION 'Import batch not found';
  END IF;
  -- Serialize optional matching across imports by this owner, including new
  -- batches. Equal legitimate rows are otherwise always distinct operations.
  PERFORM pg_advisory_xact_lock(hashtextextended('import-owner:' || p_user_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_id, 0));
  SELECT * INTO prior FROM public.transaction_requests WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN
      RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Request payload conflict';
    END IF;
    RETURN prior.response;
  END IF;
  t := jsonb_populate_record(NULL::public.transactions,p_transaction);
  IF t.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_skip_duplicates AND EXISTS (
    SELECT 1 FROM public.transactions x WHERE x.user_id=p_user_id
      AND x.type=t.type AND x.transaction_date=t.transaction_date
      AND x.account_id IS NOT DISTINCT FROM t.account_id
      AND x.destination_account_id IS NOT DISTINCT FROM t.destination_account_id
      AND x.amount=t.amount AND x.currency=t.currency
      AND x.amount_in_account_currency IS NOT DISTINCT FROM t.amount_in_account_currency
      AND x.destination_amount_in_account_currency IS NOT DISTINCT FROM t.destination_amount_in_account_currency
      AND x.category_id IS NOT DISTINCT FROM t.category_id
      AND x.description IS NOT DISTINCT FROM t.description AND x.notes IS NOT DISTINCT FROM t.notes
  ) THEN
    result := jsonb_build_object('import_skipped_duplicate',true);
    INSERT INTO public.transaction_requests(user_id,request_id,request_hash,response)
      VALUES(p_user_id,p_request_id,p_request_hash,result);
    RETURN result;
  END IF;
  RETURN public.create_transaction_once(p_user_id,p_request_id,p_request_hash,p_transaction,1);
END;
$$;
REVOKE ALL ON FUNCTION public.create_import_transaction_once(UUID, UUID, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_import_transaction_once(UUID, UUID, TEXT, TEXT, JSONB, BOOLEAN) TO service_role;
