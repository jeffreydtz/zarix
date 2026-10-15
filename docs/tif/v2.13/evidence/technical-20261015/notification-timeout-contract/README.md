# CP1-27: aceptación del proveedor y confirmación perdida

Prueba adicional posterior a CI6, ejecutada con Node22.17.0 y Vitest5.0.3: **1 prueba, 31 aserciones PASS**, sin modificar producto ni la suite general de913 pruebas. Revisión de producto: `84df929ab2f169251a49f3e95d0e0c148dfcb87c`; los35 archivos de fuentes y del arnés conservaron sus hashes antes/después.

Se creó una base PGlite persistida nueva usando la plataforma sintética y las migraciones reales. La regla diaria propia parte del1Oct con última ejecución5Oct; la ocurrencia6Oct crea un gasto1000, saldo9000, marca6Oct, un recibo durable y una intención de aviso. El worker real `deliverNotificationOutbox` usa SQL real mediante un adaptador de consultas que sustituye PostgREST; los roles/Auth de esta prueba son sintéticos. Sólo `sendTelegramDm` está sustituido por un doble. No se llamó a Native, GoTrue, Next, navegador o Telegram, ni se cargaron credenciales externas.

El primer doble registra aceptación y después arroja inmediatamente una excepción de timeout sintética, representando pérdida del acuse. El worker conserva la intención sin confirmar y registra `Entrega no confirmada`. La base se cierra y reabre físicamente; repetir la misma solicitud recupera el mismo recibo sin cambio en las filas financieras. Se adelanta únicamente `available_at` del evento nuevo a `now()−1 segundo` para ejercitar el reintento sin esperar60segundos; no se cambia la política del worker. El segundo envío se acepta y confirma.

El doble observó dos aceptaciones de igual mensaje, una posibilidad de duplicación física tras un acuse perdido. La aplicación no puede inferir si Telegram entregó el primer aviso, ni garantiza entrega física exactly-once o conciliación automática. El movimiento económico se conserva único e idéntico antes/después; no se revierte ni vuelve a crear. El último dispatch no encuentra más avisos pendientes. La base temporal propia se cerró y eliminó al terminar; las observaciones sintéticas quedan en `verification.json`.

Comando reproducible desde la raíz, con Node22 compatible:

```sh
node node_modules/vitest/vitest.mjs run --config docs/tif/v2.13/evidence/technical-20261015/notification-timeout-contract/provider-timeout.vitest.config.mjs --reporter=json --outputFile=docs/tif/v2.13/evidence/technical-20261015/notification-timeout-contract/vitest-result.json
```

El archivo termina en `.test-source.ts` y la configuración lo incluye de forma explícita; no se suma al descubrimiento global `**/*.test.ts`. `execution.json` conserva el comando exacto ejecutado y el manifiesto de fuentes, `vitest-result.json` el resultado del runner y `verification.json` los valores persistidos, las31 aserciones y el registro del proveedor doble.
