-- CP1-08: retain the deleted movement without keeping an operational ledger row.
-- No foreign keys: deleting the original row/profile must not erase its identity.
CREATE TABLE public.transaction_deletion_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,
  user_id UUID NOT NULL,
  actor_id UUID,
  actor_role TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  previous_row JSONB NOT NULL
);

CREATE INDEX transaction_deletion_audit_user_deleted_idx
  ON public.transaction_deletion_audit (user_id, deleted_at DESC);
ALTER TABLE public.transaction_deletion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transaction_deletion_audit FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.transaction_deletion_audit TO authenticated, service_role;
CREATE POLICY "Owners read their deleted movements"
  ON public.transaction_deletion_audit FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- The trigger alone may append. Do not expose a callable definer in public or
-- grant INSERT to clients, which would let them fabricate OLD values/actors.
CREATE SCHEMA transaction_audit_private;
REVOKE ALL ON SCHEMA transaction_audit_private FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION transaction_audit_private.record_transaction_deletion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_actor_id UUID := auth.uid();
BEGIN
  IF v_actor_id IS NOT NULL AND v_actor_id <> OLD.user_id THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.transaction_deletion_audit
    (transaction_id, user_id, actor_id, actor_role, previous_row)
  VALUES (
    OLD.id, OLD.user_id, v_actor_id,
    COALESCE(NULLIF(pg_catalog.current_setting('role', true), 'none'), session_user::TEXT),
    pg_catalog.to_jsonb(OLD)
  );
  -- A service operation without an authenticated UID records a NULL actor_id;
  -- the row owner is never substituted for the actual actor.
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION transaction_audit_private.record_transaction_deletion()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trigger_audit_transaction_deletion
  AFTER DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION transaction_audit_private.record_transaction_deletion();
