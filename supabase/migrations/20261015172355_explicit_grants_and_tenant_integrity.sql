-- Explicit privileges work with both old and new Supabase defaults.
-- All affected tables already have RLS. Guests use the bounded backend API.
-- This migration does not grant schema creation, TRUNCATE, or role membership.
REVOKE ALL ON TABLE public.accounts, public.categories, public.transactions,
  public.recurring_rules, public.budgets, public.investments, public.investment_sales,
  public.portfolio_performance_snapshots, public.bot_sessions, public.exchange_rates,
  public.budget_alerts, public.shared_groups, public.shared_group_members,
  public.shared_expenses, public.shared_expense_splits, public.market_data_cache,
  public.net_worth_snapshots FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts, public.categories,
  public.transactions, public.recurring_rules, public.budgets, public.investments,
  public.shared_groups, public.shared_group_members TO authenticated;
GRANT SELECT ON TABLE public.investment_sales, public.portfolio_performance_snapshots,
  public.exchange_rates, public.budget_alerts, public.shared_expenses,
  public.shared_expense_splits TO authenticated;
GRANT SELECT ON public.v_user_balance_summary, public.v_current_month_expenses TO authenticated;
REVOKE ALL ON public.v_user_balance_summary, public.v_current_month_expenses FROM PUBLIC, anon;

-- Preserve column-level profile grants from security_hardening and its follow-up.
-- Never restore a table-wide SELECT/UPDATE grant that would expose credentials
-- or permit subscription/Telegram identity edits.
REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, telegram_chat_id, telegram_username, telegram_webhook_secret,
  mp_preapproval_id, status, current_period_end, grace_period_end,
  default_currency, timezone, notification_time, daily_summary_enabled,
  weekly_summary_enabled, monthly_summary_enabled, onboarding_done,
  telegram_link_code_expires_at, created_at, updated_at
) ON public.users TO authenticated;
GRANT UPDATE (
  telegram_username, gemini_api_key, telegram_bot_token, telegram_webhook_secret,
  default_currency, timezone, notification_time, daily_summary_enabled,
  weekly_summary_enabled, monthly_summary_enabled, onboarding_done
) ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users, public.accounts,
  public.categories, public.transactions, public.recurring_rules, public.budgets,
  public.investments, public.investment_sales, public.portfolio_performance_snapshots,
  public.bot_sessions, public.exchange_rates, public.budget_alerts,
  public.shared_groups, public.shared_group_members, public.shared_expenses,
  public.shared_expense_splits, public.market_data_cache, public.net_worth_snapshots TO service_role;
GRANT SELECT ON public.v_user_balance_summary, public.v_current_month_expenses TO service_role;

-- The October balance trigger explicitly reverses OLD and applies NEW, including
-- type and source-account changes. The old August restriction is now obsolete.
DROP TRIGGER IF EXISTS trigger_guard_transaction_immutability ON public.transactions;

