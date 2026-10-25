-- possible_duplicate_of must point at the same owner's row.
-- ON DELETE SET NULL applies only to the reference column, not user_id.
-- Forward-only and re-runnable. NEVER `supabase db push`.

DO $$
BEGIN
  PERFORM zarix_vault.vault_available();
EXCEPTION
  WHEN undefined_function THEN
    RAISE EXCEPTION 'zarix_vault_unavailable'
      USING HINT = 'zarix_vault.vault_available() must exist before this migration.';
END $$;

UPDATE public.pending_inbox_items child
   SET possible_duplicate_of = NULL
 WHERE child.possible_duplicate_of IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.pending_inbox_items parent
      WHERE parent.id = child.possible_duplicate_of
        AND parent.user_id = child.user_id
   );

CREATE UNIQUE INDEX IF NOT EXISTS pending_inbox_user_id_id_unique
  ON public.pending_inbox_items (user_id, id);

ALTER TABLE public.pending_inbox_items
  DROP CONSTRAINT IF EXISTS pending_inbox_possible_duplicate_fk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'pending_inbox_possible_duplicate_fk'
       AND conrelid = 'public.pending_inbox_items'::regclass
  ) THEN
    ALTER TABLE public.pending_inbox_items
      ADD CONSTRAINT pending_inbox_possible_duplicate_fk
      FOREIGN KEY (user_id, possible_duplicate_of)
      REFERENCES public.pending_inbox_items (user_id, id)
      ON DELETE SET NULL (possible_duplicate_of);
  END IF;
END $$;
