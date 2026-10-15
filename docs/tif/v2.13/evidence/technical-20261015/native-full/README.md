# Nueva corrida nativa y recuperación integral — 15/10/2026

**22/22 grupos PASS en una corrida completa nueva**, revisión `1872f2209aca4c3d9506394c07d4e6ec5cd6f18a`, Node 22.17.0/macOS arm64 y PostgreSQL nativo 17.11. [Informe ejecutado](native-verification.json), [preflight vacío](preflight.json) y [manifiesto exacto](manifest.json).

SOURCE `127.0.0.1:54321/54322` y RESTORE `127.0.0.1:55321/55322` tenían inicialmente cero tablas públicas, usuarios Auth, buckets y objetos Storage. El ensayo reprodujo baseline + **27 migraciones**, incluida la versión final `7f0a8bc2e23c3dfd43af5f01b9132b9daa44d48b6a38f5fe02524b837d0f4bce` de conciliación atómica y precisión. El hash del harness fue `877b2b7a29c16752bd726f3d75303a49c5175fef7c4d66e5d0a50ea84c8de71f`. El último grupo confirmó que SQL y harness permanecieron iguales durante la ejecución. No se tocaron E2E, LOAD, producción ni instancias anteriores.

Se crearon exactamente dos usuarios normales y un invitado por capacidad para esta fase SOURCE. Signup, login y `getUser` utilizaron Auth real; esos mismos IDs pudieron iniciar sesión después de restaurarse en RESTORE. Las credenciales sintéticas/capacidad se conservan sólo en `/tmp/zarix-runtime-20261015/source-native-logins.json`, 0600, fuera de Git. Los roles `anon`/`authenticated` no tienen superusuario ni bypass de RLS. `supabase_admin` se utilizó únicamente para bootstrap, catálogo, dump/restore y administración de los destinos locales descartables.

## Cobertura observada

| Alcance | Resultado de la corrida |
| --- | --- |
| Auth y sesiones | Dos registros/logins normales; JWT con firma manipulada y token malformado rechazados con HTTP 401. Sign-out global revocó refresh; se registró la respuesta del JWT anterior y su vencimiento. Un JWT de acceso stateless puede seguir válido hasta expirar: no se declara revocación inmediata de acceso. |
| RLS, grants e IDs manipulados | Lectura/CRUD entre A/B aislados; perfil normal sin acceso a columnas secretas ni modificación de estado pago; tablas con RLS y vistas invoker; RPC de servicio denegadas para anon/A/B; tenant/payer/split ajenos sin cambio financiero. |
| Movimientos y transferencias | Triggers reales al insertar/editar/eliminar, cuenta ajena rechazada, NaN rechazado sin contaminar saldo, importes autoritativos de destino distintos conservados al editar/borrar. |
| Invitado y gastos compartidos | Invitado limitado a su grupo, centavos distribuidos; capacidades inválidas/rotadas/inactivas rechazadas incluso al intentar replay durable. Falla inyectada de split conserva importe y distribución anterior. |
| Inversiones | Falla tras decremento revierte cantidad; dos conexiones independientes, con bloqueo observado antes del primer commit, dejan una venta válida y otra rechazada por cantidad insuficiente. |
| Idempotencia durable | Dos conexiones independientes al mismo recibo esperan el bloqueo y devuelven la misma respuesta con un solo efecto financiero. El recibo restaurado puede reproducirse en el segundo stack conservando saldo y cantidad de movimientos. |
| Outbox | La fila pendiente sobrevive la restauración y puede reclamarse una vez, con contador de intento actualizado. Esto prueba persistencia/claim; no demuestra entrega real a Telegram ni una integración de proveedor. |
| Respaldo y recuperación | Datos, esquema, Auth, Storage, permisos, saldos y funcionamiento comprobados como se detalla debajo. |

La RPC nueva de conciliación se incluye en la igualdad completa del catálogo restaurado. Sus invocaciones, precisión y carrera específica se prueban en el [ensayo focal separado de 7 grupos](../account-recompute/README.md); este harness completo no la invoca contra los fixtures de saldo inicial directo. Los 18 grupos SQL focales y esos 7 nativos se solapan en alcance con esta verificación y no se suman como casos únicos adicionales.

## Respaldo/restauración comprobados

El archivo `pg_dump --format=custom` tiene **560313 bytes**, SHA256 `d4e45b59b72841890ee7a738ed09f05a3372567ac6bddc982fbef20e76f290b0`. El catálogo completo tiene SHA256 `9f886bb7c11773022b4beddd7b8234132aa5c3f24abdbbc5a562c8d365ec6463`.

