# Navegadores oficiales: preflight y plan revisable, 15/10/2026

**CNF-09 sigue BLOCKED.** Este directorio prepara ejecución temporal real de Safari, Firefox y Edge. No descargó ni ejecutó Firefox/Edge, no instaló software global, no aceptó sus términos y no contactó APP3000 durante el preflight. Chrome y su matriz visual pertenecen al runner E2E separado. Los resultados preparados no equivalen a una prueba de navegadores.

La Mac tiene macOS27.0.1/26A434 arm64, Safari27.0.1 y Chrome146.0.7680.165. Firefox/Edge no están en `/Applications`. [preflight.json](preflight.json) registra lectura de Info.plist, revisión Git y hashes. [official-software-metadata.json](official-software-metadata.json) contiene la selección exacta de metadatos públicos con fecha, fuentes y hashes de las respuestas. Se consultaron metadatos y cabeceras HEAD, nunca archivos binarios. Python no pudo validar el emisor TLS local; se usó curl con validación normal, sin `--insecure` ni cambio de certificados.

## Acción que requiere autorización específica

Descargar y usar temporalmente Firefox158.0, Edge155.0.4283.45, geckodriver0.37.1 y EdgeDriver155.0.4283.45 oficiales para probar ZARIX sintético. Coste de descarga/software0; sin cuenta externa, compras ni instalación persistente. Directorio de software `/tmp/zarix-browser-compat-software/`, perfiles privados temporales y controladores oficiales en loopback. El padre solicitará una autorización conjunta ligada a estos términos:

