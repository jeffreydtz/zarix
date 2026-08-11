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
ADR sobre CI en 0006 y §11.1 de la guía).

## Consecuencias

- Se concentra el esfuerzo donde un bug cuesta dinero real, aceptando
  conscientemente **menor cobertura de UI**.
- La lógica monetaria se escribe como funciones puras para que sea testeable
  sin base ni red (refuerza el diseño, no sólo la cobertura).
- Es una postura **defendible en la defensa del TIF**: no es "faltan tests" sino
  "los tests están donde está el riesgo", coherente con un equipo unipersonal.
- Debilidad honesta y asumida: la cobertura E2E es limitada; se documenta como
  siguiente paso en lugar de simularla.
