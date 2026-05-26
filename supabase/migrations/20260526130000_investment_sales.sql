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
