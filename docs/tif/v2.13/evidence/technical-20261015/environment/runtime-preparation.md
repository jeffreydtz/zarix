# ZARIX: nuevo runtime aislado — 2026-10-15

El acceso escalado al host verificó `/tmp -> /private/tmp`; `/tmp/zarix-runtime` y `/private/tmp/zarix-runtime` no existían y `glob('/private/tmp/zarix-runtime*')` no devolvió entradas. Se creó **una ruta nueva** `/tmp/zarix-runtime-20261015` (0700), sin borrar ni resetear ningún dato previo.

CLI oficial2.120.0, SHA256tar.gz `3b8546cc61aeabab6fd1f68edc7f664ebdfa96bdd6a9b18d8d612708f430ae28`, verificado contra checksums de la release oficial. Runtime nativo arm64; PostgreSQL17.11.0.004-r1 (servidor y herramientas17.11), Auth2.197.0, PostgREST16.4, Storage1.79.36. No softwareglobal, licencias, producción/conector remoto, recursos pagados ni acceso externo persistente.

## Instancias nuevas

| Instancia | API loopback HTTP | PostgreSQL loopback | Env privado0600 | Prefijo variables |
| --- | --- | --- | --- | --- |
| source | http://127.0.0.1:54321 | 54322 | source.env | ZARIX_LOCAL_ |
| restore | http://127.0.0.1:55321 | 55322 | restore.env | ZARIX_RESTORE_ |
| load | http://127.0.0.1:56321 | 56322 | load.env | ZARIX_LOAD_ |
| e2e | http://127.0.0.1:57321 | 57322 | e2e.env | ZARIX_E2E_ |

Archivos bajo `/tmp/zarix-runtime-20261015`. Cada env contiene `SUPABASE_URL`, `DATABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` con su prefijo, además de `ZARIX_PG_BIN`, `SUPABASE_HOME`, `SUPABASE_EXPERIMENTAL_STACK=1`, `SUPABASE_NO_UPDATE_NOTIFIER=1`. `runtime.env` los combina. Los archivos de status/inicio y env contienen **credenciales locales**: no imprimirlos ni versionarlos. `runtime-manifest.json` y `*-prepared-manifest.json` son saneados y no contienen valores secretos.

`psql`, `pg_dump`, `pg_restore`17.11: `/tmp/zarix-runtime-20261015/home/cache/stack/slim-services/postgres/17.11.0.004-r1/darwin-arm64/bin`.

## Configuración y comandos reproducibles

```sh
curl -fsSL https://github.com/supabase/cli/releases/download/v2.120.0/supabase_darwin_arm64.tar.gz -o /tmp/zarix-runtime-20261015/downloads/supabase_darwin_arm64.tar.gz
curl -fsSL https://github.com/supabase/cli/releases/download/v2.120.0/checksums.txt -o /tmp/zarix-runtime-20261015/downloads/checksums.txt
shasum -a256 /tmp/zarix-runtime-20261015/downloads/supabase_darwin_arm64.tar.gz
rg darwin_arm64 /tmp/zarix-runtime-20261015/downloads/checksums.txt
```

No ejecutar el tar.gz si su digest no coincide con la entrada oficial `supabase_2.120.0_darwin_arm64.tar.gz`. Se verificó antes de extraer.

```sh
export SUPABASE_HOME=/tmp/zarix-runtime-20261015/home
export SUPABASE_EXPERIMENTAL_STACK=1
export SUPABASE_NO_UPDATE_NOTIFIER=1
/tmp/zarix-runtime-20261015/bin/supabase stack start --help
/tmp/zarix-runtime-20261015/bin/supabase init --workdir /tmp/zarix-runtime-20261015/source
```

`init` también ejecutado por separado para restore/load/e2e. En config de cada proyecto se fijaron los puertos de su fila; `[db.seed] enabled=false`, `auth.email.enable_confirmations=false`, `auth.enable_signup=true`, `api.max_rows=1000`. Sin migraciones de aplicación. El selector experimental se guardó en cada config; todo el estado/cache bajo `SUPABASE_HOME` nuevo, sin tocar `~/.supabase`.

Inicio por proyecto (cambiar source por restore/load/e2e para las restantes; se ejecutaron acciones aprobadas específicas para red y sockets locales):

```sh
umask 077
/tmp/zarix-runtime-20261015/bin/supabase stack start --runtime native --exclude studio,realtime,functions,analytics,pooler,mail --eager --workdir /tmp/zarix-runtime-20261015/source --output-format json > /tmp/zarix-runtime-20261015/source-start.json 2> /tmp/zarix-runtime-20261015/source-start.stderr
```

El runtime nativo liga listeners a loopback. Database/Auth/REST/Storage eager; Studio/Realtime/Functions/Analytics/Pooler/Mail excluidos. No SMTP/OAuth externos ni providers activos en estos proyectos.

## Baseline verificado, antes de fixtures

En **cada una de las cuatro** se ejecutó:

```sql
SELECT current_setting('server_version'),
       (SELECT count(*) FROM auth.users),
       (SELECT count(*) FROM storage.objects),
       (SELECT count(*) FROM pg_tables WHERE schemaname='public');
```

Resultado `17.11|0|0|0` en todas. GETAuth `/auth/v1/health` y REST `/rest/v1/` con anonlocal retornaron HTTP200 en todas. Esto demuestra exclusivamente readiness y vacío de datos; los esquemas plataforma sí existen. No prueba casos de aceptación ZARIX, normalAuth/RLS/RPC, cargas, restauración ni UI. Los19+3 resultados anteriores son históricos: **no se declararon actuales al recrear vacío**. Los harnesses deben volver a aplicar migraciones y crear dos usuarios+invitado nuevos según su alcance.

## Conservación

No `destroy` ni `db reset` ejecutados en esta preparación. Cuatro owners/servicios quedan corriendo para el trabajo pendiente. Root controla su `caffeinate` por separado; este preparador no lo creó. No detener o resetear una instancia mientras los harnesses la usan. EndpointHTTPloopback no demuestra HTTPS, cifrado en reposo ni disponibilidadmensual.