Primero se creó una base separada con `TEMPLATE template0` en el cluster sintético SOURCE, sin tablas de aplicación/plataforma antes de restaurar. Después se restauró también RESTORE, una plataforma Supabase inicializada vacía. Ambas reprodujeron los conteos y hashes de **64 tablas: 27 públicas, 27 Auth y 10 Storage**. Todas las tablas de aplicación tenían filas sintéticas representativas. Se compararon propietarios, grants completos, privilegios predeterminados, RLS, políticas, columnas, constraints, índices, vistas, triggers y definiciones de funciones. Antes del replay en la plataforma RESTORE se retiraron únicamente sus defaults para evitar privilegios adicionales heredados; el archivo repuso los defaults de SOURCE y se comprobó igualdad posterior.

Los roles de plataforma ya provisionados fueron comparados entre instancias; sus contraseñas no se copian a evidencia. Auth/passwords/identidades/sesiones están en el respaldo privado, y los dos usuarios pudieron hacer login/getUser reales en RESTORE. Las operaciones posteriores en RESTORE no alteraron los datos públicos ni Storage de SOURCE.

Storage requirió cobertura separada de bytes: el dump preservó metadatos/políticas, y el objeto privado de **34 bytes**, SHA256 `dc9d3fda345877c072f06e2a8ab51ca11fc3d859fa14665ecef840206d1528b2`, se respaldó aparte y subió al segundo stack. La descarga del propietario dio el mismo hash; B y anon fueron rechazados. El bucket/objeto son fixtures de recuperación, pues ZARIX no define actualmente buckets de aplicación.

Tras la restauración, los saldos visibles por sesión normal coincidieron; se comprobaron seis denegaciones de RPC backend, secretos inaccesibles, replay durable de una operación sin efecto duplicado, outbox pendiente y una nueva distribución de gasto compartido. La fuente y el destino se conservaron con 27 tablas públicas, dos usuarios Auth, un objeto Storage y cero esperas de bloqueo al finalizar. No hubo resets, reintentos automáticos de escrituras financieras ni borrado de datos previos: ambas plataformas empezaron vacías y las ediciones/borrados del ensayo afectaron sólo sus fixtures.

El dump, objeto binario, bootstrap y diagnósticos viven en `/tmp/zarix-runtime-20261015/full-native-evidence`, 0700 con archivos privados 0600. **No se versionaron esos archivos**. El informe público contiene conteos/hashes, resultados y contextos saneados, sin contraseñas, JWT, valores de capacidades, filas secretas ni errores crudos.

## Reproducción

Usar dos stacks locales nuevos y vacíos del runtime oficial, con confirmación de email desactivada. El preflight debe confirmar SOURCE/RESTORE `public=0`, `auth.users=0`, `storage.buckets=0`, `storage.objects=0`; cualquier dato inesperado obliga a conservar el entorno y detener el bootstrap. Los archivos de variables contienen exclusivamente estas instancias locales y no deben imprimirse.

```sh
set -a
source /tmp/zarix-runtime-20261015/runtime.env
set +a
export ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only
export ZARIX_EVIDENCE_DIR=/tmp/zarix-runtime-20261015/full-native-new-run
export ZARIX_TEST_LOGIN_FILE=/tmp/zarix-runtime-20261015/source-native-new-logins.json
node --input-type=module -e 'import{spawnSync}from"node:child_process";for(const name of["ZARIX_LOCAL_DATABASE_URL","ZARIX_RESTORE_DATABASE_URL"]){const url=new URL(process.env[name]);url.username="supabase_admin";process.env[name]=url.href;}const r=spawnSync(process.execPath,["scripts/test-isolated-native-supabase.mjs"],{env:process.env,stdio:"inherit"});process.exit(r.status??1);'
```

No reutilizar el directorio de evidencia ni la fuente poblada para una corrida completa: los nombres internos del dump/reporte son fijos. Si una futura corrida necesita continuación, `--recovery-only` exige su checkpoint exacto, mismo manifiesto SQL, mismas credenciales privadas/IDs/capacidad y SHA del objeto, y destino nuevamente vacío. Este ensayo no necesitó continuación; los 22 PASS pertenecen a una única ejecución nueva.

Los **19 + 3 grupos del 13/14 de octubre permanecen históricos** y no se importan a este resultado. Los recorridos UI, carga, proveedores y aceptación global tienen informes separados. CNF-02 sigue **BLOCKED** hasta observar realmente el período mensual; una restauración correcta y pruebas breves no acreditan esa disponibilidad.
