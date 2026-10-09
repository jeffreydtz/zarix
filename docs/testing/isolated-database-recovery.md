# Verificación SQL y recuperación aislada

## Alcance y seguridad

La verificación usa datos sintéticos, dos identidades normales y un invitado sin cuenta. No lee ni modifica un proyecto remoto. No usa datos reales, proveedores pagos ni credenciales externas persistentes.

Hay dos niveles independientes:

1. `scripts/test-isolated-database.mjs` ejecuta PostgreSQL 18.3 real compilado a WASM mediante PGlite 0.5.8. Aplica RLS, permisos, funciones, triggers, constraints y transacciones reales. Crea roles normales sin `SUPERUSER` ni `BYPASSRLS`. La tabla `auth.users` y las funciones `auth.uid()`/`auth.role()` son un fixture explícito. Esto **no** demuestra registro/login de Supabase, validación criptográfica de JWT, PostgREST ni cookies de navegador.
2. `scripts/test-isolated-native-supabase.mjs` está preparado para un stack Supabase local vacío: registro y login reales, consultas PostgREST con sesiones normales, dos conexiones PostgreSQL independientes y restauración lógica nativa. **No se ejecutó en el entorno restringido:** la creación de sockets falló con `EPERM`, también después de la revisión de permisos. Un archivo de prueba preparado y validado sintácticamente no es una prueba aprobada.

La llamada de invitado al RPC se realiza con el rol de backend y un token de grupo sintético. Se verifica por separado que `anon` y las sesiones normales no pueden ejecutar ese RPC directamente. No se presenta el `service_role` como prueba de RLS de usuarios normales. El token autoriza colaboración grupal; el ID declarado de un miembro no acredita identidad personal.

## Esquema completo y migraciones

El snapshot original de PR12, commit `ed894431968775dba1d9ba01df99d9a442407865`, se conserva sin cambios en `supabase/baselines/20261009000000_preverification_snapshot.sql` para trazabilidad. SHA256:

`01255724ef94aced4836bf074d9e6abc571aaa640d25d41705433e91123be9f5`

Ese snapshot no era un baseline cronológico: ya incluía objetos que migraciones posteriores vuelven a crear y omitía otros. Se comprobaron los fallos, sin ignorar errores:

- Migraciones sin baseline: `20260401140000_user_integrations_gemini_telegram.sql` falla con `42P01`, porque falta `public.users`.
- Snapshot original seguido por todo el historial: `20260526130000_investment_sales.sql` falla con `42710`, porque la policy `investment_sales_all` ya existe.

`supabase/baselines/pre_20260401_fresh_install.sql` reconstruye el punto de partida para una instalación **vacía**. Conserva las tablas centrales y snapshots de portafolio cuya creación falta en el historial. Omite ventas y gastos compartidos, creados por sus propias migraciones. Conserva columnas posteriores que sus migraciones agregan con `IF NOT EXISTS`. No pretende ser una copia histórica de producción.

El bootstrap nuevo ejecuta ese baseline y **todos** los `.sql` de `supabase/migrations/`, sin modificaciones, en orden de nombre. No omite migraciones ni captura errores de objetos duplicados para continuar. El reporte enumera cada archivo y su SHA256. Las pruebas congelan los archivos al inicio y fallan si cambian durante la corrida.

`supabase/schema.sql` es el espejo generado de esa misma secuencia. No es un upgrade para una base existente. Generación y verificación:

```sh
node scripts/test-isolated-schema-mirror.mjs --write
node scripts/test-isolated-schema-mirror.mjs
```

La suite carga también el espejo en otra base vacía y compara tablas/RLS, policies, funciones, vistas, índices, constraints, columnas/defaults, permisos de tablas/columnas y triggers contra el replay cronológico. No se manipula el historial remoto de Supabase. Un `supabase db reset` que use solamente la carpeta histórica sigue necesitando integrar explícitamente el baseline; el comando de verificación no afirma haber reparado ese historial.

## Reproducción sin servicios externos

```sh
npm ci
node scripts/test-isolated-schema-mirror.mjs
node scripts/test-isolated-database.mjs --output-dir=/tmp/zarix-isolated-evidence
```

El comando devuelve un código distinto de cero si cualquier comprobación falla. Produce:

- `database-verification.json`: resultado individual, motor, hashes de fuentes y evidencia de recuperación.
- `synthetic-database-backup.tar.gz`: datadir físico del PostgreSQL aislado. Contiene únicamente datos sintéticos.

Las extensiones `uuid-ossp` y `pg_trgm` se instalan en `extensions`, como en Supabase, y no se sustituyen con funciones falsas. Esto reveló un error real: el RPC de cuotas usaba `uuid_generate_v4()` con `search_path=public`. La migración nueva usa `pg_catalog.gen_random_uuid()` y la prueba ejecuta las cuotas con el esquema `extensions` real.

