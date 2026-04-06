-- Cuentas: RLS estricto para el rol authenticated (cliente con JWT de sesión).
-- - Ver todas las filas en el Table Editor del dashboard es normal: usa rol que ignora RLS.
-- - La service_role del backend también ignora RLS; el aislamiento entre usuarios la aplica la API + estas políticas en el cliente.
-- Ejecutá esta migración en el proyecto remoto si accounts quedó sin RLS o con políticas antiguas.

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounts_all ON public.accounts;
DROP POLICY IF EXISTS accounts_select_own ON public.accounts;
DROP POLICY IF EXISTS accounts_insert_own ON public.accounts;
DROP POLICY IF EXISTS accounts_update_own ON public.accounts;
DROP POLICY IF EXISTS accounts_delete_own ON public.accounts;

CREATE POLICY accounts_select_own ON public.accounts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY accounts_insert_own ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY accounts_update_own ON public.accounts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY accounts_delete_own ON public.accounts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
