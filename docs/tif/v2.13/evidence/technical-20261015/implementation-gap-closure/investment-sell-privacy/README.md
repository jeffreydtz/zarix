# Privacidad de errores de venta y lectura de ventas

Se quitaron únicamente los argumentos de excepción de los dos `console.error` en `app/api/investments/[id]/sell/route.ts`. Cada catch conserva su etiqueta fija y entrega el mismo error a `errorResponse`. No cambian Auth, dueño, parámetros, llamadas a servicios, status ni cuerpo público.

La fase inicial de dos casos POST falló **0 PASS / 2 FAIL** y se conserva en `before.json`. Antes de editar el producto se agregó el caso GET: `before-with-read.json` registra **0 PASS / 3 FAIL**. Las mismas tres pruebas finales pasan **3/3** después del cambio. No se suman las dos fases como cinco pruebas únicas. Typecheck y lint de los dos archivos tocados terminaron con código 0, sin advertencias.

Las pruebas invocan las rutas y `errorResponse` reales con Auth y servicios de inversiones reemplazados por dobles explícitos. El rechazo de venta conocido conserva `400` y su mensaje público; las fallas desconocidas de venta y lectura conservan `500` genérico. La lectura llama sólo a `listSales` con dueño/posición correctos; no ejecuta una venta. Cada dispatch se verifica una vez y `fetch` está prohibido y no se utiliza.

La captura usa `formatWithOptions({showHidden:true,depth:8}, ...call)`, incluyendo propiedades no enumerables de `Error`: message, stack, cause y request. Los señuelos sintéticos de secreto y texto no aparecen en esa salida. Esto no reinterpreta la captura histórica Native730 mediante `JSON.stringify`, que conserva su límite original.

[verification.json](verification.json) contiene resultados, comandos y límites; [manifest.json](manifest.json) fija fuentes y artefactos. `before-sources/`, `before-read-sources/` y `after-sources/` preservan cada fase; sus snapshots de pruebas usan `.test-source.ts` y no duplican tests globales.

No se ejecutaron Auth, DB, Telegram, Mercado Pago ni navegador reales; esta prueba no demuestra un rollback PostgreSQL ni una interacción UI. No cambia la matriz ni acredita el delta con un gate o build anterior.

```sh
node node_modules/vitest/vitest.mjs run __tests__/investment-sell-log-privacy.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next lint \
  --file 'app/api/investments/[id]/sell/route.ts' \
  --file __tests__/investment-sell-log-privacy.test.ts
```
