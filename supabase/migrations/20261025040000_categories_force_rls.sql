-- Table owner currently bypasses ENABLE RLS. FORCE applies the same
-- policies to the owner. Superuser and BYPASSRLS (service_role) still
-- bypass. Authenticated already used these policies.

ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;