-- A row-owning RLS predicate alone does not protect references to another
-- tenant's rows: PostgreSQL foreign-key checks bypass RLS. Composite keys bind
-- ownership even for backend calls. Existing data is deliberately not rewritten.
-- NOT VALID enforces new writes immediately; audit existing rows before VALIDATE
-- CONSTRAINT in a separately approved production maintenance operation.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_id_user_unique ON public.accounts(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS investments_id_user_unique ON public.investments(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS shared_members_id_group_unique ON public.shared_group_members(id, group_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.transactions'::regclass AND conname='transactions_account_owner_fk') THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_account_owner_fk
      FOREIGN KEY (account_id,user_id) REFERENCES public.accounts(id,user_id) NOT VALID;
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_destination_owner_fk
      FOREIGN KEY (destination_account_id,user_id) REFERENCES public.accounts(id,user_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.recurring_rules'::regclass AND conname='recurring_account_owner_fk') THEN
    ALTER TABLE public.recurring_rules ADD CONSTRAINT recurring_account_owner_fk
      FOREIGN KEY (account_id,user_id) REFERENCES public.accounts(id,user_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.investments'::regclass AND conname='investments_account_owner_fk') THEN
    ALTER TABLE public.investments ADD CONSTRAINT investments_account_owner_fk
      FOREIGN KEY (account_id,user_id) REFERENCES public.accounts(id,user_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.investment_sales'::regclass AND conname='sales_investment_owner_fk') THEN
    ALTER TABLE public.investment_sales ADD CONSTRAINT sales_investment_owner_fk
      FOREIGN KEY (investment_id,user_id) REFERENCES public.investments(id,user_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.shared_expenses'::regclass AND conname='shared_expenses_payer_group_fk') THEN
    ALTER TABLE public.shared_expenses ADD CONSTRAINT shared_expenses_payer_group_fk
      FOREIGN KEY (paid_by_member_id,group_id) REFERENCES public.shared_group_members(id,group_id) NOT VALID;
  END IF;
END;
$$;

-- Categories may be global system rows or belong to the same owner.
CREATE OR REPLACE FUNCTION public.check_category_ownership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    PERFORM 1 FROM public.categories c
      WHERE c.id=NEW.category_id AND (c.is_system=TRUE OR c.user_id=NEW.user_id)
      FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La categoría no pertenece al usuario.' USING ERRCODE='23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_transaction_category_owner ON public.transactions;
CREATE TRIGGER check_transaction_category_owner BEFORE INSERT OR UPDATE OF user_id,category_id
  ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.check_category_ownership();
DROP TRIGGER IF EXISTS check_recurring_category_owner ON public.recurring_rules;
CREATE TRIGGER check_recurring_category_owner BEFORE INSERT OR UPDATE OF user_id,category_id
  ON public.recurring_rules FOR EACH ROW EXECUTE FUNCTION public.check_category_ownership();
DROP TRIGGER IF EXISTS check_budget_category_owner ON public.budgets;
CREATE TRIGGER check_budget_category_owner BEFORE INSERT OR UPDATE OF user_id,category_id
  ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.check_category_ownership();
REVOKE ALL ON FUNCTION public.check_category_ownership() FROM PUBLIC,anon,authenticated;

-- Only triggers should invoke the privileged Auth synchronization function.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;

-- PostgreSQL NUMERIC accepts NaN; positivity checks alone do not reject it.
CREATE OR REPLACE FUNCTION sell_investment_position(
  p_user_id UUID,
  p_investment_id UUID,
  p_quantity NUMERIC,
  p_price NUMERIC,
  p_currency TEXT,
  p_sold_at DATE,
  p_realized_pnl_native NUMERIC,
  p_realized_pnl_usd NUMERIC,
  p_ars_per_usd NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_inv investments%ROWTYPE;
  v_sale investment_sales%ROWTYPE;
BEGIN
  -- SECURITY DEFINER: no confiar en el caller (mismo criterio que
  -- link_telegram_to_user). Con sesión de usuario (auth.uid() presente) solo
  -- puede operar sobre sus propias posiciones; el service role
  -- (auth.uid() IS NULL) ya autenticó al usuario en la capa API.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_quantity IS NULL OR p_quantity::TEXT IN ('NaN','Infinity','-Infinity') OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;
  IF p_price IS NULL OR p_price::TEXT IN ('NaN','Infinity','-Infinity') OR p_price <= 0 THEN
    RAISE EXCEPTION 'PRECIO_INVALIDO';
  END IF;

  IF p_realized_pnl_native IS NULL OR p_realized_pnl_native::TEXT IN ('NaN','Infinity','-Infinity')
     OR p_realized_pnl_usd IS NULL OR p_realized_pnl_usd::TEXT IN ('NaN','Infinity','-Infinity')
     OR p_ars_per_usd IS NULL OR p_ars_per_usd::TEXT IN ('NaN','Infinity','-Infinity') OR p_ars_per_usd <= 0 THEN
    RAISE EXCEPTION 'VALUACION_INVALIDA';
  END IF;

  -- Decremento atómico: el UPDATE toma lock de fila; si una venta concurrente
  -- ya consumió la cantidad, el WHERE no matchea y NO se inserta la venta.
  -- Tolerancia 1e-9 por polvo de coma flotante (misma que usaba el service).
  UPDATE investments
  SET quantity = CASE WHEN quantity - p_quantity <= 1e-9 THEN 0 ELSE quantity - p_quantity END,
      is_active = CASE WHEN quantity - p_quantity <= 1e-9 THEN FALSE ELSE is_active END,
      updated_at = NOW()
  WHERE id = p_investment_id
    AND user_id = p_user_id
    AND is_active = TRUE
    AND quantity >= p_quantity - 1e-9
  RETURNING * INTO v_inv;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANTIDAD_INSUFICIENTE';
  END IF;

  INSERT INTO investment_sales (
    user_id,
    investment_id,
    quantity,
    price,
    currency,
    sold_at,
    purchase_price_at_sale,
    realized_pnl_native,
    realized_pnl_usd,
    ars_per_usd,
    notes
  ) VALUES (
    p_user_id,
    p_investment_id,
    p_quantity,
    p_price,
    p_currency,
    COALESCE(p_sold_at, CURRENT_DATE),
    v_inv.purchase_price,
    p_realized_pnl_native,
    p_realized_pnl_usd,
    p_ars_per_usd,
    p_notes
  )
  RETURNING * INTO v_sale;

  RETURN jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'remaining_quantity', v_inv.quantity,
    'position_closed', NOT v_inv.is_active
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- NUMERIC accepts NaN and infinities. A positive CHECK alone accepts NaN.
-- Cover all existing application NUMERIC fields, including balances, conversion
-- amounts, quantities, prices, budgets, snapshots, splits and rates. Existing
-- data is not rewritten; audit and validate before a production rollout.
DO $$
DECLARE c record; constraint_name text;
BEGIN
  FOR c IN SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND data_type='numeric'
      AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname='public')
    ORDER BY table_name,column_name
  LOOP
    constraint_name := c.table_name || '_' || c.column_name || '_finite';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid=format('public.%I',c.table_name)::regclass AND conname=constraint_name) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR %I::text NOT IN (''NaN'',''Infinity'',''-Infinity'')) NOT VALID',
        c.table_name,constraint_name,c.column_name,c.column_name);
    END IF;
  END LOOP;
END;
$$;

-- UUID extension commonly lives in extensions on Supabase; a public-only
-- function search_path must use the core UUID generator explicitly.
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
  group_id UUID := pg_catalog.gen_random_uuid();
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


-- Avoid known user/account lock inversion introduced by plan enforcement.
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
  -- Same order as account/transaction plan guards: user before account.
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

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
  -- Same order as account/transaction plan guards: user before account.
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

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
  -- Same order as account/transaction plan guards: user before account.
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

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
