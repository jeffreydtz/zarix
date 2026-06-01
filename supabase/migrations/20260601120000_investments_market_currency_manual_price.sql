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