## Qué comprueba la suite

- Usuarios A/B: lectura propia, creación/edición/borrado permitido y aislamiento entre usuarios con roles normales.
- Invitado: denegación directa; token correcto, inválido, revocado y de otro grupo mediante el backend.
- Perfiles: lectura segura y modificación de preferencias; denegación de secretos, estado pago e identidad de Telegram.
- Grants explícitos: prueba tanto una instalación sin grants automáticos como el perfil histórico que los otorgaba por defecto.
- RLS en todas las tablas públicas y vistas `security_invoker`.
- Referencias entre tenants: transacciones, cuentas, inversiones, categorías y pagador de grupo.
- Transacciones: saldo ante insert, modificación de tipo y delete; retiro del guard obsoleto que impedía los casos ya soportados por el trigger de octubre.
- `sell_investment_position`: permisos, identidad/posición, venta parcial/total, cantidades excesivas, no finitos y rollback tras fallo inyectado al insertar la venta.
- `save_shared_expense`: límites del token/grupo, reparto exacto de centavos y rollback del importe/reparto anterior tras fallo inyectado.
- `CB-P03`: 4 unidades con costo total 400, venta de 4 a 120, cantidad y costo remanente cero, ganancia realizada 80 y una venta histórica retenida.
- `NUMERIC`: `NaN` y los infinitos no pueden ingresar ni contaminar saldos. Un `CHECK (amount > 0)` por sí solo no rechazaba `NaN`.
- Ajustes y movimiento masivo: orden de locks usuario→cuenta comprobado en las definiciones y ejecución de ajuste. No es una garantía de ausencia de deadlocks bajo toda concurrencia posible.
- Cuotas: 100 en tres cuotas produce 33,33 + 33,33 + 33,34, con saldo correcto y reversión comprobada.

El envío solapado de dos ventas en PGlite comprueba la validación serializada, **no** una carrera real entre conexiones PostgreSQL. La prueba nativa preparada envía escrituras competidoras desde dos procesos `psql` independientes cuando el runtime esté disponible. Tampoco instrumenta la coincidencia exacta de los locks: el envío concurrente por sí solo no prueba que ambas sesiones hayan contendido por la fila.

## Recuperación efectivamente ejecutada

Antes del backup se crean registros representativos en cada tabla de aplicación, incluidos recibos durables de cuentas/transacciones/creación de inversiones/ventas/gastos compartidos, lotes de importación, cuotas de uso y outbox. La prueba falla si alguna tabla queda vacía por falta de fixture.

1. Se validan los constraints nuevos contra los datos sintéticos.
2. Se captura el catálogo completo y un hash por tabla. Los valores `NUMERIC` se comparan como JSON textual de PostgreSQL, evitando pérdidas por números JavaScript.
3. Se genera el datadir comprimido y se registra su SHA256 y tamaño.
4. Se crea una instancia **nueva**, con filesystem de memoria vacío, a partir del archivo. No reutiliza el directorio de la fuente.
5. Se restablece el `search_path` de sesión, que no forma parte de un datadir; así la decompilación de defaults e índices usa el mismo contexto. Se comparan todas las filas y todo el catálogo, incluidos permisos, RLS, funciones, triggers, índices y constraints.
6. Se repiten lecturas con usuario normal, denegación de invitado y permisos de RPC en la base restaurada.
7. Se crea un gasto nuevo en la base restaurada y se demuestra que la fuente no cambió.

Esto demuestra recuperación física del entorno SQL aislado. No demuestra recuperación de un proyecto Supabase alojado, Storage binario, claves externas, facturación del proveedor, correo, Telegram ni integraciones.

## Resultado registrado

Corrida del 9 de octubre de 2026, 04:43:45 UTC: **128/128 comprobaciones aprobadas** en PostgreSQL 18.3 / PGlite 0.5.8. El replay ejecutó 26 migraciones, cero omitidas. El espejo limpio fue equivalente. Se validaron 40 constraints nuevos por perfil de grants.

La restauración comparó 28 tablas con registros: 27 de aplicación y el fixture `auth.users`. Archivo físico: 5.172.480 bytes. SHA256 del archivo: `fdfaa09aa67b51bb53d2055546751fc402b36f103150b4f95be26902768d484a`. SHA256 del catálogo: `c750ee11007c7865ea1c961741001a8f7e3bf74e7884011b8b17b283480fee84`.

