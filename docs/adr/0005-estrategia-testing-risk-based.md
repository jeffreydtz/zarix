# 0005 — Estrategia de testing basada en riesgo

- **Estado:** Aceptada
- **Fecha:** 2026-08-11

## Contexto

Zarix es una app financiera: el riesgo más caro no es un botón mal alineado sino
un **error de aritmética monetaria** (saldos incorrectos, waterfall de pagos
bimoneda mal calculado, settlements de gastos compartidos que no cierran,
oversell de una inversión). El proyecto es **unipersonal**: mantener una
pirámide de tests completa (mucho unit + mucho integración + mucho E2E) tiene un
costo de mantenimiento que competiría con el desarrollo de producto. El TIF
impreso declaraba el testing como "planificado" (Jest+RTL+Playwright) con sólo
un smoke manual (`npm run test:bot`).

## Decisión

Adoptar una estrategia de testing **basada en riesgo**, no una pirámide completa:

1. **Unit-first sobre la lógica monetaria pura** (Vitest): funciones
   deterministas y sin I/O donde vive el dinero — cálculo de saldos, waterfall
   multi-moneda, `computeSettlements` de gastos compartidos, conversiones,
   parsing de import/export. Es el mayor retorno por test.
2. **Integración selectiva** de las rutas de mayor riesgo (auth, webhook de
   Mercado Pago, endpoints de cron, venta atómica de inversiones), no de todas.
3. **E2E acotado** a los flujos críticos; el grueso de E2E (Playwright) queda
   como trabajo futuro explícito, no como deuda oculta.

Los tests corren con `npm test` y se ejecutan en CI en cada push/PR (ver
`.github/workflows/ci.yml` y §11.1 de la guía).

## Consecuencias

- Se concentra el esfuerzo donde un bug cuesta dinero real, aceptando
  conscientemente **menor cobertura de UI**.
- La lógica monetaria se escribe como funciones puras para que sea testeable
  sin base ni red (refuerza el diseño, no sólo la cobertura).
- Es una postura **defendible en la defensa del TIF**: no es "faltan tests" sino
  "los tests están donde está el riesgo", coherente con un equipo unipersonal.
- Debilidad honesta y asumida: la cobertura E2E es limitada; se documenta como
  siguiente paso en lugar de simularla.


## Evolución — 2026-09-14

Se mantiene la decisión basada en riesgo y se actualiza Vitest a 4.1.11. La suite incorpora aislamiento de usuarios en caché/cola offline con IndexedDB simulado, errores de sincronización, privacidad en renderizado SSR, vinculación Telegram, identidad firmada de Mercado Pago, CSV, límites de XLSX y contratos/fallbacks de mercados. Los dobles de proveedores evitan operaciones sobre datos reales. Las pruebas no certifican configuración de producción ni reemplazan una prueba de pagos end-to-end.

CI usa Node.js 22 y ejecuta lint, typecheck, tests, build y `npm audit --audit-level=high`. Los resultados fechados y su alcance se documentan en la [adenda académica](../tif/ADENDA-AUDITORIA-2026-09-14.md) y el [informe de auditoría](../AUDITORIA-2026-09-14.md); no se reescribe la evidencia histórica.
