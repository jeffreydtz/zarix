-- Investment backlog: optional lot date, quote vs payment currency, ON law,
-- crypto accounts as a valid home for crypto positions, and create_investment_once
-- aligned with those fields. Does not rewrite existing rows.

ALTER TABLE public.investments
  ALTER COLUMN purchase_date DROP NOT NULL;

ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS payment_currency TEXT,
  ADD COLUMN IF NOT EXISTS law TEXT;

COMMENT ON COLUMN public.investments.purchase_date IS
  'Optional lot date. NULL when the holding was imported without a known purchase date.';
COMMENT ON COLUMN public.investments.payment_currency IS
  'Currency in which cash flows are settled (hard-dollar bonds/ONs may still quote in ARS).';
COMMENT ON COLUMN public.investments.law IS
  'Governing law for ON / sovereign bonds (e.g. NY, Argentina).';

CREATE OR REPLACE FUNCTION public.create_investment_once(
  p_user_id UUID, p_request_id TEXT, p_request_hash TEXT, p_investment JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prior public.investment_create_requests%ROWTYPE; created public.investments%ROWTYPE; result JSONB;
  v_type TEXT;
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
  v_type := COALESCE(p_investment->>'type', '');
  -- Investment accounts always; crypto accounts only for crypto positions.
  PERFORM 1 FROM public.accounts WHERE id=(p_investment->>'account_id')::UUID
    AND user_id=p_user_id AND is_active
    AND (
      type = 'investment'
      OR (type = 'crypto' AND v_type = 'crypto')
    )
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta de inversión no encontrada'; END IF;
  IF (p_investment->>'quantity')::NUMERIC IS NULL OR (p_investment->>'quantity')::NUMERIC <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;
  IF COALESCE((p_investment->>'is_manual_price')::BOOLEAN,FALSE) AND
    ((p_investment->>'current_price')::NUMERIC IS NULL OR (p_investment->>'current_price')::NUMERIC <= 0) THEN
    RAISE EXCEPTION 'PRECIO_INVALIDO';
  END IF;
  INSERT INTO public.investments(
    user_id,account_id,type,ticker,name,quantity,purchase_price,purchase_currency,
    purchase_date,maturity_date,interest_rate,notes,market_currency,payment_currency,law,
    is_manual_price,current_price,current_price_updated_at
  )
  VALUES(
    p_user_id,
    (p_investment->>'account_id')::UUID,
    (p_investment->>'type')::public.investment_type,
    p_investment->>'ticker',
    p_investment->>'name',
    (p_investment->>'quantity')::NUMERIC,
    (p_investment->>'purchase_price')::NUMERIC,
    p_investment->>'purchase_currency',
    NULLIF(p_investment->>'purchase_date','')::DATE,
    NULLIF(p_investment->>'maturity_date','')::DATE,
    (p_investment->>'interest_rate')::NUMERIC,
    p_investment->>'notes',
    NULLIF(p_investment->>'market_currency',''),
    NULLIF(p_investment->>'payment_currency',''),
    NULLIF(p_investment->>'law',''),
    COALESCE((p_investment->>'is_manual_price')::BOOLEAN,FALSE),
    (p_investment->>'current_price')::NUMERIC,
    (p_investment->>'current_price_updated_at')::TIMESTAMPTZ
  )
  RETURNING * INTO created;
  result := to_jsonb(created);
  INSERT INTO public.investment_create_requests(user_id,request_id,request_hash,response)
    VALUES(p_user_id,p_request_id,p_request_hash,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_investment_once(UUID,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_investment_once(UUID,TEXT,TEXT,JSONB) TO service_role;
