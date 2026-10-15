# Copias de aceptación y reloj de proceso

**Intermedio ejecutado: PASS de build y readiness; contratos aparte.** El build nuevo836/core-reliability terminó con BUILD_ID `aqWYS3F5R_VxiHxD3LpJV`; el perfil retry usa Next1822 y proveedor sintético57912/PID443. Auth normal A/B, JWTreal60s y API de preferencias200JSON están [registrados](intermediate-clock-executed/verification.json). Las135 piezas de navegador tienen0coincidencias exactas con service-role y CRON_SECRET. No se ejecutaron casos financieros desde este controlador. El [perfil finalCI5](final-clock-executed/README.md) también completó build/readiness sobreGit7c3e872/buildvPLjt y480fuentes: controlesAuth/API200 y135assets sin service-role/CRON. Sus solicitudes financieras posteriores tienen informes separados.

El [intento de reloj anterior](attempt-1-clock-preload-failure/sanitized-diagnosis.json) devolvió500HTML: el shim heredaba Date.parse/UTC y la extensión real deNext15 copia sólo descriptores propios. Se corrigió únicamente el preload del arnés; la misma copia/build respondió200 después. Se preservan su código exacto verificado contra elSHA de instalación, los estados y el diagnóstico; no es un fallo de producto. Hay21aserciones de modelo/extensión realNext y11de cuerpos del proveedor; estas32no se suman a Vitest ni aprueban contratos originales.

| Perfil explícito | Fuente y copia | Artefactos privados nuevos |
| --- | --- | --- |
| `intermediate-core-reliability-clock` | Git `836fd18b310a51cced9074b372a80ce5d7e1a870`, `core-reliability`; `/tmp/zarix-app-contract-clock-20261015` | `contract-clock-app.env`, `contract-clock-build-proof.json`, `contract-clock-app-state.json`, `contract-clock-observation.json` |
| `intermediate-core-reliability-clock-retry` | Misma copia/build836 y proof/env inmutables del intermedio | Nuevos `contract-clock-retry-app-state.json`, `contract-clock-retry-observation.json`, Gemini/journal/log con prefijo retry |
| `final-core-acceptance` | Revisión final todavía por fijar con `--revision`, obligatoriamente igual a `core-acceptance`; `/tmp/zarix-app-acceptance-final-20261015` | `final-proof-app.env`, `final-proof-build-proof.json`, estado normal `final-proof-app-state.json` o reloj `final-proof-clock-app-state.json`, observación `final-proof-clock-observation.json` |

Los tres perfiles usan sólo el backend existente PROOF `127.0.0.1:58321/58322`, las mismas identidades sintéticas y el puerto Next 3002. El padre debe liberar cada ventana y cerrar primero el Next anterior mediante sus propias guardas; este controlador no envía señales a procesos previos ni detiene stacks. Una falla de startup conserva el PID en un intento reservado antes del spawn y termina únicamente su hijo Next recién creado; si no cierra, deja su identidad para revisión del padre. Se rechaza el inicio si sigue vivo cualquiera de los PIDs de aplicación previamente registrados. Los archivos originales `proof-app*`, su copia Git836 y las réplicas quinta/sexta se conservan. No hay puerto 3004 ni reutilización concurrente de `.next`.

El perfil intermedio se compila desde el archivo Git836 y su manifiesto, con package/lock iguales a los probados. Las diferencias de producto actuales —por ejemplo formatter horario o metadata de exportación— se registran como `executedByThisBuild:false`. No se exige que esos cambios actuales se borren ni se atribuyen a la copia anterior. El perfil final exige además igualdad del producto actual con su freeze CI5. Sus directorios, fuentes Inter, entornos, logs, build y estados tienen nombres separados y guardas para no sobrescribir una preparación previa.

## Construcción y configuración

El build usa dependencias existentes, siete WOFF2 Inter del build LOAD congelado y el mock local de fuentes de Next; no se descarga software ni fuentes. El guard de `globalThis.fetch` se carga antes de build/workers/Next y permite sólo HTTP(S) loopback. No es un firewall ni controla otros clientes TCP. Se compara cada fuente física y su hash con la revisión seleccionada y se conserva el BUILD_ID; el inicio acepta únicamente listener/cwd del PID recién creado.

