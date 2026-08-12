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
