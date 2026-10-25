-- Add installment months on the Córdoba civil calendar, then convert to timestamptz.
-- Independent of the session TimeZone. Forward-only; do not edit 20261024200000.
-- NEVER `supabase db push`.

DO $$
BEGIN
  PERFORM zarix_vault.vault_available();
EXCEPTION
  WHEN undefined_function THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'zarix_vault.vault_available() must exist before this migration.';
END $$;

CREATE OR REPLACE FUNCTION public.cordoba_add_months(p_start TIMESTAMPTZ, p_months INTEGER)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
SET timezone = 'UTC'
AS $$
  SELECT (
    (
      ((p_start AT TIME ZONE 'America/Argentina/Cordoba')::date + (COALESCE(p_months, 0) * INTERVAL '1 month'))::date
      + ((p_start AT TIME ZONE 'America/Argentina/Cordoba')::time)
    ) AT TIME ZONE 'America/Argentina/Cordoba'
  );
$$;

REVOKE ALL ON FUNCTION public.cordoba_add_months(TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cordoba_add_months(TIMESTAMPTZ, INTEGER) TO service_role;

DROP FUNCTION IF EXISTS public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ, TEXT);

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
SET timezone = 'UTC'
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
    installment_date := public.cordoba_add_months(p_start_date, i - 1);
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

REVOKE ALL ON FUNCTION public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ, TEXT)
  TO service_role;
