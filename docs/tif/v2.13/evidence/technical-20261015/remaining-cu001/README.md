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
