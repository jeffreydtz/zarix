-- Durable receipts for other financial mutation boundaries. No TTL or provider IO.
CREATE TABLE public.investment_sale_requests (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  request_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.investment_sale_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.investment_sale_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.investment_sale_requests TO service_role;

CREATE FUNCTION public.sell_investment_once(
  p_user_id UUID, p_request_id TEXT, p_request_hash TEXT, p_sale JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prior public.investment_sale_requests%ROWTYPE; result JSONB; basis public.investments%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
    OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sale:' || p_user_id || ':' || p_request_id, 0));
  SELECT * INTO prior FROM public.investment_sale_requests WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Request payload conflict'; END IF;
    RETURN prior.response;
  END IF;
  -- Replay above must win even after an edit, archive or full liquidation.
  -- Keep this row locked through the nested sale + receipt transaction. The
  -- service computed P&L before provider IO, so reject any changed cost basis.
  SELECT * INTO basis FROM public.investments
    WHERE id=(p_sale->>'p_investment_id')::UUID AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CANTIDAD_INSUFICIENTE'; END IF;
  IF NOT (p_sale ?& ARRAY['p_expected_purchase_price','p_expected_purchase_currency','p_expected_type'])
    OR basis.purchase_price IS DISTINCT FROM (p_sale->>'p_expected_purchase_price')::NUMERIC
    OR basis.purchase_currency IS DISTINCT FROM p_sale->>'p_expected_purchase_currency'
    OR basis.type::TEXT IS DISTINCT FROM p_sale->>'p_expected_type' THEN
    RAISE EXCEPTION USING ERRCODE='Z0002', MESSAGE='Investment cost basis changed';
  END IF;
  result := public.sell_investment_position(p_user_id, (p_sale->>'p_investment_id')::UUID,
    (p_sale->>'p_quantity')::NUMERIC, (p_sale->>'p_price')::NUMERIC, p_sale->>'p_currency',
    (p_sale->>'p_sold_at')::DATE, (p_sale->>'p_realized_pnl_native')::NUMERIC,
    (p_sale->>'p_realized_pnl_usd')::NUMERIC, (p_sale->>'p_ars_per_usd')::NUMERIC, p_sale->>'p_notes');
  INSERT INTO public.investment_sale_requests(user_id,request_id,request_hash,response)
    VALUES(p_user_id,p_request_id,p_request_hash,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.sell_investment_once(UUID,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sell_investment_once(UUID,TEXT,TEXT,JSONB) TO service_role;

CREATE TABLE public.shared_expense_requests (
  group_id UUID NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  request_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,request_id)
);
ALTER TABLE public.shared_expense_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shared_expense_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.shared_expense_requests TO service_role;

CREATE FUNCTION public.save_shared_expense_once(
  p_share_token TEXT, p_request_id TEXT, p_request_hash TEXT, p_expense JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_group UUID; prior public.shared_expense_requests%ROWTYPE; result JSONB; members UUID[];
BEGIN
  IF p_share_token IS NULL OR p_share_token !~ '^[a-f0-9]{32}$' THEN RETURN NULL; END IF;
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
    OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
  -- Capability authorization precedes even a replay. The row lock also serializes
  -- simultaneous first requests and protects against group deletion/token rotation.
  SELECT id INTO v_group FROM public.shared_groups WHERE share_token=p_share_token AND is_active FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO prior FROM public.shared_expense_requests WHERE group_id=v_group AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='Request payload conflict'; END IF;
    RETURN prior.response;
  END IF;
  IF jsonb_typeof(p_expense->'p_split_member_ids') = 'array' THEN
    SELECT array_agg(member::UUID) INTO members FROM jsonb_array_elements_text(p_expense->'p_split_member_ids') AS item(member);
  END IF;
  result := public.save_shared_expense(p_share_token, (p_expense->>'p_actor_member_id')::UUID,
    (p_expense->>'p_paid_by_member_id')::UUID, p_expense->>'p_description',
    (p_expense->>'p_amount')::NUMERIC, (p_expense->>'p_expense_date')::DATE, members,
    (p_expense->>'p_expense_id')::UUID);
  IF result IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.shared_expense_requests(group_id,request_id,request_hash,response)
    VALUES(v_group,p_request_id,p_request_hash,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_shared_expense_once(TEXT,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_shared_expense_once(TEXT,TEXT,TEXT,JSONB) TO service_role;

-- Investment creation has its own namespace and durable response, so retries
-- survive later position edits/archive/deletion without creating another lot.
CREATE TABLE public.investment_create_requests (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  request_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.investment_create_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.investment_create_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.investment_create_requests TO service_role;

CREATE FUNCTION public.create_investment_once(
  p_user_id UUID, p_request_id TEXT, p_request_hash TEXT, p_investment JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prior public.investment_create_requests%ROWTYPE; created public.investments%ROWTYPE; result JSONB;
BEGIN
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
    OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
  IF p_user_id IS NULL OR (p_investment->>'user_id')::UUID IS DISTINCT FROM p_user_id
    OR (auth.uid() IS NOT NULL AND auth.uid() <> p_user_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('investment-create:' || p_user_id || ':' || p_request_id, 0));
  SELECT * INTO prior FROM public.investment_create_requests WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Request payload conflict'; END IF;
    RETURN prior.response;
  END IF;
  -- Check eligibility under a lock, not only in the service before insertion.
  PERFORM 1 FROM public.accounts WHERE id=(p_investment->>'account_id')::UUID
    AND user_id=p_user_id AND is_active AND type='investment' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta de inversión no encontrada'; END IF;
  IF (p_investment->>'quantity')::NUMERIC IS NULL OR (p_investment->>'quantity')::NUMERIC <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;
  IF COALESCE((p_investment->>'is_manual_price')::BOOLEAN,FALSE) AND
    ((p_investment->>'current_price')::NUMERIC IS NULL OR (p_investment->>'current_price')::NUMERIC <= 0) THEN
    RAISE EXCEPTION 'PRECIO_INVALIDO';
  END IF;
  INSERT INTO public.investments(user_id,account_id,type,ticker,name,quantity,purchase_price,purchase_currency,
    purchase_date,maturity_date,interest_rate,notes,market_currency,is_manual_price,current_price,current_price_updated_at)
  VALUES(p_user_id,(p_investment->>'account_id')::UUID,(p_investment->>'type')::public.investment_type,
    p_investment->>'ticker',p_investment->>'name',(p_investment->>'quantity')::NUMERIC,
    (p_investment->>'purchase_price')::NUMERIC,p_investment->>'purchase_currency',
    (p_investment->>'purchase_date')::DATE,(p_investment->>'maturity_date')::DATE,
    (p_investment->>'interest_rate')::NUMERIC,p_investment->>'notes',p_investment->>'market_currency',
    COALESCE((p_investment->>'is_manual_price')::BOOLEAN,FALSE),(p_investment->>'current_price')::NUMERIC,
    (p_investment->>'current_price_updated_at')::TIMESTAMPTZ)
  RETURNING * INTO created;
  result := to_jsonb(created);
  INSERT INTO public.investment_create_requests(user_id,request_id,request_hash,response)
    VALUES(p_user_id,p_request_id,p_request_hash,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_investment_once(UUID,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_investment_once(UUID,TEXT,TEXT,JSONB) TO service_role;
