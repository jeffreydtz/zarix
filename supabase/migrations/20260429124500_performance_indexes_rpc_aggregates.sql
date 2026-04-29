-- Performance indexes and RPC aggregations for dashboard/analysis/accounts.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date_desc
  ON public.transactions (user_id, type, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_account_date_desc
  ON public.transactions (user_id, account_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_destination_date_desc
  ON public.transactions (user_id, destination_account_id, transaction_date DESC)
  WHERE destination_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_description_trgm
  ON public.transactions USING gin ((COALESCE(description, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_source_pair_timestamp_desc
  ON public.exchange_rates (source, from_currency, to_currency, timestamp DESC);

CREATE OR REPLACE FUNCTION public.get_multicurrency_balances(
  p_user_id uuid,
  p_account_ids uuid[]
)
RETURNS TABLE (
  account_id uuid,
  primary_balance numeric,
  secondary_balance numeric
)
LANGUAGE sql
STABLE
AS $$
WITH multi_accounts AS (
  SELECT
    a.id,
    upper(trim(a.currency)) AS primary_currency,
    upper(trim(COALESCE(a.secondary_currency, ''))) AS secondary_currency
  FROM public.accounts a
  WHERE a.user_id = p_user_id
    AND a.id = ANY(p_account_ids)
    AND a.is_multicurrency = true
    AND a.secondary_currency IS NOT NULL
),
source_entries AS (
  SELECT
    tx.account_id AS account_id,
    upper(trim(tx.currency)) AS tx_currency,
    CASE
      WHEN tx.type = 'expense' THEN -abs(tx.amount)
      WHEN tx.type = 'income' THEN abs(tx.amount)
      WHEN tx.type = 'adjustment' THEN sign(tx.amount_in_account_currency) * abs(tx.amount)
      WHEN tx.type = 'transfer' THEN -abs(tx.amount)
      ELSE 0
    END AS signed_original_amount,
    CASE
      WHEN tx.type = 'expense' THEN -abs(tx.amount_in_account_currency)
      WHEN tx.type = 'income' THEN abs(tx.amount_in_account_currency)
      WHEN tx.type = 'adjustment' THEN tx.amount_in_account_currency
      WHEN tx.type = 'transfer' THEN -abs(tx.amount_in_account_currency)
      ELSE 0
    END AS signed_primary_fallback
  FROM public.transactions tx
  JOIN multi_accounts ma ON ma.id = tx.account_id
  WHERE tx.user_id = p_user_id
),
destination_entries AS (
  SELECT
    tx.destination_account_id AS account_id,
    CASE
      WHEN upper(trim(tx.currency)) = ma.primary_currency
        AND ma.secondary_currency <> ''
        AND COALESCE(tx.exchange_rate, 1) <> 1
      THEN ma.secondary_currency
      WHEN upper(trim(tx.currency)) = ma.secondary_currency
        AND COALESCE(tx.exchange_rate, 1) <> 1
      THEN ma.primary_currency
      ELSE upper(trim(tx.currency))
    END AS tx_currency,
    abs(tx.amount) * COALESCE(NULLIF(tx.exchange_rate, 0), 1) AS signed_original_amount,
    abs(tx.amount) * COALESCE(NULLIF(tx.exchange_rate, 0), 1) AS signed_primary_fallback
  FROM public.transactions tx
  JOIN multi_accounts ma ON ma.id = tx.destination_account_id
  WHERE tx.user_id = p_user_id
    AND tx.type = 'transfer'
),
entries AS (
  SELECT * FROM source_entries
  UNION ALL
  SELECT * FROM destination_entries
)
SELECT
  ma.id AS account_id,
  COALESCE(
    SUM(
      CASE
        WHEN e.tx_currency = ma.primary_currency THEN e.signed_original_amount
        WHEN e.tx_currency = ma.secondary_currency THEN 0
        ELSE e.signed_primary_fallback
      END
    ),
    0
  ) AS primary_balance,
  COALESCE(
    SUM(
      CASE
        WHEN e.tx_currency = ma.secondary_currency THEN e.signed_original_amount
        ELSE 0
      END
    ),
    0
  ) AS secondary_balance
FROM multi_accounts ma
LEFT JOIN entries e ON e.account_id = ma.id
GROUP BY ma.id;
$$;

CREATE OR REPLACE FUNCTION public.analytics_category_breakdown(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_type transaction_type
)
RETURNS TABLE (
  category_id uuid,
  category_name text,
  category_icon text,
  amount numeric,
  tx_count bigint
)
LANGUAGE sql
STABLE
AS $$
SELECT
  t.category_id,
  COALESCE(c.name, 'Sin categoría') AS category_name,
  COALESCE(c.icon, '❓') AS category_icon,
  SUM(t.amount_in_account_currency) AS amount,
  COUNT(*) AS tx_count
FROM public.transactions t
LEFT JOIN public.categories c ON c.id = t.category_id
JOIN public.accounts a ON a.id = t.account_id
LEFT JOIN public.accounts da ON da.id = t.destination_account_id
WHERE t.user_id = p_user_id
  AND t.type = p_type
  AND t.transaction_date >= p_start
  AND t.transaction_date <= p_end
  AND a.is_active = true
  AND (t.destination_account_id IS NULL OR da.is_active = true)
GROUP BY t.category_id, COALESCE(c.name, 'Sin categoría'), COALESCE(c.icon, '❓')
ORDER BY amount DESC;
$$;

CREATE OR REPLACE FUNCTION public.analytics_monthly_trend(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  month_key text,
  expenses numeric,
  income numeric
)
LANGUAGE sql
STABLE
AS $$
WITH series AS (
  SELECT generate_series(
    date_trunc('month', p_start),
    date_trunc('month', p_end),
    interval '1 month'
  ) AS month_start
),
base AS (
  SELECT
    date_trunc('month', t.transaction_date) AS month_start,
    SUM(CASE WHEN t.type = 'expense' THEN t.amount_in_account_currency ELSE 0 END) AS expenses,
    SUM(CASE WHEN t.type = 'income' THEN t.amount_in_account_currency ELSE 0 END) AS income
  FROM public.transactions t
  JOIN public.accounts a ON a.id = t.account_id
  LEFT JOIN public.accounts da ON da.id = t.destination_account_id
  WHERE t.user_id = p_user_id
    AND t.transaction_date >= p_start
    AND t.transaction_date <= p_end
    AND a.is_active = true
    AND (t.destination_account_id IS NULL OR da.is_active = true)
  GROUP BY date_trunc('month', t.transaction_date)
)
SELECT
  to_char(s.month_start, 'YYYY-MM') AS month_key,
  COALESCE(b.expenses, 0) AS expenses,
  COALESCE(b.income, 0) AS income
FROM series s
LEFT JOIN base b ON b.month_start = s.month_start
ORDER BY s.month_start ASC;
$$;

CREATE OR REPLACE FUNCTION public.analytics_daily_trend(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  day_key date,
  expenses numeric,
  income numeric
)
LANGUAGE sql
STABLE
AS $$
WITH series AS (
  SELECT generate_series(
    date_trunc('day', p_start)::date,
    date_trunc('day', p_end)::date,
    interval '1 day'
  )::date AS day_key
),
base AS (
  SELECT
    (t.transaction_date AT TIME ZONE 'UTC')::date AS day_key,
    SUM(CASE WHEN t.type = 'expense' THEN t.amount_in_account_currency ELSE 0 END) AS expenses,
    SUM(CASE WHEN t.type = 'income' THEN t.amount_in_account_currency ELSE 0 END) AS income
  FROM public.transactions t
  JOIN public.accounts a ON a.id = t.account_id
  LEFT JOIN public.accounts da ON da.id = t.destination_account_id
  WHERE t.user_id = p_user_id
    AND t.transaction_date >= p_start
    AND t.transaction_date <= p_end
    AND a.is_active = true
    AND (t.destination_account_id IS NULL OR da.is_active = true)
  GROUP BY (t.transaction_date AT TIME ZONE 'UTC')::date
)
SELECT
  s.day_key,
  COALESCE(b.expenses, 0) AS expenses,
  COALESCE(b.income, 0) AS income
FROM series s
LEFT JOIN base b ON b.day_key = s.day_key
ORDER BY s.day_key ASC;
$$;

CREATE OR REPLACE FUNCTION public.analytics_account_breakdown(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  account_name text,
  account_icon text,
  account_color text,
  amount numeric
)
LANGUAGE sql
STABLE
AS $$
SELECT
  COALESCE(a.name, 'Sin cuenta') AS account_name,
  COALESCE(a.icon, '💳') AS account_icon,
  COALESCE(a.color, '#6B7280') AS account_color,
  SUM(t.amount_in_account_currency) AS amount
FROM public.transactions t
LEFT JOIN public.accounts a ON a.id = t.account_id
LEFT JOIN public.accounts da ON da.id = t.destination_account_id
WHERE t.user_id = p_user_id
  AND t.type = 'expense'
  AND t.transaction_date >= p_start
  AND t.transaction_date <= p_end
  AND a.is_active = true
  AND (t.destination_account_id IS NULL OR da.is_active = true)
GROUP BY COALESCE(a.name, 'Sin cuenta'), COALESCE(a.icon, '💳'), COALESCE(a.color, '#6B7280')
ORDER BY amount DESC;
$$;

CREATE OR REPLACE FUNCTION public.analytics_top_expenses(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_limit integer DEFAULT 10
)
RETURNS SETOF public.transactions
LANGUAGE sql
STABLE
AS $$
SELECT t.*
FROM public.transactions t
JOIN public.accounts a ON a.id = t.account_id
LEFT JOIN public.accounts da ON da.id = t.destination_account_id
WHERE t.user_id = p_user_id
  AND t.type = 'expense'
  AND t.transaction_date >= p_start
  AND t.transaction_date <= p_end
  AND a.is_active = true
  AND (t.destination_account_id IS NULL OR da.is_active = true)
ORDER BY t.amount_in_account_currency DESC
LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;
