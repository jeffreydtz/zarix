-- Carga automática: canales email/statement en inbox y ledger, más buzón inbound.
-- NEVER supabase db push against production from a preview.
-- Previews share prod Supabase; apply only after an explicit production window.

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_source_check
  CHECK (source IN ('web', 'telegram', 'wallet', 'api', 'mcp', 'email', 'statement'));

ALTER TABLE public.pending_inbox_items DROP CONSTRAINT IF EXISTS pending_inbox_items_source_check;
ALTER TABLE public.pending_inbox_items DROP CONSTRAINT IF EXISTS pending_inbox_source_check;
ALTER TABLE public.pending_inbox_items ADD CONSTRAINT pending_inbox_items_source_check
  CHECK (source IN ('web', 'telegram', 'wallet', 'api', 'mcp', 'email', 'statement'));

ALTER TABLE public.integration_audit_log DROP CONSTRAINT IF EXISTS integration_audit_log_source_check;
ALTER TABLE public.integration_audit_log ADD CONSTRAINT integration_audit_log_source_check
  CHECK (source IN ('web', 'telegram', 'wallet', 'api', 'mcp', 'email', 'statement'));

DROP FUNCTION IF EXISTS public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ, TEXT);

CREATE OR REPLACE FUNCTION public.create_installment_transactions(
  p_user_id UUID,
  p_account_id UUID,
  p_total_amount NUMERIC,
  p_currency TEXT,
  p_installments INTEGER,
  p_category_id UUID,
  p_description TEXT,
  p_start_date TIMESTAMPTZ DEFAULT NOW(),
  p_source TEXT DEFAULT 'web'
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  group_id UUID := extensions.uuid_generate_v4();
  base_amount NUMERIC;
  this_amount NUMERIC;
  installment_date TIMESTAMPTZ;
  i INTEGER;
  v_owner UUID;
  v_source TEXT := COALESCE(NULLIF(btrim(p_source), ''), 'web');
BEGIN
  IF p_installments < 2 OR p_installments > 36 THEN
    RAISE EXCEPTION 'Las cuotas tienen que ser entre 2 y 36.';
  END IF;
  IF v_source NOT IN ('web', 'telegram', 'wallet', 'api', 'mcp', 'email', 'statement') THEN
    RAISE EXCEPTION 'Canal de escritura inválido';
  END IF;

  SELECT user_id INTO v_owner FROM accounts WHERE id = p_account_id;
  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RAISE EXCEPTION 'Cuenta no encontrada';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  base_amount := round(p_total_amount / p_installments, 2);

  FOR i IN 1..p_installments LOOP
    installment_date := public.cordoba_add_months(p_start_date, i - 1);
    this_amount := CASE WHEN i = p_installments
      THEN p_total_amount - base_amount * (p_installments - 1)
      ELSE base_amount
    END;

    INSERT INTO transactions (
      user_id, type, account_id, amount, currency, amount_in_account_currency,
      category_id, description, transaction_date,
      installment_number, installment_total, installment_group_id, source
    ) VALUES (
      p_user_id, 'expense', p_account_id, this_amount, p_currency, this_amount,
      p_category_id, p_description || ' (' || i || '/' || p_installments || ')',
      installment_date, i, p_installments, group_id, v_source
    );
  END LOOP;

  RETURN group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_installment_transactions(UUID, UUID, NUMERIC, TEXT, INTEGER, UUID, TEXT, TIMESTAMPTZ, TEXT)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.inbound_email_mailboxes (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  local_part TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE public.inbound_email_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_email_mailboxes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbound_email_mailboxes_own ON public.inbound_email_mailboxes;
CREATE POLICY inbound_email_mailboxes_own
  ON public.inbound_email_mailboxes
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.inbound_email_mailboxes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbound_email_mailboxes TO authenticated;
GRANT ALL ON public.inbound_email_mailboxes TO service_role;

COMMENT ON TABLE public.inbound_email_mailboxes IS
  'Per-user inbound mailbox token (hashed). The raw token is shown once; emails never auto-post to the ledger.';
