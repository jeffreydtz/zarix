# Conciliación atómica y precisión de saldos — 15/10/2026

La nueva RPC `recompute_account_balance` bloquea la cuenta propietaria con `FOR UPDATE`, suma el ledger con SQL `NUMERIC` y reemplaza el saldo dentro de la misma transacción. El servicio del servidor llama esa RPC con el usuario obtenido por la ruta autenticada. No hace lecturas paginadas ni un `UPDATE` separado del cliente. La RPC es `SECURITY INVOKER`, tiene `search_path` vacío y sólo `service_role` puede ejecutarla; un propietario manipulado falla con `42501`.

La [migración nueva](../../../../../../supabase/migrations/20261015000402_atomic_account_balance_recompute.sql), creada con `supabase migration new atomic_account_balance_recompute`, incorpora además una corrección estrecha de precisión: sólo las dos expresiones de crédito/reversión del destino en el trigger reciben `round(...,8)` antes de sumarse al saldo. Los archivos originales del 06/07 de octubre permanecen intactos. El importe destino persistido sigue siendo autoritativo; el fallback de movimientos antiguos se redondea por impacto a escala 8. El saldo canónico es la suma de esos impactos, independiente del redondeo del saldo acumulado cerca de cero. Se conservan los ajustes iniciales del ledger y se excluyen del saldo primario los ajustes de moneda secundaria de tarjetas multimoneda, como en el trigger. Un ledger vacío da cero.

La aplicación local de la migración ejecutó únicamente definiciones/permisos de funciones. No actualizó saldos, movimientos ni historial existente automáticamente. La prueba modifica, elimina y revierte sólo movimientos que ella misma crea; al terminar archiva sus propias cuentas y conserva sus restantes filas para revisión.

## Resultados y límites

| Verificación | Resultado | Evidencia y alcance |
| --- | --- | --- |
| Algoritmo anterior: ingreso confirmado entre lectura y reemplazo | FAIL reproducido | Una conexión independiente confirma 25; ledger 125, saldo reemplazado por 100. Es la reproducción esperada del defecto, no una aprobación del algoritmo anterior. |
| Trigger anterior: medias unidades y cruce por cero | FAIL reproducido | Fixture separado con baseline + 26 migraciones originales: mismo multiset termina en −0,00000001 o +0,00000001 según el orden. |
| SQL focal actual | 18/18 PASS | [PGlite](account-recompute-pglite.json): PostgreSQL 18.3, permisos, propietario, ledger vacío, 1022 filas, ajustes, transferencias persistidas/legacy, cruce por cero, ambos órdenes, edición/borrado y falla posterior al UPDATE con rollback. Roles/GUC de prueba; no Auth ni concurrencia nativa. La reproducción previa se registra aparte y no se suma como otro PASS. |
| Auth/PostgREST y SQL/concurrencia actuales | 7/7 PASS | [PostgreSQL nativo 17.11](account-recompute-native.json), exclusivamente E2E `127.0.0.1:57321/57322`: login/getUser de los mismos dos usuarios normales, RPC de servicio, propietario manipulado y tres denegaciones reales (anon, A y B), conexiones independientes, precisión exacta y rollback. |
| Contrato del servicio y paginación restante | 11/11 PASS | [Vitest](account-recompute-vitest.json): tres contratos de conciliación RPC; los otros ocho conservan los agregados paginados. Son dobles de PostgREST, no prueba de bloqueo. |
| Tipos públicos y espejo SQL | PASS | [CLI oficial](account-recompute-types.json): 27 tablas/30 funciones; `Database` se reexporta desde `types/database.ts`. Los modelos manuales de presentación no se presentan como catálogo exhaustivo. Espejo baseline + 27 migraciones, 28 fuentes. |
| Supabase Advisors | PASS para nueva RPC | [Informe saneado](account-recompute-advisors.json): cero hallazgos para `recompute_account_balance`; el catálogo restante conserva 61 INFO/31 WARN/0 ERROR. Los WARN son 22 `auth_rls_initplan`, 8 `function_search_path_mutable` y 1 `extension_in_public`; no se declara libre de advertencias todo el esquema. |

