-- RF14 / CP2-11, CP2-12, CP3-17. Presentation only; no financial rows change.
ALTER TABLE public.users
  ADD COLUMN net_worth_widget_visible BOOLEAN NOT NULL DEFAULT TRUE;

-- Preserve the existing owner-only users policies and column-level privileges.
-- Do not restore broad profile access or expose integration credentials.
GRANT SELECT (net_worth_widget_visible), UPDATE (net_worth_widget_visible)
  ON public.users TO authenticated;

-- Enforce the same ARS/USD catalog for new preference writes through the Data
-- API. Existing legacy values are not rewritten and do not prevent unrelated
-- profile updates. No conversion or change of account currency occurs here.
CREATE FUNCTION public.validate_presentation_currency()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.default_currency IS NULL OR NEW.default_currency NOT IN ('ARS', 'USD') THEN
    RAISE EXCEPTION 'Moneda base no permitida.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_presentation_currency() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trigger_validate_presentation_currency
  BEFORE INSERT OR UPDATE OF default_currency ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.validate_presentation_currency();
