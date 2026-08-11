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
-- gemini_api_key / telegram_bot_token / mp_preapproval_id nunca deben volver
-- al cliente (el usuario los escribe, nunca los lee de vuelta). Con RLS a nivel
-- fila el dueño podía leerlos vía PostgREST directo (?select=telegram_bot_token).
-- Se conserva telegram_webhook_secret legible: el dueño lo necesita para
-- configurar el webhook de su bot propio.
REVOKE SELECT (gemini_api_key, telegram_bot_token, mp_preapproval_id)
  ON users FROM anon, authenticated;

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

-- El código no debe volver al cliente por PostgREST directo: se entrega solo
-- por la respuesta del endpoint que lo genera.
REVOKE SELECT (telegram_link_code) ON users FROM anon, authenticated;
