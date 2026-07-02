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
