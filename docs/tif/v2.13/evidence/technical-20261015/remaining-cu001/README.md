# CU001: plan literal de24 casos pendientes

Plan documental; no ejecuta pruebas ni modifica la matriz. Se conservaron las entradas y los resultados esperados literales de `casos_prueba.csv` en [literal-plan.json](literal-plan.json).

Se identificaron22 fixtures literales pendientes y2 casos reconciliables con evidencia SQL existente. Un recorrido previo parcialmente coincidente no se promueve a PASS. CP1-37/38 permiten explícitamente alcance SQL aislado en el CSV; sus aserciones exactas están en SH02/03 y SH04–11, con11/11 de CI4. La decisión de actualizar trazabilidad corresponde al integrador.

Las futuras ejecuciones corresponden exclusivamente a la réplica nueva 58321/58322 tras su entrega. SOURCE, RESTORE, LOAD y los fixtures financieros E2E previos quedan protegidos. Importación,cron,compartidos y fallas inyectadas deben permanecer en esa réplica. Se usan las dos identidades sintéticas clonadas existentes; no se crean usuarios ni credenciales externas.

| Caso | Alcance previsto | Evaluación actual |
| --- | --- | --- |
| CP1-01 | API_UI_DB | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-02 | API_UI_DB | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-03 | API_DB_PLUS_ANALYTICS | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-04 | SQL_FAULT_AND_NORMAL_RETRY | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-05 | DIRECT_SQL_TRIGGER | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-09 | DIRECT_SQL_TRIGGER | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-11 | DIRECT_SQL_TRIGGER | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-12 | API_DB_MULTI_CURRENCY | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-19 | IMPORT_CSV_API_DB | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-20 | IMPORT_JSON_API_DB | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-21 | IMPORT_UI_API_DB | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-22 | IMPORT_REJECTION_API_DB | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-23 | RECURRING_CRUD_API_DB | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-24 | CONCURRENT_CRON_DB_OUTBOX | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-25 | CRON_FAULT_RETRY_DB | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-28 | CRON_AUTH_DATE_API_DB | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-29 | CRON_NEGATIVE_BALANCE | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-30 | CRON_NOTIFICATION | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-31 | BUDGET_BOUNDARIES_API_DB | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-33 | OWNER_STATE_API_DB | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-34 | INPUT_CENTS_API_DB_UI | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-35 | CRON_BATCH_COUNTERS | NOT_EXECUTED_LITERAL_FIXTURE |
| CP1-37 | EXACT_EXISTING_SQL_RECONCILIATION | RECONCILABLE_EXISTING_SQL_SCOPE |
| CP1-38 | EXACT_EXISTING_SQL_RECONCILIATION | RECONCILABLE_EXISTING_SQL_SCOPE |

Riesgos de atribución: PATCH de API puede reparar mediante recomputación y no prueba por sí solo el trigger SQL; `JSON.stringify(NaN)` produce `null`; balances intactos no prueban que un rechazo ocurrió antes de acceder aDB; falta de un contador `skipped` no autoriza inventarlo. Los gastos recurrentes sí pueden dejar saldo negativo según el contrato literal. Las notificaciones por doble local no equivalen a entrega real de Telegram.

Las aserciones UI siguen pendientes. La versión instalada y la evaluación inicial se registran en [arc-isolation-preflight.json](../e2e/browser-preflight/arc-isolation-preflight.json). El estado posterior está en [user-browser-scope.json](../e2e/browser-preflight/user-browser-scope.json): macOS autorizó Automation para Codex→Arc, pero el primer intento de una ventana privada falló al resolver su referencia y no confirmó su cierre. Se espera la reconciliación humana antes de crear otra pestaña o ventana. No se sustituyó Arc por Chrome.

## Arnés básico preparado

[run-basic.mjs](run-basic.mjs) prepara CP1-01/02/03/05/09/11/33/34 contra el destino fijo API 58321/PG 58322 y Next 3002. El checkpoint de preparación se registró antes de ejecutar. La sintaxis Node fue verificada; esa comprobación por sí sola no prueba el producto. Antes de cualquier I/O exige la liberación serial del padre y `synthetic-only`. Verifica la copia servida contra Git y CI4, buildID/env privados, PID/listener/cwd propios y las dos identidades clonadas por Auth normal. No altera planes, identidades ni originales.

Para la ventana explícitamente liberada, sin imprimir credenciales:

```sh
ZARIX_CU001_BASIC_WINDOW=released-proof-58321 \
ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only \
node docs/tif/v2.13/evidence/technical-20261015/remaining-cu001/run-basic.mjs
```