La prueba nativa observa `pg_stat_activity.wait_event_type=Lock`, `pg_blocking_pids` y PIDs distintos. Cuando la conciliación tiene el bloqueo primero, el INSERT no puede confirmar y el ledger visible permanece en 125; al confirmar ambos, saldo y ledger son 150. Cuando el escritor obtiene primero el bloqueo, la RPC espera y luego ve su ingreso confirmado: `before=175`, `after=175`, ledger 175. No se infiere concurrencia a partir de llamadas seriales a PGlite. Las reglas de snapshots por sentencia de [READ COMMITTED](https://www.postgresql.org/docs/17/transaction-iso.html#XACT-READ-COMMITTED) y la duración de los [bloqueos de fila](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS) sustentan el diseño y fueron comprobadas en el runtime.

El bloque de precisión nativo usa valores SQL exactos: una media unidad cruzando cero produce `0.00000000`; dos créditos de media unidad menos un gasto producen `0.00000001` en ambos órdenes. Tras editar el crédito, saldo/conciliación dan `0.00000002`; al borrar ambas transferencias propias dan `-0.00000001`. Un INSERT seguido de ROLLBACK deja ambos saldos y el número de filas intactos.

`npm run typecheck`, `npm run lint` y `npm run test:db` aprobaron después de la revisión final. El nuevo script SQL forma parte de `test:db` y el runner técnico también exporta `account-recompute-sql.json`; esa ejecución repetida no aumenta el número de casos únicos. El [manifiesto final](final-source-manifest.json) identifica revisión base, fuentes exactas y artefactos. Los ensayos se ejecutaron sobre cambios locales identificados por hash antes del commit; no se atribuyen a un HEAD anterior sin esos cambios.

Este cierre es focal. Los cuatro CU de UI, recuperación completa, carga y proveedores conservan sus informes separados. **CNF-02 continúa BLOCKED** hasta disponer de observación real del período mensual; estas pruebas breves no miden esa disponibilidad. Tampoco representan una aplicación remota, despliegue o fusión del PR.

## Intentos conservados

[Intento 1](account-recompute-native-attempt1.json) reprodujo la pérdida de saldo pero no pudo completar RPC HTTP; [intento 2](account-recompute-native-attempt2.json) conservó 4 PASS nativos y 2 BLOCKED HTTP. La causa fue el wrapper de prueba, que expandía un objeto `Headers` y descartaba autorización/content-type; PostgREST recibió los parámetros incorrectamente y respondió `PGRST202`. El wrapper final copia con `new Headers(init.headers)` y conserva los encabezados. No fue necesario cambiar permisos, reiniciar servicios ni resetear datos. La solicitud local de recarga de caché del diagnóstico no alteró datos y no resolvió ese defecto del wrapper. No hubo reintentos automáticos de escrituras financieras.

El [ensayo de 6 grupos](account-recompute-native-before-canonical-normalization.json) y el [SQL de 15 grupos](account-recompute-pglite-before-canonical-normalization.json) corresponden a la primera versión de esta RPC, antes de normalizar el trigger; se preservan como históricos con su hash anterior. Los informes actuales de 7/18 grupos identifican la migración revisada `7f0a8bc2e23c3dfd43af5f01b9132b9daa44d48b6a38f5fe02524b837d0f4bce`.

[Advisors intento 1](account-recompute-advisors-attempt1.json) registró el bloqueo de transporte TLS. La CLI 2.120.0 requiere `sslmode=disable` para este PostgreSQL nativo sin TLS. Los scripts agregan esa opción fija **después** de validar loopback; no aceptan parámetros de conexión suministrados por el usuario. El [informe previo a la normalización](account-recompute-advisors-before-canonical-normalization.json) y el actual se conservan separados. Los diagnósticos originales viven sólo en un directorio temporal privado; la evidencia incluye códigos/contextos o identificadores del catálogo, sin mensajes SQL crudos, contraseñas, JWT ni capacidades de invitado.

Los 19 grupos nativos y 3 de recuperación del 13/14 de octubre, así como las 27 tablas/29 funciones de sus tipos, siguen siendo evidencia histórica de otra revisión. No se reasignan a estas fuentes ni se suman como una corrida actual de 29 grupos.

## Reproducción

Usar únicamente una nueva réplica sintética E2E con las 27 migraciones aplicadas y el fixture privado de dos usuarios/invitado creado por `scripts/setup-isolated-e2e-users.mjs`. Deben existir tres cupos activos disponibles; el harness no cambia planes ni crea más identidades. Node 22.17.0 fue el runtime utilizado. El archivo de variables y las contraseñas sintéticas permanecen fuera del repositorio, con permisos 0600.

```sh
set -a
source /tmp/zarix-runtime-20261015/e2e.env
set +a
export ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only
export ZARIX_LOCAL_SUPABASE_URL="$ZARIX_E2E_SUPABASE_URL"
export ZARIX_LOCAL_DATABASE_URL="$ZARIX_E2E_DATABASE_URL"
export ZARIX_LOCAL_ANON_KEY="$ZARIX_E2E_ANON_KEY"
export ZARIX_LOCAL_SERVICE_ROLE_KEY="$ZARIX_E2E_SERVICE_ROLE_KEY"
export ZARIX_SUPABASE_CLI=/tmp/zarix-runtime-20261015/bin/supabase
export ZARIX_TEST_LOGIN_FILE=/tmp/zarix-runtime-20261015/e2e-logins.json
export ZARIX_RECOMPUTE_OUTPUT=/tmp/zarix-runtime-20261015/recompute-reproduction
export ZARIX_RECOMPUTE_PRIVATE_OUTPUT=/tmp/zarix-runtime-20261015/recompute-private
node scripts/test-atomic-account-recompute.mjs
node scripts/test-atomic-account-recompute-native.mjs
node scripts/generate-isolated-database-types.mjs
node scripts/test-atomic-account-recompute-advisors.mjs
node scripts/test-isolated-schema-mirror.mjs
npx vitest run __tests__/financial-summary-pagination.test.ts
npm run typecheck
npm run lint
npm run test:db
```

El harness nativo rechaza todo destino diferente de E2E `57321/57322`; no instala recursos, no llama proveedores externos y no ejecuta `db:push`, `db:reset` ni DML automático sobre el historial. La generación de tipos introspecciona únicamente el esquema público, sin leer datos de usuarios.
