-- Align ledger FKs with the domain: required account, recurring-rule and inbox
-- references. Forward-only. NEVER supabase db push against production from a
-- preview. Previews share prod Supabase; apply only after an explicit window.
--
-- Orphaned optional FKs are cleared to NULL (the row is kept). Null account_id
-- is reported and left in place; NOT NULL is added only when every row already
-- has an account.

-- Recurring executions belong to the same owner as the rule.
UPDATE public.transactions t
   SET recurring_rule_id = NULL
 WHERE t.recurring_rule_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.recurring_rules r
      WHERE r.id = t.recurring_rule_id
        AND r.user_id = t.user_id
   );

-- Inbox suggestions may point at a deleted category or confirmed movement.
UPDATE public.pending_inbox_items p
   SET category_id = NULL
 WHERE p.category_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.categories c WHERE c.id = p.category_id
   );

UPDATE public.pending_inbox_items p
   SET confirmed_transaction_id = NULL
 WHERE p.confirmed_transaction_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.transactions t
      WHERE t.id = p.confirmed_transaction_id
        AND t.user_id = p.user_id
   );

CREATE UNIQUE INDEX IF NOT EXISTS recurring_rules_user_id_id_unique
  ON public.recurring_rules (user_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_id_id_unique
  ON public.transactions (user_id, id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.transactions'::regclass
       AND conname = 'transactions_recurring_rule_owner_fk'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_recurring_rule_owner_fk
      FOREIGN KEY (user_id, recurring_rule_id)
      REFERENCES public.recurring_rules (user_id, id)
      ON DELETE SET NULL (recurring_rule_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pending_inbox_items'::regclass
       AND conname = 'pending_inbox_items_category_id_fkey'
  ) THEN
    ALTER TABLE public.pending_inbox_items
      ADD CONSTRAINT pending_inbox_items_category_id_fkey
      FOREIGN KEY (category_id)
      REFERENCES public.categories (id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pending_inbox_items'::regclass
       AND conname = 'pending_inbox_confirmed_transaction_fk'
  ) THEN
    ALTER TABLE public.pending_inbox_items
      ADD CONSTRAINT pending_inbox_confirmed_transaction_fk
      FOREIGN KEY (user_id, confirmed_transaction_id)
      REFERENCES public.transactions (user_id, id)
      ON DELETE SET NULL (confirmed_transaction_id);
  END IF;
END $$;

DO $$
DECLARE
  null_accounts integer;
BEGIN
  SELECT count(*)::integer INTO null_accounts
    FROM public.transactions
   WHERE account_id IS NULL;

  IF null_accounts = 0 THEN
    ALTER TABLE public.transactions ALTER COLUMN account_id SET NOT NULL;
  ELSE
    RAISE NOTICE
      'transactions.account_id has % null row(s); leaving the column nullable instead of inventing or deleting accounts',
      null_accounts;
  END IF;
END $$;
