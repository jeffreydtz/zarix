# CP1-08 — auditoría de borrado, delta posterior al checkpoint publicado

Implementado y probado en una base PostgreSQL WASM aislada. No se modificó la matriz histórica ni se ejecutó el runtime nativo. El gate conjunto, asesores y la regeneración completa de tipos con CLI quedan para una fase autorizada del coordinador.

El CSV pide DELETE SQL de un gasto1500: A10000→8500→10000, sin fila operativa y con identidad/actor/valor previo conservados. La nueva migración `20261015072636_audit_transaction_deletions.sql`, creada con la CLI oficial, agrega `transaction_deletion_audit` y un trigger AFTER DELETE. Almacena el OLD completo en JSONB, ID del movimiento, dueño original, actor autenticado, rol solicitante y fecha. No agrega FK que pueda borrar esa historia. El evento se escribe dentro de la misma transacción: si falla, también se revierte el DELETE y el saldo.

La tabla permite SELECT al dueño mediante RLS y lectura al backend; INSERT/UPDATE/DELETE/TRUNCATE están revocados a los roles de aplicación. La función de trigger SECURITY DEFINER vive en un esquema privado, sin USAGE/EXECUTE para esos roles y con search_path fijo. No atribuye una operación de servicio al dueño: sin auth.uid(), actor_id es NULL. Las rutas DELETE individual/masivo/total usan el cliente de la sesión verificada y conservan el filtro user_id. Bot/servicio sin sesión sigue identificado como servicio. Los errores no registran snapshots financieros.

[Antes](sql-before-final.json):0/2 grupos, ambos con42P01 por falta de auditoría, después de observar saldo restaurado y movimiento ausente. [Después](sql-after-final.json):16/16 grupos entre dos perfiles de grants, incluido OLD íntegro, actor, RLS, prohibición de escrituras/EXEC, rollback, falla de auditoría, reintento sin nuevo evento, servicio sin actor inventado y tipos/catálogo. [Vitest](vitest-final.json):16/16;11 nuevas de rutas/privacidad y5 regresiones de edición existentes. [Ejecución focal](vitest-execution.json) conserva comando, códigos y hashes seleccionados estables. Las primeras iteraciones se conservan por separado; no se suman como casos únicos.

El bloque nuevo de tipos se contrastó con las siete columnas reales del catálogo PGlite y el AST TypeScript: Row/Insert/Update, nullabilidad/defaults y ausencia de relaciones. No se afirma regeneración completa con la CLI sobre una base nativa. El espejo se verificó contra30 fuentes: baseline+29 migraciones, incluyendo la migración separada de preferencias de otro responsable. No se alteraron las cuatro migraciones originales señaladas por el usuario.

Reproducción local, sin conexiones:

```sh
node scripts/test-transaction-deletion-audit.mjs --without-audit
node scripts/test-transaction-deletion-audit.mjs
node scripts/test-isolated-schema-mirror.mjs
npx vitest run __tests__/transaction-delete-actor.test.ts __tests__/transaction-edit-regression.test.ts
```

La primera orden debe fallar por la auditoría ausente. `npm run test:db` incluye ahora el nuevo focal. El coordinador ejecutará el gate conjunto tras congelar los demás cambios; este paquete no afirma aceptación nativa/UI→API→DB ni reescribe borrados anteriores. La inmutabilidad está garantizada para roles de aplicación, no frente al propietario/superusuario.

Fuentes primarias consultadas: [Supabase: triggers](https://supabase.com/docs/guides/database/postgres/triggers), [PostgreSQL: trigger functions y OLD](https://www.postgresql.org/docs/current/plpgsql-trigger.html), [PostgreSQL: SECURITY DEFINER y privilegios](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY). La lectura del changelog.md fue rechazada por el cliente web por tipo MIME; se consultó el [changelog HTML](https://supabase.com/changelog) y no se identificó cambio aplicable al mecanismo de triggers/RLS usado.
