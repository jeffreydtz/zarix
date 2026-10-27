# Cambios v2.14 respecto de v2.13

Documento: `docs/tif/v2.14/ZARIX-Plan-de-Desarrollo-Tecnologico-v2.14.docx`  
Antecedente: `docs/tif/v2.13/ZARIX-Plan-de-Desarrollo-Tecnologico-v2.13.docx`  
Código de referencia del producto: `main` `b7da00bbbffdc2350e6b14ce0888a7453eabbe85` (26/10/2026). La cita de auditoría usa los SHA de las rondas finales: `a86a9f6` (#25) y `b27fad7` (#26).  
El modelo financiero de v2.13 no se recalculó.

Las 37 figuras centrales del Word conservan numeración. El diagrama de integraciones se agregó como anexo digital (`docs/tif/diagrams/fig14_integraciones.puml` y `docs/tif/png/fig14_integraciones.png`), sin insertar una figura 38 en el cuerpo.

Esta nota cubre la entrega inicial (PR #27, sobre `f43d158`), el seguimiento de #26/#16/#17/#25 y la cita de la auditoría de código y pruebas diferenciales contra main de #25 y #26, siempre sobre el mismo archivo v2.14. No existe una v2.15. La revisión de pares interna (Kael), 26/10/2026, se acredita por mensajes del equipo (no es revisión de GitHub ni pentest externo): #25 `a86a9f6` no-HOLD, 112.800 casos; #26 `b27fad7` PASS / no-HOLD (CI 40392284614, Vitest 2424).

## Control documental

| Sección | Cambio | PR |
|---|---|---|
| Ficha de seguimiento | Versión 2.14, 26 de octubre de 2026; antecedente v2.13 | control de versión |
| Historial | Fila 26/10/2026 · 2.14 (incluye #26, la auditoría de código y pruebas diferenciales contra main y la revisión de pares interna (Kael), 26/10/2026; el número de versión no cambia) | #15–#19, #21, #23–#26 |
| Registro de revisiones académicas | Sin cambio: filas Pendiente | — |
| Anexo C (seis ítems en blanco) | Sin cambio: req-2, cu-5, ui-3, rob-6, class-6, test-7 siguen Pendiente de validación | — |

## Alcance, actores y glosario

| Sección | Cambio | PR |
|---|---|---|
| A. Resumen ejecutivo | Escenarios Wallet, MCP/REST, PAT y Vault dentro de los cuatro CU | #15–#17, #25 |
| 10.4.1 / 10.4.2 | Alcance: patrimonio líquido, ON/FCI/IOL, ficha CAFCI ARS/USD, frescura por tasa, bandeja, PAT, MCP/REST, Vault; OAuth MCP deshabilitado | #15–#17, #21, #23, #25, #26 |
| 10.4.3 Actores | Canal Wallet; Cliente MCP o REST v1 | #16, #17, #25 |
| 10.4.3 Glosario | Patrimonio líquido/total alineados al dashboard; PAT; bandeja; registro de herramientas; tasa ejecutable | #15, #16, #17, #23, #25 |

## Requerimientos y reglas

| Sección | Cambio | PR |
|---|---|---|
| 10.4.4 RF02 | Frescura por tasa (blue 24 h; oficial/MEP/CCL 96 h con stale); degradación sin 500 | #18, #23 |
| 10.4.4 RF03 | Patrimonio líquido; posiciones fuera del total | #15 |
| 10.4.4 RF05 | Tipo `on`; cuotaparte desde ficha HTML CAFCI fail-closed; CAS; sin reparar NAV antiguo ni timestamp futuro; salto diario por tipo; ARS/USD; FCI peso→USD vía MEP; IOL de portafolio; panel IOL no persistido; cita de auditoría de código y pruebas diferenciales contra main (ronda 16/16) y de revisión de pares interna (Kael), 26/10/2026 | #15, #18, #21, #26 |
| 10.4.4 RF09 / RF16 | Vault fail-closed para Telegram/Gemini | #16 |
| 10.4.4 RF10 | Lecturas MCP/REST sobre el mismo catálogo | #17 |
| 10.4.4 RF17 (nuevo) | PAT `zrxp_`, hash SHA-256, permisos, tope 20 | #16 |
| 10.4.4 RF18 (nuevo) | Bandeja Wallet, claim atómico y auto-confirmación conservadora (lista permitida de gasto; paridad con `fb63360`); cita de auditoría de código y pruebas diferenciales contra main (ronda 19/19) y de revisión de pares interna (Kael), 26/10/2026 (112.800 casos) | #16, #25 |
| 10.4.4 RF19 (nuevo) | MCP `/api/mcp` y REST `/api/v1/tools` | #17 |
| 10.4.5 RNF02 | Degradación FX de fin de semana | #23 |
| 10.4.5 RNF03 | Sesión o PAT; secreto no en claro; `integration_audit_log` con metadatos redactados; la auditoría de código y pruebas diferenciales contra main y la revisión de pares interna (Kael), 26/10/2026, no son pentest externo ni revisión de GitHub | #16, #17, #25 |
| 10.4.5 RNF08 | Motivo de skip CAFCI sin cuerpo HTTP (`unparseable_ficha`, `daily_jump`, `older_than_stored`, …) | #24, #26 |
| 10.4.6 RN01 | Calendario `America/Argentina/Cordoba` en bandeja/cuotas/`get_budget_status` | #25 |
| 10.4.6 RN06 | Claim atómico de bandeja | #25 |
| 10.4.6 RN08 | Tasa ejecutable ≤24 h; visualización por tasa | #23 |
| 10.4.6 RN09 / RN10 | ON factor 100; ficha CAFCI fail-closed; CAS; salto diario ±8 %/±25 %; FCI/MEP; IOL panel no persistido | #15, #21, #26 |

## Casos de uso y prototipos

| Sección | Cambio | PR |
|---|---|---|
| 10.5.1 Navegación | Pendientes; Integraciones; P13 y P14 (lista permitida de auto-confirmación) | #16, #25 |
| 10.5.2 Diagrama de CU | Actores Wallet y MCP/REST, sin quinto óvalo | #16, #17, #25 |
| 10.5.3 CU-001 | A12 Bandeja Wallet (lista permitida + paridad `fb63360`); A13 MCP/REST | #16, #17, #25 |
| 10.5.3 CU-002 | A08 PAT; A09 Vault | #16 |
| 10.5.3 CU-003 | A06 lectura MCP/REST; E01 sin 500 | #17, #23 |
| 10.5.3 CU-004 | A05 IOL / ON / FCI; ficha HTML CAFCI | #15, #18, #21, #26 |

## Arquitectura, datos y pruebas

| Sección | Cambio | PR |
|---|---|---|
| 10.5.5 Modelo de datos | `personal_access_tokens`, `pending_inbox_items`, Vault, `integration_audit_log`; columnas ON/FCI | #15, #16, #25 |
| 10.5.6 Arquitectura | MCP, REST v1, registro de herramientas, PAT, Vault, bandeja, ficha CAFCI | #16, #17, #25, #26 |
| 10.5.6 ADR10–ADR13 | PAT/Vault; bandeja atómica y auto-confirmación conservadora; frescura FX; cuotaparte CAFCI fail-closed y CAS | #16, #17, #23, #25, #26 |
| 10.5.7 / 10.5.9 | Controles y firmas de líquido, PAT, bandeja, MCP | #15–#17, #25 |
| 10.5.10 Trazabilidad | 19 RF | #16, #17, #25 |
| 10.5.12 Pruebas | Corrida 26/10/2026 sobre `b7da00b`: 2424/2424 en 159 archivos; fila «auditoría de código y pruebas diferenciales contra main» (rondas 19/19 y 16/16; 6.742 escrituras; replays R16 9.252, R17 fresh 11.152 y foco 208) y fila «revisión de pares interna (Kael), 26/10/2026» (112.800 casos; #26 CI 40392284614) | #16, #17, #25, #26 |
| 11.2 Formatos | Planilla financiera v2.13 conservada sin recálculo | — |
| Anexo A | Next.js 15.5.28; migraciones 20261024–20261025; ficha CAFCI; balas de auditoría de código y pruebas diferenciales contra main y de revisión de pares interna (Kael), 26/10/2026 (A.1 y A.7); `npm audit` actual sin confirmar | #16, #19, #25, #26 |
| Anexo E | PT13, PT14, ARQ-Componentes-Integraciones | #16, #17, #25 |

## Qué no se modificó

- Capítulos 1–9 de negocio y el modelo financiero (VAN, escenarios, costos de infraestructura). Cheerio/parse5 es dependencia de biblioteca, no una partida de infraestructura.
- Tablas de revisión/firmas y los seis ítems pendientes del checklist de la cátedra.
- Numeración de las 37 figuras centrales.
