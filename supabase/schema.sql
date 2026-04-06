-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ZARIX - SCHEMA SUPABASE
-- Aplicación financiera personal para mercado argentino
-- Optimizado para tier gratuito (500MB DB, suficiente para años)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para búsqueda full-text rápida

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
  default_currency TEXT NOT NULL DEFAULT 'ARS',
  timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  notification_time TIME DEFAULT '22:00:00',
  daily_summary_enabled BOOLEAN DEFAULT TRUE,
  weekly_summary_enabled BOOLEAN DEFAULT TRUE,
  monthly_summary_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_telegram ON users(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

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
  frequency recurrence_frequency NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  last_executed_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recurring_user ON recurring_rules(user_id, is_active);

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
  maturity_date DATE,
  interest_rate NUMERIC(8, 4),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT positive_quantity CHECK (quantity > 0),
  CONSTRAINT positive_price CHECK (purchase_price > 0)
);

CREATE INDEX idx_investments_user ON investments(user_id, is_active);
CREATE INDEX idx_investments_account ON investments(account_id);
CREATE INDEX idx_investments_type ON investments(type, is_active);
CREATE INDEX idx_investments_ticker ON investments(ticker) WHERE ticker IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. BOT SESSIONS (contexto de conversación con IA)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  account_record accounts%ROWTYPE;
  dest_account_record accounts%ROWTYPE;
  amount_delta NUMERIC(20, 8);
  dest_amount_delta NUMERIC(20, 8);
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
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;

-- Users: solo puede ver y editar su propio perfil
CREATE POLICY users_select ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY users_update ON users FOR UPDATE USING (auth.uid() = id);

-- Accounts: solo sus propias cuentas (TO authenticated; anon sin política = sin acceso)
CREATE POLICY accounts_select_own ON accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY accounts_insert_own ON accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY accounts_update_own ON accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY accounts_delete_own ON accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Categories: sistema (is_system=true) son visibles para todos, custom solo para owner
CREATE POLICY categories_select ON categories FOR SELECT USING (
  is_system = TRUE OR auth.uid() = user_id
);
CREATE POLICY categories_insert ON categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY categories_update ON categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY categories_delete ON categories FOR DELETE USING (auth.uid() = user_id);

-- Transactions: solo las propias
CREATE POLICY transactions_all ON transactions FOR ALL USING (auth.uid() = user_id);

-- Recurring rules: solo las propias
CREATE POLICY recurring_rules_all ON recurring_rules FOR ALL USING (auth.uid() = user_id);

-- Budgets: solo los propios
CREATE POLICY budgets_all ON budgets FOR ALL USING (auth.uid() = user_id);

-- Investments: solo las propias
CREATE POLICY investments_all ON investments FOR ALL USING (auth.uid() = user_id);

-- Bot sessions: solo las propias
CREATE POLICY bot_sessions_all ON bot_sessions FOR ALL USING (auth.uid() = user_id);

-- Exchange rates: lectura pública (no hay datos sensibles)
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY exchange_rates_select ON exchange_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY exchange_rates_insert ON exchange_rates FOR INSERT WITH CHECK (true);

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
CREATE OR REPLACE VIEW v_user_balance_summary AS
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
CREATE OR REPLACE VIEW v_current_month_expenses AS
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
  UPDATE users
  SET telegram_chat_id = p_telegram_chat_id
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- NOTAS FINALES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Los saldos se calculan en tiempo real vía trigger (no hay
--    inconsistencias)
-- 2. Los índices compuestos optimizan las queries más comunes del dashboard
-- 3. RLS asegura que cada usuario solo vea sus datos
-- 4. El schema está optimizado para < 500MB incluso con años de datos:
--    - 50 transacciones/mes × 12 meses × 5 años = 3000 registros ≈ 1.5MB
--    - Exchange rates cache (1 por día × 365 × 2 años) ≈ 0.5MB
--    - Resto de tablas: < 5MB
--    TOTAL estimado: < 10MB (98% de margen del tier gratuito)
--
-- 5. MIGRACIÓN TARJETAS DE CRÉDITO:
--    Si ya tenés datos en accounts, ejecutá esto en Supabase SQL Editor:
--    ALTER TABLE accounts 
--      ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(20, 8),
--      ADD COLUMN IF NOT EXISTS closing_day INTEGER CHECK (closing_day >= 1 AND closing_day <= 31),
--      ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day >= 1 AND due_day <= 31),
--      ADD COLUMN IF NOT EXISTS last_4_digits TEXT CHECK (length(last_4_digits) = 4);