- [Firefox Terms of Use](https://www.mozilla.org/en-US/about/legal/terms/firefox/), vigentes16/09/2026: acuerdo para usar el ejecutable distribuido por Mozilla; la licencia del código fuente no sustituye ese acuerdo.
- [Microsoft Edge Software License Terms](https://explore.microsoft.com/en-us/edge/terms), sección2 aplicable a macOS: descargar o usar Edge constituye aceptación de sus términos. La [página oficial de descarga](https://www.microsoft.com/en-us/edge/download) lo indica antes de descargar.
- [geckodriver oficial](https://github.com/mozilla/geckodriver/releases/tag/v0.37.1), código bajo MPL2.0 y avisos del paquete; [EdgeDriver oficial y contrato de versión](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/). Revisar también los términos/avisos incluidos en cada distribución; una aceptación adicional o permiso obligatorio nuevo detiene esa acción y se reporta.

La autorización Safari fue comunicada por el padre desde la respuesta humana “si” del15/10/2026 (referencia `Sentinel_cc69c3519ba88191856af578a8897337`). Sólo el agente E2E gestiona Allow Remote Automation durante la ventana acordada y restaura disabled; este runner no activa/desactiva permisos. No incluye Keychain, TCC, administrador, Xcode, Gatekeeper ni otros cambios del sistema. Firefox/Edge siguen pendientes de autorización específica.

## Paquetes y verificación prevista

| Producto | Paquete oficial exacto | Integridad publicada | Firma/arquitectura aún pendientes |
|---|---|---|---|
| Firefox158.0 | [mac/en-US/Firefox158.0.dmg](https://archive.mozilla.org/pub/firefox/releases/158.0/mac/en-US/Firefox%20158.0.dmg) | SHA256 `dfe8508ee8880cec1578253eb02b9154b5971a55e832d97396f463cd07b5ef67`; [SHA256SUMS](https://archive.mozilla.org/pub/firefox/releases/158.0/SHA256SUMS) | mac universal; confirmar arm64, firma Mozilla y notarización del `.app` descargado |
| geckodriver0.37.1 | [macos-aarch64.tar.gz](https://github.com/mozilla/geckodriver/releases/download/v0.37.1/geckodriver-v0.37.1-macos-aarch64.tar.gz) | SHA256 `d02b3f7003f999caf90974a2ef5da0286c05d01cee19112c86846d759fdba4f5` publicado en la [API del release](https://api.github.com/repos/mozilla/geckodriver/releases/latest);4,234,637bytes | verificar arm64/firma/notarización. [Mozilla advierte](https://firefox-source-docs.mozilla.org/testing/geckodriver/Notarization.html) sobre aceptación macOS: no eliminar cuarentena ni desactivar protección |
| Edge155.0.4283.45 | [MicrosoftEdge-155.0.4283.45.pkg](https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/e7bb64c8-bda9-4a93-8a9c-1016b460d50c/MicrosoftEdge-155.0.4283.45.pkg) | SHA256 `9f34fb05d8c66440cd8f972dc0c34d0f9e9ef25827525c093117ba61d69ee2e1`;432,193,641bytes; [API oficial](https://edgeupdates.microsoft.com/api/products?view=enterprise) | mac universal; `pkgutil --check-signature` y extracción sin installer/scripts, luego confirmar arm64 y firma Microsoft del `.app` |
| EdgeDriver155.0.4283.45 | [edgedriver_mac64_m1.zip](https://msedgedriver.microsoft.com/155.0.4283.45/edgedriver_mac64_m1.zip) | HEAD200/9,232,635bytes; [versión oficial](https://msedgedriver.microsoft.com/LATEST_RELEASE_155_MACOS). No se identificó manifiesto SHA256 oficial para este ZIP; registrar hash local sin llamarlo autenticidad del editor | verificar binario arm64 y firma/notarización Microsoft antes de ejecutar. Primeros tres componentes de versión deben coincidir con Edge |

Después de la autorización, cada descarga/ejecución se somete a la revisión de permisos del executor. Comprobar SHA256 antes de extraer; no ejecutar contenido del paquete durante extracción. `pkgutil --expand-full` sirve para examinar el payload de Edge sin ejecutar installer ni sus hooks. Firefox puede montarse readonly/nobrowse bajo `/tmp`, sin respuesta automática a un diálogo de licencia. Conservar el paquete intacto y copiar solamente el `.app` necesario a `/tmp`. No aplicar `xattr -d`, `spctl --master-disable`, `sudo`, cambios de preferencias generales ni flags para saltar permisos. Las firmas/notarización todavía **no están verificadas**, porque los binarios no existen localmente.

RNF05 en [plan.md](../../../plan.md) exige estable actual **y anterior**; la selección actual anterior conocida es Firefox157.0.1 y Edge154.0.4258.62. No se descargaron, ejecutaron ni se verificaron sus paquetes/checksums. La autorización propuesta es para las versiones actuales de la tabla; la cobertura anterior permanece explícitamente pendiente. Tampoco se puede llamar Safari a WebKit o Firefox al fork instalado por Playwright.

## Runner preparado y alcance exacto

[run-browser-read.mjs](run-browser-read.mjs) usa exclusivamente W3C WebDriver HTTP, sin Selenium Manager ni descarga automática. Reutiliza los guards del repositorio y los restringe a API57321/PostgreSQL57322 y app `http://127.0.0.1:3000`. Requiere fixture privado0600 preexistente con exactamente dos usuarios Auth y un invitado; no los crea, rota ni cambia planes. Cada identidad tiene una sesión fresh separada; Safari usa su sesión de automatización oficial, Firefox perfiles bajo `--profile-root` privado y Edge `--user-data-dir` propio sin Keychain real.

| Subcaso preparado | Oráculo y límite |
|---|---|
| CU001 lectura de movimientos | UI `/expenses`, conteo `Traídos` y GET normal de100movimientos contra SQL independiente con dueño, cuenta/destino activos y orden fecha/ID. El fixture existente debe tener menos de100movimientos para el oráculo de conteo completo. Invitado preexistente primero demuestra GET protegido401; luego grupo activo sólo sus miembros, o404 con SQL inactivo si API anterior lo revocó. No se une ni crea grupos/gastos. |
| CU002 lectura de cuentas | UI `/accounts` con nombres existentes, GET con IDs, nombres, moneda y saldo persistido contra SQL de A; segundo login UI B y GET excluyen IDs A. No compara cada saldo renderizado ni edita perfil, crea cuenta, archiva, descarga/exporta o cambia plan. |
| CU003 lectura de análisis | UI de período explícito exclusivamente ARS contra sumas SQL completas de gasto/ingreso/neto con dueño, límites UTC literales iguales a `lib/transaction-date` y cuentas activas; no convertir fallo en cero. Moneda mixta bloquea ese oráculo antes de inventar conversión. |
| CU004 lectura de inversiones | UI con nombre/cantidad/precio de compra renderizados y GET contra posiciones propias activas SQL. GET/dashboard pueden refrescar precios no manuales: el runner bloquea antes de iniciar navegador si existen esos candidatos. Si ya existe fixture manualUSD q6/precio110 y Premium usable, subprueba derivada CP4-08:660→726 y cierre sin cambiar facts. No se crean posiciones, ventas ni cotizaciones. |

El observador SQL impone `default_transaction_read_only=on` y sólo SELECT. Un hash inicial/final cubre accounts, transactions, investments e investment_sales de los dos usuarios de prueba. Esto **no afirma ausencia global de escrituras**: login crea sesiones Auth y dashboard puede guardar snapshot/caché. No se guardan JWT, cookies, passwords, capabilities, HAR, traces, stdout/stderr de driver ni excepciones crudas. Capturas de los cuatro CU sólo después del login, sin barra de direcciones; ninguna imagen del formulario con credenciales. Perfiles son privados en `/tmp`, no se copian a evidencia y se eliminan sólo tras confirmar la salida del driver propio. No se toca un driver/puerto ajeno ocupado.

La defensa de destinos remotos debe estar verificada por el dueño del entorno antes de abrir la ventana: backend con proveedores loopback sintéticos; no interpretar simples flags de telemetría como aislamiento de red probado. Firefox/Edge solicitan proxy manual hacia puerto9 para destinos no loopback. Safari usa el entorno sintético controlado por E2E; este preflight no demuestra una barrera de red del navegador por sí solo.

## Reproducción

Preflight sin sesión ni request a la app:

```sh
node docs/tif/v2.13/evidence/technical-20261015/browser-compat/preflight.mjs
node --check docs/tif/v2.13/evidence/technical-20261015/browser-compat/run-browser-read.mjs
```

El runner sin ventana autorizada sale2 y guarda cuatro filas BLOCKED bajo `/tmp/zarix-browser-compat-safari`. Esa negativa es una comprobación del guard; no es PASS de compatibilidad.

Sólo tras aviso del padre APPready y activación temporal Safari por E2E, se cargan en proceso los `.env` privados existentes, sin imprimirlos. Mapear `ZARIX_E2E_SUPABASE_URL`/`ZARIX_E2E_DATABASE_URL` a `ZARIX_LOCAL_SUPABASE_URL`/`ZARIX_LOCAL_DATABASE_URL`; usar el mismo `TZ` que el servidor. Los siguientes flags son **atestaciones del operador con evidencia**, no autorización autogenerada:

```sh
ZARIX_BROWSER_COMPAT_PRODUCT=safari \
ZARIX_BROWSER_COMPAT_EXECUTE=authorized-window \
ZARIX_BROWSER_COMPAT_APP_READY=isolated-e2e-57321 \
ZARIX_BROWSER_COMPAT_PROVIDER_GUARD=loopback-fixtures-confirmed \
ZARIX_API_TARGET_PURPOSE=isolated-api-e2e-replica \
ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only \
ZARIX_TEST_LOGIN_FILE=/tmp/zarix-runtime-20261015/e2e-logins.json \
ZARIX_BROWSER_COMPAT_OUTPUT=docs/tif/v2.13/evidence/technical-20261015/e2e/safari \
node docs/tif/v2.13/evidence/technical-20261015/browser-compat/run-browser-read.mjs
```

Safari exige además `ZARIX_SAFARI_AUTOMATION_AUTHORIZATION` con la referencia humana recibida. Firefox/Edge exigen `ZARIX_BROWSER_TERMS_AUTHORIZATION`, `ZARIX_BROWSER_COMPAT_SOFTWARE_VERIFIED=publisher-checks-pass`, binario y driver absolutos bajo `/tmp/zarix-browser-compat-software/`; no poner esos flags hasta completar la autorización y los checks reales. El runner cierra sesión WebDriver y detiene sólo su driver; el agente E2E registra la restauración de Safari.

**No aprobación por lectura:** CP1-01/03/17/19/20, CP2-01/06/07/08, CP3-04/09 y CP4-02/08 completos requieren sus acciones/oráculos originales en la matriz browser×CP. Las celdas no ejecutadas quedan BLOCKED; un subcaso de lectura aprobado no las cambia. OCR/Gemini/Telegram/MercadoPago reales siguen fuera de estas comprobaciones; las credenciales/proveedores faltantes quedan BLOCKED en sus reportes correspondientes. CNF-02 mensual requiere observación real y no se prueba con este runner.
