# CP3-01 y CP3-02: cotizaciones y frontera TTL

Ejecutado sobre PROOF58321/58322 después del caso en frío: **CP3-01 PASS y CP3-02 PASS con evidencia compuesta tras el fix5281167**, según [cierre posterior](postfix-contracts.json). La [reconciliación anterior con FAIL](reconciled-contracts.json) permanece histórica. El [intento íntegro](attempt-1/verification.json) conserva FAIL: cuatro workers PASS y el último falló sólo al renderizar TSX por falta del global React. Sus nueve aserciones de servicio/fallback ya habían pasado; el [seguimiento SSR offline](ssr-followup.json) completa cuatro aserciones sobre esa misma respuesta capturada con helpers/componentes reales. No se repitieron servicio, HTTP, SQL ni INSERT. Nunca se reasigna PASS a la corrida integral fallida. Se añadieron56FX sintéticas; canonical25, caché y cada FX previa se conservaron. La ejecución original no cambió aplicación, reloj del sistema, usuarios ni tablas financieras; el fix posterior de presentación se identifica por separado.

El servicio `cotizaciones.ts` real se importa con `tsx` y alias del repositorio, contrastado con los bytes Git y el manifiesto CI4 `836fd18…`. `createServiceClientSync` real persiste únicamente `exchange_rates`. Un guard de `fetch` sólo permite el doble HTTP propio57911 y GET/POST de esa tabla en58321; rechaza red externa y redirects. Las claves existentes se leen del archivo privado600 y no se publican. No se envía ninguna solicitud a Next3002: su metadato identifica el entorno, sin atribuir esta fase al build compilado ni a navegador.

CP3-01 fija el reloj del proceso a06Oct2026 12Z: oficial1000, blue1300, MEP1250, CCL1280ARS/USD y BTC60000/ETH2500/USDT1USD. Cada lado compra/venta usa explícitamente la misma tasa sintética para aislar tipos. El proveedor crypto incluye precios ARS positivos explícitos y su timestamp; el servicio no recibe crédito por calcular esos precios. Se contrastan fuente/hora, respuestas HTTP hasheadas y ocho filas FX reales. Crypto carece de campos provider/origin; su fuente se acredita mediante transporte hacia el doble y fixture, sin inventar metadata de producto.

CP3-02 usa cuatro procesos nuevos, sin memoria compartida, con T0 a13/14/15/16Z. Cada proceso obtiene primero1200 del proveedor real de la estrategia (dobleHTTP), persistiendo ocho filas:299s conserva muestra/memoria sin otra llamada ni INSERT;300s y301s solicitan1300 y persisten otras ocho; a300s con ambos proveedores503 obtiene1200/T0 de DB sin INSERT. Este último resultado pasa por `blueFxReference` y el SSR de `BlueFxReferenceDetails` reales: “Cotización guardada”, proveedor nulo y fecha original. Se conserva MAX_AGE86400 separado de TTL300. Date se controla sólo en cada worker; timers, DB y sistema mantienen su reloj real.

Cada T0 es posterior al anterior y a sus muestras. El arnés registra BLOCKED si FX preexistentes alcanzan el primer T0, porque el fallback consulta la muestra global más reciente; no borra ni altera filas para forzarlo. Captura antes/después las25 tablas canónicas y caché mediante texto JSONB de PostgreSQL antes de parsear NUMERIC, además de cada ID/texto exacto de FX originales. Espera56 filas FX nuevas en total; ninguna fila original se modifica. Los errores crudos quedan sólo en archivos privados `.private.log`, fuera del repositorio. No hay reintento automático de una operación.

```sh
ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only \
ZARIX_QUOTE_CONTRACT_WINDOW=proof-exclusive \
node docs/tif/v2.13/evidence/technical-20261015/quote-contracts/run.mjs
```

`node --check` acredita sólo sintaxis. La ejecución y su resultado se publican por separado, sin asignar PASS a proveedores reales, UI, caché Next ni disponibilidad mensual.

El worker actual incorpora React real al entorno de JSX clásico; su secuencia completa no se volvió a ejecutar. La copia `attempt-1/executed-*.mjs` y sus hashes identifican los bytes realmente ejecutados. El fallo de preparación, el resultado de DB y el render offline permanecen separados. Los45asserts de workers y4del seguimiento no son49casos nuevos de la matriz.

Comando del seguimiento ya ejecutado, sin red:

```sh
TSX_TSCONFIG_PATH="$PWD/docs/tif/v2.13/evidence/technical-20261015/quote-contracts/attempt-1/tsx.config.json" \
node --import ./node_modules/tsx/dist/loader.mjs \
  docs/tif/v2.13/evidence/technical-20261015/quote-contracts/ssr-captured.mjs
```

La revisión independiente posterior detectó que el HTML real muestra `04:00:00 UTC` para la muestra original `16:00:00Z`. El atributo `dateTime` y la referencia son correctos, pero las cuatro aserciones iniciales del render omitían esa hora visible. Se retira el PASS completo de CP3-02: el TTL/fallback/DB están probados y la presentación de hora observada queda FAIL. La síntesis previa equivocada se conserva en `reconciled-contracts-before-visible-time-review.json`; no es el resultado aceptado. No se editó el componente ni se atribuye el hallazgo a navegador.

El commit `5281167` modifica únicamente el formato existente con `hour12: false` y agrega una regresión de tarde16Z: antes1FAIL/después1PASS, TypeScript y lintfocal0. El [SSR posterior](ssr-followup-after-fix.json) usa la misma respuesta capturada y fuentes Git de ese commit, muestra16:00UTC y pasa5aserciones, con0HTTP/0SQL/0INSERT. La copia PROOF836/Next3002 sigue sin cambiar; CI5 global y la UI compilada posterior tienen su propia evidencia. El cierre actual es `postfix-contracts.json`; no borra ni transforma los fallos históricos en PASS.
