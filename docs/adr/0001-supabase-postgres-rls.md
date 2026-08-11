# 0001 — Supabase (Postgres + Auth + RLS) como backend

- **Estado:** Aceptada
- **Fecha:** 2026-08-11

## Contexto

Zarix es un proyecto unipersonal con presupuesto cercano a cero y necesidad de
iterar rápido. Requiere una base de datos relacional (aritmética de saldos,
integridad referencial, triggers), autenticación de usuarios y varias vías de
escritura (web, bot de Telegram, crons, webhooks). Montar y operar un backend
propio (servidor, Auth, hosting de DB, backups) es costo y trabajo de ops que
no aporta diferenciación al producto.

## Decisión

Usar **Supabase** como backend-as-a-service: Postgres administrado + Auth +
Row Level Security (RLS) + API. El esquema vive en `supabase/schema.sql`
(espejo) y evoluciona vía migraciones versionadas en `supabase/migrations/`.
La app Next.js habla con Supabase por dos caminos:

- **Cliente anon/cookie** (`@supabase/ssr`): sujeto a RLS, para el navegador.
- **Cliente service-role** (`createServiceClientSync()`): usado por la capa de
  servicios (`lib/services/*`), los crons y los webhooks.

## Consecuencias

- **Trade-off que revela el código:** los servicios usan el cliente
  **service-role**, que **saltea RLS**. En esos caminos la seguridad no la da
  la base sino el **filtrado explícito por `user_id` en la capa de aplicación**
  (todos los servicios son singletons scoped por userId). Es una decisión
  consciente: webhooks y crons no tienen sesión de usuario, así que no pueden
  depender de `auth.uid()`.
- Esto obliga a **defensa en profundidad**: RLS activo en todas las tablas
  protege el camino anon/cookie y cualquier acceso directo, mientras el
  `WHERE user_id = …` protege el camino service-role. Un servicio que olvide el
  filtro es un bug de seguridad (fuga cross-tenant): es una invariante a
  revisar en cada PR.
- Ganancia: cero ops de DB/Auth, backups y PITR incluidos, velocidad de
  iteración alta, costo en tier gratuito.
- Riesgo: acoplamiento al proveedor. Mitigado porque es Postgres estándar y el
  esquema/migraciones son portables (SQL plano).
