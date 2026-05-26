-- Persist daily price change (%) per position so the UI keeps showing
-- variación del día even when the upstream quote provider is down.
-- Aditive, nullable; no impact on existing rows.

ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS current_price_change_pct NUMERIC(10, 4);

COMMENT ON COLUMN investments.current_price_change_pct IS
  'Daily change pct from latest quote refresh (Yahoo/Stooq/CoinGecko). NULL if never refreshed.';
