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
