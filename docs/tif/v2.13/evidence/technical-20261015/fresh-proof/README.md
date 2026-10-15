# Quinta réplica local para contratos de aceptación

La réplica temporal API `127.0.0.1:58321` / PostgreSQL `58322` se preparó vacía con el runtime nativo oficial ya descargado. [preparation.json](preparation.json) registra dos grupos de preparación PASS: plataforma inicialmente sin usuarios Auth, objetos Storage ni tablas públicas; luego baseline y 27 migraciones, 27 tablas con RLS, 12 tablas financieras vacías y dos identidades sintéticas A/B copiadas desde la fuente aislada. Sólo se copiaron `auth.users` y `auth.identities`, sin sesiones ni refresh tokens. A tiene Free y B Premium como configuración administrativa de prueba; esto no acredita cobros ni una integración con Mercado Pago.

Las dos sesiones normales de preparación verificaron password login y `getUser`; se cerraron sólo esas sesiones. La lectura de la fuente usó transacciones de sólo lectura y sus hashes públicos/Auth permanecieron iguales. Las réplicas RESTORE, LOAD y E2E no se conectaron durante esa preparación. Los conteos iniciales del informe describen ese momento: los ensayos posteriores del padre pueden añadir sus propios fixtures.

[build-proof.json](build-proof.json) vincula una copia separada de la aplicación, 477 archivos y el build `a2WBtszbvrpoT9GHwToED` a la revisión CI4 `836fd18b310a51cced9074b372a80ce5d7e1a870`, comprobada por `core-reliability`. [app-state.json](app-state.json) identifica Next PID 52579, origen `127.0.0.1:3002` y backend 58321. El texto `scope` del informe ejecutado conserva por error editorial la etiqueta «CI3» del controlador previo; la revisión, los hashes y los 477 archivos del mismo informe corresponden a CI4. No se reescribe ese registro original.

La compilación utiliza dependencias existentes, siete fuentes Inter WOFF2 copiadas de un build congelado anterior y el mock de fuentes de Next. El guard se carga antes de Next y sus workers y restringe `globalThis.fetch` a loopback; no equivale a un firewall ni cubre todo TCP. Los proveedores configurables parten del servidor local 57910 y no se sembraron cotizaciones durante preparación/build/start. Los ensayos posteriores declaran por separado sus proveedores y semillas. El gateway público y Next usan loopback; el listener interno de PostgREST conserva la limitación wildcard documentada en `environment/native-runtime-inspection.json`.

## Auth: expiración real y revocación local

Sólo esta quinta réplica configura JWT de 60 segundos. Las otras réplicas conservan 3600 segundos. Los tokens proceden de un login normal; no se firman JWT ad hoc ni se cambia el reloj del sistema/Auth.

[auth-expiry.json](auth-expiry.json) reúne tres comprobaciones acotadas PASS: el token de una sesión temporal C fue válido inicialmente, su refresh se revocó con logout local de esa sesión, y el mismo JWT vencido fue rechazado por Auth/PostgREST después de la tolerancia documentada de 30 segundos; otras dos sesiones normales A/B continuaron renovándose legítimamente. El primer grupo se referencia desde el intento anterior; los tres grupos no son tres ejecuciones nuevas ni un CP2-21 de navegador completo.

Se preservan dos intentos FAIL del arnés. [Intento 1](auth-expiry-attempt-1/verification.json) exigía incorrectamente Auth 200 después de logout local: GoTrue devolvió 403 `session_not_found`. [Intento 2](auth-expiry-attempt-2/verification.json) exigía REST 401 a `exp+2s`, dentro de la tolerancia de 30 segundos, y obtuvo 200. Sus fuentes exactas permanecen al lado de cada informe. La continuación reutilizó el mismo token y las mismas cookies; no los reemplazó para forzar el resultado. La firma criptográfica y el control temporal de claims son comprobaciones distintas en [PostgREST 16.4](https://raw.githubusercontent.com/PostgREST/postgrest/v16.4/docs/references/auth.rst).

Las cookies privadas proceden del adaptador SSR real tras login/refresh normal; no se afirma captura de navegador. Con un refresh válido, un access token vencido puede renovarse y devolver 200. La sesión C conserva su refresh revocado; no se efectuó logout global. Dos sesiones de control propias creadas por el primer intento quedaron preservadas además de los dos controles privados posteriores; no se revocaron sesiones ajenas para limpiar un fallo del arnés.

## Recovery local real

[auth-recovery.json](auth-recovery.json) registra dos grupos PASS sobre la identidad A clonada. `admin.generateLink` local creó hashes reales sin enviar correo. El primer hash se verificó una vez y produjo una sesión nueva; sólo esa sesión se cerró localmente y la reutilización devolvió 403 `otp_expired`. Después se creó el hash final, se ajustó únicamente `recovery_sent_at` de A a 3605 segundos de antigüedad y su verificación devolvió 403 `otp_expired`, conservando ese hash como actual.

El TTL efectivo de recovery es 3600 segundos, leído de la configuración resuelta del servicio; la fixture de fecha no se presenta como una espera real de una hora. No hubo cambio de contraseña, SMTP, tokens publicados, nuevas identidades ni cambios financieros. Los hashes de las 12 tablas financieras y las dos sesiones normales de control se conservaron.

## CP2-09: contrato literal y resultados independientes

[auth-negative-contract/verification.json](auth-negative-contract/verification.json) conserva **FAIL: 9 comprobaciones PASS y una FAIL**. La contraseña incorrecta se rechazó sin usuario ni token con **HTTP 400 `invalid_credentials`** de GoTrue; el contrato original exige 401/403. Esa divergencia literal no se transforma en PASS ni se describe como acceso indebido.

El arnés continuó: usuario inexistente y password incorrecto devolvieron el mismo error sin enumeración sensible; JWT actual con firma alterada y JWT real vencido devolvieron 403 `bad_jwt`; recovery expirado y reutilizado devolvieron 403 `otp_expired`. Dos controles A/B con login normal leyeron `/api/user/notification-preferences` con HTTP 200. La API de ZARIX rechazó con 401 las cookies reales de C con access vencido y refresh previamente revocado. Las 12 tablas financieras quedaron iguales, las dos sesiones normales anteriores se conservaron y las dos sesiones nuevas de este arnés se cerraron localmente con 204. No se ejecutó navegador ni se alteraron cotizaciones.

## Reproducción y conservación

Los controladores requieren confirmaciones explícitas y rutas/orígenes cerrados; no deben repetirse sobre el proyecto existente. Las credenciales, cookies, hashes de recovery y diagnósticos permanecen sólo en archivos privados 0600 bajo el runtime 0700 en `/tmp/zarix-runtime-20261015`; los informes públicos contienen estados, hashes de integridad y metadatos saneados. [manifest.json](manifest.json) fija los bytes de las fuentes e informes publicados.

La limpieza futura autorizada utiliza únicamente `supabase stack stop --workdir /tmp/zarix-runtime-20261015/proof` con `SUPABASE_HOME` privado, después de conservar el dump y los fixtures privados. No se ha detenido esta réplica ni eliminado su identidad, configuración, datos o copia de la aplicación. El padre coordina su ventana y los ensayos posteriores. No hay instalación global, recurso pago, acceso persistente externo, fusión ni despliegue.
