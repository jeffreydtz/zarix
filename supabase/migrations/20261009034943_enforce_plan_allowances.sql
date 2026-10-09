-- Proposed v2.13 Free/Premium rules. No pricing and no destructive downgrade.
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS movement_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION public.plan_account_limit(p_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT CASE WHEN
   (u.status::text IN ('ACTIVE','CANCELED') AND u.current_period_end > now()) OR
   (u.status::text = 'GRACE_PERIOD' AND u.current_period_end IS NOT NULL AND u.grace_period_end > now())
 THEN 20 ELSE 3 END FROM public.users u WHERE u.id=p_user_id;
$$;
REVOKE ALL ON FUNCTION public.plan_account_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_account_limit(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_account_plan_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE cap INTEGER;
BEGIN
 IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
   RAISE EXCEPTION 'plan_invalid_selection';
 END IF;
 IF TG_OP='UPDATE' AND (NOT NEW.is_active OR NOT NEW.movement_enabled OR
   (OLD.is_active AND OLD.movement_enabled)) THEN RETURN NEW; END IF;
 IF NOT NEW.is_active OR NOT NEW.movement_enabled THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.users WHERE id=NEW.user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'plan_invalid_selection'; END IF;
 cap := public.plan_account_limit(NEW.user_id);
 IF (SELECT count(*) FROM public.accounts WHERE user_id=NEW.user_id AND is_active AND movement_enabled AND id<>NEW.id) >= cap THEN
   RAISE EXCEPTION 'plan_account_limit';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_account_plan_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enforce_account_plan_limit BEFORE INSERT OR UPDATE OF user_id,is_active,movement_enabled
 ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.enforce_account_plan_limit();

CREATE OR REPLACE FUNCTION public.select_movement_accounts(p_user_id UUID, p_account_ids UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE cap INTEGER;
BEGIN
 -- Service-only RPC. The authenticated route supplies the user, never the body.
 PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'plan_invalid_selection'; END IF;
 cap := public.plan_account_limit(p_user_id);
 IF p_account_ids IS NULL OR cardinality(p_account_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_account_ids) x)
 OR (SELECT count(*) FROM public.accounts WHERE user_id=p_user_id AND is_active AND id=ANY(p_account_ids)) <> cardinality(p_account_ids) THEN
   RAISE EXCEPTION 'plan_invalid_selection';
 END IF;
 IF cardinality(p_account_ids)>cap THEN RAISE EXCEPTION 'plan_account_limit'; END IF;
 -- Clear first so a valid replacement never transiently exceeds the allowance.
 UPDATE public.accounts SET movement_enabled=FALSE WHERE user_id=p_user_id AND movement_enabled AND NOT (id=ANY(p_account_ids));
 UPDATE public.accounts SET movement_enabled=TRUE WHERE user_id=p_user_id AND id=ANY(p_account_ids) AND NOT movement_enabled;
END;
$$;
REVOKE ALL ON FUNCTION public.select_movement_accounts(UUID,UUID[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.select_movement_accounts(UUID,UUID[]) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_movement_plan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE cap INTEGER;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'plan_invalid_selection'; END IF;
   IF NEW.account_id IS NOT DISTINCT FROM OLD.account_id AND NEW.destination_account_id IS NOT DISTINCT FROM OLD.destination_account_id THEN RETURN NEW; END IF;
 END IF;
 PERFORM 1 FROM public.users WHERE id=NEW.user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'plan_invalid_selection'; END IF;
 cap := public.plan_account_limit(NEW.user_id);
 IF NEW.recurring_rule_id IS NOT NULL AND cap<>20 THEN RAISE EXCEPTION 'plan_premium_required'; END IF;
 IF (SELECT count(*) FROM public.accounts WHERE user_id=NEW.user_id AND is_active AND movement_enabled)>cap THEN
   RAISE EXCEPTION 'plan_selection_required';
 END IF;
 IF NEW.account_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts WHERE id=NEW.account_id AND user_id=NEW.user_id AND is_active AND movement_enabled)
 OR (NEW.destination_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id=NEW.destination_account_id AND user_id=NEW.user_id AND is_active AND movement_enabled)) THEN
   RAISE EXCEPTION 'plan_account_disabled';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_movement_plan() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_movement_plan BEFORE INSERT OR UPDATE OF user_id,account_id,destination_account_id
 ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_movement_plan();

-- End anchors are captured from server-owned paid periods; a webhook cannot reset
-- counters mid-cycle. Grace continues the previous cycle. No automatic crash retry.
CREATE TABLE public.plan_usage_cycles (
 user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 period_end TIMESTAMPTZ NOT NULL
);
CREATE TABLE public.plan_usage_requests (
 user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 feature TEXT NOT NULL CHECK(feature IN ('ocr','ai')),
 request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 1 AND 180),
 fingerprint TEXT NOT NULL,
 period_end TIMESTAMPTZ NOT NULL,
 reservation_token UUID NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('reserved','completed','released')),
 result JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,feature,request_key)
);
CREATE INDEX plan_usage_cycle_count ON public.plan_usage_requests(user_id,feature,period_end) WHERE state<>'released';
ALTER TABLE public.plan_usage_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_usage_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_usage_cycles,public.plan_usage_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.plan_usage_cycles,public.plan_usage_requests TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_plan_usage(p_user_id UUID,p_feature TEXT,p_request_key TEXT,p_fingerprint TEXT,p_token UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE u public.users%ROWTYPE; previous public.plan_usage_requests%ROWTYPE; cycle_end TIMESTAMPTZ; allowance INTEGER;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'plan_premium_required'; END IF;
 SELECT * INTO previous FROM public.plan_usage_requests WHERE user_id=p_user_id AND feature=p_feature AND request_key=p_request_key;
 IF FOUND THEN
   IF previous.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'plan_request_conflict'; END IF;
   IF previous.state='completed' THEN RETURN jsonb_build_object('replayed',TRUE,'result',previous.result); END IF;
   IF previous.state='reserved' THEN RAISE EXCEPTION 'plan_request_in_progress'; END IF;
 END IF;
 IF public.plan_account_limit(p_user_id)<>20 THEN RAISE EXCEPTION 'plan_premium_required'; END IF;
 allowance := CASE p_feature WHEN 'ocr' THEN 20 WHEN 'ai' THEN 40 ELSE NULL END;
 IF allowance IS NULL THEN RAISE EXCEPTION 'plan_premium_required'; END IF;
 SELECT period_end INTO cycle_end FROM public.plan_usage_cycles WHERE user_id=p_user_id;
 IF cycle_end IS NULL THEN
   cycle_end := u.current_period_end;
   INSERT INTO public.plan_usage_cycles(user_id,period_end) VALUES(p_user_id,cycle_end);
 ELSIF cycle_end<=now() AND u.current_period_end>cycle_end AND u.current_period_end>now() THEN
   cycle_end := u.current_period_end;
   UPDATE public.plan_usage_cycles SET period_end=cycle_end WHERE user_id=p_user_id;
 END IF;
 IF (SELECT count(*) FROM public.plan_usage_requests WHERE user_id=p_user_id AND feature=p_feature AND period_end=cycle_end AND state<>'released') >= allowance THEN
   RAISE EXCEPTION 'plan_quota_exhausted';
 END IF;
 INSERT INTO public.plan_usage_requests(user_id,feature,request_key,fingerprint,period_end,reservation_token,state)
 VALUES(p_user_id,p_feature,p_request_key,p_fingerprint,cycle_end,p_token,'reserved')
 ON CONFLICT(user_id,feature,request_key) DO UPDATE SET period_end=EXCLUDED.period_end,reservation_token=EXCLUDED.reservation_token,state='reserved',result=NULL;
 RETURN jsonb_build_object('replayed',FALSE);
END;
$$;
CREATE OR REPLACE FUNCTION public.finish_plan_usage(p_user_id UUID,p_feature TEXT,p_request_key TEXT,p_token UUID,p_succeeded BOOLEAN,p_result JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
 UPDATE public.plan_usage_requests SET state=CASE WHEN p_succeeded THEN 'completed' ELSE 'released' END,result=CASE WHEN p_succeeded THEN p_result ELSE NULL END
 WHERE user_id=p_user_id AND feature=p_feature AND request_key=p_request_key AND reservation_token=p_token AND state='reserved';
 IF NOT FOUND THEN RAISE EXCEPTION 'plan_request_conflict'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_plan_usage(UUID,TEXT,TEXT,TEXT,UUID),public.finish_plan_usage(UUID,TEXT,TEXT,UUID,BOOLEAN,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_plan_usage(UUID,TEXT,TEXT,TEXT,UUID),public.finish_plan_usage(UUID,TEXT,TEXT,UUID,BOOLEAN,JSONB) TO service_role;

-- Premium automation is paused on downgrade, while existing rules stay readable.
CREATE OR REPLACE FUNCTION public.enforce_recurring_plan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'plan_invalid_selection'; END IF;
 IF NEW.is_active AND (TG_OP='INSERT' OR NOT OLD.is_active) THEN
   PERFORM 1 FROM public.users WHERE id=NEW.user_id FOR UPDATE;
   IF NOT FOUND OR public.plan_account_limit(NEW.user_id)<>20 THEN RAISE EXCEPTION 'plan_premium_required'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_recurring_plan() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_recurring_plan BEFORE INSERT OR UPDATE OF user_id,is_active ON public.recurring_rules
 FOR EACH ROW EXECUTE FUNCTION public.enforce_recurring_plan();

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
