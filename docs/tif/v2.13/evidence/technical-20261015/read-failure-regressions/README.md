# Lecturas financieras fallidas, sesión y límite de caché

Regresiones locales con dobles explícitos de servicios/SDK/proveedores, ejecutadas con Node22.17 y Vitest5. No son una repetición de la carga de navegador, una integración Auth real ni una medición de disponibilidad/capacidad. Los resultados adversos de LOAD se conservan por separado.

`before.json` reproduce once fallos entre35pruebas: siete lecturas financieras fallidas mostraban datos vacíos/parciales, las cotizaciones fallidas fabricaban ceros, se absorbía un redirect del framework y dos contratos fallaban exactamente a300s. `after-dashboard-ttl.json` conserva35/35PASS. Una sesión ausente sigue redirigiendo al login; un fallo de datos muestra indisponibilidad y un enlace de reintento, sin total financiero ni snapshot nuevo.

`before-auth-session.json` conserva4fallos/8pruebas de errores de consulta Auth convertidos en sesión ausente. `before-auth-upstream.json` conserva5fallos/7pruebas de middleware/API. El helper compartido sólo clasifica401/403 y400con códigos de credencial conocidos como rechazo de sesión; timeout408, límite429, endpoint404 y errores desconocidos/servidor permanecen indisponibles. Los tests posteriores incluyen esos bordes. No se concede acceso a un handler financiero cuando Auth no puede verificar la sesión.

`before-auth-cookie-rotation.json` conserva el fallo de perder cookies que el SDK ya había rotado antes de una respuesta de timeout. La respuesta503 ahora conserva esas cookies y las cabeceras de reintento/no-cache. Los valores son constantes sintéticas de prueba, sin JWT ni credenciales existentes.

`before-account-fx.json` conserva2fallos/14pruebas: una conversión EUR primaria/secundaria indisponible producía cero y un total incompleto. Ahora falla la lectura en lugar de inventar esa valoración; el casoEUR100×1.1USD×1300ARS conserva110USD/143000ARS. La política de paridad de stablecoins ya existente no se modifica.

La regresión de snapshot/presupuesto está en [financial-services.md](financial-services.md): una lectura incompleta no se guarda como patrimonio diario, una RPC de presupuesto fallida no se presenta como gasto0 y el presupuesto sin categoría conserva su gasto real devuelto por la RPC vigente. Su commit y el antes/después se documentan allí.

La última corrida focal `final-focused.json` contiene74/74PASS en seis archivos; incluye31pruebas preexistentes y43nuevas. Las corridas intermedias se solapan y no se suman. La cobertura configurada/global y los gates completos se informan exclusivamente en `../core-reliability/` cuando se ejecuten. La revisión independiente de dashboard/Auth/TTL/FX está en `../review/e2e-read-failure-review.json`; su alcance y hashes son propios.

Comando final ejecutado desde la raíz:

```sh
TZ=Etc/UTC node_modules/.bin/vitest run \
  __tests__/auth-upstream-failures.test.ts \
  __tests__/auth-session-failures.test.ts \
  __tests__/dashboard-read-failures.test.ts \
  __tests__/billing-nonbilling-quote-freshness.test.ts \
  __tests__/blue-fx-metadata.test.ts \
  __tests__/financial-read-errors.test.ts \
  --reporter=json \
  --outputFile=docs/tif/v2.13/evidence/technical-20261015/read-failure-regressions/final-focused.json
```

Los JSON guardan los nombres de las aserciones, tiempos y diferencias observadas. No sustituyen los contratos originales de UI ni se promueven por parecido a otros casos. CP3-02 requiere además conciliar su contrato completo de cotización anterior con la etiqueta de origen persistido; el caso de no-caché/EUR de una UI real conserva su verificación independiente pendiente.
