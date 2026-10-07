-- Revertir OLD y aplicar NEW de manera independiente también al cambiar
-- tipo, origen o destino. No se aplica automáticamente a producción.
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  touched_accounts UUID[] := ARRAY[]::UUID[];
  old_is_secondary_adjustment BOOLEAN := FALSE;
  new_is_secondary_adjustment BOOLEAN := FALSE;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    touched_accounts := touched_accounts || ARRAY[OLD.account_id, OLD.destination_account_id];
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    touched_accounts := touched_accounts || ARRAY[NEW.account_id, NEW.destination_account_id];
  END IF;

  -- Mismo orden de locks para A→B y B→A; los dos impactos son parte de la
  -- transacción que modificó el movimiento, incluidos UPDATE y DELETE.
  PERFORM id FROM public.accounts
  WHERE id = ANY(touched_accounts)
  ORDER BY id
  FOR UPDATE;

  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.type = 'adjustment' THEN
    SELECT COALESCE(
      a.type = 'credit_card' AND a.is_multicurrency
      AND a.secondary_currency IS NOT NULL
      AND upper(trim(COALESCE(OLD.currency, ''))) = upper(trim(a.secondary_currency)),
      FALSE
    ) INTO old_is_secondary_adjustment
    FROM public.accounts a WHERE a.id = OLD.account_id;
    old_is_secondary_adjustment := COALESCE(old_is_secondary_adjustment, FALSE);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.type = 'adjustment' THEN
    SELECT COALESCE(
      a.type = 'credit_card' AND a.is_multicurrency
      AND a.secondary_currency IS NOT NULL
      AND upper(trim(COALESCE(NEW.currency, ''))) = upper(trim(a.secondary_currency)),
      FALSE
    ) INTO new_is_secondary_adjustment
    FROM public.accounts a WHERE a.id = NEW.account_id;
    new_is_secondary_adjustment := COALESCE(new_is_secondary_adjustment, FALSE);
  END IF;

  -- Quitar el impacto anterior usando OLD.type, no el tipo de la fila nueva.
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    IF OLD.type IN ('expense', 'transfer') THEN
      UPDATE public.accounts SET balance = balance + OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
    ELSIF OLD.type = 'income' OR (OLD.type = 'adjustment' AND NOT old_is_secondary_adjustment) THEN
      UPDATE public.accounts SET balance = balance - OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
    END IF;
    IF OLD.type = 'transfer' AND OLD.destination_account_id IS NOT NULL THEN
      UPDATE public.accounts SET balance = balance - OLD.amount * COALESCE(OLD.exchange_rate, 1)
      WHERE id = OLD.destination_account_id;
    END IF;
  END IF;

  -- Aplicar el impacto nuevo usando NEW.type y sus propias cuentas/monedas.
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.type IN ('expense', 'transfer') THEN
      UPDATE public.accounts SET balance = balance - NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
    ELSIF NEW.type = 'income' OR (NEW.type = 'adjustment' AND NOT new_is_secondary_adjustment) THEN
      UPDATE public.accounts SET balance = balance + NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
    END IF;
    IF NEW.type = 'transfer' AND NEW.destination_account_id IS NOT NULL THEN
      UPDATE public.accounts SET balance = balance + NEW.amount * COALESCE(NEW.exchange_rate, 1)
      WHERE id = NEW.destination_account_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
