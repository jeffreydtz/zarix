# Lectura funcional después de restauración

La corrida documentada terminó: **cuatro lecturas acotadas PASS, general PARTIAL**. Ver [evidencia del15/10](../tif/v2.13/evidence/technical-20261015/restored-ui/README.md). Las siguientes guardas se usaron para ejecutar **después de liberar LOAD**. La ventana de root es obligatoria: no se compila, inicia Next, abre navegador, consulta Auth/SQL ni agrega la fixture FX mientras carga siga activa. Los scripts están preparados para el producto CI3 `bb2e8a6aa5de7f7f26ba745da67257b0f1f25e81`; sus checks propios no heredan automáticamente los 819 tests anteriores.

El destino es exclusivamente RESTORE existente: API/Auth `http://127.0.0.1:55321`, PostgreSQL `127.0.0.1:55322/postgres`, Next separado `http://127.0.0.1:3002`. No crea stacks, usuarios, credenciales externas o proveedores. Usa `source-native-logins.json` privado (los dos usuarios ya restaurados) y `restore.env`, ambos 0600. No resetea ni borra datos, modifica la app o cambia firewall/TCC.

## Preparación y ejecución autorizada

La copia se construye desde los bytes Git del freeze CI3, con manifiesto CI3 de442entradas (441Git y el marcadorCLI ignorado exacto) más25assets públicos del mismo ref. Verifica los hashes de producto actuales, excluye entornos reales y crea una `.next` propia en `/tmp/zarix-app-restored-read-20261015`; no usa ni modifica `.next` raíz. El enlace node_modules reutiliza la instalación compatible existente. Salidas de build/Next y entorno local se guardan privadas bajo `/tmp/zarix-runtime-20261015`.

Sólo después de la ventana explícita:

```sh
ZARIX_RESTORE_UI_WINDOW_CONFIRM=post-load-exclusive \
python3 scripts/prepare-restored-ui-copy.py build
ZARIX_RESTORE_UI_WINDOW_CONFIRM=post-load-exclusive \
python3 scripts/prepare-restored-ui-copy.py start
ZARIX_RESTORE_UI_WINDOW_CONFIRM=post-load-exclusive \
ZARIX_PLAYWRIGHT_MODULE=/tmp/zarix-e2e-20261015/node_modules/playwright/index.mjs \
node scripts/test-restored-ui-read.mjs
```

Las llamadas requieren los permisos locales por acción que correspondan; estas líneas no constituyen una ejecución. El runner exige PID/listener3002 y BUILD_ID propios y los hashes de la copia. No adopta otro listener por obtener HTTP200. No ejecutar una segunda copia sobre directorios/estado existentes ni volver a sembrar ocho FX si la primera corrida ya las guardó; conservar ese intento y reanudar sólo con inventario explícito. El runner persiste un checkpoint0600 con fsync/rename antes del INSERT; un lockwx impide paralelos. Reusa sus mismos8IDs y hashes comprometidos; aborta con IDs parciales, drift o filas desaparecidas. Cada intento guarda un directorio nuevo, sin reemplazar reportes/capturas anteriores.

## Guardas y alcance

El build, sus workers y Next precargan `restored-read-fetch-guard.mjs` antes de importar servidor/app. El guard permite sólo HTTP(S) loopback y fuerza `redirect:error`; falla cerrado si su auditoría privada no es válida. El log es `/tmp/zarix-restored-read-fetch-guard-20261015.jsonl`, 0600, regular y sin enlaces. No registra headers, bodies, tokens, querystrings ni rutas dinámicas. Esto controla `globalThis.fetch`, **no es un firewall ni una garantía de todo TCP**. Para evitar la descarga de Inter que Next implementa con `node:https`, el build usa `NEXT_FONT_GOOGLE_MOCKED_RESPONSES`: siete WOFF2 reales ya presentes en la copia LOAD del mismo freeze se copian a una fixture privada con hashes. Sólo se lee esa copia, nunca `.next` raíz; la copia restaurada emite sus propios assets. No se solicita Google Fonts ni se presenta esa fixture como integración de proveedores.

El browser permite sólo app3002 y API55321, con service workers bloqueados. El transporte usa respuestas reales `route.fetch(maxRedirects:0)` y aborta todo HTTP30x; no se confía en que una ruta permita revisar saltos posteriores. Se preservan bodies/headers/cookies del transporte real, sin valores financieros simulados. Se hace password login normal real, verifica `getUser` y luego lee los cuatro CU. La navegación automática a `/dashboard` se bloquea expresamente porque esa página guarda snapshots derivados; no forma parte de estos cuatro recorridos de lectura. También se bloquea `/api/market-data`, cuyo GET puede sobrescribir la caché original; el widget queda expresamente fuera de aceptación. Se bloquean writes HTTP a las API de app; no se hace submit financiero. Auth crea sesiones esperadas y se cierra únicamente cada sesión temporal propia con `scope=local`, sin sign-out global. Las capturas se toman después del login, nunca de inputs de contraseña ni con cookies/JWT visibles.

La fixture restaurada original sólo tenía un FX `source=synthetic`. La app necesita ocho pares reconocidos. Root autorizó **append auxiliar explícito** de blue/oficial/mep/ccl y sus `_buy`, todos1200, fecha actual e IDs nuevos, conservando toda fila previa. Son datos sintéticos de referencia agregados **después** del restore; no se atribuyen al backup original ni a un proveedor real. Los endpoints configurables apuntan al doble loopback503 existente, por lo que la app debe usar fallback DB; el guard bloquea también las URLs hardcoded del widget Mercados. Un widget externo no disponible se declara limitado y no se rellena con ceros para aprobar finanzas.

Se contrastan antes/después las 25 tablas públicas canónicas, excluyendo sólo FX y market_data_cache; los hashes usan el texto JSONB de PostgreSQL antes de convertir NUMERIC a JavaScript. FX original se comprueba por ID/hash y exactamente ocho IDs nuevos concordantes; market_data_cache original y ACL/RLS/grants se hashean aparte. Auth y caché tienen su alcance explícito. No se publican dumps, tokens o filas Auth completas.

CU001 compara IDs/importes de movimientos y lectura visible; CU002 cuentas/saldos API y valor renderizado exacto con nombres; CU003 sumas de SQL, API y cifras renderizadas; CU004 posiciones, valoración/P&L almacenados y lectura visible mediante portfolio sin refresh ni snapshot diario. Los oráculos usan la fixture real restaurada, con conteos y transferencias efectivas, sin inventar2cuentas/20movimientos/3lotes/1regla/1grupo.

El resultado sólo puede aprobar estas cuatro lecturas acotadas. CNF-12 original sigue separado: plan de backup realmente contratado, snapshot/gasto posterior nominal, reloj23h/3h30 y fronteras24h/4h/+1s no se deducen de esta prueba. CNF-02 mensual y TLS tampoco se aprueban.
