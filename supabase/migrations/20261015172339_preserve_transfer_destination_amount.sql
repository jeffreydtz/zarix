-- Importe destino confirmado: evita perder centavos por persistir tasas inversas con sólo8 decimales.
-- No se recalculan saldos históricos; movimientos viejos mantienen el fallback anterior.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS destination_amount_in_account_currency NUMERIC(20,8);
ALTER TABLE public.transactions ADD CONSTRAINT positive_destination_amount
  CHECK (destination_amount_in_account_currency IS NULL OR destination_amount_in_account_currency > 0);

CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  touched_accounts UUID[] := ARRAY[]::UUID[];
  old_is_secondary_adjustment BOOLEAN := FALSE;
  new_is_secondary_adjustment BOOLEAN := FALSE;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    touched_accounts := touched_accounts || ARRAY[OLD.account_id, OLD.destination_account_id];
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    touched_accounts := touched_accounts || ARRAY[NEW.account_id, NEW.destination_account_id];
  END IF;

  -- Mismo orden de locks para A→B y B→A; los dos impactos son parte de la
  -- transacción que modificó el movimiento, incluidos UPDATE y DELETE.
  PERFORM id FROM public.accounts
  WHERE id = ANY(touched_accounts)
  ORDER BY id
  FOR UPDATE;

  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.type = 'adjustment' THEN
    SELECT COALESCE(
      a.type = 'credit_card' AND a.is_multicurrency
      AND a.secondary_currency IS NOT NULL
      AND upper(trim(COALESCE(OLD.currency, ''))) = upper(trim(a.secondary_currency)),
      FALSE
    ) INTO old_is_secondary_adjustment
    FROM public.accounts a WHERE a.id = OLD.account_id;
    old_is_secondary_adjustment := COALESCE(old_is_secondary_adjustment, FALSE);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.type = 'adjustment' THEN
    SELECT COALESCE(
      a.type = 'credit_card' AND a.is_multicurrency
      AND a.secondary_currency IS NOT NULL
      AND upper(trim(COALESCE(NEW.currency, ''))) = upper(trim(a.secondary_currency)),
      FALSE
    ) INTO new_is_secondary_adjustment
    FROM public.accounts a WHERE a.id = NEW.account_id;
    new_is_secondary_adjustment := COALESCE(new_is_secondary_adjustment, FALSE);
  END IF;

  -- Quitar el impacto anterior usando OLD.type, no el tipo de la fila nueva.
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    IF OLD.type IN ('expense', 'transfer') THEN
      UPDATE public.accounts SET balance = balance + OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
    ELSIF OLD.type = 'income' OR (OLD.type = 'adjustment' AND NOT old_is_secondary_adjustment) THEN
      UPDATE public.accounts SET balance = balance - OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
    END IF;
    IF OLD.type = 'transfer' AND OLD.destination_account_id IS NOT NULL THEN
      UPDATE public.accounts SET balance = balance - COALESCE(OLD.destination_amount_in_account_currency, OLD.amount * COALESCE(OLD.exchange_rate, 1))
      WHERE id = OLD.destination_account_id;
    END IF;
  END IF;

  -- Aplicar el impacto nuevo usando NEW.type y sus propias cuentas/monedas.
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.type IN ('expense', 'transfer') THEN
      UPDATE public.accounts SET balance = balance - NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
    ELSIF NEW.type = 'income' OR (NEW.type = 'adjustment' AND NOT new_is_secondary_adjustment) THEN
      UPDATE public.accounts SET balance = balance + NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
    END IF;
    IF NEW.type = 'transfer' AND NEW.destination_account_id IS NOT NULL THEN
      UPDATE public.accounts SET balance = balance + COALESCE(NEW.destination_amount_in_account_currency, NEW.amount * COALESCE(NEW.exchange_rate, 1))
      WHERE id = NEW.destination_account_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Los resúmenes bimoneda deben usar el mismo crédito persistido que el trigger.
CREATE OR REPLACE FUNCTION get_multicurrency_balances(
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
WITH RECURSIVE multi_accounts AS (
  SELECT
    a.id,
    upper(trim(a.currency)) AS primary_currency,
    upper(trim(COALESCE(a.secondary_currency, ''))) AS secondary_currency
  FROM accounts a
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
    NULL::numeric AS secondary_to_primary_rate,
    false AS is_primary_payment_waterfall,
    NULL::numeric AS primary_inflow_amount,
    NULL::numeric AS primary_to_secondary_rate
  FROM transactions tx
  JOIN multi_accounts ma ON ma.id = tx.account_id
  WHERE tx.user_id = p_user_id
),
destination_entries AS (
  SELECT
    tx.destination_account_id AS account_id,
    tx.transaction_date,
    tx.id AS tx_id,
    upper(trim(tx.currency)) AS tx_currency,
    COALESCE(tx.destination_amount_in_account_currency, abs(tx.amount) * COALESCE(NULLIF(tx.exchange_rate, 0), 1)) AS signed_original_amount,
    COALESCE(tx.destination_amount_in_account_currency, abs(tx.amount) * COALESCE(NULLIF(tx.exchange_rate, 0), 1)) AS signed_primary_fallback,
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
    END AS secondary_to_primary_rate,
    (
      upper(trim(tx.currency)) = ma.primary_currency
      AND COALESCE(tx.exchange_rate, 1) <> 1
    ) AS is_primary_payment_waterfall,
    CASE
      WHEN upper(trim(tx.currency)) = ma.primary_currency
           AND COALESCE(tx.exchange_rate, 1) <> 1
      THEN COALESCE(tx.destination_amount_in_account_currency, abs(tx.amount) * COALESCE(NULLIF(tx.exchange_rate, 0), 1))
      ELSE NULL::numeric
    END AS primary_inflow_amount,
    CASE
      WHEN upper(trim(tx.currency)) = ma.primary_currency
           AND COALESCE(tx.exchange_rate, 1) <> 1
      THEN 1 / COALESCE(NULLIF(tx.exchange_rate, 0), 1)
      ELSE NULL::numeric
    END AS primary_to_secondary_rate
  FROM transactions tx
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
      WHEN oe.is_primary_payment_waterfall THEN
        oe.primary_inflow_amount
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
      WHEN oe.is_primary_payment_waterfall THEN
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
        WHEN oe.is_primary_payment_waterfall THEN
          CASE
            WHEN w.primary_balance < 0 THEN LEAST(oe.primary_inflow_amount, abs(w.primary_balance))
            ELSE 0
          END
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
        WHEN oe.is_primary_payment_waterfall THEN
          (
            oe.primary_inflow_amount -
            CASE
              WHEN w.primary_balance < 0 THEN LEAST(oe.primary_inflow_amount, abs(w.primary_balance))
              ELSE 0
            END
          ) * COALESCE(oe.primary_to_secondary_rate, 1)
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
