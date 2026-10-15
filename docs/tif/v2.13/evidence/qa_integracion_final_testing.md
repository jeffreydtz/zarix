# QA de integración final — testing, clases y anexos

Render revisado: `tmp/revision/docx_render_final`, versión definitiva de 198 páginas. Se inspeccionaron visualmente **todas las páginas 150–198 inclusive: 49 PNG**, con `view_image` y detalle `original`. Esta revisión no modificó fuentes, código ni builder.

Resultado: **aprobado visualmente para este tramo**. No se detectaron cortes de contenido, solapamientos de texto, filas partidas que pierdan información ni defectos materiales de integración. Encabezados, pies y numeración visibles y continuos en las 49 páginas.

| Páginas | Verificación | Resultado |
|---|---|---|
| 150 | Figura 85 de simulación: precio hipotético; factor 100 para bonos / 1 para el resto; división por factor y ausencia de escritura | Fórmula completa, legible y consistente con VN 100 |
| 151–157 | Responsabilidades, firmas y DTO; destino autoritativo de transferencia; tablas y cajas de datos | Contenido completo; los identificadores largos se ajustan dentro de las celdas |
| 158–163 | Clases de los cuatro CU; análisis determinista en p162; inversión/venta y comienzo de trazabilidad | La frontera de análisis depende por separado de funciones puras y de SupabaseClient; no hay dependencia de heurísticas a DB |
| 163–165 | Transiciones de tablas de trazabilidad y catálogo de vistas | Encabezados repetidos, filas completas, referencias a cuatro familias conservadas |
| 165–168 | Evidencia, contratos monetarios y firma real del calendario | SHA de código verificado y límites de evidencia explícitos; texto íntegro entre páginas |
| 169–170 | Figuras 96 y 97: CFG Guardas / Frecuencia | Ambas vistas impresas; S0, S1–S12, SF y ST visibles. Continuación S6 no / S7 no → S8 coherente. Tipografía legible; medidas previas de las fuentes: 9,568 / 9,642 pt |
| 170–173 | Particiones del calendario, SQL, P&L y comienzo del coordinador | Tablas completas, encabezados repetidos y resultados numéricos conservados |
| 174–178 | Offline, RF11, matriz RF01–16/RNF01–08 y cobertura | RF05 en p175 dice que RPC real de venta y proveedores requieren ejecución y evidencia propias. RNF06–08 presentes en p177 y pendientes identificados. No se atribuye aceptación UI a pruebas de helpers |
| 179–180 | Protocolo reproducible y checklist test-0–7 | Criterio de ramas instrumentadas; test-7 refiere RF01–16/RNF01–08 y exactamente cuatro CU; aceptación integral pendiente visible |
| 181–186 | Bibliografía y anexos A/B | Tablas sin pérdidas; lista de cobertura en p185 contiene 15 archivos, incluido `lib/offline-queue-sync.ts`; SHA y manifiesto completos |
| 187–192 | Los 59 criterios de la cátedra | Tablas legibles y completas; cierres de RRR/PDR/CDR y test-7 siguen pendientes de validación real |
| 192–198 | Prosa y figuras de patrones | Referencia RNF06 corregida en p193; etiquetas normaliza JSON separadas en p195; nota StrategyAdapter íntegra en p197; TemplateMethod completo en p198 |

Cifras verificadas en su integración impresa: **304/304 Vitest en 32 archivos**, **39/39 SQL aislados** (28 + 11); CSV **273 registros = 149 diseñados + 124 ejecutados seleccionados**, sin sumar estos últimos de nuevo a la suite general. Cobertura del conjunto configurado: **659/1081 sentencias (60,96 %), 549/973 ramas (56,42 %), 71/112 funciones (63,39 %) y 601/958 líneas (62,73 %)**. Calendario 37/37 y 30/30; offline 12/12 y 2/2. La versión de código impresa es `98250f5dfb83bb88eeed241f80807a5770e4caaf`.

Observación de composición sin pérdida de contenido: p180 cierra la tabla del checklist con una fila; p182 y p194 tienen poca prosa antes del inicio de un anexo o de las páginas de figuras. Son espacios de paginación y no afectan la lectura ni la evidencia.

Quedan cerrados en esta versión los hallazgos visuales anteriores de simulación sin factor, dependencia incorrecta de heurísticas, CFG demasiado pequeño/sin IDs, atribución excesiva en RF05, archivo offline ausente de la lista de cobertura y desborde de la nota StrategyAdapter. Esta aprobación visual no sustituye las aceptaciones de producto y despliegue que el propio documento mantiene pendientes.
