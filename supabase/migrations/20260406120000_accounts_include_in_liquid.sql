-- Cuentas pueden excluirse del patrimonio líquido (siguen sumando al total).
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS include_in_liquid BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN accounts.include_in_liquid IS
  'Si false, no suma a liquidez en agregados; sigue en patrimonio total. Ignorado para type=investment (van al bucket inversiones).';
