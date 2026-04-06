-- Caché global de cotizaciones mercado (una fila) para mostrar última data conocida si Yahoo falla.
CREATE TABLE IF NOT EXISTS market_data_cache (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE market_data_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE market_data_cache IS 'Snapshot JSON de mercados (crypto, acciones US/AR); solo service role.';
