# ADR 0007 - Alineacion de versiones de migraciones con produccion

Fecha: 2026-10-16. Estado: aceptada (sin cambios en la base productiva).

## Contexto
El 2026-10-15 las 11 migraciones de v2.13 se aplicaron en produccion con apply_migration (MCP), que asigna su propia version. El repo tenia otros timestamps, por lo que `supabase db push` las habria reaplicado.

## Decision
Se renombraron los archivos (git mv, contenido sin cambios) a las versiones de `supabase_migrations.schema_migrations`:

| Version prod | Nombre | Version anterior en repo |
|---|---|---|
| 20261015172320 | fix_balance_update_old_new_impacts | 20261006235424 |
| 20261015172329 | atomic_shared_expense | 20261006235955 |
| 20261015172339 | preserve_transfer_destination_amount | 20261007000231 |
| 20261015172344 | durable_financial_requests_outbox | 20261009034852 |
| 20261015172349 | atomic_account_creation | 20261009034943 |
| 20261015172355 | explicit_grants_and_tenant_integrity | 20261009034950 |
| 20261015172404 | durable_sales_shared_expenses | 20261009035715 |
| 20261015172410 | durable_import_batches | 20261009041100 |
| 20261015172417 | atomic_account_balance_recompute | 20261015000402 |
| 20261015172422 | audit_transaction_deletions | 20261015072636 |
| 20261015172428 | presentation_preferences | 20261015072807 |

## Desalineacion pendiente (historial anterior)
Produccion registra 6 entradas previas sin archivo equivalente en el repo:

| Prod | Repo mas cercano |
|---|---|
| 20260811230242 hardening_phase1_additive | 20260811120000_security_hardening.sql (parcial) |
| 20260811230359 hardening_phase1b_currency_checks | 20260811130000_data_integrity.sql (parcial) |
| 20260811231157 hardening_phase2_revoke_secrets | 20260811120000_security_hardening.sql (parcial) |
| 20260812214554 hardening_phase2b_secret_columns_correct | sin archivo |
| 20260814222333 net_worth_snapshots | 20260814120000_net_worth_snapshots.sql |
| 20260819165200 security_integrity_followup | 20260819120000_security_integrity_followup.sql |

Las 18 migraciones del repo anteriores a 20261015172320 (20260401120000 a 20260819120000) no figuran con esas versiones en produccion: se aplicaron fuera del CLI. Ver ADR 0006 (baseline).

## Recomendacion (no ejecutada)
No usar `db push` hasta reparar. En una ventana aprobada, tras verificar el esquema real:

    supabase migration repair --status applied <cada version del repo anterior a 20261015172320>
    supabase migration repair --status reverted 20260811230242 20260811230359 20260811231157 20260812214554 20260814222333 20260819165200
    supabase migration list

`repair` solo edita schema_migrations (no ejecuta SQL), pero modifica produccion y requiere aprobacion. Alternativa: consolidar en un baseline segun ADR 0006.

La migracion nueva 20261016213000_ai_daily_caps.sql queda pendiente de aplicar con aprobacion.
