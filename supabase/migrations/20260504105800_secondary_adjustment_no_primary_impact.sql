CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  amount_delta NUMERIC(20, 8);
  old_is_secondary_adjustment BOOLEAN := FALSE;
  new_is_secondary_adjustment BOOLEAN := FALSE;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.type = 'adjustment' THEN
    SELECT COALESCE(
      a.type = 'credit_card'
      AND a.is_multicurrency = true
      AND a.secondary_currency IS NOT NULL
      AND upper(trim(COALESCE(OLD.currency, ''))) = upper(trim(a.secondary_currency)),
      FALSE
    )
    INTO old_is_secondary_adjustment
    FROM accounts a
    WHERE a.id = OLD.account_id;
    old_is_secondary_adjustment := COALESCE(old_is_secondary_adjustment, FALSE);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.type = 'adjustment' THEN
    SELECT COALESCE(
      a.type = 'credit_card'
      AND a.is_multicurrency = true
      AND a.secondary_currency IS NOT NULL
      AND upper(trim(COALESCE(NEW.currency, ''))) = upper(trim(a.secondary_currency)),
      FALSE
    )
    INTO new_is_secondary_adjustment
    FROM accounts a
    WHERE a.id = NEW.account_id;
    new_is_secondary_adjustment := COALESCE(new_is_secondary_adjustment, FALSE);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'expense' THEN
      UPDATE accounts SET balance = balance + OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
    ELSIF OLD.type = 'income' THEN
      UPDATE accounts SET balance = balance - OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
    ELSIF OLD.type = 'transfer' THEN
      UPDATE accounts SET balance = balance + OLD.amount_in_account_currency
      WHERE id = OLD.account_id;
      IF OLD.destination_account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance - (OLD.amount * COALESCE(OLD.exchange_rate, 1))
        WHERE id = OLD.destination_account_id;
      END IF;
    ELSIF OLD.type = 'adjustment' THEN
      IF NOT old_is_secondary_adjustment THEN
        UPDATE accounts SET balance = balance - OLD.amount_in_account_currency
        WHERE id = OLD.account_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.type = 'expense' THEN
      amount_delta = OLD.amount_in_account_currency - NEW.amount_in_account_currency;
    ELSIF OLD.type = 'income' THEN
      amount_delta = NEW.amount_in_account_currency - OLD.amount_in_account_currency;
    ELSIF OLD.type = 'transfer' THEN
      amount_delta = OLD.amount_in_account_currency - NEW.amount_in_account_currency;
    ELSIF OLD.type = 'adjustment' AND NEW.type = 'adjustment' THEN
      IF old_is_secondary_adjustment AND new_is_secondary_adjustment THEN
        amount_delta = 0;
      ELSIF old_is_secondary_adjustment AND NOT new_is_secondary_adjustment THEN
        amount_delta = NEW.amount_in_account_currency;
      ELSIF NOT old_is_secondary_adjustment AND new_is_secondary_adjustment THEN
        amount_delta = -OLD.amount_in_account_currency;
      ELSE
        amount_delta = NEW.amount_in_account_currency - OLD.amount_in_account_currency;
      END IF;
    ELSE
      amount_delta = NEW.amount_in_account_currency - OLD.amount_in_account_currency;
    END IF;

    IF OLD.account_id != NEW.account_id THEN
      IF OLD.type = 'expense' THEN
        UPDATE accounts SET balance = balance + OLD.amount_in_account_currency WHERE id = OLD.account_id;
        UPDATE accounts SET balance = balance - NEW.amount_in_account_currency WHERE id = NEW.account_id;
      ELSIF OLD.type = 'income' THEN
        UPDATE accounts SET balance = balance - OLD.amount_in_account_currency WHERE id = OLD.account_id;
        UPDATE accounts SET balance = balance + NEW.amount_in_account_currency WHERE id = NEW.account_id;
      ELSIF OLD.type = 'adjustment' THEN
        IF NOT old_is_secondary_adjustment THEN
          UPDATE accounts SET balance = balance - OLD.amount_in_account_currency WHERE id = OLD.account_id;
        END IF;
        IF NEW.type = 'adjustment' AND NOT new_is_secondary_adjustment THEN
          UPDATE accounts SET balance = balance + NEW.amount_in_account_currency WHERE id = NEW.account_id;
        END IF;
      END IF;
    ELSE
      UPDATE accounts SET balance = balance + amount_delta WHERE id = NEW.account_id;
    END IF;

    IF OLD.type = 'transfer' AND OLD.destination_account_id IS NOT NULL THEN
      UPDATE accounts SET balance = balance - (OLD.amount * COALESCE(OLD.exchange_rate, 1))
      WHERE id = OLD.destination_account_id;
    END IF;
    IF NEW.type = 'transfer' AND NEW.destination_account_id IS NOT NULL THEN
      UPDATE accounts SET balance = balance + (NEW.amount * COALESCE(NEW.exchange_rate, 1))
      WHERE id = NEW.destination_account_id;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'expense' THEN
      UPDATE accounts SET balance = balance - NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
    ELSIF NEW.type = 'income' THEN
      UPDATE accounts SET balance = balance + NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
    ELSIF NEW.type = 'transfer' THEN
      UPDATE accounts SET balance = balance - NEW.amount_in_account_currency
      WHERE id = NEW.account_id;
      IF NEW.destination_account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance + (NEW.amount * COALESCE(NEW.exchange_rate, 1))
        WHERE id = NEW.destination_account_id;
      END IF;
    ELSIF NEW.type = 'adjustment' THEN
      IF NOT new_is_secondary_adjustment THEN
        UPDATE accounts SET balance = balance + NEW.amount_in_account_currency
        WHERE id = NEW.account_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
