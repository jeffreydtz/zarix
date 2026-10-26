-- FOR KEY SHARE on categories applies the UPDATE policy, which excludes
-- NULL-owner system rows. Authenticated parking/writes then fail even though
-- SELECT is allowed. System categories are globally readable: EXISTS without
-- a lock. KEY SHARE stays on the caller's own categories.

CREATE OR REPLACE FUNCTION public.check_category_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = NEW.category_id AND c.is_system IS TRUE
    ) THEN
      RETURN NEW;
    END IF;
    PERFORM 1 FROM public.categories c
      WHERE c.id = NEW.category_id AND c.user_id = NEW.user_id
      FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La categoría no pertenece al usuario.' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
