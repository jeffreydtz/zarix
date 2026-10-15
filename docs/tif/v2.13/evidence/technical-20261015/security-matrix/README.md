# CP2-19 — aislamiento real de seis recursos

Resultado compuesto final: **42 PASS / 6 BLOCKED / 0 FAIL en 48 celdas únicas**. CP2-19 permanece **BLOCKED/parcial** por las seis celdas sin prueba completa. [cp2-19-composite.json](cp2-19-composite.json) y [matrix.csv](matrix.csv) enlazan la evidencia por celda; no se afirma otra ejecución integral de 48 celdas sobre la build final.

La corrida del 15 de octubre usa únicamente E2E `127.0.0.1:57321/57322` y la aplicación `127.0.0.1:3000`, con las dos identidades sintéticas normales existentes. No se crearon usuarios ni credenciales; las sesiones se obtuvieron mediante contraseña y se verificaron con Auth `getUser`, con JWT de rol `authenticated`. Los archivos privados de credenciales permanecen en `/tmp/zarix-runtime-20261015`, con permiso `0600`.

La matriz contiene **48 celdas únicas**: SELECT, INSERT como U2, UPDATE y DELETE de cuentas, movimientos, posiciones, reglas, presupuestos y preferencias, por API y PostgREST con JWT de A. Se crearon fixtures propios A/B, mediante sus APIs y sesiones normales, para probar que los POST ignoran `user_id`/`userId` del cuerpo y usan el dueño de la sesión. Los SELECT negativos de DB no añaden un filtro artificial `user_id=A`: la política debe ocultar por sí misma los IDs de B. Antes de cada grupo se comprobó que el dueño B podía leer su fila.

El intento 2 registró `39 PASS / 8 BLOCKED / 1 FAIL` con el criterio inicial. La revisión posterior separa tres HTTP 500 de UPDATE válidos como **FAIL del contrato HTTP**, aunque su integridad es PASS. También limita preferencias GET: la equivalencia con flags de A, sin un oráculo que distinga A de B, no prueba por sí sola qué perfil respondió. La lectura de presupuesto que usó un mes incompleto se repitió una sola vez con DATE `2099-01-01` y pasó. La matriz reconciliada anterior a la corrección HTTP contiene **39 PASS / 6 BLOCKED / 3 FAIL**, en [matrix-before-http-fix.csv](matrix-before-http-fix.csv) y [review-reconciliation-before-http-fix.json](review-reconciliation-before-http-fix.json). No es una segunda ejecución completa de 48 celdas.

Se compararon todas las columnas de los fixtures propios de B, incluyendo su saldo y sus movimientos de apertura, y la fila pública preexistente de preferencias, antes y después de cada operación negativa. Sólo los hashes, cantidades de filas y nombres de columnas están en evidencia. El digest conjunto antes/después es idéntico. Ninguna preferencia original fue escrita. Al terminar se archivaron únicamente las nuevas cuentas/posiciones/reglas propias; los movimientos y presupuestos futuros de prueba se conservaron. Esta comparación se realizó antes de archivar los fixtures; su cambio posterior `is_active=false` es teardown propio explícito, no pérdida de integridad durante los negativos.

Los grants también se comprobaron con las sesiones normales: el dueño puede leer las columnas permitidas de su perfil, A recibe cero filas al leer/actualizar el perfil B, y INSERT/DELETE del perfil reciben `42501`. La lectura normal de `gemini_api_key`, incluso propia, recibe `42501`. El chequeo acotado de exposición encontró la clave local de servicio ausente en `/login` y sus 12 chunks públicos referenciados. La precondición de que esa clave privada existe y no está vacía se confirmó en la reconciliación. Esto no equivale a auditar todos los bundles o todas las claves.

Las seis celdas pendientes son:

- INSERT de movimiento B con JWT A: el trigger de plan devuelve `P0001` antes del WITH CHECK. La integridad está preservada, pero no se cuenta como prueba directa de INSERT RLS.
- SELECT API de posición B: no existe GET en `/api/investments/[id]`; sólo PATCH y DELETE. El GET de colección refresca cotizaciones y puede escribir posiciones originales de A, así que no se ejecutó en esta matriz. El SELECT DB negativo sí pasó.
- Las cuatro celdas API de preferencias: GET carece de un oráculo discriminante de perfil; POST actualiza el singleton propio de A, que debe conservarse, y no existen endpoints de INSERT/DELETE ni UPDATE por ID extranjero. No se crean endpoints para satisfacer el harness.

