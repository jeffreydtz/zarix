-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SEED DATA PARA TESTING
-- Ejecutar DESPUÉS de crear un usuario via magic link
-- Reemplazar 'USER_ID_AQUI' con tu user ID real de Supabase Auth
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- PASO 1: Obtener tu user ID
-- Dashboard → Authentication → Users → copiar ID del usuario

-- PASO 2: Reemplazar en las queries de abajo
\set user_id 'USER_ID_AQUI'

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CREAR CUENTAS DE EJEMPLO
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO accounts (user_id, name, type, currency, balance, icon, color, is_debt, include_in_total, sort_order)
VALUES
  (:'user_id', 'Efectivo ARS', 'cash', 'ARS', 50000, '💵', '#10B981', false, true, 0),
  (:'user_id', 'Efectivo USD', 'cash', 'USD', 500, '💵', '#059669', false, true, 1),
  (:'user_id', 'Mercado Pago', 'digital_wallet', 'ARS', 125000, '📱', '#0099FF', false, true, 2),
  (:'user_id', 'BBVA', 'bank', 'ARS', 280000, '🏦', '#004481', false, true, 3),
  (:'user_id', 'Visa', 'credit_card', 'ARS', -45000, '💳', '#1A1F71', true, false, 4),
  (:'user_id', 'Crypto Wallet', 'crypto', 'USDT', 1000, '₿', '#F7931A', false, true, 5),
  (:'user_id', 'IOL Inversiones', 'investment', 'ARS', 450000, '📈', '#0066CC', false, true, 6);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CREAR TRANSACCIONES DE EJEMPLO (último mes)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Obtener IDs de cuentas recién creadas
WITH user_accounts AS (
  SELECT id, name, currency FROM accounts WHERE user_id = :'user_id'
),
comida_cat AS (
  SELECT id FROM categories WHERE name = 'Comida' AND is_system = true LIMIT 1
),
transporte_cat AS (
  SELECT id FROM categories WHERE name = 'Transporte' AND is_system = true LIMIT 1
),
sueldo_cat AS (
  SELECT id FROM categories WHERE name = 'Sueldo' AND is_system = true LIMIT 1
)

INSERT INTO transactions (
  user_id,
  type,
  account_id,
  amount,
  currency,
  amount_in_account_currency,
  category_id,
  description,
  transaction_date
)
SELECT
  :'user_id',
  'income',
  (SELECT id FROM user_accounts WHERE name = 'BBVA'),
  800000,
  'ARS',
  800000,
  (SELECT id FROM sueldo_cat),
  'Sueldo de Marzo',
  NOW() - INTERVAL '5 days'

UNION ALL

SELECT
  :'user_id',
  'expense',
  (SELECT id FROM user_accounts WHERE name = 'Efectivo ARS'),
  15300,
  'ARS',
  15300,
  (SELECT id FROM comida_cat),
  'Supermercado Carrefour',
  NOW() - INTERVAL '2 days'

UNION ALL

SELECT
  :'user_id',
  'expense',
  (SELECT id FROM user_accounts WHERE name = 'Efectivo ARS'),
  8500,
  'ARS',
  8500,
  (SELECT id FROM comida_cat),
  'Almuerzo en restaurante',
  NOW() - INTERVAL '1 day'

UNION ALL

SELECT
  :'user_id',
  'expense',
  (SELECT id FROM user_accounts WHERE name = 'Mercado Pago'),
  3500,
  'ARS',
  3500,
  (SELECT id FROM transporte_cat),
  'Uber a Palermo',
  NOW() - INTERVAL '1 day'

UNION ALL

SELECT
  :'user_id',
  'expense',
  (SELECT id FROM user_accounts WHERE name = 'Visa'),
  18,
  'USD',
  23400,
  (SELECT id FROM categories WHERE name = 'Suscripciones' AND is_system = true),
  'Netflix Premium',
  NOW() - INTERVAL '3 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CREAR PRESUPUESTOS DE EJEMPLO
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO budgets (user_id, category_id, month, amount, currency)
SELECT
  :'user_id',
  id,
  DATE_TRUNC('month', NOW())::DATE,
  amount,
  'ARS'
FROM (
  VALUES
    ((SELECT id FROM categories WHERE name = 'Comida' AND is_system = true), 80000),
    ((SELECT id FROM categories WHERE name = 'Transporte' AND is_system = true), 50000),
    ((SELECT id FROM categories WHERE name = 'Ocio' AND is_system = true), 30000),
    ((SELECT id FROM categories WHERE name = 'Suscripciones' AND is_system = true), 25000)
) AS budgets_data(category_id, amount);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CREAR INVERSIONES DE EJEMPLO
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO investments (
  user_id,
  account_id,
  type,
  ticker,
  name,
  quantity,
  purchase_price,
  purchase_currency,
  purchase_date,
  current_price
)
SELECT
  :'user_id',
  (SELECT id FROM accounts WHERE name = 'IOL Inversiones' AND user_id = :'user_id'),
  'crypto',
  'BTC',
  'Bitcoin',
  0.01,
  85000,
  'USD',
  NOW() - INTERVAL '30 days',
  87500

UNION ALL

SELECT
  :'user_id',
  (SELECT id FROM accounts WHERE name = 'IOL Inversiones' AND user_id = :'user_id'),
  'cedear',
  'AAPL',
  'Apple Inc',
  5,
  150000,
  'ARS',
  NOW() - INTERVAL '60 days',
  165000;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- VERIFICAR QUE TODO SE CREÓ CORRECTAMENTE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT 'Cuentas creadas:' AS info, COUNT(*) AS count FROM accounts WHERE user_id = :'user_id'
UNION ALL
SELECT 'Transacciones creadas:', COUNT(*) FROM transactions WHERE user_id = :'user_id'
UNION ALL
SELECT 'Presupuestos creados:', COUNT(*) FROM budgets WHERE user_id = :'user_id'
UNION ALL
SELECT 'Inversiones creadas:', COUNT(*) FROM investments WHERE user_id = :'user_id';

-- Verificar saldos (deberían estar actualizados por el trigger)
SELECT name, balance, currency FROM accounts WHERE user_id = :'user_id' ORDER BY sort_order;
