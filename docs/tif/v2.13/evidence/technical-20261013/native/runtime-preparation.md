# ZARIX: runtime local aislado — 2026-10-13

CLI oficial 2.120.0, archivo SHA256 `3b8546cc61aeabab6fd1f68edc7f664ebdfa96bdd6a9b18d8d612708f430ae28`, verificado contra `checksums.txt` de la release oficial. No se instaló software global, ni se aceptaron licencias, ni se usó `~/.supabase`, producción o conector remoto.

Todo el runtime, cache, proyectos descartables y credenciales locales está en `/tmp/zarix-runtime` (directorio 0700). El manifiesto saneado es `runtime-manifest.json`. `source-start.json`, `restore-start.json` y `runtime.env` contienen credenciales locales y son 0600: **no copiarlos a evidencia versionada ni imprimir su contenido**.

## Endpoints y herramientas

- Fuente: API `http://127.0.0.1:54321`, PostgreSQL TCP `127.0.0.1:54322`.
- Destino de restauración: API `http://127.0.0.1:55321`, PostgreSQL TCP `127.0.0.1:55322`.
- `psql`, `pg_dump`, `pg_restore`: `/tmp/zarix-runtime/home/cache/stack/slim-services/postgres/17.11.0.004-r1/darwin-arm64/bin` (17.11).
- Auth v2.197.0; PostgREST v16.4; Storage v1.79.36. El CLI inicia un owner separado y los servicios sobreviven al comando que los creó.
- Native listeners ligados a loopback según documentación del runtime. Servicios excluidos: Studio, Realtime, Functions, Analytics, Pooler y Mail. Database/Auth/REST/Storage eager sin idle shutdown.
- `auth.email.enable_confirmations=false`; signup habilitado. Sin OAuth/SMTP externo configurado. Seeds del CLI deshabilitadas: las migraciones y datos sintéticos son responsabilidad del harness.

## Comandos de preparación ejecutados

```sh
mkdir -p /tmp/zarix-runtime/bin /tmp/zarix-runtime/downloads /tmp/zarix-runtime/home /tmp/zarix-runtime/source /tmp/zarix-runtime/restore
chmod 700 /tmp/zarix-runtime
curl -fL https://github.com/supabase/cli/releases/download/v2.120.0/supabase_darwin_arm64.tar.gz -o /tmp/zarix-runtime/downloads/supabase_darwin_arm64.tar.gz
curl -fL https://github.com/supabase/cli/releases/download/v2.120.0/checksums.txt -o /tmp/zarix-runtime/downloads/checksums.txt
shasum -a 256 /tmp/zarix-runtime/downloads/supabase_darwin_arm64.tar.gz
rg darwin_arm64 /tmp/zarix-runtime/downloads/checksums.txt
tar -xzf /tmp/zarix-runtime/downloads/supabase_darwin_arm64.tar.gz -C /tmp/zarix-runtime/bin
export SUPABASE_HOME=/tmp/zarix-runtime/home
export SUPABASE_EXPERIMENTAL_STACK=1
export SUPABASE_NO_UPDATE_NOTIFIER=1
/tmp/zarix-runtime/bin/supabase stack start --help
/tmp/zarix-runtime/bin/supabase init --workdir /tmp/zarix-runtime/source
/tmp/zarix-runtime/bin/supabase init --workdir /tmp/zarix-runtime/restore
```

Configs generadas: fuente `[api] port=54321`, `[db] port=54322`; destino 55321/55322. En ambos `[db.seed] enabled=false`. Cada proyecto tiene `experimental.stack=true`. El runtime es experimental y estos flags corresponden exactamente a 2.120.0.

Inicio (se ejecutó con permisos para red de descargas oficiales y sockets locales; el sandbox inicial devolvía error de listener, resuelto al escalar la operación autorizada):

```sh
umask 077
/tmp/zarix-runtime/bin/supabase stack start --runtime native --exclude studio,realtime,functions,analytics,pooler,mail --eager --workdir /tmp/zarix-runtime/source --output-format json > /tmp/zarix-runtime/source-start.json 2> /tmp/zarix-runtime/source-start.stderr
/tmp/zarix-runtime/bin/supabase stack start --runtime native --exclude studio,realtime,functions,analytics,pooler,mail --eager --workdir /tmp/zarix-runtime/restore --output-format json > /tmp/zarix-runtime/restore-start.json 2> /tmp/zarix-runtime/restore-start.stderr
```

## Variables privadas del harness

`runtime.env` contiene `ZARIX_LOCAL_SUPABASE_URL`, `ZARIX_LOCAL_DATABASE_URL`, `ZARIX_LOCAL_ANON_KEY`, `ZARIX_LOCAL_SERVICE_ROLE_KEY`; equivalentes `ZARIX_RESTORE_*`; `ZARIX_PG_BIN`; y selector/home del CLI. Leerlo sin volcar valores a logs. `source.env` contiene sólo la fuente.

## Verificación de preparación

Antes de modificar las instancias se ejecutó en ambas:

```sql
SELECT current_setting('server_version'),
       (SELECT count(*) FROM auth.users),
       (SELECT count(*) FROM storage.objects),
       (SELECT count(*) FROM pg_tables WHERE schemaname='public');
```