El [reporte de esa corrida](isolated-database-verification.json) incluye cada resultado y hashes de todas las fuentes. Es una copia exacta del [reporte del agregado final](../tif/v2.13/evidence/technical-20261009/database-verification.json), cuya verificación registró fuentes estables durante toda la ejecución. Una corrida posterior genera su propio reporte y archivo; timestamps, UUIDs y checksum del backup pueden cambiar. El tiempo observado de restauración del fixture no es un RTO de producción.

## Procedimiento nativo preparado, pendiente de ejecución

Se verificó la disponibilidad de Supabase CLI 2.120.0 y artefactos nativos oficiales: PostgreSQL `17.11.0.004-r1`, Auth `v2.197.0-r0`, PostgREST `v16.4-r0`, Storage `v1.79.36-r0` y Mailpit `v1.31.3-r0`. Los hashes descargados fueron verificados, pero el stack no pudo abrir sockets en este executor.

En un executor que permita procesos y sockets locales, desde **otro directorio vacío**:

```sh
supabase init
SUPABASE_EXPERIMENTAL_STACK=1 supabase start --stack verified --runtime native --exclude realtime,functions,studio,analytics,pooler --eager
```

También puede usarse un stack Supabase local estándar permitido por ese executor. Debe tener el esquema `public` vacío, cero usuarios Auth y confirmación de correo local deshabilitada. El harness comprueba el estado vacío y rechaza URLs que no sean `localhost`, `127.0.0.1` o `::1`. Fija `localhost` a `127.0.0.1`, descarta opciones heredadas de libpq (incluidos `PGHOSTADDR` y `PGSERVICE`), rechaza parámetros de conexión ambiguos y bloquea redirecciones HTTP para evitar que las claves del stack salgan del destino local. Estas guardas tienen pruebas unitarias sin red; no reemplazan ejecutar el stack.

Proveer por variables de entorno, exclusivamente con los valores del stack local:

- `ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only`
- `ZARIX_LOCAL_SUPABASE_URL`
- `ZARIX_LOCAL_DATABASE_URL`
- `ZARIX_LOCAL_ANON_KEY`
- `ZARIX_LOCAL_SERVICE_ROLE_KEY`
- `ZARIX_PG_BIN`: carpeta que contiene `psql`, `pg_dump` y `pg_restore`, o dejarlas disponibles en `PATH`
- `ZARIX_EVIDENCE_DIR`: directorio de resultados local opcional

No copiar credenciales reales ni pegarlas en un chat. El script genera contraseñas sintéticas efímeras para los registros Auth y nunca las imprime. Ejecutar desde el checkout:

```sh
node scripts/test-isolated-native-supabase.mjs
```

El harness aplica el bootstrap, registra e inicia sesión con dos usuarios reales, verifica sus JWT mediante Auth, comprueba PostgREST, prueba guest/RPC y lanza solicitudes solapadas desde sesiones independientes. Luego usa `pg_dump` nativo, crea una base nueva con `TEMPLATE template0`, verifica que está vacía y ejecuta `pg_restore`. Compara filas y vuelve a probar permisos. También rechaza cambios en las fuentes SQL durante la corrida. La restauración usa los roles del mismo cluster aislado; no afirma portar roles a otro cluster. El archivo y el reporte se guardan con permisos restrictivos y se conserva la base de destino para inspección.

La aplicación web y sus cookies/rutas completas requieren además una ejecución del servidor Next.js configurado contra ese mismo stack y la correspondiente prueba de navegador. El harness SQL/API no sustituye esa parte.

## Despliegue y datos preexistentes

La migración `20261009034950_explicit_grants_and_tenant_integrity.sql` usa `NOT VALID` para los nuevos checks finitos y FKs compuestos: protege los writes nuevos sin reescribir datos anteriores. La prueba aislada los valida todos; eso no certifica una base real que no fue inspeccionada.

Antes de aprobar un despliegue real:

1. Tomar un backup apropiado y verificar su restauración en un destino separado autorizado.
2. Auditar referencias cruzadas y valores no finitos preexistentes; resolver cualquier hallazgo mediante un plan explícito.
3. Validar los constraints y medir bloqueo/duración con el volumen real.
4. Aplicar solamente migraciones pendientes, nunca el baseline ni el espejo completo.
5. Ejecutar de nuevo pruebas de Auth, PostgREST y navegador con usuarios de prueba autorizados.

Los backups de base de datos Supabase no incluyen el contenido binario de Storage; sus metadatos no reemplazan una copia de los objetos. Los dumps no sustituyen inventario de configuración externa ni un plan de recuperación del proveedor.

## Fuentes verificadas

- [Supabase: RLS y grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: cambio de exposición automática de tablas](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Supabase: backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase: backup y restore con CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [PGlite: dumpDataDir/loadDataDir](https://pglite.dev/docs/api)
- [PostgreSQL: variables de conexión libpq](https://www.postgresql.org/docs/current/libpq-envars.html)
