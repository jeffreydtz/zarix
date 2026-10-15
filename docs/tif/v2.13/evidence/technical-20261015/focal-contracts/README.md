# Cinco contratos originales: evidencia y preparación focal

Arnés independiente de los gates CI3 y de los recorridos API/UI anteriores. No modifica producto, plan, usuarios, recursos originales ni las 273 filas de `casos_prueba.csv`.

El [primer intento](attempt-1-existing-full-plan/verification.json) ejecutó CP1-36 con resultado PASS: gasto original100 ARS, tres cuotas33.34/33.33/33.33, netos del gasto y grupo0.00, grupo archivado conservado. Los otros cuatro casos quedaron BLOCKED antes de crear fixtures o enviar comandos: A ya tenía20 cuentas activas de20 permitidas. Las doce tablas protegidas conservaron todas sus filas originales sin cambios. La [revisión independiente](cp1-36-review.json) contrasta reporte, arnés exacto preservado y referencia API anterior; este resultado corresponde al buildCI3 `QcXclgO6C0_ktQ5ac8YWh`, no a cambios posteriores del checkout.

**El perfil nuevo de cuatro casos está preparado, todavía no ejecutado.** Usa una quinta réplica local autorizada con las mismas dos identidades sintéticas del ensayo nativo anterior; AFree/BPremium se preparan fuera de este arnés. La ejecución requiere una ventana liberada por el coordinador y el buildCI4 separado. Los contratos de análisis de cuenta vacía se ejecutan primero; sus fixtures conservadas pueden existir después, sin exigir una base global vacía para estos cuatro casos. `node --check` sólo comprueba sintaxis; no aprueba contratos.

| ID | Fixture y oráculo literal |
| --- | --- |
| CP1-36 | Lectura exclusivamente del `expenseId` original enlazado en `../e2e/api/api-verification.json`: importe100 ARS; cuotas33.34/33.33/33.33, tres miembros del mismo grupo y suma100; netos independientes del gasto por miembro suman0. Las otras filas del grupo se concilian aparte, sin sustituir el oráculo del gasto exacto. Grupo archivado conservado sin reactivar/escribir. |
| CP1-06 | Cuentas propias nuevas A10000/B2000; gasto1500 en A; PATCH origen B; A10000/B500, un movimiento con el mismo ID y relación histórica coherente. |
| CP1-10 | Cuentas propias nuevas A10000/B2000/C3000; transferencia1500 A→B; PATCH destinoC e importe1000; balances9000/2000/4000 y total15000; flujo de ingresos/gastos sin incremento. |
| CP1-13 | Cuenta propia nueva10000, dos gastos6000 con claves distintas. Barrera transaccional en esa cuenta propia y dos conexiones PostgreSQL bloqueadas, observadas simultáneamente antes de liberar la barrera; dos efectos y recibos, saldo−2000. |
| CP4-03 | Posición manual nueva4×100USD; venta total4×120USD; cantidad/costo remanente0, realizado80USD, posición cerrada, historial HTTP autenticado visible y resultados numéricos finitos. |

Las cuentas se crean por API normal y se archivan al terminar **sólo si pertenecen al namespace UUID de esta corrida**; sus datos financieros se conservan. Se necesitan tres huecos libres del plan como máximo. No se cambian estados Premium/Free, selecciones de cuentas ni reglas para acomodar el arnés. Si no hay capacidad se registra un bloqueo real y se conserva CP1-36 como lectura independiente.

El bloqueo de CP1-13 usa una conexión administrativa únicamente para retener `FOR UPDATE` en su cuenta nueva. Ambos comandos financieros entran por HTTP con cookies SSR de login normal, claves distintas y conexiones PostgREST reales; `pg_stat_activity`/`pg_blocking_pids` deben demostrar el solapamiento. `Promise.all` por sí solo no aprueba concurrencia. La transacción barrera termina con ROLLBACK, sin escrituras propias.

Los snapshots de integridad comprueban todas las columnas de las filas preexistentes en doce tablas públicas. Las sesiones Auth temporales son normales; sólo se cierran localmente esas sesiones SDK. Las credenciales, cookies, JWT, secretos y capacidad de invitado no se guardan en la evidencia. Los errores crudos de SQL/Auth tampoco se publican.

Comando previsto, desde la raíz del repositorio y **sólo tras liberar la ventana**:

```sh
ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only \
ZARIX_FOCAL_WINDOW=after-load-and-quotes \
node docs/tif/v2.13/evidence/technical-20261015/focal-contracts/run.mjs
```

Sin argumentos se conserva el perfil original `existing-e2e`: lee en memoria `e2e.env` y `e2e-logins.json` privados0600 en `/tmp/zarix-runtime-20261015`, API57321/DB57322, Next3000 y cinco casos. La copia ejecutada del primer intento permanece en `attempt-1-existing-full-plan/executed-run.mjs`, con su propio hash; no se reemplaza por este arnés ampliado.

Comando futuro de los cuatro casos pendientes, **sólo después de CI4 y de liberar PROOF**:

```sh
ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only \
ZARIX_FOCAL_WINDOW=after-load-and-quotes \
node docs/tif/v2.13/evidence/technical-20261015/focal-contracts/run.mjs \
  --profile fresh-proof \
  --cases CP1-06,CP1-10,CP1-13,CP4-03 \
  --core-dir core-reliability \
  --app-state /tmp/zarix-runtime-20261015/proof-app-state.json
```

`fresh-proof` sólo admite API58321/DB58322 y Next3002. Lee `proof.env`/`proof-logins.json` privados, exige propósito `fifth-isolated-acceptance-replica` y coteja las dos identidades con el fixture nativo privado; no crea usuarios ni credenciales. Omite completamente la lectura del grupo archivado de CP1-36. Registra conteos iniciales y protege todas las filas preexistentes en las doce tablas declaradas, incluidas fixtures de pruebas anteriores; sólo crea/archiva cuentas de su propio namespace UUID. No borra, reinicia ni modifica planes originales. SOURCE, RESTORE, LOAD, E2E57321 y destinos remotos quedan excluidos de ese perfil.

El estado APP debe declarar la copia exacta `/tmp/zarix-app-account-analysis-20261015`; BUILD_ID se lee dentro de esa copia, sin usar `.next` raíz. Se exige que el PID vivo indicado sea dueño del listener127.0.0.1:3002 y tenga esa copia como cwd, antes de enviar comandos. `proof-build-proof.json`, el manifiesto CI4 elegido y los bytes Git de su revisión inmutable se contrastan contra todas las fuentes copiadas, incluyendo esquema y las27 migraciones actuales. Sólo el marcador CLI ignorado capturado por CI puede aparecer como metadato separado de Git. Los hashes del APPenv privado enlazan backend y claves locales sin publicar sus valores. `--core-dir` queda dentro de esta evidencia técnica; no admite destinos externos. Se mantiene la distinción entre build raíz, buildPROOF y checkout actual.

Cada reporte se crea en un directorio nuevo0700 `focal-contracts-<UUID>`, con archivos0600. Incluye perfil, selección de casos, revisión, build, manifiesto exacto, respuestas saneadas, aserciones, conteos/hash de originales y resultado PASS/FAIL/BLOCKED real. No atribuye la evidencia a navegador, proveedores ni a otros gates.
