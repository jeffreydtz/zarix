# 0007 — Patrimonio real vs IPC/MEP/CCL y benchmarks sin asesorar

- **Estado:** Aceptada
- **Fecha:** 2026-11-10

## Contexto

Zarix ya muestra "ARS reales" (deflactor INDEC) y cotizaciones blue/MEP/CCL, más
snapshots diarios de patrimonio líquido y de portafolio. Falta una vista de
**rendimiento por período** (mes, trimestre, año, desde el inicio) comparada
contra inflación, dólar MEP/CCL y un conjunto chico de benchmarks argentinos
(plazo fijo, caución, FCI money market).

Una comparación que **sugiera** instrumentos o un rebalanceo puede leerse como
asesoramiento regulado por la CNV. Tampoco hay una serie pública estable de
caución ni un índice único de money market.

## Decisión

- Calcular rendimiento nominal y real a partir de snapshots ya persistidos.
  Inflación: INDEC vía argentinadatos.com. MEP/CCL: `exchange_rates` + cotización
  viva, siempre con fuente y fecha.
- Plazo fijo: intentar la API pública de argentinadatos; si no hay TNA usable,
  `BENCHMARK_PLAZO_FIJO_TNA` o un TNA que carga el usuario.
- Caución y FCI money market: **no inventar**. Quedan "no disponible" hasta un
  TNA/ticker configurado (`user_benchmark_settings` o env). El NAV de CAFCI se
  muestra con fuente/fecha; no se extrapola el cambio diario al período.
- TNA se aplica como interés simple (`TNA × días / 365`), etiquetado como tal.
- Copy explícito: información comparativa, no recomendación ni rebalanceo.

## Consecuencias

- La UI siempre muestra fuente y fecha, o el motivo de "no disponible".
- Hace falta la migración `20261110140000_user_benchmark_settings.sql` (no
  aplicarla desde un preview que comparte el Supabase de producción).
- Variables opcionales: `BENCHMARK_PLAZO_FIJO_TNA`, `BENCHMARK_CAUCION_TNA`,
  `BENCHMARK_FCI_MM_TICKER`.