Las nuevas cuentas propias se archivan; los movimientos se conservan salvo los DELETE propios exigidos por CP1-09/11. El informe conserva huellas de las filas originales antes/después. No ejecuta cron, importación, compartidos, navegador o proveedor. Si faltan cupos ya configurados, bloquea el caso y continúa sin cambiar planes.

CP1-05 registra primero UPDATE de `amount` solo y su saldo observado; después prueba la edición de ambas columnas monetarias canónicas. Esa segunda prueba no sustituye la primera ni promueve el caso original ambiguo a PASS. CP1-01 conserva pendiente el listado/dashboard UI. CP1-34 envía la cadena `NaN`, convertida por la API a NaN, y separa ese rechazo del comportamiento real de un input del navegador.

La apertura contable de una cuenta es un `adjustment` documentado. Se conserva en los snapshots y en `openingLedgerRows`; el conteo de gastos/ingresos/transferencias se mantiene separado. La revisión estática independiente detectó esa distinción antes de ejecutar; no se descartó una falla observada del producto.

## Ejecución real y reconciliación

[verification.json](verification.json): **5 PASS y 3 PARTIAL**, con 85aserciones aceptadas y0 fallas en la selección final. Las12 tablas originales protegidas conservaron sus filas y huellas en ambas fases; las fuentes permanecieron estables y no se reportaron errores de cleanup de las cuentas sintéticas. Se usaron Auth normal y la copia Next 3002 fijada a CI4, revisión y buildID registrados en cada informe. No es aceptación de CU001 completo.

El [primer intento](attempt-1-eight-cases/verification.json) se conserva íntegro: CP1-33 falló porque el arnés había supuesto 4xx. El CSV sólo exige rechazo por estado/acceso. El [reintento autorizado de CP1-33](attempt-2-cp1-33/verification.json) verificó ambas ramas, payload de error sin datos y ledger/cuentas completos intactos. Los dos HTTP 500 se registran como observación; no se declara que sean el contrato HTTP esperado ni se modificó el producto para obtener PASS.

CP1-01 queda parcial por UI, CP1-05 por interpretación de la columna SQL y CP1-34 por la diferencia entre NaN convertido en la API y un input real del navegador. La observación `amount` solo dejó saldo 8500 con canónico 1500; actualizar ambos importes produjo 8000 exactamente. Ambas observaciones siguen visibles.

## Catorce adaptadores restantes, sin ejecutar

[run-remaining.mjs](run-remaining.mjs) y [remaining-scenarios.mjs](remaining-scenarios.mjs) preparan CP1-04/12/19/20/21/22/23/24/25/28/29/30/31/35. [remaining-preparation.json](remaining-preparation.json) conserva hashes y sintaxis; no hay resultado runtime todavía.

El perfil intermedio fija Git 836/core-reliability en una copia física nueva de Next 3002 contra 58321/58322. El perfil final exige su propia copia/core-acceptance. Ambos tienen nombres y rutas cerrados: no aceptan un destino arbitrario. La copia completa se compara con Git y el manifiesto de build; los cambios actuales no compilados se enumeran como no ejecutados. El reloj sólo se instala en Next, fijado a 2026-10-06T12:00:00Z, y se contrasta con PID/build/hash/preload observados; runner, OS y Auth conservan tiempo real. No se inventa un parámetro de fecha en cron.

La ejecución necesita liberación serial explícita del padre y estos gates; el ejemplo **no fue ejecutado**:

```sh
ZARIX_CU001_REMAINING_WINDOW=released-clock-proof-58321 \
ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only \
node docs/tif/v2.13/evidence/technical-20261015/remaining-cu001/run-remaining.mjs \
  --profile intermediate-core-reliability-clock
```

`--cases` permite repetir únicamente casos afectados. Los cron usan B con Premium ya configurado, CRON_SECRET local existente y alertas de administración explícitamente deshabilitadas. No cambian planes ni claves. Las reglas propias se desactivan y las cuentas nuevas se archivan; los hooks SQL temporales sólo coinciden con IDs de fixtures propios, registran el punto de falla en una secuencia de prueba y se eliminan en finally. Los nombres exactos y su cleanup se registran antes de instalar el hook para cubrir una respuesta perdida tras CREATE; se conservan las definiciones y ACL instaladas y se compara el catálogo público completo antes/después. Cada sesión SQL acota statement/lock a17s/3s. No se reemplazan funciones del producto ni se alteran migraciones.

Se conservan como alcances pendientes: nomenclatura importadas/rechazadas/omitidas frente a `skipped` del API; criterios de duplicado y estados visibles en UI; siguiente fecha visible; identidad del bot si falta; rama histórica 23505 que la transacción actual ya hace atómica; observación instrumentada de acceso previo a DB; aceptación real de Telegram. No se fuerzan esos pendientes para obtener PASS.
