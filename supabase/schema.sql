-- GENERATED fresh-install schema: reconstructed baseline + all migrations.
-- Regenerate: node scripts/test-isolated-schema-mirror.mjs --write
-- Empty isolated database only. Do not apply this concatenation to production.
-- Existing deployments apply only outstanding timestamped migrations.

-- BEGIN supabase/baselines/pre_20260401_fresh_install.sql
-- SHA256 6e14e39f1964ab96c5b0ba192a7390823b7a3ddc38c63598a1e5ad0c55244247
-- RECONSTRUCTED FRESH-INSTALL BASELINE, not a historical production dump.
-- Derived from PR12 commit ed894431968775dba1d9ba01df99d9a442407865 schema.sql
-- SHA256 01255724ef94aced4836bf074d9e6abc571aaa640d25d41705433e91123be9f5.
-- Core tables and portfolio snapshots have no creation migration in the repo.
-- This file supplies them BEFORE every timestamped migration is run, unchanged,
-- in lexicographic order. investment_sales and shared-expense objects are omitted
-- because their historical migrations create them. Later IF NOT EXISTS columns
-- remain from the snapshot. Do not apply this baseline to an existing database.
-- It does not assert or repair any remote migration-history state.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para búsqueda full-text rápida

-- Estado de suscripción del producto SaaS (feature flags de acceso).
CREATE TYPE subscription_status AS ENUM (
  'ACTIVE',
  'GRACE_PERIOD',
  'PAST_DUE',
  'CANCELED'
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. USERS (extend Supabase Auth)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT UNIQUE,
  telegram_username TEXT,
  gemini_api_key TEXT,
  telegram_bot_token TEXT,
  telegram_webhook_secret TEXT,
  mp_preapproval_id TEXT,
  status subscription_status NOT NULL DEFAULT 'ACTIVE',
  current_period_end TIMESTAMPTZ,
  grace_period_end TIMESTAMPTZ,
  default_currency TEXT NOT NULL DEFAULT 'ARS',
  timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  notification_time TIME DEFAULT '22:00:00',
  daily_summary_enabled BOOLEAN DEFAULT TRUE,
  weekly_summary_enabled BOOLEAN DEFAULT TRUE,
  monthly_summary_enabled BOOLEAN DEFAULT TRUE,
  onboarding_done BOOLEAN NOT NULL DEFAULT FALSE,
  -- Vinculación de Telegram con prueba de posesión (código de un solo uso).
  -- Ver migración 20260811120000_security_hardening.sql.
  telegram_link_code TEXT,
  telegram_link_code_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_telegram ON users(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE UNIQUE INDEX idx_users_mp_preapproval_id ON users(mp_preapproval_id)
  WHERE mp_preapproval_id IS NOT NULL;
CREATE INDEX idx_users_subscription_status ON users(status);
CREATE INDEX idx_users_grace_period_end ON users(grace_period_end)
  WHERE status = 'GRACE_PERIOD';

CREATE UNIQUE INDEX idx_users_telegram_webhook_secret ON users(telegram_webhook_secret)
  WHERE telegram_webhook_secret IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. ACCOUNTS (cuentas — el core de la app)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TYPE account_type AS ENUM (
  'cash',            -- Efectivo
  'bank',            -- Banco
  'credit_card',     -- Tarjeta de crédito
  'investment',      -- Cuenta de inversiones
  'crypto',          -- Wallet crypto
  'digital_wallet',  -- Mercado Pago, Wise, Payoneer
  'other'
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type account_type NOT NULL DEFAULT 'bank',
  currency TEXT NOT NULL DEFAULT 'ARS',
  balance NUMERIC(20, 8) NOT NULL DEFAULT 0,
  icon TEXT,
  color TEXT DEFAULT '#3B82F6',
  is_debt BOOLEAN DEFAULT FALSE,
  include_in_total BOOLEAN DEFAULT TRUE,
  include_in_liquid BOOLEAN NOT NULL DEFAULT TRUE,
  min_balance NUMERIC(20, 8),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Campos específicos para tarjetas de crédito
  credit_limit NUMERIC(20, 8),
  closing_day INTEGER CHECK (closing_day >= 1 AND closing_day <= 31),
  due_day INTEGER CHECK (due_day >= 1 AND due_day <= 31),
  last_4_digits TEXT CHECK (length(last_4_digits) = 4),
  
  -- Soporte para tarjetas bi-moneda (ej: Visa que acepta ARS y USD)
  is_multicurrency BOOLEAN DEFAULT FALSE,
  secondary_currency TEXT, -- ej: 'USD' si la principal es ARS
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_user ON accounts(user_id, is_active, sort_order);
CREATE INDEX idx_accounts_currency ON accounts(currency) WHERE is_active = TRUE;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. CATEGORIES (categorías de gasto/ingreso)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TYPE category_type AS ENUM ('expense', 'income');

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type category_type NOT NULL,
  icon TEXT NOT NULL DEFAULT '🔁',
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_user ON categories(user_id, type);
CREATE INDEX idx_categories_parent ON categories(parent_id) WHERE parent_id IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. TRANSACTIONS (transacciones — el corazón del sistema)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TYPE transaction_type AS ENUM (
  'expense',      -- Gasto
  'income',       -- Ingreso
  'transfer',     -- Transferencia entre cuentas propias
  'adjustment'    -- Ajuste manual de saldo
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  destination_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(20, 8) NOT NULL,
  currency TEXT NOT NULL,
  amount_in_account_currency NUMERIC(20, 8) NOT NULL,
  exchange_rate NUMERIC(20, 8),
  destination_amount_in_account_currency NUMERIC(20, 8) CHECK (destination_amount_in_account_currency > 0),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  notes TEXT,
  tags TEXT[],
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  receipt_url TEXT,
  location JSONB,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_rule_id UUID,
  installment_number INTEGER,
  installment_total INTEGER,
  installment_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT positive_amount CHECK (amount > 0),
  CONSTRAINT valid_transfer CHECK (
    type != 'transfer' OR destination_account_id IS NOT NULL
  ),
  CONSTRAINT valid_installment CHECK (
    installment_number IS NULL OR 
    (installment_number > 0 AND installment_number <= installment_total)
  )
);

-- Índices compuestos para queries típicos
CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_account ON transactions(account_id, transaction_date DESC);
CREATE INDEX idx_transactions_category ON transactions(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_transactions_installment_group ON transactions(installment_group_id) 
  WHERE installment_group_id IS NOT NULL;
CREATE INDEX idx_transactions_tags ON transactions USING gin(tags);
CREATE INDEX idx_transactions_search ON transactions USING gin(to_tsvector('spanish', description));
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date_desc
  ON transactions (user_id, type, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_account_date_desc
  ON transactions (user_id, account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_destination_date_desc
  ON transactions (user_id, destination_account_id, transaction_date DESC)
  WHERE destination_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_user_description_trgm
  ON transactions USING gin ((COALESCE(description, '')) gin_trgm_ops);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. RECURRING RULES (reglas de recurrencia)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TYPE recurrence_frequency AS ENUM ('daily', 'weekly', 'monthly', 'yearly');

CREATE TABLE recurring_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  amount NUMERIC(20, 8) NOT NULL,
  currency TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  is_subscription BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_name TEXT,
  subscription_plan TEXT,
  notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  frequency recurrence_frequency NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  last_executed_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recurring_user ON recurring_rules(user_id, is_active);
CREATE INDEX idx_recurring_subscriptions ON recurring_rules(user_id, is_subscription, is_active);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. BUDGETS (presupuestos mensuales)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  amount NUMERIC(20, 8) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS',
  rollover_enabled BOOLEAN DEFAULT FALSE,
  rollover_amount NUMERIC(20, 8) DEFAULT 0,
  alert_at_percent INTEGER DEFAULT 80,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_budget_per_category_month UNIQUE(user_id, category_id, month),
  CONSTRAINT positive_amount CHECK (amount > 0),
  CONSTRAINT valid_alert CHECK (alert_at_percent > 0 AND alert_at_percent <= 100)
);

CREATE INDEX idx_budgets_user_month ON budgets(user_id, month DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. INVESTMENTS (inversiones y posiciones)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TYPE investment_type AS ENUM (
  'stock_arg',      -- Acción argentina (MERVAL)
  'cedear',         -- CEDEAR
  'stock_us',       -- Acción USA
  'etf',            -- ETF
  'crypto',         -- Crypto
  'plazo_fijo',     -- Plazo fijo
  'fci',            -- Fondo Común de Inversión
  'bond',           -- Bono
  'caucion',        -- Caución
  'real_estate',    -- Inmueble
  'other'
);

CREATE TABLE investments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  type investment_type NOT NULL,
  ticker TEXT,
  name TEXT NOT NULL,
  quantity NUMERIC(20, 8) NOT NULL,
  purchase_price NUMERIC(20, 8) NOT NULL,
  purchase_currency TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  current_price NUMERIC(20, 8),
  current_price_updated_at TIMESTAMPTZ,
  current_price_change_pct NUMERIC(10, 4),
  -- Override de moneda de cotización (USD/ARS). NULL = default por tipo.
  market_currency TEXT,
  -- Si TRUE, el precio actual lo carga el usuario a mano y no se refresca desde la API.
  is_manual_price BOOLEAN NOT NULL DEFAULT FALSE,
  maturity_date DATE,
  interest_rate NUMERIC(8, 4),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- >= 0: el cierre total de posición deja quantity = 0 (ver migración 20260702120000)
  CONSTRAINT positive_quantity CHECK (quantity >= 0),
  CONSTRAINT positive_price CHECK (purchase_price > 0)
);

CREATE INDEX idx_investments_user ON investments(user_id, is_active);
CREATE INDEX idx_investments_account ON investments(account_id);
CREATE INDEX idx_investments_type ON investments(type, is_active);
CREATE INDEX idx_investments_ticker ON investments(ticker) WHERE ticker IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7b. PORTFOLIO PERFORMANCE SNAPSHOTS (ROI / PnL diario, USD + blue)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE portfolio_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  cost_basis_usd NUMERIC(20, 8) NOT NULL,
  market_value_usd NUMERIC(20, 8) NOT NULL,
  unrealized_pnl_usd NUMERIC(20, 8) NOT NULL,
  roi_percent NUMERIC(14, 6) NOT NULL,
  blue_ars_per_usd NUMERIC(20, 8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portfolio_snapshots_user_day UNIQUE (user_id, snapshot_date)
);

CREATE INDEX idx_portfolio_snapshots_user_day ON portfolio_performance_snapshots(user_id, snapshot_date DESC);

ALTER TABLE portfolio_performance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY portfolio_performance_snapshots_all
  ON portfolio_performance_snapshots
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. BOT SESSIONS (sales are created by the 20260526130000 migration)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE bot_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT NOT NULL,
  context JSONB NOT NULL DEFAULT '[]',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bot_sessions_user ON bot_sessions(user_id, last_message_at DESC);
CREATE INDEX idx_bot_sessions_telegram ON bot_sessions(telegram_chat_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. EXCHANGE RATES (histórico de cotizaciones)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL DEFAULT 'ARS',
  rate NUMERIC(20, 8) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_rate_per_timestamp UNIQUE(source, from_currency, to_currency, timestamp)
);

CREATE INDEX idx_exchange_rates_lookup ON exchange_rates(
  from_currency, to_currency, timestamp DESC
);
CREATE INDEX idx_exchange_rates_timestamp ON exchange_rates(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_source_pair_timestamp_desc
  ON exchange_rates (source, from_currency, to_currency, timestamp DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 10. BUDGET ALERTS (registro de alertas enviadas)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE budget_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  percent_reached INTEGER NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budget_alerts_budget ON budget_alerts(budget_id, sent_at DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TRIGGERS — AUTO UPDATE timestamps
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para crear usuario automáticamente en signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, default_currency, timezone)
  VALUES (
    NEW.id,
    'ARS',
    'America/Argentina/Buenos_Aires'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_investments_updated_at BEFORE UPDATE ON investments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FUNCTION — Actualizar saldo de cuenta al insertar/actualizar transacción
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_account_balance();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ROW LEVEL SECURITY (RLS) — Seguridad por usuario
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;

-- Users: solo puede ver y editar su propio perfil
CREATE POLICY users_select ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY users_update ON users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND status = (SELECT u.status FROM users u WHERE u.id = auth.uid())
    AND mp_preapproval_id IS NOT DISTINCT FROM (
      SELECT u.mp_preapproval_id FROM users u WHERE u.id = auth.uid()
    )
    AND current_period_end IS NOT DISTINCT FROM (
      SELECT u.current_period_end FROM users u WHERE u.id = auth.uid()
    )
    AND grace_period_end IS NOT DISTINCT FROM (
      SELECT u.grace_period_end FROM users u WHERE u.id = auth.uid()
    )
  );

-- Accounts: solo sus propias cuentas (TO authenticated; anon sin política = sin acceso)
CREATE POLICY accounts_select_own ON accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY accounts_insert_own ON accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY accounts_update_own ON accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY accounts_delete_own ON accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Categories: sistema (is_system=true) son visibles para todos, custom solo para owner
CREATE POLICY categories_select ON categories FOR SELECT USING (
  is_system = TRUE OR auth.uid() = user_id
);
CREATE POLICY categories_insert ON categories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_system = FALSE);
CREATE POLICY categories_update ON categories FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND is_system = FALSE)
  WITH CHECK (auth.uid() = user_id AND is_system = FALSE);
CREATE POLICY categories_delete ON categories FOR DELETE USING (auth.uid() = user_id);

-- Transactions: solo las propias
CREATE POLICY transactions_all ON transactions FOR ALL USING (auth.uid() = user_id);

-- Recurring rules: solo las propias
CREATE POLICY recurring_rules_all ON recurring_rules FOR ALL USING (auth.uid() = user_id);

-- Budgets: solo los propios
CREATE POLICY budgets_all ON budgets FOR ALL USING (auth.uid() = user_id);

-- Budget alerts: solo filas ligadas a presupuestos del usuario
CREATE POLICY budget_alerts_all ON budget_alerts FOR ALL USING (
  EXISTS (SELECT 1 FROM budgets b WHERE b.id = budget_alerts.budget_id AND b.user_id = auth.uid())
);

-- Investments: solo las propias
CREATE POLICY investments_all ON investments FOR ALL USING (auth.uid() = user_id);

-- Bot sessions: solo las propias
CREATE POLICY bot_sessions_all ON bot_sessions FOR ALL USING (auth.uid() = user_id);

-- Exchange rates: lectura para authenticated; escritura SOLO service_role
-- (fix rate poisoning — antes el INSERT estaba abierto a anon/authenticated).
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY exchange_rates_select ON exchange_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY exchange_rates_insert ON exchange_rates FOR INSERT TO service_role WITH CHECK (true);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SEED DATA — Categorías del sistema (argentinas)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSERT INTO categories (id, user_id, name, type, icon, is_system) VALUES
-- GASTOS
(uuid_generate_v4(), NULL, 'Comida', 'expense', '🍔', TRUE),
(uuid_generate_v4(), NULL, 'Transporte', 'expense', '🚗', TRUE),
(uuid_generate_v4(), NULL, 'Hogar', 'expense', '🏠', TRUE),
(uuid_generate_v4(), NULL, 'Salud', 'expense', '💊', TRUE),
(uuid_generate_v4(), NULL, 'Ocio', 'expense', '🎮', TRUE),
(uuid_generate_v4(), NULL, 'Suscripciones', 'expense', '📱', TRUE),
(uuid_generate_v4(), NULL, 'Ropa', 'expense', '👕', TRUE),
(uuid_generate_v4(), NULL, 'Educación', 'expense', '📚', TRUE),
(uuid_generate_v4(), NULL, 'Trabajo', 'expense', '💼', TRUE),
(uuid_generate_v4(), NULL, 'Viajes', 'expense', '✈️', TRUE),
(uuid_generate_v4(), NULL, 'Mascotas', 'expense', '🐾', TRUE),
(uuid_generate_v4(), NULL, 'Regalos', 'expense', '🎁', TRUE),
(uuid_generate_v4(), NULL, 'Impuestos', 'expense', '💸', TRUE),
(uuid_generate_v4(), NULL, 'Mantenimiento', 'expense', '🔧', TRUE),
(uuid_generate_v4(), NULL, 'Salidas', 'expense', '🍺', TRUE),
(uuid_generate_v4(), NULL, 'Deporte', 'expense', '🏋️', TRUE),
(uuid_generate_v4(), NULL, 'Otros', 'expense', '🔁', TRUE),

-- INGRESOS
(uuid_generate_v4(), NULL, 'Sueldo', 'income', '💼', TRUE),
(uuid_generate_v4(), NULL, 'Freelance', 'income', '💻', TRUE),
(uuid_generate_v4(), NULL, 'Inversiones', 'income', '📈', TRUE),
(uuid_generate_v4(), NULL, 'Alquiler', 'income', '🏘️', TRUE),
(uuid_generate_v4(), NULL, 'Regalo', 'income', '🎁', TRUE),
(uuid_generate_v4(), NULL, 'Reembolso', 'income', '🔄', TRUE),
(uuid_generate_v4(), NULL, 'Venta', 'income', '💰', TRUE),
(uuid_generate_v4(), NULL, 'Otros', 'income', '🔁', TRUE);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- VIEWS — Queries complejos optimizados
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Vista de saldos totales por usuario (con conversión a ARS blue y USD)
-- security_invoker: evalúa con permisos del usuario que consulta (RLS en tablas base)
CREATE OR REPLACE VIEW v_user_balance_summary
WITH (security_invoker = true)
AS
WITH latest_rates AS (
  SELECT DISTINCT ON (from_currency, to_currency)
    from_currency,
    to_currency,
    rate,
    source
  FROM exchange_rates
  WHERE source IN ('blue', 'oficial', 'coingecko')
  ORDER BY from_currency, to_currency, timestamp DESC
),
blue_rate AS (
  SELECT rate FROM latest_rates 
  WHERE from_currency = 'USD' AND to_currency = 'ARS' AND source = 'blue'
  LIMIT 1
)
SELECT
  a.user_id,
  COUNT(a.id) AS total_accounts,
  SUM(CASE WHEN a.include_in_total THEN a.balance ELSE 0 END) AS total_balance_native,
  SUM(
    CASE
      WHEN NOT a.include_in_total THEN 0
      WHEN a.currency = 'ARS' THEN a.balance / COALESCE((SELECT rate FROM blue_rate), 1300)
      WHEN a.currency = 'USD' THEN a.balance
      ELSE a.balance * COALESCE(lr.rate, 1)
    END
  ) AS total_balance_usd,
  SUM(
    CASE
      WHEN NOT a.include_in_total THEN 0
      WHEN a.currency = 'ARS' THEN a.balance
      WHEN a.currency = 'USD' THEN a.balance * COALESCE((SELECT rate FROM blue_rate), 1300)
      ELSE a.balance * COALESCE(lr.rate, 1) * COALESCE((SELECT rate FROM blue_rate), 1300)
    END
  ) AS total_balance_ars_blue
FROM accounts a
LEFT JOIN latest_rates lr ON lr.from_currency = a.currency AND lr.to_currency = 'USD'
WHERE a.is_active = TRUE
GROUP BY a.user_id;

-- Vista de gastos por categoría (mes actual)
CREATE OR REPLACE VIEW v_current_month_expenses
WITH (security_invoker = true)
AS
SELECT
  t.user_id,
  c.name AS category_name,
  c.icon AS category_icon,
  COUNT(t.id) AS transaction_count,
  SUM(t.amount_in_account_currency) AS total_amount,
  t.currency
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE
  t.type = 'expense'
  AND t.transaction_date >= date_trunc('month', NOW())
  AND t.transaction_date < date_trunc('month', NOW()) + INTERVAL '1 month'
GROUP BY t.user_id, c.name, c.icon, t.currency;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FUNCTIONS — Business Logic en DB (mejor performance)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Crear transacción en cuotas (genera N transacciones futuras)
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
  installment_amount NUMERIC;
  installment_date TIMESTAMPTZ;
  i INTEGER;
BEGIN
  installment_amount := p_total_amount / p_installments;
  
  FOR i IN 1..p_installments LOOP
    installment_date := p_start_date + (i - 1) * INTERVAL '1 month';
    
    INSERT INTO transactions (
      user_id,
      type,
      account_id,
      amount,
      currency,
      amount_in_account_currency,
      category_id,
      description,
      transaction_date,
      installment_number,
      installment_total,
      installment_group_id
    ) VALUES (
      p_user_id,
      'expense',
      p_account_id,
      installment_amount,
      p_currency,
      installment_amount,
      p_category_id,
      p_description || ' (' || i || '/' || p_installments || ')',
      installment_date,
      i,
      p_installments,
      group_id
    );
  END LOOP;
  
  RETURN group_id;
END;
$$ LANGUAGE plpgsql;

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

CREATE OR REPLACE FUNCTION analytics_category_breakdown(
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
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
JOIN accounts a ON a.id = t.account_id
LEFT JOIN accounts da ON da.id = t.destination_account_id
WHERE t.user_id = p_user_id
  AND t.type = p_type
  AND t.transaction_date >= p_start
  AND t.transaction_date <= p_end
  AND a.is_active = true
  AND (t.destination_account_id IS NULL OR da.is_active = true)
GROUP BY t.category_id, COALESCE(c.name, 'Sin categoría'), COALESCE(c.icon, '❓')
ORDER BY amount DESC;
$$;

CREATE OR REPLACE FUNCTION analytics_monthly_trend(
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
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts da ON da.id = t.destination_account_id
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

CREATE OR REPLACE FUNCTION analytics_daily_trend(
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
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts da ON da.id = t.destination_account_id
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

CREATE OR REPLACE FUNCTION analytics_account_breakdown(
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
FROM transactions t
LEFT JOIN accounts a ON a.id = t.account_id
LEFT JOIN accounts da ON da.id = t.destination_account_id
WHERE t.user_id = p_user_id
  AND t.type = 'expense'
  AND t.transaction_date >= p_start
  AND t.transaction_date <= p_end
  AND a.is_active = true
  AND (t.destination_account_id IS NULL OR da.is_active = true)
GROUP BY COALESCE(a.name, 'Sin cuenta'), COALESCE(a.icon, '💳'), COALESCE(a.color, '#6B7280')
ORDER BY amount DESC;
$$;

CREATE OR REPLACE FUNCTION analytics_top_expenses(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_limit integer DEFAULT 10
)
RETURNS SETOF transactions
LANGUAGE sql
STABLE
AS $$
SELECT t.*
FROM transactions t
JOIN accounts a ON a.id = t.account_id
LEFT JOIN accounts da ON da.id = t.destination_account_id
WHERE t.user_id = p_user_id
  AND t.type = 'expense'
  AND t.transaction_date >= p_start
  AND t.transaction_date <= p_end
  AND a.is_active = true
  AND (t.destination_account_id IS NULL OR da.is_active = true)
ORDER BY t.amount_in_account_currency DESC
LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

-- Obtener gasto vs presupuesto del mes actual
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
    ROUND((COALESCE(SUM(t.amount_in_account_currency), 0) / b.amount * 100)::NUMERIC, 2) AS percent
  FROM budgets b
  JOIN categories c ON c.id = b.category_id
  LEFT JOIN transactions t ON
    t.category_id = b.category_id
    AND t.user_id = p_user_id
    AND t.type = 'expense'
    AND DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', p_month::TIMESTAMPTZ)
  WHERE b.user_id = p_user_id AND b.month = p_month
  GROUP BY b.category_id, c.name, b.amount;
END;
$$ LANGUAGE plpgsql;

-- Vincular Telegram a usuario
CREATE OR REPLACE FUNCTION link_telegram_to_user(
  p_user_id UUID,
  p_telegram_chat_id BIGINT
)
RETURNS VOID AS $$
BEGIN
  -- SECURITY DEFINER: no confiar en el caller. Se vincula SIEMPRE al
  -- usuario autenticado (auth.uid()); p_user_id se ignora salvo para
  -- rechazar un intento de vincular a otra cuenta.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE users
  SET telegram_chat_id = p_telegram_chat_id
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION link_telegram_to_user(UUID, BIGINT) FROM PUBLIC, anon, authenticated;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- END supabase/baselines/pre_20260401_fresh_install.sql

-- BEGIN supabase/migrations/20260401120000_handle_new_user_idempotent.sql
-- SHA256 2626bb5155eec3e53c08679ca820a9d894e3ab1a607de61c2c959275cb618f60
-- Idempotent profile row: safe if trigger runs twice or row pre-exists
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, default_currency, timezone)
  VALUES (
    NEW.id,
    'ARS',
    'America/Argentina/Buenos_Aires'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- END supabase/migrations/20260401120000_handle_new_user_idempotent.sql

-- BEGIN supabase/migrations/20260401140000_user_integrations_gemini_telegram.sql
-- SHA256 bb59ae6a70d129f60b23e3127c6e8ce6dcac7f3361e104147ebb8cc30347787a
-- Per-user Gemini API key and optional own Telegram bot (webhook path slug)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT,
  ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT,
  ADD COLUMN IF NOT EXISTS telegram_webhook_secret TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_webhook_secret
  ON public.users (telegram_webhook_secret)
  WHERE telegram_webhook_secret IS NOT NULL;

COMMENT ON COLUMN public.users.gemini_api_key IS 'User Google AI Studio key; falls back to GEMINI_API_KEY env when null';
COMMENT ON COLUMN public.users.telegram_bot_token IS 'Optional BotFather token; null = shared TELEGRAM_BOT_TOKEN';
COMMENT ON COLUMN public.users.telegram_webhook_secret IS 'Opaque slug for /api/telegram/webhook/u/:secret';
-- END supabase/migrations/20260401140000_user_integrations_gemini_telegram.sql

-- BEGIN supabase/migrations/20260401160000_market_data_cache.sql
-- SHA256 deb96d28ce4fa2a872a4b63fe4989969569891fe8a1778421d01e145ef45dee6
-- Caché global de cotizaciones mercado (una fila) para mostrar última data conocida si Yahoo falla.
CREATE TABLE IF NOT EXISTS market_data_cache (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE market_data_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE market_data_cache IS 'Snapshot JSON de mercados (crypto, acciones US/AR); solo service role.';
-- END supabase/migrations/20260401160000_market_data_cache.sql

-- BEGIN supabase/migrations/20260401180000_fix_balance_trigger_delete_adjustment.sql
-- SHA256 6e463be41204208d98de62934865dcecd592a0a0bfc97989fe7b14136a919390
-- Al borrar un movimiento tipo adjustment el trigger no revertía el saldo (solo INSERT estaba cubierto).
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  amount_delta NUMERIC(20, 8);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'expense' THEN
      UPDATE accounts SET balance = balance + OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
    ELSIF OLD.type = 'income' THEN
      UPDATE accounts SET balance = balance - OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
    ELSIF OLD.type = 'transfer' THEN
      UPDATE accounts SET balance = balance + OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
      IF OLD.destination_account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance - (OLD.amount * COALESCE(OLD.exchange_rate, 1))
        WHERE id = OLD.destination_account_id;
      END IF;
    ELSIF OLD.type = 'adjustment' THEN
      UPDATE accounts SET balance = balance - OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.type = 'expense' THEN
      amount_delta = OLD.amount_in_account_currency - NEW.amount_in_account_currency;
    ELSIF OLD.type = 'income' THEN
      amount_delta = NEW.amount_in_account_currency - OLD.amount_in_account_currency;
    ELSIF OLD.type = 'transfer' THEN
      amount_delta = OLD.amount_in_account_currency - NEW.amount_in_account_currency;
    ELSE
      amount_delta = NEW.amount_in_account_currency - OLD.amount_in_account_currency;
    END IF;

    IF OLD.account_id != NEW.account_id THEN
      IF OLD.type = 'expense' THEN
        UPDATE accounts SET balance = balance + OLD.amount_in_account_currency WHERE id = OLD.account_id;
        UPDATE accounts SET balance = balance - NEW.amount_in_account_currency WHERE id = NEW.account_id;
      ELSIF OLD.type = 'income' THEN
        UPDATE accounts SET balance = balance - OLD.amount_in_account_currency WHERE id = OLD.account_id;
        UPDATE accounts SET balance = balance + NEW.amount_in_account_currency WHERE id = NEW.account_id;
      END IF;
    ELSE
      UPDATE accounts SET balance = balance + amount_delta WHERE id = NEW.account_id;
    END IF;

    IF OLD.type = 'transfer' AND OLD.destination_account_id IS NOT NULL THEN
      UPDATE accounts SET balance = balance - (OLD.amount * COALESCE(OLD.exchange_rate, 1))
      WHERE id = OLD.destination_account_id;
    END IF;
    IF NEW.type = 'transfer' AND NEW.destination_account_id IS NOT NULL THEN
      UPDATE accounts SET balance = balance + (NEW.amount * COALESCE(NEW.exchange_rate, 1))
      WHERE id = NEW.destination_account_id;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'expense' THEN
      UPDATE accounts SET balance = balance - NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
    ELSIF NEW.type = 'income' THEN
      UPDATE accounts SET balance = balance + NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
    ELSIF NEW.type = 'transfer' THEN
      UPDATE accounts SET balance = balance - NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
      IF NEW.destination_account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance + (NEW.amount * COALESCE(NEW.exchange_rate, 1))
        WHERE id = NEW.destination_account_id;
      END IF;
    ELSIF NEW.type = 'adjustment' THEN
      UPDATE accounts SET balance = balance + NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
-- END supabase/migrations/20260401180000_fix_balance_trigger_delete_adjustment.sql

-- BEGIN supabase/migrations/20260406120000_accounts_include_in_liquid.sql
-- SHA256 8dbcc109b97aaec39bb4c13d9169324dac7d33ce1cac5d843cc48878d532b121
-- Cuentas pueden excluirse del patrimonio líquido (siguen sumando al total).
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS include_in_liquid BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN accounts.include_in_liquid IS
  'Si false, no suma a liquidez en agregados; sigue en patrimonio total. Ignorado para type=investment (van al bucket inversiones).';
-- END supabase/migrations/20260406120000_accounts_include_in_liquid.sql

-- BEGIN supabase/migrations/20260429124500_performance_indexes_rpc_aggregates.sql
-- SHA256 07b6905b834b3331266a2555cfb666cba2590d28d1de8a549ff341066935eaf8
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
-- END supabase/migrations/20260429124500_performance_indexes_rpc_aggregates.sql

-- BEGIN supabase/migrations/20260504104000_multicurrency_usd_payment_waterfall.sql
-- SHA256 a1d04d791d82177b57764e23ccaa2545cea0a015847e8c8f5a4486f426ff64d9
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
WITH RECURSIVE multi_accounts AS (
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
-- END supabase/migrations/20260504104000_multicurrency_usd_payment_waterfall.sql

-- BEGIN supabase/migrations/20260504105800_secondary_adjustment_no_primary_impact.sql
-- SHA256 4f9f2bbbb06577c3cb0f55922db6b81baa41124a79450ccec372294a9a1fd480
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  amount_delta NUMERIC(20, 8);
  old_is_secondary_adjustment BOOLEAN := FALSE;
  new_is_secondary_adjustment BOOLEAN := FALSE;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.type = 'adjustment' THEN
    SELECT COALESCE(
      a.type = 'credit_card'
      AND a.is_multicurrency = true
      AND a.secondary_currency IS NOT NULL
      AND upper(trim(COALESCE(OLD.currency, ''))) = upper(trim(a.secondary_currency)),
      FALSE
    )
    INTO old_is_secondary_adjustment
    FROM accounts a
    WHERE a.id = OLD.account_id;
    old_is_secondary_adjustment := COALESCE(old_is_secondary_adjustment, FALSE);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.type = 'adjustment' THEN
    SELECT COALESCE(
      a.type = 'credit_card'
      AND a.is_multicurrency = true
      AND a.secondary_currency IS NOT NULL
      AND upper(trim(COALESCE(NEW.currency, ''))) = upper(trim(a.secondary_currency)),
      FALSE
    )
    INTO new_is_secondary_adjustment
    FROM accounts a
    WHERE a.id = NEW.account_id;
    new_is_secondary_adjustment := COALESCE(new_is_secondary_adjustment, FALSE);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'expense' THEN
      UPDATE accounts SET balance = balance + OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
    ELSIF OLD.type = 'income' THEN
      UPDATE accounts SET balance = balance - OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
    ELSIF OLD.type = 'transfer' THEN
      UPDATE accounts SET balance = balance + OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
      IF OLD.destination_account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance - (OLD.amount * COALESCE(OLD.exchange_rate, 1))
        WHERE id = OLD.destination_account_id;
      END IF;
    ELSIF OLD.type = 'adjustment' THEN
      IF NOT old_is_secondary_adjustment THEN
        UPDATE accounts SET balance = balance - OLD.amount_in_account_currency
        WHERE id = OLD.account_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.type = 'expense' THEN
      amount_delta = OLD.amount_in_account_currency - NEW.amount_in_account_currency;
    ELSIF OLD.type = 'income' THEN
      amount_delta = NEW.amount_in_account_currency - OLD.amount_in_account_currency;
    ELSIF OLD.type = 'transfer' THEN
      amount_delta = OLD.amount_in_account_currency - NEW.amount_in_account_currency;
    ELSIF OLD.type = 'adjustment' AND NEW.type = 'adjustment' THEN
      IF old_is_secondary_adjustment AND new_is_secondary_adjustment THEN
        amount_delta = 0;
      ELSIF old_is_secondary_adjustment AND NOT new_is_secondary_adjustment THEN
        amount_delta = NEW.amount_in_account_currency;
      ELSIF NOT old_is_secondary_adjustment AND new_is_secondary_adjustment THEN
        amount_delta = -OLD.amount_in_account_currency;
      ELSE
        amount_delta = NEW.amount_in_account_currency - OLD.amount_in_account_currency;
      END IF;
    ELSE
      amount_delta = NEW.amount_in_account_currency - OLD.amount_in_account_currency;
    END IF;

    IF OLD.account_id != NEW.account_id THEN
      IF OLD.type = 'expense' THEN
        UPDATE accounts SET balance = balance + OLD.amount_in_account_currency WHERE id = OLD.account_id;
        UPDATE accounts SET balance = balance - NEW.amount_in_account_currency WHERE id = NEW.account_id;
      ELSIF OLD.type = 'income' THEN
        UPDATE accounts SET balance = balance - OLD.amount_in_account_currency WHERE id = OLD.account_id;
        UPDATE accounts SET balance = balance + NEW.amount_in_account_currency WHERE id = NEW.account_id;
      ELSIF OLD.type = 'adjustment' THEN
        IF NOT old_is_secondary_adjustment THEN
          UPDATE accounts SET balance = balance - OLD.amount_in_account_currency WHERE id = OLD.account_id;
        END IF;
        IF NEW.type = 'adjustment' AND NOT new_is_secondary_adjustment THEN
          UPDATE accounts SET balance = balance + NEW.amount_in_account_currency WHERE id = NEW.account_id;
        END IF;
      END IF;
    ELSE
      UPDATE accounts SET balance = balance + amount_delta WHERE id = NEW.account_id;
    END IF;

    IF OLD.type = 'transfer' AND OLD.destination_account_id IS NOT NULL THEN
      UPDATE accounts SET balance = balance - (OLD.amount * COALESCE(OLD.exchange_rate, 1))
      WHERE id = OLD.destination_account_id;
    END IF;
    IF NEW.type = 'transfer' AND NEW.destination_account_id IS NOT NULL THEN
      UPDATE accounts SET balance = balance + (NEW.amount * COALESCE(NEW.exchange_rate, 1))
      WHERE id = NEW.destination_account_id;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'expense' THEN
      UPDATE accounts SET balance = balance - NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
    ELSIF NEW.type = 'income' THEN
      UPDATE accounts SET balance = balance + NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
    ELSIF NEW.type = 'transfer' THEN
      UPDATE accounts SET balance = balance - NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
      IF NEW.destination_account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance + (NEW.amount * COALESCE(NEW.exchange_rate, 1))
        WHERE id = NEW.destination_account_id;
      END IF;
    ELSIF NEW.type = 'adjustment' THEN
      IF NOT new_is_secondary_adjustment THEN
        UPDATE accounts SET balance = balance + NEW.amount_in_account_currency
        WHERE id = NEW.account_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
-- END supabase/migrations/20260504105800_secondary_adjustment_no_primary_impact.sql

-- BEGIN supabase/migrations/20260504164000_multicurrency_bidirectional_payment_waterfall.sql
-- SHA256 6577a0a494a89a48d8752145104ff36da2677984d597e46a714685d55b926797
-- Tarjetas bimoneda:
-- - Pago en moneda secundaria (USD): cancela USD primero, remanente pasa a ARS.
-- - Pago en moneda primaria (ARS) con tipo de cambio explícito: cancela ARS primero,
--   remanente pasa a USD con la tasa inversa.
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
WITH RECURSIVE multi_accounts AS (
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
    NULL::numeric AS secondary_to_primary_rate,
    false AS is_primary_payment_waterfall,
    NULL::numeric AS primary_inflow_amount,
    NULL::numeric AS primary_to_secondary_rate
  FROM public.transactions tx
  JOIN multi_accounts ma ON ma.id = tx.account_id
  WHERE tx.user_id = p_user_id
),
destination_entries AS (
  SELECT
    tx.destination_account_id AS account_id,
    tx.transaction_date,
    tx.id AS tx_id,
    upper(trim(tx.currency)) AS tx_currency,
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
    END AS secondary_to_primary_rate,
    (
      upper(trim(tx.currency)) = ma.primary_currency
      AND COALESCE(tx.exchange_rate, 1) <> 1
    ) AS is_primary_payment_waterfall,
    CASE
      WHEN upper(trim(tx.currency)) = ma.primary_currency
           AND COALESCE(tx.exchange_rate, 1) <> 1
      THEN abs(tx.amount) * COALESCE(NULLIF(tx.exchange_rate, 0), 1)
      ELSE NULL::numeric
    END AS primary_inflow_amount,
    CASE
      WHEN upper(trim(tx.currency)) = ma.primary_currency
           AND COALESCE(tx.exchange_rate, 1) <> 1
      THEN 1 / COALESCE(NULLIF(tx.exchange_rate, 0), 1)
      ELSE NULL::numeric
    END AS primary_to_secondary_rate
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
-- END supabase/migrations/20260504164000_multicurrency_bidirectional_payment_waterfall.sql

-- BEGIN supabase/migrations/20260526120000_investments_daily_change.sql
-- SHA256 3404033b1980199c0550fe422f228ef9063ba9f6ca817a73e2a852546ca6f976
-- Persist daily price change (%) per position so the UI keeps showing
-- variación del día even when the upstream quote provider is down.
-- Aditive, nullable; no impact on existing rows.

ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS current_price_change_pct NUMERIC(10, 4);

COMMENT ON COLUMN investments.current_price_change_pct IS
  'Daily change pct from latest quote refresh (Yahoo/Stooq/CoinGecko). NULL if never refreshed.';
-- END supabase/migrations/20260526120000_investments_daily_change.sql

-- BEGIN supabase/migrations/20260526130000_investment_sales.sql
-- SHA256 33ec37f7ea4da80eb78e33f145ae0b8a0178e86c31727707a7476d676ba10f68
-- Ventas parciales/totales de posiciones con ganancia realizada.
-- Cada venta baja `investments.quantity`; si llega a 0, la posición se archiva (is_active = false).
-- realized_pnl_usd = (price - purchase_price_at_sale) * quantity, convertido a USD con el blue del día de la venta.

CREATE TABLE IF NOT EXISTS investment_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  quantity NUMERIC(20, 8) NOT NULL,
  price NUMERIC(20, 8) NOT NULL,
  currency TEXT NOT NULL,
  sold_at DATE NOT NULL DEFAULT CURRENT_DATE,
  purchase_price_at_sale NUMERIC(20, 8) NOT NULL,
  realized_pnl_native NUMERIC(20, 8) NOT NULL,
  realized_pnl_usd NUMERIC(20, 8) NOT NULL,
  ars_per_usd NUMERIC(20, 8) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT investment_sales_positive_qty CHECK (quantity > 0),
  CONSTRAINT investment_sales_positive_price CHECK (price > 0)
);

CREATE INDEX IF NOT EXISTS idx_investment_sales_user ON investment_sales(user_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_investment_sales_investment ON investment_sales(investment_id, sold_at DESC);

ALTER TABLE investment_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY investment_sales_all
  ON investment_sales
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE investment_sales IS 'Ventas (parcial/total) de posiciones. Registra ganancia realizada por venta.';
COMMENT ON COLUMN investment_sales.purchase_price_at_sale IS 'Snapshot del precio promedio de compra al momento de la venta (para auditar realized).';
COMMENT ON COLUMN investment_sales.realized_pnl_usd IS 'Ganancia/pérdida realizada en USD usando blue del día de la venta.';
-- END supabase/migrations/20260526130000_investment_sales.sql

-- BEGIN supabase/migrations/20260601120000_investments_market_currency_manual_price.sql
-- SHA256 30db2d8d5bb92eb823aca3e4be0562c5b7a51c373a6cd434755b3b7d6e3bf923
-- Permite corregir la moneda de cotización por posición (ej. AAPLD cotiza en USD
-- aunque sea CEDEAR) y cargar un precio manual cuando el ticker/fondo no está en
-- la API. Aditivo, sin impacto en filas existentes.

ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS market_currency TEXT,
  ADD COLUMN IF NOT EXISTS is_manual_price BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN investments.market_currency IS
  'Override de moneda del precio de mercado (USD/ARS). NULL = default por tipo.';
COMMENT ON COLUMN investments.is_manual_price IS
  'Si TRUE, current_price lo carga el usuario a mano y no se refresca desde la API.';
-- END supabase/migrations/20260601120000_investments_market_currency_manual_price.sql

-- BEGIN supabase/migrations/20260609120000_shared_expenses.sql
-- SHA256 b18293971440256a42d2891563f022689fce7a131d4dbe08b9df494c895b933b
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SHARED EXPENSES (gastos compartidos estilo Tricount)
-- Grupos con link público (share_token). Los invitados NO necesitan
-- cuenta: acceden con el link y se identifican con nombre + email/teléfono.
-- Todo el acceso de invitados pasa por la API (service role) validando el
-- token; el acceso directo con sesión queda limitado al dueño vía RLS.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE shared_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  currency TEXT NOT NULL DEFAULT 'ARS',
  share_token TEXT NOT NULL UNIQUE CHECK (share_token ~ '^[a-f0-9]{32}$'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_groups_owner ON shared_groups(owner_user_id, is_active);

CREATE TABLE shared_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  -- Si el invitado tiene cuenta Zarix se puede vincular; opcional.
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  email TEXT CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone TEXT CHECK (phone IS NULL OR phone ~ '^[0-9+\-() ]{6,25}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_group_members_group ON shared_group_members(group_id);

CREATE TABLE shared_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  paid_by_member_id UUID NOT NULL REFERENCES shared_group_members(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  amount NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_expenses_group ON shared_expenses(group_id, expense_date DESC, created_at DESC);

CREATE TABLE shared_expense_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES shared_expenses(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES shared_group_members(id) ON DELETE CASCADE,
  amount NUMERIC(20, 2) NOT NULL CHECK (amount >= 0),
  UNIQUE (expense_id, member_id)
);

CREATE INDEX idx_shared_expense_splits_expense ON shared_expense_splits(expense_id);
CREATE INDEX idx_shared_expense_splits_member ON shared_expense_splits(member_id);

-- RLS: dueño con sesión puede operar directo; invitados SOLO vía API
-- (service role) que valida share_token. Sin política para anon.
ALTER TABLE shared_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_expense_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY shared_groups_owner_all ON shared_groups
  FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY shared_group_members_owner_all ON shared_group_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_groups g
      WHERE g.id = shared_group_members.group_id
        AND g.owner_user_id = auth.uid()
    )
  );

CREATE POLICY shared_expenses_owner_all ON shared_expenses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_groups g
      WHERE g.id = shared_expenses.group_id
        AND g.owner_user_id = auth.uid()
    )
  );

CREATE POLICY shared_expense_splits_owner_all ON shared_expense_splits
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_expenses e
      JOIN shared_groups g ON g.id = e.group_id
      WHERE e.id = shared_expense_splits.expense_id
        AND g.owner_user_id = auth.uid()
    )
  );
-- END supabase/migrations/20260609120000_shared_expenses.sql

-- BEGIN supabase/migrations/20260702120000_atomic_investment_sell.sql
-- SHA256 7efdacd2da569fd69b5c32384adf8eb8c5c6860860bd5fd0bfcaa7755ee189a3
-- Venta atómica de posiciones (fix carrera lectura-validación-escritura).
-- investmentsService.sell() leía la cantidad, validaba en JS y recién después
-- insertaba la venta y descontaba: dos ventas concurrentes (doble click)
-- podían sobrevender la posición. Este RPC hace el decremento condicional
-- (`quantity >= p_quantity`) y el INSERT de la venta en UNA transacción.

-- El cierre total deja quantity = 0: relajar el CHECK original (quantity > 0).
ALTER TABLE investments DROP CONSTRAINT IF EXISTS positive_quantity;
ALTER TABLE investments ADD CONSTRAINT positive_quantity CHECK (quantity >= 0);

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

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;
  IF p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'PRECIO_INVALIDO';
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

-- SECURITY DEFINER + auth.uid() IS NULL permitido implica que el rol anon
-- (que también tiene uid NULL) podría invocarla vía PostgREST con un
-- p_user_id ajeno. Solo el service role (la capa API ya autenticó) puede
-- ejecutarla.
REVOKE EXECUTE ON FUNCTION sell_investment_position(UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sell_investment_position(UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION sell_investment_position(UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT) TO service_role;

COMMENT ON FUNCTION sell_investment_position IS
  'Venta atómica de una posición: descuenta quantity solo si alcanza (evita oversell concurrente) e inserta la fila en investment_sales en la misma transacción. Devuelve {sale, remaining_quantity, position_closed}.';
-- END supabase/migrations/20260702120000_atomic_investment_sell.sql

-- BEGIN supabase/migrations/20260811120000_security_hardening.sql
-- SHA256 2e639815c8f47ad11c7b0cd4a24b5e7e99f4c7e740c74af97511655918e6c891
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SECURITY HARDENING (2026-08-11)
-- 1. exchange_rates: cerrar INSERT abierto a anon/authenticated (rate poisoning)
-- 2. users: quitar secretos del SELECT client-facing (defensa en profundidad)
-- 3. Vinculación de Telegram con prueba de posesión (código de un solo uso)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. RATE POISONING ────────────────────────────────────────────────
-- Antes: exchange_rates_insert WITH CHECK (true) sin cláusula TO → cualquiera
-- con la anon key podía insertar una cotización falsa que el DbCacheProvider
-- propagaba a las conversiones de TODOS los usuarios. Solo el server (service_role,
-- vía cotizacionesService) debe escribir cotizaciones.
DROP POLICY IF EXISTS exchange_rates_insert ON exchange_rates;
CREATE POLICY exchange_rates_insert ON exchange_rates
  FOR INSERT TO service_role WITH CHECK (true);
-- Endurecemos también los grants de tabla (service_role bypassa RLS igual):
REVOKE INSERT ON exchange_rates FROM anon, authenticated;

-- 2. SECRETOS PLAINTEXT EN users ───────────────────────────────────
-- Las credenciales de terceros (gemini_api_key, telegram_bot_token) nunca deben
-- volver al cliente: el usuario las escribe, nunca las lee de vuelta. Con RLS a
-- nivel fila el dueño podía leerlas vía PostgREST directo (?select=...).
--
-- OJO: un REVOKE por columna NO alcanza si existe un GRANT SELECT a nivel tabla
-- (el grant de tabla lo supera). Supabase concede SELECT de tabla a
-- anon/authenticated por defecto. El patrón correcto es revocar el SELECT de
-- tabla y reconceder solo las columnas no-secretas.
--
-- Se EXCLUYEN solo gemini_api_key y telegram_bot_token (credenciales de terceros).
-- mp_preapproval_id se mantiene legible porque la policy users_update lo
-- referencia en su WITH CHECK (si se revoca, la policy falla y rompe todo update).
-- telegram_webhook_secret se mantiene: el dueño lo necesita para su bot propio.
-- Los reads server-side de las credenciales usan el service client (bypass).
REVOKE SELECT ON users FROM anon, authenticated;
GRANT SELECT (
  id, telegram_chat_id, telegram_username, telegram_webhook_secret,
  mp_preapproval_id, status, current_period_end, grace_period_end,
  default_currency, timezone, notification_time, daily_summary_enabled,
  weekly_summary_enabled, monthly_summary_enabled, onboarding_done,
  telegram_link_code_expires_at, created_at, updated_at
) ON users TO authenticated;

-- 3. VINCULACIÓN CON PRUEBA DE POSESIÓN ────────────────────────────
-- Antes: el "código de vinculación" era el propio telegram_chat_id (público,
-- sin prueba de posesión) → un atacante podía vincular el chat de una víctima.
-- Ahora: la app genera un código de un solo uso (10 min) y el usuario lo envía
-- al bot; quien envía el código controla ese chat_id (Telegram lo entregó).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_link_code TEXT,
  ADD COLUMN IF NOT EXISTS telegram_link_code_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_link_code
  ON users(telegram_link_code) WHERE telegram_link_code IS NOT NULL;

-- Nota: telegram_link_code queda fuera del GRANT SELECT de arriba (no se lista),
-- así que el rol authenticated no puede leerlo por PostgREST. Se entrega solo por
-- la respuesta del endpoint que lo genera.
-- END supabase/migrations/20260811120000_security_hardening.sql

-- BEGIN supabase/migrations/20260811130000_data_integrity.sql
-- SHA256 942bffc1325e78de010542c641070f10d8e1afac03b183479a1eecf359f58dad
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
-- END supabase/migrations/20260811130000_data_integrity.sql

-- BEGIN supabase/migrations/20260814120000_net_worth_snapshots.sql
-- SHA256 4835efb3ebd09f09704a7dc6f4afaf44a50588a8f33c52a2469826c346ccd57e
-- Snapshots diarios de patrimonio TOTAL (cuentas líquidas + inversiones),
-- para el gráfico ancla del dashboard. portfolio_performance_snapshots solo
-- cubre el portafolio de inversiones; esta tabla cubre el patrimonio completo.
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  liquid_usd NUMERIC(20, 8) NOT NULL,
  investments_usd NUMERIC(20, 8) NOT NULL,
  total_usd NUMERIC(20, 8) NOT NULL,
  total_ars_blue NUMERIC(20, 2) NOT NULL,
  blue_ars_per_usd NUMERIC(20, 8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT net_worth_snapshots_user_day UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_user_day
  ON net_worth_snapshots(user_id, snapshot_date DESC);

-- Mismo modelo de acceso que portfolio_performance_snapshots: RLS on,
-- sin policies — solo el service role escribe/lee (crons y SSR).
ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON net_worth_snapshots FROM anon, authenticated;
-- END supabase/migrations/20260814120000_net_worth_snapshots.sql

-- BEGIN supabase/migrations/20260819120000_security_integrity_followup.sql
-- SHA256 016e31e0a00236b4d87648359b22cdb32653cd56d49f8883335436c6bf5f7ead
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
-- END supabase/migrations/20260819120000_security_integrity_followup.sql

-- BEGIN supabase/migrations/20261006235424_fix_balance_update_old_new_impacts.sql
-- SHA256 7d0c107a4836c1c88c07559fbee26c8187d621e52b838474ca9b6c76782ba296
-- Revertir OLD y aplicar NEW de manera independiente también al cambiar
-- tipo, origen o destino. No se aplica automáticamente a producción.
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
      UPDATE public.accounts SET balance = balance - OLD.amount * COALESCE(OLD.exchange_rate, 1)
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
      UPDATE public.accounts SET balance = balance + NEW.amount * COALESCE(NEW.exchange_rate, 1)
      WHERE id = NEW.destination_account_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
-- END supabase/migrations/20261006235424_fix_balance_update_old_new_impacts.sql

-- BEGIN supabase/migrations/20261006235955_atomic_shared_expense.sql
-- SHA256 dda45e83dc60cc9954068f6b8c610e1571bab34327069bb4d172400104335cb9
-- Un gasto y su reparto son una sola operación; jamás dejar importe nuevo
-- con reparto anterior si falla una escritura. Se ejecuta sólo desde backend.
CREATE OR REPLACE FUNCTION public.save_shared_expense(
  p_share_token TEXT,
  p_actor_member_id UUID,
  p_paid_by_member_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_expense_date DATE DEFAULT NULL,
  p_split_member_ids UUID[] DEFAULT NULL,
  p_expense_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group_id UUID;
  v_expense_id UUID;
  v_member_ids UUID[];
  v_amount NUMERIC;
  v_count INTEGER;
BEGIN
  IF p_share_token IS NULL OR p_share_token !~ '^[a-f0-9]{32}$' THEN
    RETURN NULL;
  END IF;

  -- Serializa las escrituras de gastos del grupo y evita que se borre entre
  -- la autorización por capability y el cambio de sus gastos/repartos.
  SELECT id INTO v_group_id FROM public.shared_groups
  WHERE share_token = p_share_token AND is_active = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF p_actor_member_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shared_group_members
    WHERE id = p_actor_member_id AND group_id = v_group_id
  ) THEN
    RAISE EXCEPTION 'Tenés que unirte al grupo para cargar o editar gastos.' USING ERRCODE = '42501';
  END IF;

  -- El actor es una identificación declarada dentro del link compartido.
  -- No prueba identidad individual: el token autoriza la colaboración grupal.
  IF p_paid_by_member_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shared_group_members
    WHERE id = p_paid_by_member_id AND group_id = v_group_id
  ) THEN
    RAISE EXCEPTION 'El miembro que pagó no pertenece al grupo.' USING ERRCODE = '22023';
  END IF;
  IF p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'La descripción debe tener entre 1 y 200 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount::TEXT IN ('NaN', 'Infinity', '-Infinity') OR p_amount <= 0 OR p_amount > 999999999999999999.99 THEN
    RAISE EXCEPTION 'El monto debe ser positivo y finito.' USING ERRCODE = '22023';
  END IF;
  v_amount := round(p_amount, 2);
  IF v_amount < 0.01 THEN
    RAISE EXCEPTION 'El monto mínimo es 0,01.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(cardinality(p_split_member_ids), 0) = 0 THEN
    SELECT array_agg(id ORDER BY created_at, id) INTO v_member_ids
    FROM public.shared_group_members WHERE group_id = v_group_id;
  ELSE
    IF cardinality(p_split_member_ids) > 30 THEN
      RAISE EXCEPTION 'El reparto supera el máximo de participantes.' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(member_id ORDER BY first_position) INTO v_member_ids
    FROM (
      SELECT member_id, min(position) AS first_position
      FROM unnest(p_split_member_ids) WITH ORDINALITY AS participants(member_id, position)
      GROUP BY member_id
    ) distinct_participants;
  END IF;
  v_count := coalesce(cardinality(v_member_ids), 0);
  IF v_count = 0 OR EXISTS (
    SELECT 1 FROM unnest(v_member_ids) AS selected(member_id)
    LEFT JOIN public.shared_group_members m
      ON m.id = selected.member_id AND m.group_id = v_group_id
    WHERE m.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay participantes que no pertenecen al grupo.' USING ERRCODE = '22023';
  END IF;

  IF p_expense_id IS NULL THEN
    INSERT INTO public.shared_expenses(group_id, paid_by_member_id, description, amount, expense_date)
    VALUES (v_group_id, p_paid_by_member_id, btrim(p_description), v_amount,
            coalesce(p_expense_date, (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE))
    RETURNING id INTO v_expense_id;
  ELSE
    SELECT id INTO v_expense_id FROM public.shared_expenses
    WHERE id = p_expense_id AND group_id = v_group_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    UPDATE public.shared_expenses SET paid_by_member_id = p_paid_by_member_id,
      description = btrim(p_description), amount = v_amount,
      expense_date = coalesce(p_expense_date, expense_date)
    WHERE id = v_expense_id AND group_id = v_group_id;
    DELETE FROM public.shared_expense_splits WHERE expense_id = v_expense_id;
  END IF;

  -- Usar NUMERIC para centavos: BIGINT no cubre todo el NUMERIC(20,2).
  -- El reparto usa el orden deduplicado de participantes de la solicitud.
  INSERT INTO public.shared_expense_splits(expense_id, member_id, amount)
  SELECT v_expense_id, member_id,
    (floor(v_amount * 100 / v_count) +
       CASE WHEN position <= mod(v_amount * 100, v_count) THEN 1 ELSE 0 END) / 100
  FROM unnest(v_member_ids) WITH ORDINALITY AS participants(member_id, position);

  RETURN (
    SELECT to_jsonb(e) || jsonb_build_object('splits', (
      SELECT jsonb_agg(jsonb_build_object('member_id', member_id, 'amount', amount) ORDER BY member_id)
      FROM public.shared_expense_splits WHERE expense_id = v_expense_id
    ))
    FROM public.shared_expenses e WHERE id = v_expense_id AND group_id = v_group_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_shared_expense(TEXT, UUID, UUID, TEXT, NUMERIC, DATE, UUID[], UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_shared_expense(TEXT, UUID, UUID, TEXT, NUMERIC, DATE, UUID[], UUID) TO service_role;
-- END supabase/migrations/20261006235955_atomic_shared_expense.sql

-- BEGIN supabase/migrations/20261007000231_preserve_transfer_destination_amount.sql
-- SHA256 a67a04bdee629aeb6fff196f1a803d100bb35bb40d038204767d4181b2ccfa1f
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
-- END supabase/migrations/20261007000231_preserve_transfer_destination_amount.sql

-- BEGIN supabase/migrations/20261009034852_durable_financial_requests_outbox.sql
-- SHA256 c25f0065d8fbd17145399219ad3db694e9b2d4931baf7c058dde2de9a0569eb1
-- Financial effect, reply receipt and recurring notification commit together.
-- These APIs are server-only; caller identity always comes from verified auth.
CREATE TABLE public.transaction_requests (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  request_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.transaction_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transaction_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.transaction_requests TO service_role;
-- Deliberately no TTL: deleting a receipt would allow a delayed replay to debit again.

CREATE FUNCTION public.create_transaction_once(
  p_user_id UUID, p_request_id TEXT, p_request_hash TEXT, p_transaction JSONB,
  p_installments INTEGER DEFAULT 1
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  prior public.transaction_requests%ROWTYPE;
  t public.transactions%ROWTYPE;
  result JSONB;
  installment_group UUID;
BEGIN
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
     OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid request identifier or fingerprint';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  -- Transaction-scoped lock arbitrates simultaneous retries, including first insert.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_id, 0));
  SELECT * INTO prior FROM public.transaction_requests
    WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'Z0001', MESSAGE = 'Request payload conflict';
    END IF;
    RETURN prior.response;
  END IF;

  t := jsonb_populate_record(NULL::public.transactions, p_transaction);
  IF t.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_installments IS NULL OR p_installments < 1 OR p_installments > 36 THEN
    RAISE EXCEPTION 'Invalid installments';
  END IF;
  IF p_installments > 1 THEN
    IF t.type <> 'expense' THEN RAISE EXCEPTION 'Installments require expense'; END IF;
    installment_group := public.create_installment_transactions(p_user_id, t.account_id,
      t.amount, t.currency, p_installments, t.category_id, t.description, t.transaction_date);
    SELECT to_jsonb(tx) INTO STRICT result FROM public.transactions tx
      WHERE tx.user_id = p_user_id AND tx.installment_group_id = installment_group
        AND tx.installment_number = 1;
  ELSE
    INSERT INTO public.transactions (user_id, type, account_id, destination_account_id,
      amount, currency, amount_in_account_currency, destination_amount_in_account_currency,
      exchange_rate, category_id, description, notes, tags, transaction_date, is_recurring, recurring_rule_id)
    VALUES (p_user_id, t.type, t.account_id, t.destination_account_id, t.amount, t.currency,
      t.amount_in_account_currency, t.destination_amount_in_account_currency, t.exchange_rate,
      t.category_id, t.description, t.notes, t.tags, COALESCE(t.transaction_date, now()),
      COALESCE(t.is_recurring, false), t.recurring_rule_id)
    RETURNING to_jsonb(transactions.*) INTO result;
  END IF;
  INSERT INTO public.transaction_requests (user_id, request_id, request_hash, response)
    VALUES (p_user_id, p_request_id, p_request_hash, result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_transaction_once(UUID, TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_transaction_once(UUID, TEXT, TEXT, JSONB, INTEGER) TO service_role;

CREATE TABLE public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);
CREATE INDEX notification_outbox_pending ON public.notification_outbox (available_at, created_at)
  WHERE delivered_at IS NULL;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_outbox TO service_role;

CREATE FUNCTION public.enqueue_recurring_notification() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  rule public.recurring_rules%ROWTYPE;
  occurrence DATE;
BEGIN
  IF NEW.recurring_rule_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO rule FROM public.recurring_rules
    WHERE id = NEW.recurring_rule_id AND user_id = NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Regla recurrente no encontrada'; END IF;
  occurrence := timezone('America/Argentina/Buenos_Aires', NEW.transaction_date)::date;
  UPDATE public.recurring_rules SET last_executed_date = occurrence
    WHERE id = rule.id AND user_id = NEW.user_id
      AND (last_executed_date IS NULL OR last_executed_date < occurrence);
  IF rule.notification_enabled THEN
    INSERT INTO public.notification_outbox (user_id, event_key, payload)
    VALUES (NEW.user_id, 'recurring:' || rule.id || ':' || occurrence,
      jsonb_build_object('kind', 'recurring', 'transactionId', NEW.id,
        'type', NEW.type, 'description', NEW.description, 'amount', NEW.amount,
        'currency', NEW.currency, 'frequency', rule.frequency))
    ON CONFLICT (user_id, event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_recurring_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_recurring_notification() TO service_role;
CREATE TRIGGER transaction_recurring_outbox AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_recurring_notification();

CREATE FUNCTION public.claim_notification_outbox(p_limit INTEGER DEFAULT 20)
RETURNS SETOF public.notification_outbox LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    WITH candidates AS (
      SELECT id FROM public.notification_outbox
      WHERE delivered_at IS NULL AND available_at <= now()
        AND (lease_until IS NULL OR lease_until <= now())
      ORDER BY available_at, created_at
      FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit, 1), 100)
    )
    UPDATE public.notification_outbox o
    SET lease_token = gen_random_uuid(), lease_until = now() + interval '5 minutes',
        attempts = attempts + 1
    FROM candidates c WHERE o.id = c.id RETURNING o.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_notification_outbox(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox(INTEGER) TO service_role;

-- Release only claims that this worker never started, in one bounded DB request.
CREATE FUNCTION public.release_notification_outbox(p_claims JSONB)
RETURNS VOID LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.notification_outbox o SET lease_until = NULL, lease_token = NULL
  FROM jsonb_to_recordset(p_claims) AS claim(id UUID, lease_token UUID)
  WHERE o.id = claim.id AND o.lease_token = claim.lease_token AND o.delivered_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.release_notification_outbox(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_notification_outbox(JSONB) TO service_role;
-- END supabase/migrations/20261009034852_durable_financial_requests_outbox.sql

-- BEGIN supabase/migrations/20261009034943_atomic_account_creation.sql
-- SHA256 3b511ab53cdf19409eed70bdf661751cb82bc4ea322414f941c592fc175f7c38
-- Atomic account creation with opening balance (extracted from the dropped plan-allowances migration, 2026-10-15). No plan limits.
-- Separate receipt namespace prevents account/transaction request-key collisions.
CREATE TABLE public.account_creation_requests (
 user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 8 AND 200),
 request_hash TEXT NOT NULL,
 response JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id)
);
ALTER TABLE public.account_creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_creation_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.account_creation_requests TO service_role;

-- Account and opening ledger entry share one commit and the existing durable
-- request receipt pattern. A response-loss retry returns the original account as created.
CREATE OR REPLACE FUNCTION public.create_account_with_opening_balance(
 p_user_id UUID,p_request_id TEXT,p_request_hash TEXT,p_account JSONB,p_initial_balance NUMERIC
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous public.account_creation_requests%ROWTYPE; a public.accounts%ROWTYPE; result JSONB; next_sort INTEGER;
BEGIN
 IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
 OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'plan_request_conflict'; END IF;
 IF auth.uid() IS NOT NULL AND auth.uid()<>p_user_id THEN RAISE EXCEPTION 'plan_invalid_selection'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':account:'||p_request_id,0));
 SELECT * INTO previous FROM public.account_creation_requests WHERE user_id=p_user_id AND request_id=p_request_id;
 IF FOUND THEN
   IF previous.request_hash<>p_request_hash THEN RAISE EXCEPTION 'plan_request_conflict'; END IF;
   RETURN previous.response;
 END IF;
 PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'plan_invalid_selection'; END IF;
 a := jsonb_populate_record(NULL::public.accounts,p_account);
 SELECT COALESCE(max(sort_order)+1,0) INTO next_sort FROM public.accounts WHERE user_id=p_user_id;
 INSERT INTO public.accounts(user_id,name,type,currency,balance,icon,color,is_debt,include_in_total,include_in_liquid,
 min_balance,credit_limit,closing_day,due_day,last_4_digits,is_multicurrency,secondary_currency,sort_order)
 VALUES(p_user_id,a.name,a.type,a.currency,0,a.icon,COALESCE(a.color,'#3B82F6'),COALESCE(a.is_debt,false),
 COALESCE(a.include_in_total,true),COALESCE(a.include_in_liquid,true),a.min_balance,a.credit_limit,a.closing_day,a.due_day,
 a.last_4_digits,COALESCE(a.is_multicurrency,false),a.secondary_currency,next_sort) RETURNING * INTO a;
 IF p_initial_balance IS NULL OR p_initial_balance::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid opening balance'; END IF;
 IF p_initial_balance<>0 THEN
   INSERT INTO public.transactions(user_id,type,account_id,amount,currency,amount_in_account_currency,description,transaction_date)
   VALUES(p_user_id,'adjustment',a.id,abs(p_initial_balance),a.currency,p_initial_balance,'Saldo inicial',now());
 END IF;
 SELECT to_jsonb(account) INTO result FROM public.accounts account WHERE account.id=a.id AND account.user_id=p_user_id;
 INSERT INTO public.account_creation_requests(user_id,request_id,request_hash,response) VALUES(p_user_id,p_request_id,p_request_hash,result);
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_account_with_opening_balance(UUID,TEXT,TEXT,JSONB,NUMERIC) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_account_with_opening_balance(UUID,TEXT,TEXT,JSONB,NUMERIC) TO service_role;
-- END supabase/migrations/20261009034943_atomic_account_creation.sql

-- BEGIN supabase/migrations/20261009034950_explicit_grants_and_tenant_integrity.sql
-- SHA256 05403aadbbd2a86673e2a00ef1b242e7c9c6162ed4fc11c5e4d9f7f24b0c850c
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
-- END supabase/migrations/20261009034950_explicit_grants_and_tenant_integrity.sql

-- BEGIN supabase/migrations/20261009035715_durable_sales_shared_expenses.sql
-- SHA256 db67484f7515d80a4371679fdc225cabc287d06aa975b177c956998e750256ca
-- Durable receipts for other financial mutation boundaries. No TTL or provider IO.
CREATE TABLE public.investment_sale_requests (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  request_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.investment_sale_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.investment_sale_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.investment_sale_requests TO service_role;

CREATE FUNCTION public.sell_investment_once(
  p_user_id UUID, p_request_id TEXT, p_request_hash TEXT, p_sale JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prior public.investment_sale_requests%ROWTYPE; result JSONB; basis public.investments%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
    OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sale:' || p_user_id || ':' || p_request_id, 0));
  SELECT * INTO prior FROM public.investment_sale_requests WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Request payload conflict'; END IF;
    RETURN prior.response;
  END IF;
  -- Replay above must win even after an edit, archive or full liquidation.
  -- Keep this row locked through the nested sale + receipt transaction. The
  -- service computed P&L before provider IO, so reject any changed cost basis.
  SELECT * INTO basis FROM public.investments
    WHERE id=(p_sale->>'p_investment_id')::UUID AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CANTIDAD_INSUFICIENTE'; END IF;
  IF NOT (p_sale ?& ARRAY['p_expected_purchase_price','p_expected_purchase_currency','p_expected_type'])
    OR basis.purchase_price IS DISTINCT FROM (p_sale->>'p_expected_purchase_price')::NUMERIC
    OR basis.purchase_currency IS DISTINCT FROM p_sale->>'p_expected_purchase_currency'
    OR basis.type::TEXT IS DISTINCT FROM p_sale->>'p_expected_type' THEN
    RAISE EXCEPTION USING ERRCODE='Z0002', MESSAGE='Investment cost basis changed';
  END IF;
  result := public.sell_investment_position(p_user_id, (p_sale->>'p_investment_id')::UUID,
    (p_sale->>'p_quantity')::NUMERIC, (p_sale->>'p_price')::NUMERIC, p_sale->>'p_currency',
    (p_sale->>'p_sold_at')::DATE, (p_sale->>'p_realized_pnl_native')::NUMERIC,
    (p_sale->>'p_realized_pnl_usd')::NUMERIC, (p_sale->>'p_ars_per_usd')::NUMERIC, p_sale->>'p_notes');
  INSERT INTO public.investment_sale_requests(user_id,request_id,request_hash,response)
    VALUES(p_user_id,p_request_id,p_request_hash,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.sell_investment_once(UUID,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sell_investment_once(UUID,TEXT,TEXT,JSONB) TO service_role;

CREATE TABLE public.shared_expense_requests (
  group_id UUID NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  request_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,request_id)
);
ALTER TABLE public.shared_expense_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shared_expense_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.shared_expense_requests TO service_role;

CREATE FUNCTION public.save_shared_expense_once(
  p_share_token TEXT, p_request_id TEXT, p_request_hash TEXT, p_expense JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_group UUID; prior public.shared_expense_requests%ROWTYPE; result JSONB; members UUID[];
BEGIN
  IF p_share_token IS NULL OR p_share_token !~ '^[a-f0-9]{32}$' THEN RETURN NULL; END IF;
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
    OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
  -- Capability authorization precedes even a replay. The row lock also serializes
  -- simultaneous first requests and protects against group deletion/token rotation.
  SELECT id INTO v_group FROM public.shared_groups WHERE share_token=p_share_token AND is_active FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO prior FROM public.shared_expense_requests WHERE group_id=v_group AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='Request payload conflict'; END IF;
    RETURN prior.response;
  END IF;
  IF jsonb_typeof(p_expense->'p_split_member_ids') = 'array' THEN
    SELECT array_agg(member::UUID) INTO members FROM jsonb_array_elements_text(p_expense->'p_split_member_ids') AS item(member);
  END IF;
  result := public.save_shared_expense(p_share_token, (p_expense->>'p_actor_member_id')::UUID,
    (p_expense->>'p_paid_by_member_id')::UUID, p_expense->>'p_description',
    (p_expense->>'p_amount')::NUMERIC, (p_expense->>'p_expense_date')::DATE, members,
    (p_expense->>'p_expense_id')::UUID);
  IF result IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.shared_expense_requests(group_id,request_id,request_hash,response)
    VALUES(v_group,p_request_id,p_request_hash,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_shared_expense_once(TEXT,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_shared_expense_once(TEXT,TEXT,TEXT,JSONB) TO service_role;

-- Investment creation has its own namespace and durable response, so retries
-- survive later position edits/archive/deletion without creating another lot.
CREATE TABLE public.investment_create_requests (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 8 AND 200),
  request_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.investment_create_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.investment_create_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.investment_create_requests TO service_role;

CREATE FUNCTION public.create_investment_once(
  p_user_id UUID, p_request_id TEXT, p_request_hash TEXT, p_investment JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prior public.investment_create_requests%ROWTYPE; created public.investments%ROWTYPE; result JSONB;
BEGIN
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
    OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
  IF p_user_id IS NULL OR (p_investment->>'user_id')::UUID IS DISTINCT FROM p_user_id
    OR (auth.uid() IS NOT NULL AND auth.uid() <> p_user_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('investment-create:' || p_user_id || ':' || p_request_id, 0));
  SELECT * INTO prior FROM public.investment_create_requests WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Request payload conflict'; END IF;
    RETURN prior.response;
  END IF;
  -- Check eligibility under a lock, not only in the service before insertion.
  PERFORM 1 FROM public.accounts WHERE id=(p_investment->>'account_id')::UUID
    AND user_id=p_user_id AND is_active AND type='investment' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta de inversión no encontrada'; END IF;
  IF (p_investment->>'quantity')::NUMERIC IS NULL OR (p_investment->>'quantity')::NUMERIC <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;
  IF COALESCE((p_investment->>'is_manual_price')::BOOLEAN,FALSE) AND
    ((p_investment->>'current_price')::NUMERIC IS NULL OR (p_investment->>'current_price')::NUMERIC <= 0) THEN
    RAISE EXCEPTION 'PRECIO_INVALIDO';
  END IF;
  INSERT INTO public.investments(user_id,account_id,type,ticker,name,quantity,purchase_price,purchase_currency,
    purchase_date,maturity_date,interest_rate,notes,market_currency,is_manual_price,current_price,current_price_updated_at)
  VALUES(p_user_id,(p_investment->>'account_id')::UUID,(p_investment->>'type')::public.investment_type,
    p_investment->>'ticker',p_investment->>'name',(p_investment->>'quantity')::NUMERIC,
    (p_investment->>'purchase_price')::NUMERIC,p_investment->>'purchase_currency',
    (p_investment->>'purchase_date')::DATE,(p_investment->>'maturity_date')::DATE,
    (p_investment->>'interest_rate')::NUMERIC,p_investment->>'notes',p_investment->>'market_currency',
    COALESCE((p_investment->>'is_manual_price')::BOOLEAN,FALSE),(p_investment->>'current_price')::NUMERIC,
    (p_investment->>'current_price_updated_at')::TIMESTAMPTZ)
  RETURNING * INTO created;
  result := to_jsonb(created);
  INSERT INTO public.investment_create_requests(user_id,request_id,request_hash,response)
    VALUES(p_user_id,p_request_id,p_request_hash,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_investment_once(UUID,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_investment_once(UUID,TEXT,TEXT,JSONB) TO service_role;
-- END supabase/migrations/20261009035715_durable_sales_shared_expenses.sql

-- BEGIN supabase/migrations/20261009041100_durable_import_batches.sql
-- SHA256 7cd5974799151e9c12a3e4e76a652391247f0c7ea3de74769638b23366df9a88
-- Import is intentionally partial per row. Bind the batch before any financial
-- write; each row has an atomic transaction_requests receipt retained forever.
CREATE TABLE public.import_batches (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  intent_hash TEXT NOT NULL CHECK (intent_hash ~ '^[0-9a-f]{64}$'),
  context JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, batch_id)
);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.import_batches TO service_role;

CREATE FUNCTION public.begin_import_batch(p_user_id UUID, p_batch_id UUID, p_intent_hash TEXT, p_context JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prior public.import_batches%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_batch_id IS NULL OR p_intent_hash IS NULL
     OR p_intent_hash !~ '^[0-9a-f]{64}$' OR p_context IS NULL THEN
    RAISE EXCEPTION 'Invalid import batch';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('import:' || p_user_id::text || ':' || p_batch_id::text, 0));
  SELECT * INTO prior FROM public.import_batches WHERE user_id=p_user_id AND batch_id=p_batch_id;
  IF FOUND THEN
    IF prior.intent_hash <> p_intent_hash THEN
      RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Import batch payload conflict';
    END IF;
    RETURN prior.context;
  END IF;
  INSERT INTO public.import_batches(user_id,batch_id,intent_hash,context)
    VALUES(p_user_id,p_batch_id,p_intent_hash,p_context);
  RETURN p_context;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_import_batch(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_import_batch(UUID, UUID, TEXT, JSONB) TO service_role;

CREATE FUNCTION public.create_import_transaction_once(
  p_user_id UUID, p_batch_id UUID, p_request_id TEXT, p_request_hash TEXT,
  p_transaction JSONB, p_skip_duplicates BOOLEAN DEFAULT false
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prior public.transaction_requests%ROWTYPE; t public.transactions%ROWTYPE; result JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_request_id IS NULL OR p_request_id !~ ('^import:' || p_batch_id::text || ':(transaction|transfer):[0-9]+$')
     OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid import request';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.import_batches WHERE user_id=p_user_id AND batch_id=p_batch_id) THEN
    RAISE EXCEPTION 'Import batch not found';
  END IF;
  -- Serialize optional matching across imports by this owner, including new
  -- batches. Equal legitimate rows are otherwise always distinct operations.
  PERFORM pg_advisory_xact_lock(hashtextextended('import-owner:' || p_user_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_id, 0));
  SELECT * INTO prior FROM public.transaction_requests WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN
      RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Request payload conflict';
    END IF;
    RETURN prior.response;
  END IF;
  t := jsonb_populate_record(NULL::public.transactions,p_transaction);
  IF t.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_skip_duplicates AND EXISTS (
    SELECT 1 FROM public.transactions x WHERE x.user_id=p_user_id
      AND x.type=t.type AND x.transaction_date=t.transaction_date
      AND x.account_id IS NOT DISTINCT FROM t.account_id
      AND x.destination_account_id IS NOT DISTINCT FROM t.destination_account_id
      AND x.amount=t.amount AND x.currency=t.currency
      AND x.amount_in_account_currency IS NOT DISTINCT FROM t.amount_in_account_currency
      AND x.destination_amount_in_account_currency IS NOT DISTINCT FROM t.destination_amount_in_account_currency
      AND x.category_id IS NOT DISTINCT FROM t.category_id
      AND x.description IS NOT DISTINCT FROM t.description AND x.notes IS NOT DISTINCT FROM t.notes
  ) THEN
    result := jsonb_build_object('import_skipped_duplicate',true);
    INSERT INTO public.transaction_requests(user_id,request_id,request_hash,response)
      VALUES(p_user_id,p_request_id,p_request_hash,result);
    RETURN result;
  END IF;
  RETURN public.create_transaction_once(p_user_id,p_request_id,p_request_hash,p_transaction,1);
END;
$$;
REVOKE ALL ON FUNCTION public.create_import_transaction_once(UUID, UUID, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_import_transaction_once(UUID, UUID, TEXT, TEXT, JSONB, BOOLEAN) TO service_role;
-- END supabase/migrations/20261009041100_durable_import_batches.sql

-- BEGIN supabase/migrations/20261015000402_atomic_account_balance_recompute.sql
-- SHA256 7f0a8bc2e23c3dfd43af5f01b9132b9daa44d48b6a38f5fe02524b837d0f4bce
-- Reconciliation must hold the same account lock as the ledger balance trigger.
-- A concurrent ledger write cannot commit its account impact between the sum
-- and replacement. No movements, initial adjustments or other accounts change.
CREATE OR REPLACE FUNCTION public.recompute_account_balance(
  p_user_id UUID,
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  target_account public.accounts%ROWTYPE;
  recomputed_balance NUMERIC(20,8);
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Usuario no autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_account
  FROM public.accounts
  WHERE id = p_account_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta no encontrada' USING ERRCODE = '42501';
  END IF;

  -- A separate statement after acquiring the lock reads the committed ledger
  -- in READ COMMITTED. Starting from zero includes opening-balance adjustments.
  SELECT COALESCE(SUM(
    CASE WHEN tx.account_id = p_account_id THEN
      CASE
        WHEN tx.type IN ('expense', 'transfer') THEN -tx.amount_in_account_currency
        WHEN tx.type = 'income' THEN tx.amount_in_account_currency
        WHEN tx.type = 'adjustment' AND NOT COALESCE(
          target_account.type = 'credit_card'
          AND target_account.is_multicurrency
          AND target_account.secondary_currency IS NOT NULL
          AND upper(trim(COALESCE(tx.currency, ''))) = upper(trim(target_account.secondary_currency)),
          FALSE
        ) THEN tx.amount_in_account_currency
        ELSE 0
      END
    ELSE 0 END
    + CASE WHEN tx.destination_account_id = p_account_id AND tx.type = 'transfer' THEN
      -- The trigger stores each impact in NUMERIC(20,8). Round the legacy
      -- product per movement, rather than rounding a sum of unrounded products.
      round(COALESCE(tx.destination_amount_in_account_currency, tx.amount * COALESCE(tx.exchange_rate, 1)), 8)
    ELSE 0 END
  ), 0) INTO recomputed_balance
  FROM public.transactions tx
  WHERE tx.user_id = p_user_id
    AND (tx.account_id = p_account_id OR tx.destination_account_id = p_account_id);

  UPDATE public.accounts
  SET balance = recomputed_balance, updated_at = now()
  WHERE id = p_account_id AND user_id = p_user_id;

  RETURN jsonb_build_object('before', target_account.balance, 'after', recomputed_balance);
END;
$$;

-- Only the authenticated server route may use this repair operation through
-- its service client. Normal clients cannot replace balances directly by RPC.
REVOKE ALL ON FUNCTION public.recompute_account_balance(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_account_balance(UUID, UUID) TO service_role;

-- Canonical impacts have scale 8 before touching the balance. Rounding the
-- accumulated balance instead depends on ordering at a half-unit near zero.
-- Only the two destination credit/reversal expressions differ from 20261007.
-- Persisted destination amounts stay authoritative; no history is revalued.
CREATE OR REPLACE FUNCTION public.update_account_balance()
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
      UPDATE public.accounts SET balance = balance - round(COALESCE(OLD.destination_amount_in_account_currency, OLD.amount * COALESCE(OLD.exchange_rate, 1)), 8)
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
      UPDATE public.accounts SET balance = balance + round(COALESCE(NEW.destination_amount_in_account_currency, NEW.amount * COALESCE(NEW.exchange_rate, 1)), 8)
      WHERE id = NEW.destination_account_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
-- END supabase/migrations/20261015000402_atomic_account_balance_recompute.sql

-- BEGIN supabase/migrations/20261015072636_audit_transaction_deletions.sql
-- SHA256 f5e9ecde74f98b62233aada534206df22655361a661b6b1963a537b221f1b355
-- CP1-08: retain the deleted movement without keeping an operational ledger row.
-- No foreign keys: deleting the original row/profile must not erase its identity.
CREATE TABLE public.transaction_deletion_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,
  user_id UUID NOT NULL,
  actor_id UUID,
  actor_role TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  previous_row JSONB NOT NULL
);

CREATE INDEX transaction_deletion_audit_user_deleted_idx
  ON public.transaction_deletion_audit (user_id, deleted_at DESC);
ALTER TABLE public.transaction_deletion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transaction_deletion_audit FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.transaction_deletion_audit TO authenticated, service_role;
CREATE POLICY "Owners read their deleted movements"
  ON public.transaction_deletion_audit FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- The trigger alone may append. Do not expose a callable definer in public or
-- grant INSERT to clients, which would let them fabricate OLD values/actors.
CREATE SCHEMA transaction_audit_private;
REVOKE ALL ON SCHEMA transaction_audit_private FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION transaction_audit_private.record_transaction_deletion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_actor_id UUID := auth.uid();
BEGIN
  IF v_actor_id IS NOT NULL AND v_actor_id <> OLD.user_id THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.transaction_deletion_audit
    (transaction_id, user_id, actor_id, actor_role, previous_row)
  VALUES (
    OLD.id, OLD.user_id, v_actor_id,
    COALESCE(NULLIF(pg_catalog.current_setting('role', true), 'none'), session_user::TEXT),
    pg_catalog.to_jsonb(OLD)
  );
  -- A service operation without an authenticated UID records a NULL actor_id;
  -- the row owner is never substituted for the actual actor.
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION transaction_audit_private.record_transaction_deletion()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trigger_audit_transaction_deletion
  AFTER DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION transaction_audit_private.record_transaction_deletion();
-- END supabase/migrations/20261015072636_audit_transaction_deletions.sql

-- BEGIN supabase/migrations/20261015072807_presentation_preferences.sql
-- SHA256 ca6aefd4b6c61e4a60f4b4dd075f5fd6bbbe27dd6e72e7ecddd024544c421309
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
-- END supabase/migrations/20261015072807_presentation_preferences.sql

-- BEGIN supabase/migrations/20261024170000_investment_type_on.sql
-- SHA256 c90422088b1113bfdb6fc32d511585b07d5d3beea241113d5fa6161274764545
-- Obligaciones negociables as their own instrument type, distinct from sovereign bonds.
-- Must commit before any statement uses the new enum label.
ALTER TYPE public.investment_type ADD VALUE IF NOT EXISTS 'on';
-- END supabase/migrations/20261024170000_investment_type_on.sql

-- BEGIN supabase/migrations/20261024170100_investment_backlog.sql
-- SHA256 35a56be1ed5338bc85220cb1e7e88476cddfeeac57044eb272d692e4420e094c
-- Investment backlog: optional lot date, quote vs payment currency, ON law,
-- crypto accounts as a valid home for crypto positions, and create_investment_once
-- aligned with those fields. Does not rewrite existing rows.

ALTER TABLE public.investments
  ALTER COLUMN purchase_date DROP NOT NULL;

ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS payment_currency TEXT,
  ADD COLUMN IF NOT EXISTS law TEXT;

COMMENT ON COLUMN public.investments.purchase_date IS
  'Optional lot date. NULL when the holding was imported without a known purchase date.';
COMMENT ON COLUMN public.investments.payment_currency IS
  'Currency in which cash flows are settled (hard-dollar bonds/ONs may still quote in ARS).';
COMMENT ON COLUMN public.investments.law IS
  'Governing law for ON / sovereign bonds (e.g. NY, Argentina).';

CREATE OR REPLACE FUNCTION public.create_investment_once(
  p_user_id UUID, p_request_id TEXT, p_request_hash TEXT, p_investment JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prior public.investment_create_requests%ROWTYPE; created public.investments%ROWTYPE; result JSONB;
  v_type TEXT;
BEGIN
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
    OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
  IF p_user_id IS NULL OR (p_investment->>'user_id')::UUID IS DISTINCT FROM p_user_id
    OR (auth.uid() IS NOT NULL AND auth.uid() <> p_user_id) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('investment-create:' || p_user_id || ':' || p_request_id, 0));
  SELECT * INTO prior FROM public.investment_create_requests WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Request payload conflict'; END IF;
    RETURN prior.response;
  END IF;
  v_type := COALESCE(p_investment->>'type', '');
  -- Investment accounts always; crypto accounts only for crypto positions.
  PERFORM 1 FROM public.accounts WHERE id=(p_investment->>'account_id')::UUID
    AND user_id=p_user_id AND is_active
    AND (
      type = 'investment'
      OR (type = 'crypto' AND v_type = 'crypto')
    )
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta de inversión no encontrada'; END IF;
  IF (p_investment->>'quantity')::NUMERIC IS NULL OR (p_investment->>'quantity')::NUMERIC <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;
  IF COALESCE((p_investment->>'is_manual_price')::BOOLEAN,FALSE) AND
    ((p_investment->>'current_price')::NUMERIC IS NULL OR (p_investment->>'current_price')::NUMERIC <= 0) THEN
    RAISE EXCEPTION 'PRECIO_INVALIDO';
  END IF;
  INSERT INTO public.investments(
    user_id,account_id,type,ticker,name,quantity,purchase_price,purchase_currency,
    purchase_date,maturity_date,interest_rate,notes,market_currency,payment_currency,law,
    is_manual_price,current_price,current_price_updated_at
  )
  VALUES(
    p_user_id,
    (p_investment->>'account_id')::UUID,
    (p_investment->>'type')::public.investment_type,
    p_investment->>'ticker',
    p_investment->>'name',
    (p_investment->>'quantity')::NUMERIC,
    (p_investment->>'purchase_price')::NUMERIC,
    p_investment->>'purchase_currency',
    NULLIF(p_investment->>'purchase_date','')::DATE,
    NULLIF(p_investment->>'maturity_date','')::DATE,
    (p_investment->>'interest_rate')::NUMERIC,
    p_investment->>'notes',
    NULLIF(p_investment->>'market_currency',''),
    NULLIF(p_investment->>'payment_currency',''),
    NULLIF(p_investment->>'law',''),
    COALESCE((p_investment->>'is_manual_price')::BOOLEAN,FALSE),
    (p_investment->>'current_price')::NUMERIC,
    (p_investment->>'current_price_updated_at')::TIMESTAMPTZ
  )
  RETURNING * INTO created;
  result := to_jsonb(created);
  INSERT INTO public.investment_create_requests(user_id,request_id,request_hash,response)
    VALUES(p_user_id,p_request_id,p_request_hash,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_investment_once(UUID,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_investment_once(UUID,TEXT,TEXT,JSONB) TO service_role;
-- END supabase/migrations/20261024170100_investment_backlog.sql

-- BEGIN supabase/migrations/20261024180000_ai_integrations_foundation.sql
-- SHA256 180c1ad668dc9b09b8c07fb2860dc1e408b181587f27bfdc75a66283aca349db
-- AI-first public integrations: write channel, PATs, encrypted secrets,
-- pending inbox, card maps, audit log. Idempotent. Additive for secrets:
-- plaintext columns are NOT copied or nulled here (staged rollout).
--
-- Prod apply order (do not skip). NEVER `supabase db push`.
-- Prod migration history recorded #15 as 20261024182913 (investment_type_on)
-- and 20261024182923 (investment_backlog), not the filenames 20261024170000 /
-- 170100. `db push` would try to re-apply those files. Apply #16 one file at
-- a time with `apply_migration` (version = the filename timestamp).
--
--   1. PITR marker
--   2. apply_migration 20261024180000_ai_integrations_foundation.sql
--   3. apply_migration 20261024190000_pat_rls_confirm_quotes.sql
--   4. Deploy #16 code (encrypt-only writes; Vault-aware Telegram readers)
--   5. Pause key edits, run supabase/manual/backfill-user-secrets.sql
--   6. Run supabase/manual/20261025120000_revoke_plaintext_secret_updates.sql
--      (not a timestamped migration — db push cannot apply it early)
--   7. Later follow-up: supabase/manual/null-plaintext-user-secrets.sql
--
-- Rollback to main (dpl_9Dq25… / 7651817): keys saved after step 4 have
-- plaintext NULLed. Before rolling the app back, run
-- supabase/manual/restore-plaintext-from-vault.sql so main can still read
-- Gemini/Telegram secrets. Do not roll back until that restore verifies.
-- PAT hashes are SHA-256 (hash_version=1). v2 is reserved and not enabled.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Write channel on transactions
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web';

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_source_check
  CHECK (source IN ('web', 'telegram', 'wallet', 'api', 'mcp'));

CREATE INDEX IF NOT EXISTS idx_transactions_user_source
  ON public.transactions (user_id, source, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_transaction_once(
  p_user_id UUID, p_request_id TEXT, p_request_hash TEXT, p_transaction JSONB,
  p_installments INTEGER DEFAULT 1
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  prior public.transaction_requests%ROWTYPE;
  t public.transactions%ROWTYPE;
  result JSONB;
  installment_group UUID;
BEGIN
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
     OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid request identifier or fingerprint';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_id, 0));
  SELECT * INTO prior FROM public.transaction_requests
    WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'Z0001', MESSAGE = 'Request payload conflict';
    END IF;
    RETURN prior.response;
  END IF;

  t := jsonb_populate_record(NULL::public.transactions, p_transaction);
  IF t.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_installments IS NULL OR p_installments < 1 OR p_installments > 36 THEN
    RAISE EXCEPTION 'Invalid installments';
  END IF;
  IF p_installments > 1 THEN
    IF t.type <> 'expense' THEN RAISE EXCEPTION 'Installments require expense'; END IF;
    installment_group := public.create_installment_transactions(p_user_id, t.account_id,
      t.amount, t.currency, p_installments, t.category_id, t.description, t.transaction_date);
    SELECT to_jsonb(tx) INTO STRICT result FROM public.transactions tx
      WHERE tx.user_id = p_user_id AND tx.installment_group_id = installment_group
        AND tx.installment_number = 1;
  ELSE
    INSERT INTO public.transactions (user_id, type, account_id, destination_account_id,
      amount, currency, amount_in_account_currency, destination_amount_in_account_currency,
      exchange_rate, category_id, description, notes, tags, transaction_date, is_recurring,
      recurring_rule_id, source)
    VALUES (p_user_id, t.type, t.account_id, t.destination_account_id, t.amount, t.currency,
      t.amount_in_account_currency, t.destination_amount_in_account_currency, t.exchange_rate,
      t.category_id, t.description, t.notes, t.tags, COALESCE(t.transaction_date, now()),
      COALESCE(t.is_recurring, false), t.recurring_rule_id, COALESCE(t.source, 'web'))
    RETURNING to_jsonb(transactions.*) INTO result;
  END IF;
  INSERT INTO public.transaction_requests (user_id, request_id, request_hash, response)
    VALUES (p_user_id, p_request_id, p_request_hash, result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_transaction_once(UUID, TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_transaction_once(UUID, TEXT, TEXT, JSONB, INTEGER) TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Personal access tokens (hash only)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.personal_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  token_prefix TEXT NOT NULL CHECK (char_length(token_prefix) BETWEEN 8 AND 16),
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  hash_version SMALLINT NOT NULL DEFAULT 1 CHECK (hash_version IN (1, 2)),
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT personal_access_tokens_scopes_check CHECK (
    scopes <@ ARRAY['read','write','ingest','write:confirm']::TEXT[]
    AND array_length(scopes, 1) >= 1
  )
);

ALTER TABLE public.personal_access_tokens
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.personal_access_tokens
  ADD COLUMN IF NOT EXISTS hash_version SMALLINT;
UPDATE public.personal_access_tokens SET hash_version = 1 WHERE hash_version IS NULL;
ALTER TABLE public.personal_access_tokens ALTER COLUMN hash_version SET DEFAULT 1;
ALTER TABLE public.personal_access_tokens ALTER COLUMN hash_version SET NOT NULL;
ALTER TABLE public.personal_access_tokens DROP CONSTRAINT IF EXISTS personal_access_tokens_hash_version_check;
ALTER TABLE public.personal_access_tokens ADD CONSTRAINT personal_access_tokens_hash_version_check
  CHECK (hash_version IN (1, 2));
ALTER TABLE public.personal_access_tokens DROP CONSTRAINT IF EXISTS personal_access_tokens_scopes_check;
ALTER TABLE public.personal_access_tokens ADD CONSTRAINT personal_access_tokens_scopes_check CHECK (
  scopes <@ ARRAY['read','write','ingest','write:confirm']::TEXT[]
  AND array_length(scopes, 1) >= 1
);
UPDATE public.personal_access_tokens
  SET expires_at = created_at + interval '365 days'
  WHERE expires_at IS NULL;
ALTER TABLE public.personal_access_tokens
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '365 days');
ALTER TABLE public.personal_access_tokens ALTER COLUMN expires_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS personal_access_tokens_hash_unique
  ON public.personal_access_tokens (token_hash);
CREATE INDEX IF NOT EXISTS personal_access_tokens_user_idx
  ON public.personal_access_tokens (user_id, created_at DESC);

ALTER TABLE public.personal_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_access_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pat_select_own ON public.personal_access_tokens;
CREATE POLICY pat_select_own ON public.personal_access_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pat_no_client_write ON public.personal_access_tokens;
-- Inserts/updates/deletes go through the service role API so token_hash never
-- crosses PostgREST as a client write.
REVOKE ALL ON public.personal_access_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, name, token_prefix, scopes, expires_at, last_used_at, revoked_at, created_at, updated_at)
  ON public.personal_access_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_access_tokens TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Encrypted user secrets (Supabase Vault; fail closed)
-- Additive only. Plaintext columns stay until later manual migrations:
--   supabase/manual/backfill-user-secrets.sql  (copy+verify, never nulls)
--   supabase/manual/null-plaintext-user-secrets.sql (null only after verify)
-- Those must run AFTER encrypted writes are live. They are not applied here.
-- Recovery if a preview DB applied old commit 925b46c (user_secret_backup +
-- public.decrypt_user_secret / envelope:v0): this migration DROPs that backup
-- table and the public decrypt function. Prod never ran 925b46c. Do not copy
-- leftover envelope ciphertext forward; re-save secrets so _enc is vault/AES.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gemini_api_key_enc TEXT,
  ADD COLUMN IF NOT EXISTS telegram_bot_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS wallet_auto_confirm BOOLEAN NOT NULL DEFAULT FALSE;

GRANT SELECT (wallet_auto_confirm), UPDATE (wallet_auto_confirm)
  ON public.users TO authenticated;
-- Do NOT REVOKE UPDATE on plaintext secret columns here. Old code (main)
-- still writes gemini_api_key / telegram_bot_token as authenticated.
-- Apply supabase/manual/20261025120000_revoke_plaintext_secret_updates.sql
-- AFTER the #16 code deploy. It is not a timestamped migration so db push
-- cannot apply it early. See that file for the numbered runbook.

CREATE SCHEMA IF NOT EXISTS zarix_vault;
REVOKE ALL ON SCHEMA zarix_vault FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA zarix_vault TO service_role;

DROP TABLE IF EXISTS zarix_vault.user_secret_backup;
DROP FUNCTION IF EXISTS public.decrypt_user_secret(TEXT);
DROP FUNCTION IF EXISTS zarix_vault.encrypt_secret(TEXT);
DROP FUNCTION IF EXISTS zarix_vault.decrypt_secret(TEXT);
DROP FUNCTION IF EXISTS zarix_vault.copy_user_secrets();
DROP FUNCTION IF EXISTS zarix_vault.finalize_plaintext_null();
DROP FUNCTION IF EXISTS zarix_vault.rollback_plaintext();

CREATE OR REPLACE FUNCTION zarix_vault.assert_kind(p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('gemini_api_key', 'telegram_bot_token') THEN
    RAISE EXCEPTION 'zarix_vault_invalid_kind';
  END IF;
  RETURN p_kind;
END;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.secret_name(p_user_id UUID, p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'zarix.user.' || zarix_vault.assert_kind(p_kind) || '.' || p_user_id::text;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.vault_available()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'vault') THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'Supabase Vault (schema vault) is required. pgcrypto/envelope is not a fallback.';
  END IF;
  RETURN TRUE;
END;
$$;

-- Fail closed: never envelope, never a repo-hardcoded key, never pgcrypto
-- with a published passphrase. Production uses supabase_vault.
CREATE OR REPLACE FUNCTION zarix_vault.store_user_secret(p_user_id UUID, p_kind TEXT, p_plain TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  secret_name TEXT;
  secret_id TEXT;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'zarix_vault_invalid_user'; END IF;
  IF p_plain IS NULL OR p_plain = '' THEN
    RETURN zarix_vault.delete_user_secret(p_user_id, p_kind);
  END IF;
  IF NOT zarix_vault.vault_available() THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'Supabase Vault (schema vault) is required in production. Tests may use app AES-GCM with ZARIX_SECRETS_MASTER_KEY.';
  END IF;
  secret_name := zarix_vault.secret_name(p_user_id, p_kind);
  BEGIN
    EXECUTE 'SELECT id::text FROM vault.secrets WHERE name = $1' INTO secret_id USING secret_name;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE EXCEPTION 'zarix_vault_unavailable';
  END;
  IF secret_id IS NOT NULL THEN
    EXECUTE 'SELECT vault.update_secret($1::uuid, $2, $3, $4)' USING secret_id::uuid, p_plain, secret_name, 'zarix user secret';
    RETURN 'vault:v1:' || secret_id;
  END IF;
  EXECUTE 'SELECT vault.create_secret($1, $2, $3)::text' INTO secret_id USING p_plain, secret_name, 'zarix user secret';
  IF secret_id IS NULL OR secret_id = '' THEN
    RAISE EXCEPTION 'zarix_vault_store_failed';
  END IF;
  RETURN 'vault:v1:' || secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.read_user_secret(p_user_id UUID, p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  secret_name TEXT;
  val TEXT;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'zarix_vault_invalid_user'; END IF;
  IF NOT zarix_vault.vault_available() THEN
    RAISE EXCEPTION 'zarix_vault_unavailable';
  END IF;
  secret_name := zarix_vault.secret_name(p_user_id, p_kind);
  BEGIN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO val USING secret_name;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE EXCEPTION 'zarix_vault_unavailable';
  END;
  RETURN val;
END;
$$;

CREATE OR REPLACE FUNCTION zarix_vault.delete_user_secret(p_user_id UUID, p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  secret_name TEXT;
  secret_id UUID;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'zarix_vault_invalid_user'; END IF;
  PERFORM zarix_vault.vault_available();
  secret_name := zarix_vault.secret_name(p_user_id, p_kind);
  BEGIN
    EXECUTE 'SELECT id FROM vault.secrets WHERE name = $1' INTO secret_id USING secret_name;
    IF secret_id IS NOT NULL THEN
      EXECUTE 'DELETE FROM vault.secrets WHERE id = $1' USING secret_id;
    END IF;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE EXCEPTION 'zarix_vault_unavailable';
  END;
  RETURN NULL;
END;
$$;

-- PostgREST trampolines: implementation lives in zarix_vault. EXECUTE is
-- revoked from anon/authenticated. There is no public.decrypt_user_secret.
CREATE OR REPLACE FUNCTION public.zarix_vault_store(p_user_id UUID, p_kind TEXT, p_plain TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, zarix_vault, pg_temp
AS $$
  SELECT zarix_vault.store_user_secret(p_user_id, p_kind, p_plain);
$$;

CREATE OR REPLACE FUNCTION public.zarix_vault_read(p_user_id UUID, p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, zarix_vault, pg_temp
AS $$
  SELECT zarix_vault.read_user_secret(p_user_id, p_kind);
$$;

REVOKE ALL ON FUNCTION zarix_vault.assert_kind(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.secret_name(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.vault_available() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.store_user_secret(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.read_user_secret(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION zarix_vault.delete_user_secret(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zarix_vault_store(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zarix_vault_read(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zarix_vault.vault_available() TO service_role;
GRANT EXECUTE ON FUNCTION zarix_vault.store_user_secret(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION zarix_vault.read_user_secret(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION zarix_vault.delete_user_secret(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.zarix_vault_store(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.zarix_vault_read(UUID, TEXT) TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. Pending inbox + remembered card maps
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.wallet_card_account_maps (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  card_name_normalized TEXT NOT NULL CHECK (char_length(card_name_normalized) BETWEEN 1 AND 80),
  account_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_name_normalized),
  FOREIGN KEY (account_id, user_id) REFERENCES public.accounts(id, user_id)
);

CREATE TABLE IF NOT EXISTS public.pending_inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC(20, 8),
  currency TEXT NOT NULL DEFAULT 'ARS',
  merchant TEXT,
  card_name TEXT,
  account_id UUID,
  category_id UUID,
  occurred_at TIMESTAMPTZ,
  raw_payload JSONB,
  tool_payload JSONB,
  raw_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'discarded')),
  suggestion_source TEXT CHECK (suggestion_source IS NULL OR suggestion_source IN ('history', 'heuristic', 'none', 'gemini')),
  idempotency_key TEXT,
  ingest_key TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  direction TEXT NOT NULL DEFAULT 'expense' CHECK (direction IN ('expense', 'income')),
  amount_ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'wallet' CHECK (source IN ('web', 'telegram', 'wallet', 'api', 'mcp')),
  fingerprint TEXT NOT NULL,
  confirmed_transaction_id UUID,
  discarded_at TIMESTAMPTZ,
  claim_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pending_inbox_amount_nonneg CHECK (amount IS NULL OR amount > 0),
  FOREIGN KEY (account_id, user_id) REFERENCES public.accounts(id, user_id)
);

ALTER TABLE public.pending_inbox_items ADD COLUMN IF NOT EXISTS ingest_key TEXT;
ALTER TABLE public.pending_inbox_items ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE public.pending_inbox_items ADD COLUMN IF NOT EXISTS amount_ambiguous BOOLEAN;
ALTER TABLE public.pending_inbox_items ADD COLUMN IF NOT EXISTS tool_payload JSONB;
ALTER TABLE public.pending_inbox_items ADD COLUMN IF NOT EXISTS claim_id UUID;
UPDATE public.pending_inbox_items
   SET ingest_key = COALESCE(NULLIF(ingest_key, ''), idempotency_key, id::text)
 WHERE ingest_key IS NULL OR ingest_key = '';
UPDATE public.pending_inbox_items SET direction = 'expense' WHERE direction IS NULL;
UPDATE public.pending_inbox_items SET amount_ambiguous = FALSE WHERE amount_ambiguous IS NULL;
ALTER TABLE public.pending_inbox_items ALTER COLUMN ingest_key SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public.pending_inbox_items ALTER COLUMN ingest_key SET NOT NULL;
ALTER TABLE public.pending_inbox_items ALTER COLUMN direction SET DEFAULT 'expense';
ALTER TABLE public.pending_inbox_items ALTER COLUMN direction SET NOT NULL;
ALTER TABLE public.pending_inbox_items ALTER COLUMN amount_ambiguous SET DEFAULT FALSE;
ALTER TABLE public.pending_inbox_items ALTER COLUMN amount_ambiguous SET NOT NULL;
ALTER TABLE public.pending_inbox_items DROP CONSTRAINT IF EXISTS pending_inbox_direction_check;
ALTER TABLE public.pending_inbox_items ADD CONSTRAINT pending_inbox_direction_check
  CHECK (direction IN ('expense', 'income'));

CREATE UNIQUE INDEX IF NOT EXISTS pending_inbox_idempotency_unique
  ON public.pending_inbox_items (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pending_inbox_ingest_key_unique
  ON public.pending_inbox_items (user_id, ingest_key);
CREATE UNIQUE INDEX IF NOT EXISTS pending_inbox_fingerprint_pending_unique
  ON public.pending_inbox_items (user_id, fingerprint)
  WHERE status IN ('pending', 'confirming');
CREATE INDEX IF NOT EXISTS pending_inbox_user_status_idx
  ON public.pending_inbox_items (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pending_inbox_fingerprint_idx
  ON public.pending_inbox_items (user_id, fingerprint, created_at DESC);

ALTER TABLE public.wallet_card_account_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_card_account_maps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pending_inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_inbox_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_maps_all_own ON public.wallet_card_account_maps;
DROP POLICY IF EXISTS wallet_maps_select_own ON public.wallet_card_account_maps;
DROP POLICY IF EXISTS wallet_maps_insert_own ON public.wallet_card_account_maps;
DROP POLICY IF EXISTS wallet_maps_update_own ON public.wallet_card_account_maps;
DROP POLICY IF EXISTS wallet_maps_delete_own ON public.wallet_card_account_maps;
CREATE POLICY wallet_maps_select_own ON public.wallet_card_account_maps
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY wallet_maps_insert_own ON public.wallet_card_account_maps
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY wallet_maps_update_own ON public.wallet_card_account_maps
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY wallet_maps_delete_own ON public.wallet_card_account_maps
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pending_inbox_all_own ON public.pending_inbox_items;
DROP POLICY IF EXISTS pending_inbox_select_own ON public.pending_inbox_items;
DROP POLICY IF EXISTS pending_inbox_insert_own ON public.pending_inbox_items;
DROP POLICY IF EXISTS pending_inbox_update_own ON public.pending_inbox_items;
DROP POLICY IF EXISTS pending_inbox_delete_own ON public.pending_inbox_items;
CREATE POLICY pending_inbox_select_own ON public.pending_inbox_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY pending_inbox_insert_own ON public.pending_inbox_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY pending_inbox_update_own ON public.pending_inbox_items
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY pending_inbox_delete_own ON public.pending_inbox_items
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.wallet_card_account_maps, public.pending_inbox_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_card_account_maps, public.pending_inbox_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_card_account_maps, public.pending_inbox_items TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. Integration audit log
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.integration_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 3 AND 40),
  source TEXT NOT NULL CHECK (source IN ('web', 'telegram', 'wallet', 'api', 'mcp')),
  ip_hash TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integration_audit_outcome_check CHECK (
    outcome IS NULL OR outcome IN ('ok', 'error', 'thrown', 'denied')
  )
);
ALTER TABLE public.integration_audit_log ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE public.integration_audit_log DROP CONSTRAINT IF EXISTS integration_audit_outcome_check;
ALTER TABLE public.integration_audit_log ADD CONSTRAINT integration_audit_outcome_check CHECK (
  outcome IS NULL OR outcome IN ('ok', 'error', 'thrown', 'denied')
);

CREATE INDEX IF NOT EXISTS integration_audit_user_idx
  ON public.integration_audit_log (user_id, created_at DESC);

ALTER TABLE public.integration_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_audit_select_own ON public.integration_audit_log;
CREATE POLICY integration_audit_select_own ON public.integration_audit_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.integration_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.integration_audit_log TO authenticated;
GRANT SELECT, INSERT ON public.integration_audit_log TO service_role;
-- END supabase/migrations/20261024180000_ai_integrations_foundation.sql

-- BEGIN supabase/migrations/20261024190000_pat_rls_confirm_quotes.sql
-- SHA256 d367685854283a88869f24114382899a26bcff4ea2efd4336396b812546fcec8
-- Atomic pending-inbox confirm + authenticated claim helper.
-- Idempotent. Does not rewrite financial amounts.

ALTER TABLE public.pending_inbox_items
  DROP CONSTRAINT IF EXISTS pending_inbox_items_status_check;
ALTER TABLE public.pending_inbox_items
  ADD CONSTRAINT pending_inbox_items_status_check
  CHECK (status IN ('pending', 'confirming', 'confirmed', 'discarded'));

CREATE OR REPLACE FUNCTION public.claim_pending_inbox_item(
  p_user_id UUID,
  p_item_id UUID
) RETURNS SETOF public.pending_inbox_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':inbox:' || p_item_id::text, 0));
  RETURN QUERY
  UPDATE public.pending_inbox_items
     SET status = 'confirming',
         claim_id = gen_random_uuid(),
         updated_at = now()
   WHERE id = p_item_id
     AND user_id = p_user_id
     AND status = 'pending'
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_inbox_item(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_pending_inbox_item(UUID, UUID) TO authenticated, service_role;
-- END supabase/migrations/20261024190000_pat_rls_confirm_quotes.sql

-- BEGIN supabase/migrations/20261024200000_inbox_dedupe_uncertain_rate_limit.sql
-- SHA256 aedc14946a29ef7d797ef442439e1e86198b5b5c3767800bb435a27e2156ddc0
-- Inbox event identity survives confirmation, uncertain confirm state,
-- shared rate-limit counters, installment write-channel, vault assert.
-- Idempotent. Additive. NEVER `supabase db push`.

-- Fail closed if Vault is missing at apply time. PGlite tests stub schema vault.
DO $$
BEGIN
  PERFORM zarix_vault.vault_available();
EXCEPTION
  WHEN undefined_function THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'zarix_vault.vault_available() must exist before this migration.';
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Uncertain inbox status + fingerprint reserved after confirm
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.pending_inbox_items
  DROP CONSTRAINT IF EXISTS pending_inbox_items_status_check;
ALTER TABLE public.pending_inbox_items
  ADD CONSTRAINT pending_inbox_items_status_check
  CHECK (status IN ('pending', 'confirming', 'confirmed', 'discarded', 'uncertain'));

DROP INDEX IF EXISTS pending_inbox_fingerprint_pending_unique;
CREATE UNIQUE INDEX IF NOT EXISTS pending_inbox_fingerprint_reserved_unique
  ON public.pending_inbox_items (user_id, fingerprint)
  WHERE status IN ('pending', 'confirming', 'confirmed', 'uncertain');

CREATE OR REPLACE FUNCTION public.claim_pending_inbox_item(
  p_user_id UUID,
  p_item_id UUID
) RETURNS SETOF public.pending_inbox_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':inbox:' || p_item_id::text, 0));
  RETURN QUERY
  UPDATE public.pending_inbox_items
     SET status = 'confirming',
         claim_id = gen_random_uuid(),
         updated_at = now()
   WHERE id = p_item_id
     AND user_id = p_user_id
     AND status IN ('pending', 'uncertain')
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_inbox_item(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_pending_inbox_item(UUID, UUID) TO authenticated, service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Shared atomic rate-limit counters (token + user)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key TEXT PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 200),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_counters TO service_role;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key TEXT,
  p_max INTEGER,
  p_window_ms INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  rec public.rate_limit_counters%ROWTYPE;
  now_ts TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_key IS NULL OR char_length(p_key) < 1 OR char_length(p_key) > 200 THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;
  IF p_max IS NULL OR p_max < 1 OR p_window_ms IS NULL OR p_window_ms < 1 THEN
    RAISE EXCEPTION 'Invalid rate-limit window';
  END IF;
  INSERT INTO public.rate_limit_counters AS c (key, count, window_start)
  VALUES (p_key, 1, now_ts)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
          WHEN c.window_start <= now_ts - ((p_window_ms::text || ' milliseconds')::interval)
            THEN 1
          ELSE c.count + 1
        END,
        window_start = CASE
          WHEN c.window_start <= now_ts - ((p_window_ms::text || ' milliseconds')::interval)
            THEN now_ts
          ELSE c.window_start
        END
  RETURNING * INTO rec;
  RETURN rec.count <= p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Installment writes keep the originating channel
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DROP FUNCTION IF EXISTS public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ);

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
    installment_date := p_start_date + (i - 1) * INTERVAL '1 month';
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

REVOKE ALL ON FUNCTION public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.create_transaction_once(
  p_user_id UUID, p_request_id TEXT, p_request_hash TEXT, p_transaction JSONB,
  p_installments INTEGER DEFAULT 1
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  prior public.transaction_requests%ROWTYPE;
  t public.transactions%ROWTYPE;
  result JSONB;
  installment_group UUID;
BEGIN
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$'
     OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid request identifier or fingerprint';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_id, 0));
  SELECT * INTO prior FROM public.transaction_requests
    WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.request_hash <> p_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'Z0001', MESSAGE = 'Request payload conflict';
    END IF;
    RETURN prior.response;
  END IF;

  t := jsonb_populate_record(NULL::public.transactions, p_transaction);
  IF t.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_installments IS NULL OR p_installments < 1 OR p_installments > 36 THEN
    RAISE EXCEPTION 'Invalid installments';
  END IF;
  IF p_installments > 1 THEN
    IF t.type <> 'expense' THEN RAISE EXCEPTION 'Installments require expense'; END IF;
    installment_group := public.create_installment_transactions(p_user_id, t.account_id,
      t.amount, t.currency, p_installments, t.category_id, t.description,
      COALESCE(t.transaction_date, now()), COALESCE(t.source, 'web'));
    SELECT to_jsonb(tx) INTO STRICT result FROM public.transactions tx
      WHERE tx.user_id = p_user_id AND tx.installment_group_id = installment_group
        AND tx.installment_number = 1;
  ELSE
    INSERT INTO public.transactions (user_id, type, account_id, destination_account_id,
      amount, currency, amount_in_account_currency, destination_amount_in_account_currency,
      exchange_rate, category_id, description, notes, tags, transaction_date, is_recurring,
      recurring_rule_id, source)
    VALUES (p_user_id, t.type, t.account_id, t.destination_account_id, t.amount, t.currency,
      t.amount_in_account_currency, t.destination_amount_in_account_currency, t.exchange_rate,
      t.category_id, t.description, t.notes, t.tags, COALESCE(t.transaction_date, now()),
      COALESCE(t.is_recurring, false), t.recurring_rule_id, COALESCE(t.source, 'web'))
    RETURNING to_jsonb(transactions.*) INTO result;
  END IF;
  INSERT INTO public.transaction_requests (user_id, request_id, request_hash, response)
    VALUES (p_user_id, p_request_id, p_request_hash, result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_transaction_once(UUID, TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_transaction_once(UUID, TEXT, TEXT, JSONB, INTEGER) TO service_role;
-- END supabase/migrations/20261024200000_inbox_dedupe_uncertain_rate_limit.sql
