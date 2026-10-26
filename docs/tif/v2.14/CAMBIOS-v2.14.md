# Cambios v2.14 respecto de v2.13

Documento: `docs/tif/v2.14/ZARIX-Plan-de-Desarrollo-Tecnologico-v2.14.docx`  
Antecedente: `docs/tif/v2.13/ZARIX-Plan-de-Desarrollo-Tecnologico-v2.13.docx`  
Código de referencia: `main` `f43d15849233f426c7f395d2e4f6d6372f575feb` (26/10/2026).  
El modelo financiero de v2.13 no se recalculó.

Las 37 figuras centrales del Word conservan numeración. El diagrama de integraciones se agregó como anexo digital (`docs/tif/diagrams/fig14_integraciones.puml` y `docs/tif/png/fig14_integraciones.png`), sin insertar una figura 38 en el cuerpo.

## Control documental

| Sección | Cambio | PR |
|---|---|---|
| Ficha de seguimiento | Versión 2.14, 26 de octubre de 2026; antecedente v2.13 | control de versión |
| Historial | Fila 26/10/2026 · 2.14 | #15–#19, #21, #23–#25 |
| Registro de revisiones académicas | Sin cambio: filas Pendiente | — |
| Anexo C (seis ítems en blanco) | Sin cambio: req-2, cu-5, ui-3, rob-6, class-6, test-7 siguen Pendiente de validación | — |

## Alcance, actores y glosario

| Sección | Cambio | PR |
|---|---|---|
| A. Resumen ejecutivo | Escenarios Wallet, MCP/REST, PAT y Vault dentro de los cuatro CU | #15–#17, #25 |
| 10.4.1 / 10.4.2 | Alcance: patrimonio líquido, ON/FCI/IOL, frescura por tasa, bandeja, PAT, MCP/REST, Vault; OAuth MCP deshabilitado | #15–#17, #21, #23, #25 |
| 10.4.3 Actores | Canal Wallet; Cliente MCP o REST v1 | #16, #17, #25 |
| 10.4.3 Glosario | Patrimonio líquido/total alineados al dashboard; PAT; bandeja; registro de herramientas; tasa ejecutable | #15, #16, #17, #23, #25 |

## Requerimientos y reglas

| Sección | Cambio | PR |
|---|---|---|
| 10.4.4 RF02 | Frescura por tasa (blue 24 h; oficial/MEP/CCL 96 h con stale); degradación sin 500 | #18, #23 |
| 10.4.4 RF03 | Patrimonio líquido; posiciones fuera del total | #15 |
| 10.4.4 RF05 | Tipo `on`, FCI peso→USD vía MEP, importador IOL, `purchase_date` opcional | #15, #18, #21 |
| 10.4.4 RF09 / RF16 | Vault fail-closed para Telegram/Gemini | #16 |
| 10.4.4 RF10 | Lecturas MCP/REST sobre el mismo catálogo | #17 |
| 10.4.4 RF17 (nuevo) | PAT `zrxp_`, hash SHA-256, permisos, tope 20 | #16 |
| 10.4.4 RF18 (nuevo) | Bandeja Wallet y claim atómico | #16, #25 |
| 10.4.4 RF19 (nuevo) | MCP `/api/mcp` y REST `/api/v1/tools` | #17 |
| 10.4.5 RNF02 | Degradación FX de fin de semana | #23 |
| 10.4.5 RNF03 | Sesión o PAT; secreto no en claro | #16 |
| 10.4.5 RNF08 | Motivo de skip CAFCI sin cuerpo HTTP | #24 |
| 10.4.6 RN01 | Calendario `America/Argentina/Cordoba` en bandeja/cuotas/`get_budget_status` | #25 |
| 10.4.6 RN06 | Claim atómico de bandeja | #25 |
| 10.4.6 RN08 | Tasa ejecutable ≤24 h; visualización por tasa | #23 |
| 10.4.6 RN09 / RN10 | ON factor 100; FCI/MEP; banda 0,5×–2×; IOL sin API en vivo | #15, #21 |

## Casos de uso y prototipos

| Sección | Cambio | PR |
|---|---|---|
| 10.5.1 Navegación | Pendientes; Integraciones; P13 y P14 | #16, #25 |
| 10.5.2 Diagrama de CU | Actores Wallet y MCP/REST, sin quinto óvalo | #16, #17, #25 |
| 10.5.3 CU-001 | A12 Bandeja Wallet; A13 MCP/REST | #16, #17, #25 |
| 10.5.3 CU-002 | A08 PAT; A09 Vault | #16 |
| 10.5.3 CU-003 | A06 lectura MCP/REST; E01 sin 500 | #17, #23 |
| 10.5.3 CU-004 | A05 IOL / ON / FCI | #15, #18, #21 |

## Arquitectura, datos y pruebas

| Sección | Cambio | PR |
|---|---|---|
| 10.5.5 Modelo de datos | `personal_access_tokens`, `pending_inbox_items`, Vault, auditoría; columnas ON/FCI | #15, #16, #25 |
| 10.5.6 Arquitectura | MCP, REST v1, registro de herramientas, PAT, Vault, bandeja | #16, #17, #25 |
| 10.5.6 ADR10–ADR12 | PAT/Vault; bandeja atómica; frescura FX | #16, #17, #23, #25 |
| 10.5.7 / 10.5.9 | Controles y firmas de líquido, PAT, bandeja, MCP | #15–#17, #25 |
| 10.5.10 Trazabilidad | 19 RF | #16, #17, #25 |
| 10.5.12 Pruebas | Corrida 26/10/2026: 2256/2256 en 153 archivos; cobertura V8 2357/3028 sent. (77,84%); PGlite según `test:db` | todos |
| 11.2 Formatos | Planilla financiera v2.13 conservada sin recálculo | — |
| Anexo A | Next.js 15.5.28; migraciones 20261024–20261025; `npm audit` actual sin confirmar | #16, #19, #25 |
| Anexo E | PT13, PT14, ARQ-Componentes-Integraciones | #16, #17, #25 |

## Qué no se modificó

- Capítulos 1–9 de negocio y el modelo financiero (VAN, escenarios, costos de infraestructura).
- Tablas de revisión/firmas y los seis ítems pendientes del checklist de la cátedra.
- Numeración de las 37 figuras centrales.
