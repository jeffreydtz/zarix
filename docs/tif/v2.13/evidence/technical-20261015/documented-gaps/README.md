# Cierre focalizado de metadatos FX y lecturas completas

Reanudación autorizada del 15/10/2026 sobre `d4524d8a79fabd5e44112345897a6350dc4d0805` más los cambios de esta fase. `manifest.json` conserva comandos, resultados y SHA256 de 22 fuentes/tests/configuración antes y después de la corrida. El commit que contiene esta evidencia identifica la revisión publicable de este paso; los controles globales y la aceptación E2E corresponden al cierre del responsable.

## Alcance implementado

1. RF02/RF03: cada cálculo transporta su muestra blue —tipo, lado, tasa, fecha y proveedor conocido— sin atribuir al total una referencia universal. Cuentas y posiciones conservan referencias separadas. El respaldo persistido no permite reconstruir su proveedor original; la UI muestra “Cotización guardada · proveedor original no informado”. Las cotizaciones de activos y el tramo FX son referencias distintas. Los históricos no recibieron fuente o fecha FX ficticias. Ver [evidencia anterior de propagación](../../technical-20261013/documented-gaps/FX-metadata.md).
2. CU004: el error de simulación queda asociado al campo con `aria-describedby`. La simulación original fue versionada en `856fdf52f25604eeb741ad19ecea7455daa68557`; se conserva el cálculo local sin escrituras.
3. CU003/carga: `getMonthSummary`, las lecturas MTD/trailing/reglas de `getMonthFlow` y los cuatro agregados analíticos leen páginas de 1000 filas, conforme al `max_rows=1000` confirmado en source/restore/load. Cada página usa un builder nuevo y conserva propietario, fechas, tipos y selección de cuentas. El orden es fecha/ID para movimientos e ID para reglas. Una página fallida rechaza toda la lectura antes de calcular o devolver un total parcial. Se conservan las fórmulas, cruces y calendario existentes.
4. Análisis financiero: un agregado fallido muestra indisponibilidad y reintento con el período conservado. No convierte el fallo en cero, no muestra gráficos parciales y no lo trata como un error de login. Un período legítimamente vacío conserva el estado normal. `getTopExpenses` sigue limitado por el RPC existente a 100; sus errores de RPC e hidratación ahora se propagan para activar el mismo estado de indisponibilidad.

El listado de movimientos acotado de UI no se amplió. No se cambiaron RPC, migraciones, permisos, proveedores, preferencias MEP ni datos de las instancias. Los tests de reconstrucción sólo ejecutan un UPDATE doble; no se invocó ese método contra una base real.

## Reproducciones preservadas

Los JSON/logs previos están en [documented-gaps del 13–14/10](../../technical-20261013/documented-gaps/README.md). No se reemplazan por éxitos posteriores.

| Reproducción | Resultado observado antes del cambio |
|---|---|
| `pagination-financial-before.json` | 3 FAIL: resumen truncado a 1000 frente a 1505 filas esperadas; gasto MTD 2000 frente a 3010; reconstrucción serial 8002 frente a 6990. |
| `pagination-analytics-before.json` | 8 FAIL / 2 PASS: agregados truncados y fallos de segunda página no propagados. |
| `pagination-analysis-page-before.json` | 1 FAIL / 2 PASS: lectura fallida presentada como período vacío. |
| `pagination-top-expenses-before.json` | 2 FAIL / 1 PASS, 10 pruebas no seleccionadas: errores de RPC/hidratación ocultos como listas vacías. |
| `pagination-final-vitest.json` | 96/96 PASS confirmados al recuperar el archivo tras la pausa. Incluye regresiones cercanas y la reconstrucción **serial** anterior; no prueba concurrencia. |

El fixture financiero final coloca el señuelo futuro el 2/11, lejos del límite de mes del calendario local preservado. No se cambió la política de fechas del servicio. El oráculo de analytics usa gastos ARS131500, ingresos ARS500 y balance −ARS131000, con conversión USD→ARS sintética1300. Las pruebas de metadatos FX conservan MEP/oficial distintos sin usarlos como referencia patrimonial. Los fixtures incluyen IDs con fechas empatadas, otro propietario, cuentas archivadas, filas fuera del período, transferencias y ajustes según la selección previa de cada método.

## Corrida focalizada de esta reanudación

Node 22.17.0, Vitest 5.0.3, macOS, runner Node. Datos sintéticos; HTTP/DB/Auth y hooks son dobles explícitos, y el render de las páginas usa SSR. No hay navegador ni integración externa real en esta corrida.

```sh
npm test -- __tests__/blue-fx-metadata.test.ts __tests__/blue-fx-metadata-components.test.ts __tests__/financial-summary-pagination.test.ts __tests__/analytics-pagination.test.ts __tests__/analysis-page-read-failure.test.ts __tests__/investment-simulation-component.test.ts --reporter=json --outputFile=docs/tif/v2.13/evidence/technical-20261015/documented-gaps/focused-vitest.json
npm run typecheck
npm run lint
```

| Comprobación | Estado | Evidencia |
|---|---|---|
| Seis archivos focalizados | PASS, 55/55, exit 0 | `focused-vitest.json`, `focused-vitest.log`. |
| TypeScript | PASS, exit 0 | `typecheck.log`. |
| Lint | PASS, exit 0 | `lint.log`. |
| Estabilidad de las 22 fuentes seleccionadas | Comparación registrada | `sources-before.json`, `manifest.json`; no se atribuye estabilidad a otros archivos del workspace compartido. |

Las 55 pruebas se solapan con las corridas históricas; no se suman como 55 casos únicos nuevos al agregado final. La cobertura no se midió en este comando. `vitest.config.ts` incorpora los módulos de paginación/analytics/month-flow y el helper de simulación a la instrumentación seleccionada; la medición global debe declarar su nuevo alcance.

## Límite de esta corrida y corrección posterior

**Las 55 pruebas de esta fase incluyeron una reconstrucción transitoria en cliente vulnerable a concurrencia.** Paginar el ledger no creó un snapshot y su UPDATE posterior podía pisar un ingreso concurrente. Los tres casos seriales y estos resultados históricos no aprobaron esa garantía. La [corrección posterior de conciliación atómica](../account-recompute/README.md) reemplazó ese método por una RPC bajo bloqueo de cuenta y documenta 18 comprobaciones SQL y 7 grupos nativos con conexiones independientes, además del ajuste estrecho de precisión. Sus fuentes/hashes y resultados pertenecen a esa evidencia separada; no se reasignan a estas 55 pruebas.

La paginación analítica por rangos tampoco se declara snapshot transaccional bajo mutaciones concurrentes. La aceptación API/carga con 5000 movimientos y contraste SQL completo sigue perteneciendo a su reporte aislado. CP3-19 original permanece BLOCKED por la contradicción MEP/RN08; las comprobaciones derivadas blue no lo convierten en PASS. Ningún resultado de este directorio acredita CNF-02 mensual, proveedores reales, cifrado/HTTPS, restauración integral o compatibilidad de navegadores.
