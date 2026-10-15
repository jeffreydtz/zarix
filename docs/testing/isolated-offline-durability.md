# Durabilidad offline en Chrome real: CU001 y aislamiento relacionado CU002

`scripts/test-isolated-offline-durability.mjs` ejecuta UI→Next API→PostgreSQL nativo con Chrome instalado y un perfil temporal privado 0700. Reutiliza exactamente los usuarios A/B y el invitado del fixture propio existente, sin crear identidades. Sólo acepta app `http://127.0.0.1:3000`, API 57321 y PostgreSQL 57322 con `ZARIX_API_TARGET_PURPOSE=isolated-api-e2e-replica` y `ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only`. Las rutas del navegador rechazan otros destinos, incluidos source/restore/load. Nunca usar este runner en una base real ni en esas otras réplicas.

El runner agrega cuentas/categorías y movimientos sintéticos propios mediante UI autenticada y usa conexiones SQL independientes sólo para lectura. No modifica planes, roles o identidades ni borra datos previos. Ejecutarlo después del harness general E2E para evitar que su downgrade temporal interfiera con la preparación de las cuentas propias. Los servicios externos del navegador están bloqueados. No representa aceptación de Gemini, Telegram, OCR, Mercado Pago ni un quinto caso de uso.

## Preparación y seguridad

Usar el stack E2E nuevo y su fixture privado `ZARIX_TEST_LOGIN_FILE` con dos usuarios y un invitado. Inyectar en memoria, mediante el mecanismo privado del executor, `ZARIX_LOCAL_SUPABASE_URL`, `ZARIX_LOCAL_DATABASE_URL`, `ZARIX_LOCAL_ANON_KEY` y `ZARIX_PG_BIN`. No imprimir, copiar o versionar el contenido de `/tmp/zarix-runtime-20261015/e2e.env` o `e2e-logins.json`. El frontend y el backend de Next deben estar previamente vinculados por el padre a esa réplica, con fuentes congeladas y build de producción válido. El runner no inicia ni detiene Next/PostgreSQL.

También requiere el módulo Playwright 1.64.0 ya instalado fuera del repositorio, por ejemplo `ZARIX_PLAYWRIGHT_MODULE=/tmp/zarix-e2e-20261015/node_modules/playwright/index.mjs`, y Chrome instalado. No instala software ni usa el perfil personal de Chrome. El perfil privado conserva sesiones e IndexedDB únicamente para las dos fases; no se copia a la evidencia. El entorno del proceso Chrome contiene sólo variables ordinarias del sistema, sin claves de servicios del runner.

## Dos fases con reinicios distinguidos

1. `prepare`: login normal por UI; crea su cuenta A con saldo 10000. Guarda un gasto 11,11 sin conexión, demuestra cero efectos SQL, cierra Chrome y comprueba que el PID salió. Relanza Chrome con el mismo perfil, retiene la sincronización automática mediante un rechazo de transporte hasta seleccionar **Reintentar esta solicitud**, y comprueba un recibo, un movimiento y el saldo 9988,89. Después guarda otro gasto 22,22: `route.fetch` recibe HTTP 201 real, el oráculo SQL confirma el commit y la ruta aborta la respuesta antes del acuse del navegador. Conserva el mismo ID pendiente y cierra Chrome.
2. El padre recibe `WAITING_SERVER_RESTART` y detiene/reinicia sólo su proceso Next propio de puerto 3000 con el mismo build. No reinicia la base ni presenta el cierre de Chrome como reinicio de servidor.
3. `resume`: exige el registro saneado del reinicio, conserva hashes/build y recupera explícitamente el ID pendiente desde IndexedDB. Exige la misma respuesta, movimiento, huella y saldo 9966,67. Luego dos formularios nuevos con contenido idéntico generan IDs distintos, dos recibos, dos movimientos y saldo 9900,01. Por último logout/signin normal A→B en el mismo perfil comprueba que el formulario abierto se limpia o desaparece mediante navegación a login, B no ve la cuenta/categoría/borrador A y su reapertura offline utiliza sólo referencias propias. Inspecciona también el menú completo de categorías y las opciones de cuentas de B.

Configuración no sensible de ejemplo, una vez inyectadas las variables privadas:

