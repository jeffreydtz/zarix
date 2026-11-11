-- transactions.account_id pasa a ser obligatorio.
--
-- Contexto: la migración 20261111120000_transaction_integrity_fks dejó la
-- columna nullable porque producción tenía 133 movimientos importados el
-- 05/04/2026 sin cuenta (un único usuario). Esos movimientos se asignaron
-- antes de esta migración a una cuenta propia del usuario ("Importados abril",
-- tipo other, ARS, fuera del total y del líquido) con una operación de datos
-- puntual que no forma parte de este archivo.
--
-- La guarda evita aplicar el NOT NULL sobre una base que todavía tenga filas
-- sin cuenta: en ese caso falla explícitamente en vez de inventar datos.
DO $$
DECLARE
  null_rows bigint;
BEGIN
  SELECT count(*) INTO null_rows FROM public.transactions WHERE account_id IS NULL;
  IF null_rows > 0 THEN
    RAISE EXCEPTION
      'transactions.account_id tiene % fila(s) NULL; asignalas a una cuenta antes de aplicar NOT NULL',
      null_rows;
  END IF;
END
$$;

ALTER TABLE public.transactions ALTER COLUMN account_id SET NOT NULL;
