-- En tarjetas bimoneda, pagos entrantes en moneda secundaria (USD) se aplican:
-- 1) primero a deuda secundaria (hasta llevarla a 0), y
-- 2) el remanente a deuda primaria (ARS) convertido por exchange_rate.
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
    tx.account_id,
    tx.transaction_date,
    tx.id AS tx_id,
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
    END AS signed_primary_fallback,
    false AS is_secondary_payment_waterfall,
    NULL::numeric AS secondary_inflow_amount,
    NULL::numeric AS secondary_to_primary_rate
  FROM public.transactions tx
  JOIN multi_accounts ma ON ma.id = tx.account_id
  WHERE tx.user_id = p_user_id
),
destination_entries AS (
  SELECT
    tx.destination_account_id AS account_id,
    tx.transaction_date,
    tx.id AS tx_id,
    CASE
      WHEN upper(trim(tx.currency)) = ma.primary_currency
        AND ma.secondary_currency <> ''
        AND COALESCE(tx.exchange_rate, 1) <> 1
      THEN ma.secondary_currency
      ELSE upper(trim(tx.currency))
    END AS tx_currency,
    abs(tx.amount) * COALESCE(NULLIF(tx.exchange_rate, 0), 1) AS signed_original_amount,
    abs(tx.amount) * COALESCE(NULLIF(tx.exchange_rate, 0), 1) AS signed_primary_fallback,
    (
      upper(trim(tx.currency)) = ma.secondary_currency
      AND COALESCE(tx.exchange_rate, 1) <> 1
    ) AS is_secondary_payment_waterfall,
    CASE
      WHEN upper(trim(tx.currency)) = ma.secondary_currency
           AND COALESCE(tx.exchange_rate, 1) <> 1
      THEN abs(tx.amount)
      ELSE NULL::numeric
    END AS secondary_inflow_amount,
    CASE
      WHEN upper(trim(tx.currency)) = ma.secondary_currency
           AND COALESCE(tx.exchange_rate, 1) <> 1
      THEN COALESCE(NULLIF(tx.exchange_rate, 0), 1)
      ELSE NULL::numeric
    END AS secondary_to_primary_rate
  FROM public.transactions tx
  JOIN multi_accounts ma ON ma.id = tx.destination_account_id
  WHERE tx.user_id = p_user_id
    AND tx.type = 'transfer'
),
entries AS (
  SELECT * FROM source_entries
  UNION ALL
  SELECT * FROM destination_entries
),
ordered_entries AS (
  SELECT
    e.*,
    ROW_NUMBER() OVER (PARTITION BY e.account_id ORDER BY e.transaction_date, e.tx_id) AS rn
  FROM entries e
),
walk AS (
  SELECT
    oe.account_id,
    oe.rn,
    CASE
      WHEN oe.is_secondary_payment_waterfall THEN
        oe.secondary_inflow_amount * COALESCE(oe.secondary_to_primary_rate, 1)
      ELSE
        CASE
          WHEN oe.tx_currency = ma.primary_currency THEN oe.signed_original_amount
          WHEN oe.tx_currency = ma.secondary_currency THEN 0
          ELSE oe.signed_primary_fallback
        END
    END AS primary_balance,
    CASE
      WHEN oe.is_secondary_payment_waterfall THEN
        0
      ELSE
        CASE
          WHEN oe.tx_currency = ma.secondary_currency THEN oe.signed_original_amount
          ELSE 0
        END
    END AS secondary_balance
  FROM ordered_entries oe
  JOIN multi_accounts ma ON ma.id = oe.account_id
  WHERE oe.rn = 1

  UNION ALL

  SELECT
    oe.account_id,
    oe.rn,
    w.primary_balance +
      CASE
        WHEN oe.is_secondary_payment_waterfall THEN
          (
            oe.secondary_inflow_amount -
            CASE
              WHEN w.secondary_balance < 0 THEN LEAST(oe.secondary_inflow_amount, abs(w.secondary_balance))
              ELSE 0
            END
          ) * COALESCE(oe.secondary_to_primary_rate, 1)
        ELSE
          CASE
            WHEN oe.tx_currency = ma.primary_currency THEN oe.signed_original_amount
            WHEN oe.tx_currency = ma.secondary_currency THEN 0
            ELSE oe.signed_primary_fallback
          END
      END AS primary_balance,
    w.secondary_balance +
      CASE
        WHEN oe.is_secondary_payment_waterfall THEN
          CASE
            WHEN w.secondary_balance < 0 THEN LEAST(oe.secondary_inflow_amount, abs(w.secondary_balance))
            ELSE 0
          END
        ELSE
          CASE
            WHEN oe.tx_currency = ma.secondary_currency THEN oe.signed_original_amount
            ELSE 0
          END
      END AS secondary_balance
  FROM walk w
  JOIN ordered_entries oe
    ON oe.account_id = w.account_id
   AND oe.rn = w.rn + 1
  JOIN multi_accounts ma ON ma.id = oe.account_id
),
latest AS (
  SELECT DISTINCT ON (account_id)
    account_id,
    primary_balance,
    secondary_balance
  FROM walk
  ORDER BY account_id, rn DESC
)
SELECT
  ma.id AS account_id,
  COALESCE(l.primary_balance, 0) AS primary_balance,
  COALESCE(l.secondary_balance, 0) AS secondary_balance
FROM multi_accounts ma
LEFT JOIN latest l ON l.account_id = ma.id;
$$;
