-- Un gasto y su reparto son una sola operación; jamás dejar importe nuevo
-- con reparto anterior si falla una escritura. Se ejecuta sólo desde backend.
CREATE OR REPLACE FUNCTION public.save_shared_expense(
  p_share_token TEXT,
  p_actor_member_id UUID,
  p_paid_by_member_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_expense_date DATE DEFAULT NULL,
  p_split_member_ids UUID[] DEFAULT NULL,
  p_expense_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group_id UUID;
  v_expense_id UUID;
  v_member_ids UUID[];
  v_amount NUMERIC;
  v_count INTEGER;
BEGIN
  IF p_share_token IS NULL OR p_share_token !~ '^[a-f0-9]{32}$' THEN
    RETURN NULL;
  END IF;

  -- Serializa las escrituras de gastos del grupo y evita que se borre entre
  -- la autorización por capability y el cambio de sus gastos/repartos.
  SELECT id INTO v_group_id FROM public.shared_groups
  WHERE share_token = p_share_token AND is_active = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF p_actor_member_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shared_group_members
    WHERE id = p_actor_member_id AND group_id = v_group_id
  ) THEN
    RAISE EXCEPTION 'Tenés que unirte al grupo para cargar o editar gastos.' USING ERRCODE = '42501';
  END IF;

  -- El actor es una identificación declarada dentro del link compartido.
  -- No prueba identidad individual: el token autoriza la colaboración grupal.
  IF p_paid_by_member_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shared_group_members
    WHERE id = p_paid_by_member_id AND group_id = v_group_id
  ) THEN
    RAISE EXCEPTION 'El miembro que pagó no pertenece al grupo.' USING ERRCODE = '22023';
  END IF;
  IF p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'La descripción debe tener entre 1 y 200 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount::TEXT IN ('NaN', 'Infinity', '-Infinity') OR p_amount <= 0 OR p_amount > 999999999999999999.99 THEN
    RAISE EXCEPTION 'El monto debe ser positivo y finito.' USING ERRCODE = '22023';
  END IF;
  v_amount := round(p_amount, 2);
  IF v_amount < 0.01 THEN
    RAISE EXCEPTION 'El monto mínimo es 0,01.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(cardinality(p_split_member_ids), 0) = 0 THEN
    SELECT array_agg(id ORDER BY created_at, id) INTO v_member_ids
    FROM public.shared_group_members WHERE group_id = v_group_id;
  ELSE
    IF cardinality(p_split_member_ids) > 30 THEN
      RAISE EXCEPTION 'El reparto supera el máximo de participantes.' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(member_id ORDER BY first_position) INTO v_member_ids
    FROM (
      SELECT member_id, min(position) AS first_position
      FROM unnest(p_split_member_ids) WITH ORDINALITY AS participants(member_id, position)
      GROUP BY member_id
    ) distinct_participants;
  END IF;
  v_count := coalesce(cardinality(v_member_ids), 0);
  IF v_count = 0 OR EXISTS (
    SELECT 1 FROM unnest(v_member_ids) AS selected(member_id)
    LEFT JOIN public.shared_group_members m
      ON m.id = selected.member_id AND m.group_id = v_group_id
    WHERE m.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay participantes que no pertenecen al grupo.' USING ERRCODE = '22023';
  END IF;

  IF p_expense_id IS NULL THEN
    INSERT INTO public.shared_expenses(group_id, paid_by_member_id, description, amount, expense_date)
    VALUES (v_group_id, p_paid_by_member_id, btrim(p_description), v_amount,
            coalesce(p_expense_date, (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::DATE))
    RETURNING id INTO v_expense_id;
  ELSE
    SELECT id INTO v_expense_id FROM public.shared_expenses
    WHERE id = p_expense_id AND group_id = v_group_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    UPDATE public.shared_expenses SET paid_by_member_id = p_paid_by_member_id,
      description = btrim(p_description), amount = v_amount,
      expense_date = coalesce(p_expense_date, expense_date)
    WHERE id = v_expense_id AND group_id = v_group_id;
    DELETE FROM public.shared_expense_splits WHERE expense_id = v_expense_id;
  END IF;

  -- Usar NUMERIC para centavos: BIGINT no cubre todo el NUMERIC(20,2).
  -- El reparto usa el orden deduplicado de participantes de la solicitud.
  INSERT INTO public.shared_expense_splits(expense_id, member_id, amount)
  SELECT v_expense_id, member_id,
    (floor(v_amount * 100 / v_count) +
       CASE WHEN position <= mod(v_amount * 100, v_count) THEN 1 ELSE 0 END) / 100
  FROM unnest(v_member_ids) WITH ORDINALITY AS participants(member_id, position);

  RETURN (
    SELECT to_jsonb(e) || jsonb_build_object('splits', (
      SELECT jsonb_agg(jsonb_build_object('member_id', member_id, 'amount', amount) ORDER BY member_id)
      FROM public.shared_expense_splits WHERE expense_id = v_expense_id
    ))
    FROM public.shared_expenses e WHERE id = v_expense_id AND group_id = v_group_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_shared_expense(TEXT, UUID, UUID, TEXT, NUMERIC, DATE, UUID[], UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_shared_expense(TEXT, UUID, UUID, TEXT, NUMERIC, DATE, UUID[], UUID) TO service_role;
