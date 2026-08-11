-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DATA INTEGRITY (2026-08-11)
-- H2  guard de inmutabilidad de transacciones (el trigger de saldo no maneja
--     cambio de tipo ni cambio de cuenta origen en transferencias)
-- H4  ajuste de saldo atómico con FOR UPDATE (evita carrera read-then-write)
-- M1  cuotas: distribuir los centavos del remanente en la última cuota
-- M2  monedas normalizadas (mayúsculas) — evita bugs de match por upper(trim())
-- M3  get_budget_status: excluir cuentas archivadas y no mezclar monedas
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- H2 ── Guard de inmutabilidad ─────────────────────────────────────
-- El trigger update_account_balance() calcula mal el delta ante un cambio de
-- tipo (usa la fórmula del tipo viejo) y no ajusta la cuenta origen cuando una
-- transferencia cambia de account_id. Las rutas web ya bloquean estas ediciones,
-- pero el bot/scripts/import podrían dispararlas y corromper saldos en silencio.
-- Movemos la invariante a la DB con un trigger BEFORE UPDATE (corre antes del
-- trigger de saldo).
CREATE OR REPLACE FUNCTION guard_transaction_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.type <> NEW.type THEN
    RAISE EXCEPTION 'No se permite cambiar el tipo de una transacción (rompe la consistencia del saldo). Borrá y recreá el movimiento.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.type = 'transfer' AND OLD.account_id <> NEW.account_id THEN
    RAISE EXCEPTION 'No se permite cambiar la cuenta origen de una transferencia. Borrá y recreá el movimiento.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_guard_transaction_immutability ON transactions;
CREATE TRIGGER trigger_guard_transaction_immutability
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION guard_transaction_immutability();

-- H4 ── Ajuste de saldo atómico ────────────────────────────────────
-- Reemplaza el read-then-write de transactionsService.createBalanceAdjustment:
-- toma el lock de la fila de la cuenta (FOR UPDATE) y calcula el delta dentro de
-- la misma transacción, serializando ajustes concurrentes (web + bot, doble
-- submit). Espeja exactamente la lógica previa (amount = |delta|, aiac = delta).
CREATE OR REPLACE FUNCTION create_balance_adjustment(
  p_user_id UUID,
  p_account_id UUID,
  p_target_balance NUMERIC
)
RETURNS VOID AS $$
DECLARE
  v_account accounts;
  v_current NUMERIC;
  v_delta NUMERIC;
