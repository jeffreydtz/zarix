# RF02/RF03: referencia de conversión blue

Corrida focalizada confirmada el 13/10/2026 sobre la copia compartida basada en `f3218f97efc4f1a84c8f41a3491952d55c283d60`. Las fuentes exactas del worktree se identifican por SHA256 en `fx-source-manifest.json`; los cambios de esta fase se consolidan posteriormente en la revisión final del responsable. No se aplicaron migraciones ni se alteraron datos, credenciales, producción o preferencias MEP.

## Cambio implementado

- `getDolarQuotes` conserva en cada cotización el adaptador proveedor que realmente respondió y el origen de la muestra. Un fallback DolarApi continúa identificado como DolarApi aun dentro del caché compartido. El respaldo de `exchange_rates` lleva `provider: null` y `origin: persisted`; el nombre de mercado/lado y el cache key no se usan para inferir un proveedor original. El caché en memoria conserva la fecha de fuente y la procedencia de la muestra.
- `AccountWithBalance.blueReference` contiene la muestra exacta `blue.sell` usada por la conversión de esa fila; el agregado deduplica sólo las referencias de cuentas incluidas en totales. Se preservan las fórmulas y los saldos originales.
- `PortfolioSummaryPayload.blueReference` conserva su muestra FX por separado de `valuation_price_source` y de la fecha del precio de cada activo. Se declara el lado efectivamente usado, incluyendo el fallback compra previamente existente cuando corresponde.
- Patrimonio transporta referencias por componente —cuentas y posiciones—, aunque tasa, fecha o procedencia difieran. La UI no toma una tercera cotización del mercado y la atribuye a todo el total. Hero y detalle muestran tipo/lado, `1 USD = ARS ...`, fuente y fecha original en UTC. La etiqueta del respaldo es “Cotización guardada · proveedor original no informado”. Los datos faltantes permanecen explícitos, sin usar la fecha de consulta como fecha de fuente.
- Para EUR/cripto y otros cruces, la etiqueta limita estos metadatos al tramo USD/ARS. No atribuye la referencia blue a la totalidad del cruce. Los snapshots existentes sólo conservan sus cifras, fecha de snapshot y tasa escalar; no guardan proveedor ni fecha FX. No se inventaron esos datos ni se modificó el esquema para agregarlos. La nota visible del hero declara esa limitación histórica.
- El error de simulación tiene ID propio y está asociado al campo mediante `aria-describedby`; el helper de simulación fue incluido en la lista de instrumentación de cobertura seleccionada.

## Resultado y reproducción

Node 22.17.0; Vitest 5.0.3; macOS; runner Node. Datos sintéticos. Los accesos HTTP/DB de estas pruebas son dobles explícitos; las comprobaciones de UI usan SSR o handlers con dobles de hooks. El proveedor que se nombra en el fixture identifica el adaptador ejecutado por ese doble, no una integración externa real.

```sh
npm test -- __tests__/blue-fx-metadata.test.ts __tests__/blue-fx-metadata-components.test.ts __tests__/billing-nonbilling-quote-freshness.test.ts __tests__/financial-services-regression.test.ts __tests__/technical-financial-contracts.test.ts __tests__/investment-retry-boundaries.test.ts __tests__/investment-simulation.test.ts __tests__/investment-simulation-component.test.ts --reporter=json --outputFile=docs/tif/v2.13/evidence/technical-20261013/documented-gaps/fx-metadata-vitest.json
npm run lint
npm run typecheck
```

| Verificación | Estado confirmado | Artefacto y alcance |
|---|---|---|
| 8 archivos Vitest focalizados | PASS, 143/143, exit 0 | `fx-metadata-vitest.json` / `.log`; incluye 11 nuevas pruebas de propagación y fallback, 6 nuevas de renderizado SSR, 27 de simulación y regresiones cercanas. No se suman otra vez al agregado final como casos únicos adicionales. |
| TypeScript | PASS, exit 0 | `fx-metadata-typecheck.log`. |
| Lint | PASS, exit 0 | `fx-metadata-lint.log`. |
| Coherencia de referencia blue con USD100 | PASS focalizado | Cuentas conservan USD100 y calculan ARS130000 con blue1300, aunque MEP1250/oficial1000 difieran. Detalle muestra ARS130000 y esa referencia. |
| Total con muestras distintas | PASS focalizado | Cuentas y posiciones de USD100 cada una, tasas1300/1400, totalARS270000 con dos referencias identificadas. |
| CP3-19 original MEP | BLOCKED por conflicto documental | No existe selector MEP; RN08 prescribe blue. Estas pruebas no cambian su resultado a PASS. |
| CP3-19-RN08-blue integral / CP4-08/09 integral | No acreditados por esta corrida | El reporte E2E aislado debe enlazar ejecución autenticada, aislamiento y estado DB. |
| Cobertura instrumentada | No medida por este comando | La medición y su alcance corresponden a `npm run test:coverage` y la evidencia agregada final. |

La desconexión del executor interrumpió un intento previo de guardar esta captura. Tras reconectar se comprobó el disco: el cambio de etiqueta y los archivos de corrida143 no existían. Se aplicó el cambio y se ejecutaron de nuevo los tres comandos, cada uno con código de salida observado. Sólo esta corrida completada se declara PASS; no se atribuye resultado al intento interrumpido.
