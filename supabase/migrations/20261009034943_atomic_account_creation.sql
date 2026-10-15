-- Atomic account creation with opening balance (extracted from the dropped plan-allowances migration, 2026-10-15). No plan limits.
-- Separate receipt namespace prevents account/transaction request-key collisions.
CREATE TABLE public.account_creation_requests (
 user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 8 AND 200),
 request_hash TEXT NOT NULL,
 response JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id)
);
ALTER TABLE public.account_creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_creation_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.account_creation_requests TO service_role;

-- Account and opening ledger entry share one commit and the existing durable
-- request receipt pattern. A response-loss retry returns the original account as created.
CREATE OR REPLACE FUNCTION public.create_account_with_opening_balance(
 p_user_id UUID,p_request_id TEXT,p_request_hash TEXT,p_account JSONB,p_initial_balance NUMERIC
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous public.account_creation_requests%ROWTYPE; a public.accounts%ROWTYPE; result JSONB; next_sort INTEGER;
BEGIN
 IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
 OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'plan_request_conflict'; END IF;
 IF auth.uid() IS NOT NULL AND auth.uid()<>p_user_id THEN RAISE EXCEPTION 'plan_invalid_selection'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':account:'||p_request_id,0));
 SELECT * INTO previous FROM public.account_creation_requests WHERE user_id=p_user_id AND request_id=p_request_id;
 IF FOUND THEN
   IF previous.request_hash<>p_request_hash THEN RAISE EXCEPTION 'plan_request_conflict'; END IF;
   RETURN previous.response;
 END IF;
 PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'plan_invalid_selection'; END IF;
 a := jsonb_populate_record(NULL::public.accounts,p_account);
 SELECT COALESCE(max(sort_order)+1,0) INTO next_sort FROM public.accounts WHERE user_id=p_user_id;
 INSERT INTO public.accounts(user_id,name,type,currency,balance,icon,color,is_debt,include_in_total,include_in_liquid,
 min_balance,credit_limit,closing_day,due_day,last_4_digits,is_multicurrency,secondary_currency,sort_order)
 VALUES(p_user_id,a.name,a.type,a.currency,0,a.icon,COALESCE(a.color,'#3B82F6'),COALESCE(a.is_debt,false),
 COALESCE(a.include_in_total,true),COALESCE(a.include_in_liquid,true),a.min_balance,a.credit_limit,a.closing_day,a.due_day,
 a.last_4_digits,COALESCE(a.is_multicurrency,false),a.secondary_currency,next_sort) RETURNING * INTO a;
 IF p_initial_balance IS NULL OR p_initial_balance::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid opening balance'; END IF;
 IF p_initial_balance<>0 THEN
   INSERT INTO public.transactions(user_id,type,account_id,amount,currency,amount_in_account_currency,description,transaction_date)
   VALUES(p_user_id,'adjustment',a.id,abs(p_initial_balance),a.currency,p_initial_balance,'Saldo inicial',now());
 END IF;
 SELECT to_jsonb(account) INTO result FROM public.accounts account WHERE account.id=a.id AND account.user_id=p_user_id;
 INSERT INTO public.account_creation_requests(user_id,request_id,request_hash,response) VALUES(p_user_id,p_request_id,p_request_hash,result);
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_account_with_opening_balance(UUID,TEXT,TEXT,JSONB,NUMERIC) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_account_with_opening_balance(UUID,TEXT,TEXT,JSONB,NUMERIC) TO service_role;
