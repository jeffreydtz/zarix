# Recorridos UI → API → DB de CU001–CU004

`scripts/test-isolated-e2e.mjs` prepara exactamente cuatro recorridos acotados con dos identidades sintéticas normales de GoTrue. Usa Chrome instalado, una instancia PostgreSQL nativa aislada y Next local. No modifica dependencias del producto, no usa sesiones `service_role` en el navegador y rechaza destinos remotos.

La ejecución no equivale a aceptar todos los casos originales de un CU: cada comprobación declara su alcance. En particular, editar/eliminar y los diez reintentos se ejercitan por API autenticada después del alta UI. Los proveedores reales, fallos inyectados, reinicio y cola offline requieren ejecución adicional. La simulación CP4-08/09 se ejercita en la UI con +10%, −100%, −100.01% y NaN, contrastando el hash de cuentas, movimientos, posiciones y ventas antes/después; es un cálculo hipotético local que no escribe una operación financiera.

## Preparación

Usar Node 22–24, `npm ci`, `psql` y una réplica **sólo sintética** con baseline y migraciones reproducidos. El servidor Next construido debe apuntar a esa misma instancia, incluido el `NEXT_PUBLIC_SUPABASE_URL` compilado en el cliente. No reutilizar un build dirigido a otra instancia. No extraer claves de producción. GoTrue local debe tener confirmación de email deshabilitada para estas identidades `@example.invalid`; el script rechaza reemplazar el login normal con una sesión de administrador.

La corrida de esta revisión utiliza la cuarta réplica API `127.0.0.1:57321` / PostgreSQL `127.0.0.1:57322`. Fuente (`54321/54322`) y restauración (`55321/55322`) están expresamente rechazadas por los runners que escriben. La revisión automática rechazó una ejecución contra la fuente que conservaba el fixture de recuperación; ninguna escritura ocurrió en ese intento. Se eligió una nueva réplica vacía en lugar de modificar aquel fixture.

`scripts/setup-isolated-e2e-users.mjs` requiere `ZARIX_E2E_SETUP_CONFIRM=new-identities-in-replica` y un archivo privado nuevo indicado por `ZARIX_TEST_LOGIN_FILE`. Si `public` está vacío reproduce baseline/migraciones y exige Auth vacío; crea exactamente dos usuarios normales y un invitado propio sin identidad Auth. Los dos usuarios registrados participan en el grupo del invitado; un grupo distinto conserva un miembro registrado para probar IDs manipulados. Cotizaciones locales sintéticas permiten valorar la posición manual. No crea credenciales externas ni borra datos existentes. La opción `ZARIX_E2E_COMPLETE_GUEST=1` sólo completa un fixture propio anterior sin invitado, conservando sus dos credenciales; guardar esa etapa en otro directorio de reporte.

Instalar el paquete de herramientas fuera del repositorio, con versión fijada, si está autorizado:

```sh
npm install --prefix /tmp/zarix-e2e --cache /tmp/zarix-e2e-npm-cache --ignore-scripts --no-audit --no-fund playwright@1.64.0
```

Inyectar de forma privada `ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only`, `ZARIX_API_TARGET_PURPOSE=isolated-api-e2e-replica`, `ZARIX_LOCAL_SUPABASE_URL`, `ZARIX_LOCAL_DATABASE_URL`, `ZARIX_LOCAL_ANON_KEY` y `ZARIX_PG_BIN`. El archivo `/tmp/zarix-runtime/e2e.env` usa claves `ZARIX_E2E_*`; mapearlas a `ZARIX_LOCAL_*` en memoria, sin imprimirlas. No copiar valores de credenciales a documentación ni logs. Añadir:

```sh
export ZARIX_E2E_APP_URL=http://127.0.0.1:3000
export ZARIX_TEST_LOGIN_FILE=/tmp/zarix-runtime/e2e-logins.json
export ZARIX_PLAYWRIGHT_MODULE=/tmp/zarix-e2e/node_modules/playwright/index.mjs
export ZARIX_E2E_OUTPUT=/tmp/zarix-isolated-e2e
node scripts/test-isolated-e2e.mjs
```

`ZARIX_TEST_LOGIN_FILE` reutiliza exactamente los dos usuarios normales propios ya preparados: archivo privado con permisos 0600, `purpose=isolated-api-e2e-replica` y estructura `users: [{ id, email, password }, { id, email, password }]`. Sólo admite emails `zarix-e2e-…@example.invalid`, comprueba el login normal y coteja la identidad con SQL; nunca copia el archivo al reporte. Los datos del invitado y su token permanecen en el mismo fixture privado; no se usa esa capacidad para representar una identidad Auth individual.

`ZARIX_CHROME_EXECUTABLE` permite usar otra ruta de Chrome instalado; no configura Safari. `ZARIX_E2E_HEADED=1` permite observar la ejecución. El archivo privado de login es obligatorio y reutiliza los dos usuarios existentes; no crea identidades adicionales ni borra fixtures anteriores. Crea sus propias cuentas/posiciones y prepara estado de plan/onboarding sólo en identidades sintéticas. El downgrade comprueba la denegación al exceder tres cuentas y conservación de lectura/exportación; si ya existían cuentas, no afirma el fixture exacto de tres cuentas originales de CP2-20.

## Evidencia y límites

