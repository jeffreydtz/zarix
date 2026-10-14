# Verificación nativa y recuperación aislada

El 13/10 se ejecutaron 19 grupos de comprobaciones nativas con PostgreSQL 17.11, GoTrue, PostgREST y Storage reales. El 14/10 se completaron tres grupos de recuperación desde ese checkpoint, sin resetear la fuente ni crear otros usuarios. Son dos fases: **no** una corrida única de 22 grupos sobre el archivo final. Los 19 resultados anteriores conservan su revisión/hash originales; no se suman intentos repetidos como casos nuevos ni equivalen a los cuatro CU de navegador.

## Resultado ejecutado

- Dos registros/sign-ins normales, JWT con firma manipulada/malformado rechazados, roles sin superuser/BYPASSRLS, RLS y grants de perfiles/cuentas, aislamiento entre usuarios y denegación de las RPC backend-only.
- Transferencia con importes distintos y crédito destino autoritativo, edición y borrado que restauran ambos saldos; NaN rechazado sin contaminar el saldo.
- Invitado limitado por capability de grupo: IDs de otro grupo, token inválido, rotado e inactivo y replay con capability revocada. El ID de miembro sigue siendo una identidad declarada dentro del enlace.
- Rollback real tras fallas inyectadas en reparto compartido e inserción de venta. Dos procesos PostgreSQL independientes: espera de locks observada mediante `pg_stat_activity`/`pg_blocking_pids`, una venta comprometida y otra rechazada; dos reintentos devuelven el mismo recibo con un solo efecto financiero.
- Sign-out global revocó refresh. El JWT de acceso anterior todavía obtuvo HTTP 200 antes de expirar; no se garantiza revocación inmediata del acceso stateless.
- Recuperación comparó filas de **64 tablas**: 27 públicas, 27 Auth y 10 Storage, incluidas tablas plataforma vacías. Todas las tablas de aplicación tienen fixtures. No se prueban flujos MFA/OAuth por preservar sus tablas vacías.
- Dump nativo a una DB `TEMPLATE template0` comprobada vacía; luego a otro stack separado, inicialmente sin tablas públicas, usuarios ni objetos. Se compararon funciones, índices, constraints, columnas/defaults, triggers, policies, RLS, ownership, grants y privilegios por defecto.
- Login de ambos usuarios normales en el destino, aislamiento y seis denegaciones de las RPC de venta/gasto compartido para anon/A/B. Saldo y recibo financiero conservados tras replay; outbox pendiente conservado y reclamado en el destino. Un nuevo gasto compartido funciona allí; la fuente pública y Storage no cambian.
- Un objeto Storage privado sintético de 34 bytes se respaldó por separado del dump, se volvió a cargar en el destino y se leyó como su propietario. Otro usuario y anon no pudieron leerlo. SHA256: `ead5d8e8862d854bdf4e800659414b918efcafb7f698e9b9a7a27499edf779b9`. ZARIX actualmente no declara buckets de aplicación; es un fixture de recuperación de la plataforma.

El archivo custom de la fase final pesa 558.079 bytes; SHA256 `ef7352222fc70cd12caebfb6683514e54db6b7032ef1def46adafe90efbafd25`. El dump, binario y credenciales sintéticas están sólo en `/tmp` con permisos privados, **no** en Git. Los roles plataforma están preprovisionados en ambos clusters y se comparan; esto no acredita recreación de un proveedor alojado, SMTP/OAuth/configuración externa, cifrado en reposo, HTTPS, SLA mensual ni un RTO de producción.

## Fallas conservadas y resolución

[Intentos 1](native-verification-attempt-1.json) y [2](native-verification-attempt-2.json): 13 grupos PASS; `ECONNRESET` durante la verificación de rollback de venta. El harness ahora usa `Connection: close` para evitar conexiones idle del gateway nativo experimental; no reintenta automáticamente escrituras financieras.

[Intento 3](native-verification-attempt-3.json): 19 grupos PASS y datos restaurados iguales; la comparación inicial de catálogo rechazó el orden diferente de las ACL. El comparador final ordena los mismos elementos completos, preservando grantee/grantor/privilegios/grant options.

[Primera continuación](native-recovery-attempt-1.json): restore a DB literalmente vacía PASS; segundo stack FAIL por grants adicionales heredados de sus `ALTER DEFAULT PRIVILEGES`. No se toleró la ampliación. El procedimiento final retira defaults sólo en el destino descartable antes de recrear objetos, reproduce el archivo y compara después todos los ACL/defaults y owners. La [continuación final](native-recovery-verification.json), revisión `316b393577fe15ffac81cf5595459a191337aeaf` con cambios identificados por `harnessSha256`, obtuvo **3/3 PASS**. El destino funcional terminó con los mismos permisos de la fuente.

