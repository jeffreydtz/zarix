-- Forward-only follow-up after 20261024180000–240000 (already applied in prod).
-- 1) Inbox category ownership (system or same user; NULL category allowed).
-- 2) Atomic batch claim: all requested non-confirmed items, or none.
-- 3) search_path on inbox_canonical_tool_payload (security advisor WARN).

DROP TRIGGER IF EXISTS check_pending_inbox_category_owner ON public.pending_inbox_items;
CREATE TRIGGER check_pending_inbox_category_owner
  BEFORE INSERT OR UPDATE OF user_id, category_id
  ON public.pending_inbox_items
  FOR EACH ROW EXECUTE FUNCTION public.check_category_ownership();

CREATE OR REPLACE FUNCTION public.claim_pending_inbox_items(
  p_user_id UUID,
  p_item_ids UUID[]
) RETURNS SETOF public.pending_inbox_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  ids UUID[];
  n_need INTEGER;
  n_claimed INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_item_ids IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[])
    INTO ids
    FROM (SELECT DISTINCT x FROM unnest(p_item_ids) AS t(x) WHERE x IS NOT NULL) s;

  IF cardinality(ids) = 0 THEN
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':inbox:' || item_id::text, 0))
  FROM unnest(ids) AS item_id
  ORDER BY item_id;

  PERFORM 1 FROM (
    SELECT id
      FROM public.pending_inbox_items
     WHERE user_id = p_user_id
       AND id = ANY(ids)
     ORDER BY id
       FOR UPDATE
  ) locked;

  SELECT count(*)::integer
    INTO n_need
    FROM unnest(ids) AS requested(id)
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.pending_inbox_items p
      WHERE p.id = requested.id
        AND p.user_id = p_user_id
        AND p.status = 'confirmed'
   );

  UPDATE public.pending_inbox_items
     SET status = 'confirming',
         claim_id = pg_catalog.gen_random_uuid(),
         updated_at = pg_catalog.now()
   WHERE user_id = p_user_id
     AND id = ANY(ids)
     AND status IN ('pending', 'uncertain');

  GET DIAGNOSTICS n_claimed = ROW_COUNT;

  IF n_claimed IS DISTINCT FROM n_need THEN
    RAISE EXCEPTION 'Este pendiente se está confirmando.' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT *
    FROM public.pending_inbox_items
   WHERE user_id = p_user_id
     AND id = ANY(ids)
     AND status = 'confirming'
   ORDER BY id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_inbox_items(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_pending_inbox_items(UUID, UUID[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inbox_canonical_tool_payload(p JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p IS NULL OR pg_catalog.jsonb_typeof(p) = 'null' THEN NULL
    ELSE pg_catalog.jsonb_build_object(
      'type', p->>'type',
      'amount', p->'amount',
      'currency', p->>'currency',
      'description', p->>'description',
      'account', p->>'account',
      'accountId', p->>'accountId',
      'category', p->>'category',
      'categoryId', p->>'categoryId',
      'destinationAccount', p->>'destinationAccount',
      'destinationAccountId', p->>'destinationAccountId',
      'transactionDate', COALESCE(p->>'transactionDate', p->>'date'),
      'installments', p->'installments'
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.inbox_canonical_tool_payload(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inbox_canonical_tool_payload(JSONB) TO service_role;