```sh
export ZARIX_E2E_APP_URL=http://127.0.0.1:3000
export ZARIX_PLAYWRIGHT_MODULE=/tmp/zarix-e2e-20261015/node_modules/playwright/index.mjs
export ZARIX_TEST_LOGIN_FILE=/tmp/zarix-runtime-20261015/e2e-logins.json
export ZARIX_OFFLINE_OUTPUT=/tmp/zarix-offline-durability
export ZARIX_OFFLINE_STATE_FILE=/tmp/zarix-runtime-20261015/offline-durability-state.json
ZARIX_OFFLINE_PHASE=prepare node scripts/test-isolated-offline-durability.mjs
```

Tras cerrar todos los browsers propios, el padre guarda `/tmp/zarix-runtime-20261015/next-restart-proof.json` sin secretos, con este contrato:

```json
{
  "purpose": "isolated-offline-server-restart",
  "appOrigin": "http://127.0.0.1:3000",
  "before": { "pid": 111, "buildId": "SAME_BUILD", "stoppedAt": "UTC_ISO_DATE", "stopConfirmed": true },
  "after": { "pid": 222, "buildId": "SAME_BUILD", "startedAt": "UTC_ISO_DATE", "startConfirmed": true }
}
```

Los PID y tiempos deben ser observados, los PID deben diferir y `stoppedAt` debe ser posterior al cierre demostrado de Chrome. El padre conserva además evidencia propia de fuentes/build/readiness. El runner valida esos campos y sólo copia campos permitidos al reporte. Reanudar:

```sh
ZARIX_OFFLINE_PHASE=resume node scripts/test-isolated-offline-durability.mjs
```

Si un fallo del arnés interrumpe sólo CU002 después de completar los gastos, conservar el reporte original y reparar el selector demostrado. La fase `identity` vuelve a ejecutar exclusivamente el cambio de identidad, sin repetir los cuatro movimientos ni reiniciar Next. Exige el mismo build y la misma lista de hashes de aplicación del estado original; registra por separado los hashes anterior/actual del propio arnés. Cierra la sesión normal del perfil, ingresa como A por UI, crea un señuelo de categoría con sufijo nuevo y prueba A→B/offline. No atribuir los checks del arnés reparado al gate core anterior.

```sh
ZARIX_OFFLINE_PHASE=identity node scripts/test-isolated-offline-durability.mjs
```

## Evidencia y límites

Cada fase guarda JSON con revisión, hashes de fuentes, build, versiones, fechas, PID de Chrome y salida confirmada del proceso, eventos de requests con sólo método/ruta/status, aserciones SQL y capturas después de login. No almacena HAR, trazas crudas, cookies, passwords, JWT, headers de autorización ni tokens del invitado. Los IDs lógicos de idempotencia y las huellas de payload/respuesta financiera sintética sí se registran como evidencia de deduplicación. El estado privado para reanudación sigue siendo 0600 y no se publica.

Usar carpetas de salida y estado nuevos al comenzar otra corrida; no sobrescribir reportes de fallos ni volver a cargar los gastos confirmados para corregir un selector. `Nuevo` se selecciona dentro del hero de Movimientos, pues la navegación también tiene un botón con ese nombre. El sandbox de este executor puede devolver `EPERM` para sockets locales: registrar ese bloqueo de transporte antes de usar el permiso autorizado, sin clasificarlo como rechazo de Auth de la aplicación.

`WAITING_SERVER_RESTART` es un estado intermedio, no PASS del reintento completo. `PARTIAL` sólo afirma que los recorridos acotados del runner aprobaron; no aprueba todos los CP ni CU001/CU002 completos. Las dos intenciones nuevas son secuenciales y separadas del reintento; la contención de sesiones PostgreSQL independientes pertenece al ensayo nativo. La prueba de B conserva snapshots privados A sin adoptarlos ni borrarlos; prueba aislamiento en UI/cache de la aplicación, no aislamiento físico frente a alguien que inspeccione archivos del navegador.

Los dos procesos Chrome y el reinicio de Next se demuestran separadamente. No hay afirmación de reinicio de PostgreSQL, máquina, caída eléctrica ni disponibilidad mensual. Toda falla conserva los datos sintéticos escritos y el reporte parcial, y exige revisar la causa antes de repetir; nunca hace reset automático.

El perfil temporal sólo sirve mientras exista para continuar las fases. La corrida real 20261015-02 lo eliminó, después de comprobar la salida del PID y tras finalizar la fase de identidad; conserva estado privado, reportes, hashes, capturas y datos SQL. Ese checkpoint no ofrece el archivo IndexedDB bruto ni una copia íntegra del perfil para auditoría posterior. El estado privado incluye el item pendiente seleccionado para pérdida de respuesta, no un respaldo completo de IndexedDB.