La clave cron se copia de `e2e-app.env` privado ya existente y no se genera otra. `TELEGRAM_ADMIN_CHAT_ID` se fija explícitamente vacío y se registra `adminAlertsDisabled:true`, para que los rechazos de cron no intenten alertar a un administrador externo. No se heredan credenciales de Gemini/Telegram/Mercado Pago del host. Los datos de usuario y `telegram_bot_token` de cada fixture deben comprobarse por el runner específico; una configuración de proceso no modifica esos datos ni demuestra entrega de notificaciones. El outbox representa intenciones; no se inicia un dispatcher.

El perfil de tiempo normal usa el proveedor local 57910 sin cambiarlo. El perfil de reloj usa exclusivamente el nuevo doble 57912 para CriptoYa, DolarAPI y CoinGecko, con cuerpos fijos a `2026-10-06T12:00:00.000Z`: compra/venta1200 para los cuatro dólares y BTC60000/ETH2500/USDT1 USD. `clock-quote-fixture.mjs` no importa el servidor anterior, no arranca al importarse, no hace proxy/fetch ni accede a DB. Guarda sólo PID, source hash y contadores privados. Su inicio y listener/cwd deben quedar comprobados antes de iniciar el Next de reloj. Las FX originales de octubre15 no se actualizan ni borran; las consultas a un proveedor fresco fijo tienen su propio alcance declarado.

## Reloj y Auth

Sólo `start-clock` precarga el shim en el proceso Next seleccionado. `Date()`, `Date.now()` y `new Date()` sin argumentos quedan en octubre6 a las12Z; fechas con argumentos, parse/UTC, herencia, timers y performance conservan su comportamiento. Build, reloj Mac, PostgreSQL, GoTrue, navegador y runner no cambian de hora. El registro privado se escribe desde el proceso real con PID, comando, BUILD_ID, revisión, hashes de fuentes/preload, hora original de instalación y hora observada simulada; no basta una variable de entorno.

El SDK SSR comparte el reloj de Next. GoTrue mantiene el reloj real y JWT de60s: los clientes de prueba deben renovar normalmente con reloj real antes de cada request y conservar las cookies actualizadas. Se requieren controles Auth normales sobre esa instancia ya iniciada; las21 aserciones del modelo/extensiónNext Date no prueban Auth ni equivalen a expiración de sesión real.

## Gemini sin llamadas externas

El preload comprueba que el guard revisado ya está instalado **antes** de intentar un canary sin headers ni credenciales al origen público de Gemini. El guard debe rechazarlo antes de invocar fetch nativo, dejando un registro de denegación. Esto es un doble local de indisponibilidad, no una petición a Google ni una observación de caída real del proveedor.

Los archivos `contract-clock-retry-gemini-unavailable.json` y `contract-clock-retry-gemini-attempts.jsonl` —o sus variantes finales normal/reloj— registran el mismo PID/build y un journal de intentos hacia hosts Gemini. Para CP3-16, el runner deberá comprobar las credenciales almacenadas de su fixture sin publicarlas, tomar límites antes/después del cálculo, obtener éxito real de `GET /api/ai/projections` y demostrar cero intentos adicionales Gemini durante esa ventana. Ni ausencia de env ni el canary de preparación aprueban ese contrato por sí solos.

## Comandos del intermedio ejecutado

```sh
# Sólo después de la liberación de la ventana por el padre:
ZARIX_ACCEPTANCE_APP_WINDOW_CONFIRM=parent-released-frozen-copy \
python3 docs/tif/v2.13/evidence/technical-20261015/acceptance-final/build-app.py \
  build --profile intermediate-core-reliability-clock \
  --revision 836fd18b310a51cced9074b372a80ce5d7e1a870

ZARIX_FINAL_CLOCK_QUOTES_WINDOW=parent-released-synthetic-provider \
node docs/tif/v2.13/evidence/technical-20261015/acceptance-final/clock-quote-fixture.mjs

# El proceso anterior3002 debe estar cerrado y el57912 debe ser el propio:
ZARIX_ACCEPTANCE_APP_WINDOW_CONFIRM=parent-released-frozen-copy \
python3 docs/tif/v2.13/evidence/technical-20261015/acceptance-final/build-app.py \
  start-clock --profile intermediate-core-reliability-clock-retry \
  --revision 836fd18b310a51cced9074b372a80ce5d7e1a870
```

Esta secuencia sólo se ejecutó con la ventana del padre liberada; no se repite mientras existan escritores o pruebas previas activos. El cierre posterior se coordina por PID/build/cwd/listener propios y preserva datos y artefactos privados; el controlador no contiene reset, destroy, SQL, creación de usuarios ni borrado financiero.
