-- Forward-only: budget spent totals use explicit Córdoba civil-month bounds
-- (UTC−03), matching transactions/summary. DATE_TRUNC('month', timestamptz)
-- followed the session TimeZone and dropped 31 Oct 23:30-03 under UTC.

CREATE OR REPLACE FUNCTION public.get_budget_status(
  p_user_id UUID,
  p_month DATE DEFAULT (pg_catalog.date_trunc('month', timezone('America/Argentina/Cordoba', pg_catalog.now())))::date
)
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
  budget_amount NUMERIC,
  spent_amount NUMERIC,
  remaining_amount NUMERIC,
  percent_used NUMERIC
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  month_start timestamptz := ((p_month::text) || ' 00:00:00-03')::timestamptz;
  month_end timestamptz := ((((p_month + interval '1 month')::date)::text) || ' 00:00:00-03')::timestamptz;
BEGIN
  RETURN QUERY
  SELECT
    b.category_id,
    COALESCE(c.name, 'Sin categoría'),
    b.amount,
    COALESCE(SUM(t.amount_in_account_currency), 0) AS spent,
    b.amount - COALESCE(SUM(t.amount_in_account_currency), 0) AS remaining,
    ROUND((COALESCE(SUM(t.amount_in_account_currency), 0) / NULLIF(b.amount, 0) * 100)::NUMERIC, 2) AS percent
  FROM public.budgets b
  LEFT JOIN public.categories c ON c.id = b.category_id
  LEFT JOIN public.transactions t ON
    t.user_id = p_user_id
    AND t.type = 'expense'
    AND t.transaction_date >= month_start
    AND t.transaction_date < month_end
    AND (
      (b.category_id IS NOT NULL AND t.category_id = b.category_id)
      OR (b.category_id IS NULL AND t.category_id IS NULL)
    )
    AND EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = t.account_id
        AND a.user_id = p_user_id
        AND a.is_active = TRUE
        AND upper(trim(a.currency)) = upper(trim(b.currency))
    )
  WHERE b.user_id = p_user_id AND b.month = p_month
  GROUP BY b.category_id, c.name, b.amount;
END;
$$;
