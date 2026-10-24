-- Atomic pending-inbox confirm + authenticated claim helper.
-- Idempotent. Does not rewrite financial amounts.

ALTER TABLE public.pending_inbox_items
  DROP CONSTRAINT IF EXISTS pending_inbox_items_status_check;
ALTER TABLE public.pending_inbox_items
  ADD CONSTRAINT pending_inbox_items_status_check
  CHECK (status IN ('pending', 'confirming', 'confirmed', 'discarded'));

CREATE OR REPLACE FUNCTION public.claim_pending_inbox_item(
  p_user_id UUID,
  p_item_id UUID
) RETURNS SETOF public.pending_inbox_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':inbox:' || p_item_id::text, 0));
  RETURN QUERY
  UPDATE public.pending_inbox_items
     SET status = 'confirming',
         claim_id = gen_random_uuid(),
         updated_at = now()
   WHERE id = p_item_id
     AND user_id = p_user_id
     AND status = 'pending'
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_inbox_item(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_pending_inbox_item(UUID, UUID) TO authenticated, service_role;
