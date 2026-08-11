# 0006 — Migraciones de Supabase: baseline, drift check y rollback

- **Estado:** Aceptada
- **Fecha:** 2026-08-11

## Contexto

El esquema de Zarix evolucionó con **14 migraciones** versionadas en
`supabase/migrations/` (timestamped) y un `supabase/schema.sql` que actúa como
**espejo** del estado consolidado. Sin embargo, históricamente varias
migraciones se **aplicaron a mano** en el SQL Editor de Supabase, por lo que la
base de datos de producción **no tiene historial de migraciones del CLI**
(`supabase migration list` no refleja lo aplicado). Eso genera dos riesgos:
**drift** (el `schema.sql` y la DB real se desincronizan) y la falta de un
procedimiento claro de **rollback** para una app que guarda datos financieros.

## Decisión

Formalizar el proceso de migraciones en tres frentes:

1. **Baseline del historial:** ejecutar `supabase db pull` para capturar el
   estado real de la DB como migración baseline y, desde ahí, aplicar **todas**
   las migraciones futuras vía CLI (`supabase db push`), de modo que la DB
   tenga historial verdadero. `schema.sql` deja de ser la fuente y pasa a ser un
   artefacto regenerado.
2. **Drift check en CI:** un job compara el esquema esperado (migraciones)
   contra el `schema.sql`/DB para detectar divergencias antes de mergear.
3. **Estrategia de rollback:**
   - **Migraciones versionadas + git:** nunca se edita una migración ya
     aplicada; se revierte con una migración inversa nueva.
   - **Expand-contract** para cambios riesgosos: agregar lo nuevo y backfillear
     → migrar lectura/escritura → recién después eliminar lo viejo. Así el
     código desplegado nunca depende de un esquema inexistente o ya borrado.
   - **PITR (Point-In-Time Recovery) de Supabase** ante un incidente de datos:
     restaurar la DB a un instante previo.

## Consecuencias

- Se cierra la brecha entre `schema.sql` y la DB real; el drift se detecta
  automáticamente en vez de descubrirse en producción.
- El rollback deja de ser "editar SQL a mano" y pasa a ser un procedimiento
  reproducible (migración inversa / expand-contract / PITR según el caso).
- Costo: disciplina de no aplicar cambios fuera del CLI y de diseñar los cambios
  de esquema en pasos expand-contract, más lentos pero seguros.
- Nota de estado: el baseline con `supabase db pull` es la acción pendiente que
  este ADR decide; hasta completarlo, `db:push` puede chocar con lo aplicado
  manualmente y debe correrse con cuidado.