Resultado: `17.11|0|0|0`; GET Auth `/auth/v1/health` y REST `/rest/v1/` con anon local retornaron HTTP 200. Estos resultados prueban inicio y vacío de datos, no pruebas funcionales de ZARIX. Los esquemas plataforma existen; el destino no es una base sin ninguna tabla, sino una instancia plataforma sin datos ni aplicación.

`postgres` tiene `rolsuper=false, rolbypassrls=true`; `supabase_admin` tiene `rolsuper=true, rolbypassrls=true` y trust administrativo local del runtime. Restore de esquemas/ownership plataforma puede requerir usar ese rol local para el mismo puerto/DB; las sesiones funcionales deben usar Auth normal.

## Ciclo de vida

Mantener corriendo para los harnesses. Restart preserva datos/identidad/config guardada:

```sh
/tmp/zarix-runtime/bin/supabase stack restart --workdir /tmp/zarix-runtime/source --output-format json > /tmp/zarix-runtime/source-restart.json
/tmp/zarix-runtime/bin/supabase stack restart --workdir /tmp/zarix-runtime/restore --output-format json > /tmp/zarix-runtime/restore-restart.json
```

Stop no borra datos:

```sh
/tmp/zarix-runtime/bin/supabase stack stop --workdir /tmp/zarix-runtime/source
/tmp/zarix-runtime/bin/supabase stack stop --workdir /tmp/zarix-runtime/restore
```

No se ejecutó destroy. Los endpoints son HTTP local; esta preparación no demuestra HTTPS, cifrado en reposo ni disponibilidad mensual.

## Reset descartable para segunda corrida

Tras preservar el primer reporte del harness en `/tmp/zarix-runtime/native-evidence/native-verification-attempt-1.json`, se pidió una segunda corrida completa desde vacío. Sólo se resetearon los dos proyectos descartables `/tmp/zarix-runtime/source` y `/tmp/zarix-runtime/restore`:

```sh
/tmp/zarix-runtime/bin/supabase db reset --local --no-seed --yes --workdir /tmp/zarix-runtime/source --output-format json > /tmp/zarix-runtime/source-reset-2.json
/tmp/zarix-runtime/bin/supabase db reset --local --no-seed --yes --workdir /tmp/zarix-runtime/restore --output-format json > /tmp/zarix-runtime/restore-reset-2.json
```

Las migraciones de estos proyectos /tmp estaban vacías; las del repositorio no se modificaron. Ambos regresaron al baseline `17.11|0|0|0` y Auth/REST HTTP200. Se renovaron `runtime.env` y `source.env` 0600 a partir de status privado; conservaron puertos e identidad. No se borró el reporte previo, ni datos originales/remotos. No volver a resetear mientras los harnesses estén corriendo.

## Tercera corrida

Se repitió reset local descartable source/restore para intento3 tras reconectar la Mac y ajustar el harness con `Connection: close`. Se conservaron ambos informes previos. Baseline de ambos nuevamente `17.11|0|0|0`, Auth/REST HTTP200; runtime.env/source.env renovados0600 y mismos puertos. Resultados privados de reset/status guardados con sufijo `-3.json`.

## Instancia de carga CNF-01

Proyecto aislado adicional `/tmp/zarix-runtime/load`, API loopback `http://127.0.0.1:56321`, PostgreSQL56322. Mismo CLI/native runtime/cache y servicios excluidos, eager, signup sin confirmación, seed deshabilitada. Inicio sólo este proyecto, sin tocar source/restore:

```sh
/tmp/zarix-runtime/bin/supabase init --workdir /tmp/zarix-runtime/load
/tmp/zarix-runtime/bin/supabase stack start --runtime native --exclude studio,realtime,functions,analytics,pooler,mail --eager --workdir /tmp/zarix-runtime/load --output-format json > /tmp/zarix-runtime/load-start.json
```

Archivo privado0600 `/tmp/zarix-runtime/load.env` con `ZARIX_LOAD_SUPABASE_URL`, `ZARIX_LOAD_DATABASE_URL`, `ZARIX_LOAD_ANON_KEY`, `ZARIX_LOAD_SERVICE_ROLE_KEY`, `ZARIX_PG_BIN` y selector/home del CLI. Baseline antes de sembrar: `17.11|0|0|0`, Auth/REST HTTP200. El agente de carga/root aplicará migraciones y fixtures; esta preparación no ejecutó carga ni creó usuarios.

## Recuperación retomada el 2026-10-14

El pedido de reset4 completo del día anterior no llegó a crear proceso por desconexión del ejecutor; fuente conservada. Tras reconexión, se ejecutó reset exclusivamente `/tmp/zarix-runtime/restore`, con las mismas opciones locales `db reset --local --no-seed --yes`. Baseline destino `17.11|0|0|0` y Auth/REST HTTP200. Se renovaron sólo entradas `ZARIX_RESTORE_*` de runtime.env0600; source.env y load.env conservados. No se hicieron operaciones contra fuente ni carga. La corrida de recuperación continuará verificando ACL y default privileges sin resetear los resultados funcionales de fuente.