Los informes versionados omiten diagnósticos crudos y registran el SHA256 del informe privado original. El hash de checkpoint de la continuación referencia el original del intento 3. El saneamiento posterior del harness mantiene sólo tipo/código/contexto en JSON y conserva raw únicamente en un directorio temporal privado; recibió 15/15 pruebas de guardas y typecheck. Es una modificación de diagnóstico posterior a la fase nativa final, no una repetición atribuida de esa fase. `final-source-manifest.json` identifica los archivos finales.

## Comandos de reproducción

Preparación exacta del runtime oficial, checksum y aislamiento: [runtime-preparation.md](runtime-preparation.md), [runtime-manifest.json](runtime-manifest.json). El CLI y sus servicios viven en `/tmp/zarix-runtime`, sin instalación global. Las variables de `runtime.env` contienen exclusivamente valores de los stacks locales y no deben imprimirse.

```sh
set -a
source /tmp/zarix-runtime/runtime.env
set +a
export ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only
export ZARIX_EVIDENCE_DIR=/tmp/zarix-runtime/native-evidence
export ZARIX_TEST_LOGIN_FILE=/tmp/zarix-runtime/test-logins.json
```

La corrida original completa requiere fuente vacía. La continuación efectiva usó la fuente conservada y un destino nuevamente vacío:

```sh
export ZARIX_NATIVE_CHECKPOINT_FILE=/tmp/zarix-runtime/native-evidence/native-verification-attempt-3.json
node --input-type=module -e 'import {spawnSync} from "node:child_process"; for (const name of ["ZARIX_LOCAL_DATABASE_URL","ZARIX_RESTORE_DATABASE_URL"]) { const url=new URL(process.env[name]); url.username="supabase_admin"; process.env[name]=url.href; } const result=spawnSync(process.execPath,["scripts/test-isolated-native-supabase.mjs","--recovery-only"],{env:process.env,stdio:"inherit"}); process.exit(result.status??1);'
```

El rol administrativo es sólo el bootstrap local del runtime. Las verificaciones funcionales usan JWT normales. Para una corrida completa nueva, omitir `--recovery-only` y usar stacks descartables vacíos. El script rechaza destinos remotos, destinos fuente/restauración iguales y bootstrap sobre datos existentes. La continuación exige credenciales privadas de los mismos dos IDs, sólo emails sintéticos, fixture binario con el SHA anterior y el mismo manifiesto SQL; no hereda los 19 resultados como ejecutados de nuevo.

## Tipos sincronizados

El CLI oficial generó `types/supabase-generated.ts` desde las 27 tablas y 29 funciones públicas. Incluye los campos `movement_enabled`, `destination_amount_in_account_currency` y las RPC críticas. `types/database.ts` reexporta el contrato `Database` generado y conserva los modelos de presentación existentes; éstos no se presentan como catálogo exhaustivo.

Generación y comparación ejecutadas:

```sh
export ZARIX_SUPABASE_CLI=/tmp/zarix-runtime/bin/supabase
node --input-type=module -e 'import{spawnSync}from"node:child_process";const url=new URL(process.env.ZARIX_LOCAL_DATABASE_URL);url.username="supabase_admin";process.env.ZARIX_LOCAL_DATABASE_URL=url.href;const r=spawnSync(process.execPath,["scripts/generate-isolated-database-types.mjs","--write"],{env:process.env,stdio:"inherit"});process.exit(r.status??1);'
# Repetir el comando sin --write para comparar, sin modificar el archivo.
npm run typecheck
npm test -- __tests__/isolated-native-target.test.ts
```

Resultado: generación/comparación PASS, typecheck PASS, 15/15 guardas PASS. SHA256 del tipo generado: `7afaa2cb212f9b38b9e7112bb6d4df05f3118cb717907ecf4d7fd40218874ba1`. La generación sólo introspecciona schema, nunca datos ni valores de secretos.

[Presencia de proveedores](provider-presence.json): `gemini_api_key_present=false`, `telegram_bot_token_present=false` en los perfiles sintéticos. Se consultaron solamente booleanos. Las comprobaciones de outbox no representan entrega real a Telegram ni consumo real de Gemini.
