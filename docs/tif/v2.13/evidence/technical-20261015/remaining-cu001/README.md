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

Las aserciones UI quedan bloqueadas por la preflight de aislamiento de Arc. La versión instalada y las fuentes oficiales se registran en [arc-isolation-preflight.json](../e2e/browser-preflight/arc-isolation-preflight.json). No se ejecutó Arc ni se sustituyó por Chrome.

## Arnés básico preparado

[run-basic.mjs](run-basic.mjs) prepara CP1-01/02/03/05/09/11/33/34 contra el destino fijo API 58321/PG 58322 y Next 3002. No se ejecutó. La sintaxis Node fue verificada; esto no prueba el producto. Antes de cualquier I/O exige la liberación serial del padre y `synthetic-only`. Verifica la copia servida contra Git y CI4, buildID/env privados, PID/listener/cwd propios y las dos identidades clonadas por Auth normal. No altera planes, identidades ni originales.

Para la ventana explícitamente liberada, sin imprimir credenciales:

```sh
ZARIX_CU001_BASIC_WINDOW=released-proof-58321 \
ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only \
node docs/tif/v2.13/evidence/technical-20261015/remaining-cu001/run-basic.mjs
```

Las nuevas cuentas propias se archivan; los movimientos se conservan salvo los DELETE propios exigidos por CP1-09/11. El informe conserva huellas de las filas originales antes/después. No ejecuta cron, importación, compartidos, navegador o proveedor. Si faltan cupos ya configurados, bloquea el caso y continúa sin cambiar planes.

CP1-05 registra primero UPDATE de `amount` solo y su saldo observado; después prueba la edición de ambas columnas monetarias canónicas. Esa segunda prueba no sustituye la primera ni promueve el caso original ambiguo a PASS. CP1-01 conserva pendiente el listado/dashboard UI. CP1-34 envía la cadena `NaN`, convertida por la API a NaN, y separa ese rechazo del comportamiento real de un input del navegador.

La apertura contable de una cuenta es un `adjustment` documentado. Se conserva en los snapshots y en `openingLedgerRows`; el conteo de gastos/ingresos/transferencias se mantiene separado. La revisión estática independiente detectó esa distinción antes de ejecutar; no se descartó una falla observada del producto.
