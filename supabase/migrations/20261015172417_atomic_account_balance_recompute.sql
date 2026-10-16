-- Reconciliation must hold the same account lock as the ledger balance trigger.
-- A concurrent ledger write cannot commit its account impact between the sum
-- and replacement. No movements, initial adjustments or other accounts change.
CREATE OR REPLACE FUNCTION public.recompute_account_balance(
  p_user_id UUID,
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  target_account public.accounts%ROWTYPE;
  recomputed_balance NUMERIC(20,8);
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Usuario no autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_account
  FROM public.accounts
  WHERE id = p_account_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta no encontrada' USING ERRCODE = '42501';
  END IF;

  -- A separate statement after acquiring the lock reads the committed ledger
  -- in READ COMMITTED. Starting from zero includes opening-balance adjustments.
  SELECT COALESCE(SUM(
    CASE WHEN tx.account_id = p_account_id THEN
      CASE
        WHEN tx.type IN ('expense', 'transfer') THEN -tx.amount_in_account_currency
        WHEN tx.type = 'income' THEN tx.amount_in_account_currency
        WHEN tx.type = 'adjustment' AND NOT COALESCE(
          target_account.type = 'credit_card'
          AND target_account.is_multicurrency
          AND target_account.secondary_currency IS NOT NULL
          AND upper(trim(COALESCE(tx.currency, ''))) = upper(trim(target_account.secondary_currency)),
          FALSE
        ) THEN tx.amount_in_account_currency
        ELSE 0
      END
    ELSE 0 END
    + CASE WHEN tx.destination_account_id = p_account_id AND tx.type = 'transfer' THEN
      -- The trigger stores each impact in NUMERIC(20,8). Round the legacy
      -- product per movement, rather than rounding a sum of unrounded products.
      round(COALESCE(tx.destination_amount_in_account_currency, tx.amount * COALESCE(tx.exchange_rate, 1)), 8)
    ELSE 0 END
  ), 0) INTO recomputed_balance
  FROM public.transactions tx
  WHERE tx.user_id = p_user_id
    AND (tx.account_id = p_account_id OR tx.destination_account_id = p_account_id);

  UPDATE public.accounts
  SET balance = recomputed_balance, updated_at = now()
  WHERE id = p_account_id AND user_id = p_user_id;

  RETURN jsonb_build_object('before', target_account.balance, 'after', recomputed_balance);
END;
$$;

-- Only the authenticated server route may use this repair operation through
-- its service client. Normal clients cannot replace balances directly by RPC.
REVOKE ALL ON FUNCTION public.recompute_account_balance(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_account_balance(UUID, UUID) TO service_role;

-- Canonical impacts have scale 8 before touching the balance. Rounding the
-- accumulated balance instead depends on ordering at a half-unit near zero.
-- Only the two destination credit/reversal expressions differ from 20261007.
-- Persisted destination amounts stay authoritative; no history is revalued.
CREATE OR REPLACE FUNCTION public.update_account_balance()
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
      UPDATE public.accounts SET balance = balance - round(COALESCE(OLD.destination_amount_in_account_currency, OLD.amount * COALESCE(OLD.exchange_rate, 1)), 8)
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
      UPDATE public.accounts SET balance = balance + round(COALESCE(NEW.destination_amount_in_account_currency, NEW.amount * COALESCE(NEW.exchange_rate, 1)), 8)
      WHERE id = NEW.destination_account_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