El JSON incluye revisión Git, hash/estabilidad de fuentes, fechas, versión exacta de navegador, comprobaciones SQL, estado por recorrido y sólo método/ruta/status de requests observadas después del login. Las capturas se toman tras login. No guarda HAR/trazas crudas, cookies, JWT, API keys, passwords ni cuerpos de autenticación. `PARTIAL` indica que los cuatro recorridos acotados pasaron; nunca significa aceptación integral de CU001–CU004.

`scripts/test-isolated-api.mjs` complementa la UI con cookies SSR obtenidas por login normal y aserciones de API → PostgreSQL. Incluye moneda origen/destino distinta, edición/eliminación, diez reintentos, sobreventa, grants, IDs manipulados, límites/downgrade, reparto y revocación del invitado, y cron/outbox sin envío a Telegram. `ZARIX_CRON_SECRET_FILE` referencia únicamente un secreto local sintético privado. No probar Telegram real con tokens inventados. La evidencia API no aprueba la UI.

Ese runner conserva `durable-replay-fixture.json` sin sesiones ni capacidades: payload sintético, clave lógica, hash de payload/respuesta, ID de movimiento y saldo esperado. Después de un reinicio **separadamente demostrado** de Next/PostgreSQL, ejecutar con `ZARIX_API_REPLAY_FILE` apuntando al artefacto y `ZARIX_RESTART_EVIDENCE` indicando el registro saneado del reinicio. Reautentica normalmente y exige una fila, mismo saldo y misma respuesta. El primer acuse ignorado se simula a nivel del cliente lógico; no se atribuye a una pérdida real de red.

Las cuatro capturas de escritorio no prueban CNF-05–08. Esos casos exigen 320×568, 375×812, 768×1024 y 1440×900, zoom 200%, teclado, scroll, modales, importación/exportación, OCR y demás acciones documentadas. CNF-09 exige Chrome, Firefox, **Safari real** y Edge, cada uno versionado y con perfil nuevo. Playwright WebKit no constituye evidencia de Safari. [Documentación oficial de navegadores Playwright](https://playwright.dev/docs/browsers).

`scripts/test-isolated-visual.mjs` complementa con una submatriz de exactamente esos cuatro CU en los cuatro viewports, a 100% y 200%, después de los recorridos principales. Utiliza el mismo usuario A con login UI normal en un perfil Chrome nuevo y temporal. El zoom se configura mediante la opción real `chrome://settings/appearance` → `#zoomLevel`, no por CSS ni `Emulation.setPageScaleFactor`. Exige el cambio de `devicePixelRatio` de 1 a 2 y ancho CSS de layout a la mitad; conserva escala visual 1. El perfil propio se elimina al finalizar.

Las 32 celdas ejercitan sólo las acciones registradas: gasto/cuenta sin guardar y teclado Tab, alcance del botón mediante hit-test después de scroll, lectura de análisis, simulación 10% y descarga JSON por UI. Verifica desborde global y una huella monetaria antes/después; no introduce operaciones nuevas ni copia cuerpos de página, sesiones o descargas a evidencia. Conserva captura y hash por celda, incluida la fallida. Si todas pasan, el estado general sigue `PARTIAL`: preview de OCR, presupuestos, login/reset, chat de IA/anomalías y compra/venta completa en cada viewport requieren sus propios pasos ejecutados. El ensayo no completa CNF-05–08 por inferencia.

Después de observar capturas de transición en la primera fase, el helper visual espera fuentes cargadas, heading/resultado real, ancestros opacos y dimensiones/texto estables durante seis frames; en análisis espera además que desaparezcan los placeholders de gráficos. La captura de una falla se conserva sin afirmar esa preparación. El selector de navegación admite los nombres existentes `Nuevo` en desktop y `Nuevo movimiento` en mobile. Son correcciones del harness posteriores al build/global de producto `0169860`, con SHA separado; las 819 pruebas globales se atribuyen únicamente a aquella revisión.

Las referencias financieras y posiciones manuales son sintéticas. El widget Mercados de `/api/market-data` puede obtener cotizaciones públicas reales de CoinGecko/Yahoo/Stooq mediante URLs hardcoded o su caché, separado de las URLs configurables del doble de cotizaciones. Las lecturas incidentales visibles en las capturas no constituyen una aceptación formal de esas integraciones; la [proveniencia registrada](../tif/v2.13/evidence/technical-20261015/e2e/ui/provider-provenance.json) conserva esa distinción.

```sh
export ZARIX_VISUAL_OUTPUT=/tmp/zarix-runtime-20261015/visual-evidence
node scripts/test-isolated-visual.mjs
```

La retoma del 15/10 identificó Google Chrome 146.0.7680.165 y Safari 27.0.1 instalados. La sonda de SafariDriver con permisos existentes devolvió HTTP500, `session not created`, por Remote Automation deshabilitado. No se llamó `--enable` ni se cambió TCC/permisos persistentes. Firefox/Edge no estaban instalados; esas celdas permanecen bloqueadas hasta contar con el navegador/acceso autorizado.

CNF-01 requiere fixture 10 cuentas/5000 movimientos/100 posiciones, 20 sesiones concurrentes, 20 Mbps/50 ms y al menos 100 navegaciones, incluyendo fallas en el denominador; medir arranque frío y proveedor caído por separado. CNF-02 requiere observación mensual real. HTTPS/cifrado de instancia, proveedores sandbox y recuperación Auth/Storage se verifican por evidencia específica. Ninguno de esos requisitos se aprueba por este smoke test.
