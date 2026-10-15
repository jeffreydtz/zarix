# Réplica vacía HTTP aislada

Preparación y readiness reales, sin aceptar automáticamente contratos CSV. El [informe saneado](executed/readiness.json) registra una DB UUID nueva dentro del cluster RESTORE local55322, creada con template0 y esquema/ACL existentes. Se clonaron exactamente dos usuarios/identidades y perfiles sintéticos, sin sesiones iniciales, roles nuevos ni claves nuevas. Los servicios originales no se reconfiguraron.

Los binarios oficiales cacheados GoTrue2.197.0 y PostgREST16.4 escuchan sólo en127.0.0.1:60327/60323. El gateway60321 sólo reenvía Auth/REST a esos upstreams; Storage y otras rutas404. El SMTP60325 es un doble local de transporte sin reenvío externo y restringido a los dos destinatarios sintéticos. Los mensajes/token/config permanecen0600 fuera de Git. El proveedor57914 es un doble controlado503→1200; sus healthchecks no generan recibos de proveedor.

La copia Next3004 usa Git84df929/core-closure,483 fuentes exactas y buildYi9bH3FttO71PxvY-EwCH. La compilación reutilizó dependencias y siete WOFF2 locales; el guard de fetch se instaló antes del build/workers/Next. Date sólo del proceso Next está fijado al06Oct12Z; Auth, OS y runner conservan tiempo real. El canary Gemini se denegó antes del fetch nativo. No se afirma firewall global ni integración Google.

Dos sesiones normales confirmaron getUser, JWT60s con iat real y API de preferencias200. Una categoría propia insertada y leída por A fue invisible a B; anónimo401. Sólo esa categoría se borró y sólo esas sesiones se cerraron. Catorce tablas de finanzas/categorías/FX/cache permanecieron vacías; el journal del proveedor tenía cero peticiones al publicar READY. Se compararon135 assets de navegador contra los valores completos service-role/CRON: cero coincidencias; anon es configuración pública.

Fuentes ejecutadas y hashes están en [manifest.json](manifest.json). `prepare-database-a8abc2d.py` conserva los bytes exactos del bootstrap ejecutado antes de agregar el rechazo explícito de symlinks al helper mantenido. Las guardas posteriores de servicios/gateway/quote sí se ejecutaron con lstat/canonical y rutas desconocidas redactadas. Los archivos con credenciales, JWT/JWK, URLs SQL y mensajes SMTP están bajo `/tmp/zarix-runtime-20261015/empty-account-private/` y `auth-reset-private/`, nunca en los informes públicos.

Comandos utilizados, con permisos locales autorizados por invocación:

```sh
ZARIX_EMPTY_DATABASE_WINDOW=parent-released-new-empty-database python3 prepare-database.py
ZARIX_EMPTY_SERVICES_WINDOW=parent-released-local-empty-services python3 start-services.py
ZARIX_ACCEPTANCE_APP_WINDOW_CONFIRM=parent-released-frozen-copy python3 build-app.py build --revision 84df929ab2f169251a49f3e95d0e0c148dfcb87c --profile empty-core-closure
ZARIX_ACCEPTANCE_APP_WINDOW_CONFIRM=parent-released-frozen-copy python3 build-app.py start-clock --revision 84df929ab2f169251a49f3e95d0e0c148dfcb87c --profile empty-core-closure
ZARIX_EMPTY_AUTH_READINESS_WINDOW=parent-released-new-auth-only node auth-readiness.mjs
```

`targets.json` privado se escribió una sola vez después del readiness. Los casos posteriores usan ventanas seriales y reportes independientes. Retención y cierre se prepararon por separado; este informe no afirma que ya se realizaron ni acredita un restore de Auth/Storage, CNF-12, proveedor real o navegador.
