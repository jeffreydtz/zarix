# Brechas documentadas CU004 A04 y coherencia FX

Revisión de alcance del 13/10/2026 sobre base `b40feeed28d6e9ea6e8b0b2f112119e2435de1df`, rama `codex/tfi-v2-13-consistencia`. El manifiesto de fuentes de esta corrida está en `source-manifest.json`; el commit del cambio lo identifica el historial de Git. No se cambiaron producción, credenciales ni proveedores.

## Decisión de alcance previa al cambio

La simulación está prevista en `plan.md`: RN10 (línea 751), CU004/A04 (875–892), política Premium (301/646) y `diagramas/SEC-CU004-Simulacion-Detalle.mmd`. CP4-08/09 especifican comparación, límites y ausencia de escritura. La UI anterior no ofrecía ese recorrido. Completarlo no incorpora custodia, ejecución de órdenes, FX nuevo, proveedores ni persistencia de escenarios.

`InvestmentSimulationPanel` usa una copia del precio, moneda, fuente y fecha recibidos en el portafolio autenticado. La página resuelve Premium con el estado existente y `effectivePlan`; el panel permanece visible y deshabilitado al bajar a Free, sin ocultar el historial. El helper puro calcula `precio × (1 + variación / 100)` y `cantidad × precio / factor`; factor 100 para bonos, 1 para los demás tipos. No convierte monedas. La presentación redondea a dos decimales y el cálculo conserva precisión `number`. Una referencia faltante/invalidada no se transforma en un precio cero. Se acepta −100%; se rechazan menores de −100%, entradas no finitas y resultados que desborden el rango numérico.

## Pruebas focalizadas

Entorno: Node 22.17.0, Vitest 5.0.3, macOS, runner Node. Fixtures sintéticos; los tests del formulario ejecutan sus handlers reales con dobles de hooks, sin navegador ni SDK de datos.

```sh
npm test -- __tests__/investment-simulation.test.ts __tests__/investment-simulation-component.test.ts --reporter=json --outputFile=docs/tif/v2.13/evidence/technical-20261013/documented-gaps/simulation-vitest.json
npm run typecheck
npm run lint
```

| Comprobación | Resultado | Evidencia/alcance |
|---|---|---|
| Helper y handlers del formulario | PASS, 27/27 | `simulation-vitest.json`, `simulation-vitest.log`; 660→726 USD, −100→0, límites, factor VN100, referencia inmutable, identificador ausente, Free y privacidad. |
| TypeScript | PASS, exit 0 | `typecheck.log`; workspace compartido de esta revisión. |
| Lint | PASS, exit 0 | `lint.log`; workspace compartido de esta revisión. |
| Ausencia de peticiones de simulación | PASS focalizado | Los handlers simular/cerrar/rechazar no llaman `fetch`; esto no sustituye el hash de DB autenticado. |
| CP4-08/09 integrales UI/API/DB | Pendientes en esta evidencia focalizada | Deben enlazarse con el reporte E2E aislado de la revisión; estos 27 tests no los convierten por sí solos en PASS. |

No se atribuye cobertura general de la aplicación a estos tests. La medición agregada corresponde al conjunto instrumentado declarado por `vitest.config.ts` y al reporte final de la revisión.

## CP3-19: contradicción que se conserva explícita

El CSV original, línea 122, exige una política MEP seleccionable: USD100 × MEP1250 = ARS125000. RF02 exige mostrar MEP junto con las demás cotizaciones; RF03 exige poder reconstruir las conversiones. RN08, línea 745, fija expresamente USD→ARS a blue venta. `cotizacionesService.getExchangeRate(from,to)` no recibe una política MEP, las preferencias sólo ofrecen moneda ARS/USD y no existe un selector patrimonial MEP.

El contrato implementado y el ER coinciden en blue: `accounts.ts` obtiene la tasa USD→ARS y calcula `balance_ars_blue`; `net-worth.ts`/el esquema de snapshots conservan `total_ars_blue` y `blue_ars_per_usd`; `NetWorthHero` y `AccountBalanceEquivalents` rotulan blue. No se añadió una configuración MEP ni se cambió silenciosamente CP3-19. Su requisito original continúa **BLOCKED por resolución documental**, salvo que el reporte E2E documente una ejecución fallida de ese contrato original.

Caso derivado separado diseñado: **CP3-19-RN08-blue**. U1, cuenta USD100, sin posiciones; blue venta1300, MEP1250, oficial1000, con referencias sintéticas fechadas. Esperado: cuenta, agregado, patrimonio, snapshot, dashboard y detalle ARS130000 / USD100; MEP visible1250 sin afectar el patrimonio. Conservar saldos originales e aislamiento U2. Este caso debe reportar su propia ejecución y nunca otorgar PASS al original MEP.

La auditoría read-only detectó además que DTO/pantallas de patrimonio y detalle no exhiben todos los metadatos de conversión: `AccountWithBalance` sólo aporta equivalentes, `NetWorthNow` aporta `blueRate` sin proveedor/fecha y el hero no presenta esa tasa. Es una brecha RF02/RF03 que no se cierra con la comparación numérica blue ni con la simulación. Se informó al responsable de la revisión para su corrección o registro explícito en la matriz final.

Actualización posterior de la misma revisión: esa brecha de metadatos fue corregida y recibió prueba focalizada; ver [propagación FX, límites históricos y corrida final](FX-metadata.md). Se conserva el conflicto MEP del caso original y la separación entre pruebas con dobles/SSR y aceptación autenticada integral.

La [reanudación focalizada del 15/10](../../technical-20261015/documented-gaps/README.md) conserva esta evidencia e incorpora lecturas completas frente a `max_rows=1000`, propagación de errores en análisis y el límite pendiente de concurrencia de la reconstrucción serial. Sus resultados no sustituyen la corrida global ni el E2E del responsable.