El texto histórico «No provider calls» del intento 2 era demasiado amplio: el runner sólo abrió solicitudes a loopback, pero `accounts?lite=1` llama al servicio de cotizaciones de la aplicación. Sus solicitudes públicas/cache no fueron instrumentadas aquí. Esta matriz no proporciona evidencia de integración de cotizaciones; el GET de inversiones que podría refrescar filas originales fue omitido deliberadamente.

## Archivos, revisiones y repetición

- [attempt1-cp2-19.json](attempt1-cp2-19.json): preparación interrumpida porque se usó una cuenta bancaria para una posición cuyo contrato exige cuenta de inversión. No aprobó celdas de autorización. Sus dos fixtures B propios se preservaron; la cuenta se archivó.
- [attempt2-cp2-19.json](attempt2-cp2-19.json): corrida completa original, sin reescribir sus estados; revisión `0c828ecdbcfab8842dcab071a4573ca6e91fd1d6`, manifiesto de 14 archivos estable durante esa corrida.
- [budget-select-corrected.json](budget-select-corrected.json): repetición exclusivamente de esa lectura, con snapshot completo de su presupuesto B y sin escrituras.
- [foreign-updates-corrected.json](foreign-updates-corrected.json): tres UPDATE válidos repetidos sobre la build final `kxdFHyjeNiKh0b2feujgO`, compilada en `0169860` e incluyendo la corrección `6815bdcd325f49564961368cef289d3d85f51597`. Los tres respondieron **404**, con manifiesto de seis archivos estable y snapshots completos idénticos de las tres filas B de posición/regla/presupuesto por petición y conjunto. Esta repetición no vuelve a probar cuentas/movimientos/perfil en la última build.
- [attempt1-runner.mjs.txt](attempt1-runner.mjs.txt) y [attempt2-runner.mjs.txt](attempt2-runner.mjs.txt): versiones históricas reconstruidas a bytes exactos y contrastadas con el SHA-256 registrado en cada informe. La extensión `.txt` evita ejecutar casualmente los errores históricos de preparación/oráculo.
- [run-cp2-19.mjs](run-cp2-19.mjs): runner documental corregido. Sus correcciones de precondiciones, clasificación y DATE se verificaron por sintaxis; no se afirma otra corrida completa de esta versión.
- [verify-budget-select.mjs](verify-budget-select.mjs): lectura focal ejecutada.
- [verify-foreign-updates.mjs](verify-foreign-updates.mjs): repetición ejecutada de los tres UPDATE válidos, sobre los mismos fixtures B archivados, tras una build con corrección del contrato HTTP. Sin nuevas escrituras positivas ni cambios de preferencias.

Comandos ejecutados desde la raíz del repositorio:

```sh
ZARIX_SECURITY_OUTPUT=/tmp/zarix-runtime-20261015/security-matrix-attempt1 node docs/tif/v2.13/evidence/technical-20261015/security-matrix/run-cp2-19.mjs
ZARIX_SECURITY_OUTPUT=/tmp/zarix-runtime-20261015/security-matrix-attempt2 node docs/tif/v2.13/evidence/technical-20261015/security-matrix/run-cp2-19.mjs
node docs/tif/v2.13/evidence/technical-20261015/security-matrix/verify-budget-select.mjs
node docs/tif/v2.13/evidence/technical-20261015/security-matrix/verify-foreign-updates.mjs
```

La repetición requiere el entorno privado local y permiso de sockets; el guard rechaza cualquier destino fuera de los puertos E2E autorizados. Los informes de cada intento se escriben en directorios nuevos y nunca se sobrescriben. No se suman estas celdas con pruebas SQL/nativas/Vitest como si fueran casos únicos adicionales, ni se aprueba CP2-19 completo mientras existan celdas pendientes.