BEGIN
  SELECT * INTO v_account
  FROM accounts
  WHERE id = p_account_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta no encontrada';
  END IF;

  IF v_account.type = 'credit_card'
     AND v_account.is_multicurrency = TRUE
     AND v_account.secondary_currency IS NOT NULL THEN
    SELECT primary_balance INTO v_current
    FROM get_multicurrency_balances(p_user_id, ARRAY[p_account_id]);
    v_current := COALESCE(v_current, 0);
  ELSE
    v_current := v_account.balance;
  END IF;

  IF p_target_balance IS NULL THEN
    RAISE EXCEPTION 'Saldo inválido';
  END IF;

  v_delta := p_target_balance - v_current;
  IF abs(v_delta) < 1e-8 THEN
    RETURN;
  END IF;

  INSERT INTO transactions (
    user_id, type, account_id, amount, currency,
    amount_in_account_currency, description, transaction_date
  ) VALUES (
    p_user_id, 'adjustment', p_account_id, abs(v_delta), v_account.currency,
    v_delta, 'Ajuste de saldo (edición de cuenta)', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION create_balance_adjustment(UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_balance_adjustment(UUID, UUID, NUMERIC) TO service_role;

-- M1 ── Cuotas: repartir el remanente de centavos ──────────────────
CREATE OR REPLACE FUNCTION create_installment_transactions(
  p_user_id UUID,
  p_account_id UUID,
  p_total_amount NUMERIC,
  p_currency TEXT,
  p_installments INTEGER,
  p_category_id UUID,
  p_description TEXT,
  p_start_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID AS $$
DECLARE
  group_id UUID := uuid_generate_v4();
  base_amount NUMERIC;
  this_amount NUMERIC;
  installment_date TIMESTAMPTZ;
  i INTEGER;
BEGIN
  -- Base redondeada a 2 decimales; la última cuota absorbe el remanente para
  -- que la suma de las cuotas sea EXACTAMENTE p_total_amount (100/3 => 33.33,
  -- 33.33, 33.34 en vez de 3 × 33.333333).
  base_amount := round(p_total_amount / p_installments, 2);

  FOR i IN 1..p_installments LOOP
    installment_date := p_start_date + (i - 1) * INTERVAL '1 month';

    IF i = p_installments THEN
      this_amount := p_total_amount - base_amount * (p_installments - 1);
    ELSE
      this_amount := base_amount;
    END IF;

    INSERT INTO transactions (
      user_id, type, account_id, amount, currency,
      amount_in_account_currency, category_id, description,
      transaction_date, installment_number, installment_total, installment_group_id
    ) VALUES (
      p_user_id, 'expense', p_account_id, this_amount, p_currency,
      this_amount, p_category_id,
      p_description || ' (' || i || '/' || p_installments || ')',
      installment_date, i, p_installments, group_id
    );
  END LOOP;

  RETURN group_id;
END;
$$ LANGUAGE plpgsql;

-- M2 ── Monedas normalizadas ───────────────────────────────────────
-- No fijamos una whitelist cerrada (hay cuentas cripto: BTC, etc.). Forzamos la
-- forma normalizada en mayúsculas para eliminar los mismatches por upper(trim().
ALTER TABLE accounts
  ADD CONSTRAINT accounts_currency_upper CHECK (currency = upper(currency)),
  ADD CONSTRAINT accounts_secondary_currency_upper
    CHECK (secondary_currency IS NULL OR secondary_currency = upper(secondary_currency));
ALTER TABLE transactions
  ADD CONSTRAINT transactions_currency_upper CHECK (currency = upper(currency));
ALTER TABLE budgets
  ADD CONSTRAINT budgets_currency_upper CHECK (currency = upper(currency));

-- M3 ── get_budget_status: cuentas activas + sin mezcla de monedas ──
-- Antes: sumaba amount_in_account_currency (moneda de cada cuenta) contra un
-- presupuesto con su propia moneda (un gasto de 100 USD contaba como 100 en un
-- presupuesto ARS) e incluía cuentas archivadas. Ahora solo cuenta gastos de
-- cuentas activas cuya moneda coincide con la del presupuesto (aiac ya está en
-- esa moneda). Es una simplificación honesta: no mezcla monedas.
CREATE OR REPLACE FUNCTION get_budget_status(
  p_user_id UUID,
  p_month DATE DEFAULT date_trunc('month', NOW())::DATE
)
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
  budget_amount NUMERIC,
  spent_amount NUMERIC,
  remaining_amount NUMERIC,
  percent_used NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.category_id,
    c.name,
    b.amount,
    COALESCE(SUM(t.amount_in_account_currency), 0) AS spent,
    b.amount - COALESCE(SUM(t.amount_in_account_currency), 0) AS remaining,
    ROUND((COALESCE(SUM(t.amount_in_account_currency), 0) / NULLIF(b.amount, 0) * 100)::NUMERIC, 2) AS percent
  FROM budgets b
  JOIN categories c ON c.id = b.category_id
  LEFT JOIN transactions t ON
    t.category_id = b.category_id
    AND t.user_id = p_user_id
    AND t.type = 'expense'
    AND DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', p_month::TIMESTAMPTZ)
    AND EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = t.account_id
        AND a.user_id = p_user_id
        AND a.is_active = TRUE
        AND upper(trim(a.currency)) = upper(trim(b.currency))
    )
  WHERE b.user_id = p_user_id AND b.month = p_month
  GROUP BY b.category_id, c.name, b.amount;
END;
$$ LANGUAGE plpgsql;
