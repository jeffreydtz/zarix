-- Follow-up: freeze Telegram identity columns, revoke leftover RPC,
-- lock is_system on categories, installment ownership, recurring uniqueness,
-- atomic secondary adjust + bulk move, DEFINER search_path.

-- 1. Telegram identity is server-owned ─────────────────────────────────
REVOKE UPDATE ON users FROM anon, authenticated;
GRANT UPDATE (
  telegram_username,
  gemini_api_key,
  telegram_bot_token,
  telegram_webhook_secret,
  default_currency,
  timezone,
  notification_time,
  daily_summary_enabled,
  weekly_summary_enabled,
  monthly_summary_enabled,
  onboarding_done
) ON users TO authenticated;

CREATE OR REPLACE FUNCTION link_telegram_to_user(
  p_user_id UUID,
  p_telegram_chat_id BIGINT
)
RETURNS VOID AS $$
BEGIN
  RAISE EXCEPTION 'link_telegram_to_user was replaced by the one-time link code';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION link_telegram_to_user(UUID, BIGINT) FROM PUBLIC, anon, authenticated;

-- 2. Categories: never mint global is_system rows via PostgREST ────────
DROP POLICY IF EXISTS categories_insert ON categories;
CREATE POLICY categories_insert ON categories
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_system = FALSE);

DROP POLICY IF EXISTS categories_update ON categories;
CREATE POLICY categories_update ON categories
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND is_system = FALSE)
  WITH CHECK (auth.uid() = user_id AND is_system = FALSE);

-- 3. handle_new_user search_path ───────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, default_currency, timezone)
  VALUES (NEW.id, 'ARS', 'America/Argentina/Buenos_Aires')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Installments: ownership + cap + service_role only ─────────────────
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
  v_owner UUID;
BEGIN
  IF p_installments < 2 OR p_installments > 36 THEN
    RAISE EXCEPTION 'Las cuotas tienen que ser entre 2 y 36.';
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
    installment_date := p_start_date + (i - 1) * INTERVAL '1 month';
    this_amount := CASE WHEN i = p_installments
      THEN p_total_amount - base_amount * (p_installments - 1)
      ELSE base_amount
    END;

    INSERT INTO transactions (
      user_id, type, account_id, amount, currency, amount_in_account_currency,
      category_id, description, transaction_date,
      installment_number, installment_total, installment_group_id
    ) VALUES (
      p_user_id, 'expense', p_account_id, this_amount, p_currency, this_amount,
      p_category_id, p_description || ' (' || i || '/' || p_installments || ')',
      installment_date, i, p_installments, group_id
    );
  END LOOP;

  RETURN group_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE ALL ON FUNCTION create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ) TO service_role;

-- 5. Recurring occurrence uniqueness ───────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_occurrence
  ON transactions (user_id, recurring_rule_id, ((timezone('America/Argentina/Buenos_Aires', transaction_date))::date))
  WHERE recurring_rule_id IS NOT NULL;

-- 6. Secondary balance adjust with FOR UPDATE ──────────────────────────
CREATE OR REPLACE FUNCTION create_secondary_balance_adjustment(
  p_user_id UUID,
  p_account_id UUID,
  p_target_secondary NUMERIC
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

  IF NOT (v_account.type = 'credit_card' AND v_account.is_multicurrency AND v_account.secondary_currency IS NOT NULL) THEN
    RAISE EXCEPTION 'La cuenta no es tarjeta bimoneda';
  END IF;

  SELECT COALESCE(secondary_balance, 0) INTO v_current
  FROM get_multicurrency_balances(p_user_id, ARRAY[p_account_id]);

  v_delta := p_target_secondary - COALESCE(v_current, 0);
  IF abs(v_delta) < 1e-8 THEN
    RETURN;
  END IF;

  INSERT INTO transactions (
    user_id, type, account_id, amount, currency,
    amount_in_account_currency, description, transaction_date
  ) VALUES (
    p_user_id, 'adjustment', p_account_id, abs(v_delta), v_account.secondary_currency,
    v_delta, 'Ajuste de saldo moneda secundaria (edición de cuenta)', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION create_secondary_balance_adjustment(UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_secondary_balance_adjustment(UUID, UUID, NUMERIC) TO service_role;

-- 7. Bulk move in one transaction ──────────────────────────────────────
CREATE OR REPLACE FUNCTION bulk_move_transactions(
  p_user_id UUID,
  p_account_id UUID,
  p_rows JSONB
)
RETURNS INTEGER AS $$
DECLARE
  rec JSONB;
  n INTEGER := 0;
BEGIN
  PERFORM 1 FROM accounts WHERE id = p_account_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta no encontrada';
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    UPDATE transactions
    SET
      account_id = p_account_id,
      amount_in_account_currency = (rec->>'amount_in_account_currency')::NUMERIC,
      exchange_rate = NULLIF(rec->>'exchange_rate', '')::NUMERIC
    WHERE id = (rec->>'id')::UUID
      AND user_id = p_user_id
      AND type NOT IN ('transfer', 'adjustment');
    IF FOUND THEN
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE ALL ON FUNCTION bulk_move_transactions(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bulk_move_transactions(UUID, UUID, JSONB) TO service_role;

-- 8. Budget status: include null-category budgets ──────────────────────
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
    COALESCE(c.name, 'Sin categoría'),
    b.amount,
    COALESCE(SUM(t.amount_in_account_currency), 0) AS spent,
    b.amount - COALESCE(SUM(t.amount_in_account_currency), 0) AS remaining,
    ROUND((COALESCE(SUM(t.amount_in_account_currency), 0) / NULLIF(b.amount, 0) * 100)::NUMERIC, 2) AS percent
  FROM budgets b
  LEFT JOIN categories c ON c.id = b.category_id
  LEFT JOIN transactions t ON
    t.user_id = p_user_id
    AND t.type = 'expense'
    AND DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', p_month::TIMESTAMPTZ)
    AND (
      (b.category_id IS NOT NULL AND t.category_id = b.category_id)
      OR (b.category_id IS NULL AND t.category_id IS NULL)
    )
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
$$ LANGUAGE plpgsql SET search_path = public;

-- 9. create_balance_adjustment search_path ─────────────────────────────
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION create_balance_adjustment(UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_balance_adjustment(UUID, UUID, NUMERIC) TO service_role;
