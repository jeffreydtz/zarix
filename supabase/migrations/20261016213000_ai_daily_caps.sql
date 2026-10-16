-- Daily AI/OCR caps for accounts created after the v2.13 deploy (2026-10-15).
-- Users created before the cutoff are grandfathered with unlimited access.
-- Durable counter: one row per user/feature/day (America/Argentina/Buenos_Aires).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ai_unlimited BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE public.users SET ai_unlimited = TRUE
 WHERE created_at < TIMESTAMPTZ '2026-10-15 17:23:00+00' AND NOT ai_unlimited;

CREATE TABLE IF NOT EXISTS public.ai_daily_usage (
 user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 feature TEXT NOT NULL CHECK (feature IN ('ai','ocr')),
 usage_date DATE NOT NULL,
 used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
 PRIMARY KEY (user_id, feature, usage_date)
);
ALTER TABLE public.ai_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_daily_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_daily_usage TO service_role;

-- Atomically consumes one unit. Returns allowed=false when the daily cap is reached.
CREATE OR REPLACE FUNCTION public.consume_ai_daily_quota(p_user_id UUID, p_feature TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE cap INTEGER; unlimited BOOLEAN; day DATE; new_used INTEGER;
BEGIN
 cap := CASE p_feature WHEN 'ai' THEN 20 WHEN 'ocr' THEN 5 ELSE NULL END;
 IF cap IS NULL THEN RAISE EXCEPTION 'ai_quota_invalid_feature'; END IF;
 SELECT u.ai_unlimited INTO unlimited FROM public.users u WHERE u.id = p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ai_quota_unknown_user'; END IF;
 IF unlimited THEN RETURN jsonb_build_object('allowed', TRUE, 'unlimited', TRUE); END IF;
 day := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
 INSERT INTO public.ai_daily_usage AS d (user_id, feature, usage_date, used)
 VALUES (p_user_id, p_feature, day, 1)
 ON CONFLICT (user_id, feature, usage_date) DO UPDATE SET used = d.used + 1
   WHERE d.used < cap
 RETURNING d.used INTO new_used;
 IF new_used IS NULL THEN
   RETURN jsonb_build_object('allowed', FALSE, 'limit', cap, 'used', cap);
 END IF;
 RETURN jsonb_build_object('allowed', TRUE, 'limit', cap, 'used', new_used);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_ai_daily_quota(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_daily_quota(UUID, TEXT) TO service_role;
