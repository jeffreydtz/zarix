# ZARIX v2.13 — Guía breve de defensa

Esta guía prepara una exposición de 12 minutos. No acredita aprobación académica ni una demostración autenticada ejecutada. Usar datos sintéticos, cotizaciones fijas identificadas y fixtures independientes; restaurar el estado inicial antes de cada ejemplo. Los resultados esperados son oráculos de comparación, no resultados obtenidos de una pantalla que aún no se haya probado.

## Guion de 12 minutos

| Tiempo | Mostrar y explicar |
|---|---|
| 0:00–1:00 | Problema y segmento: una persona argentina combina cuentas, monedas y registros. ZARIX busca reducir el esfuerzo de registrar y reconstruir patrimonio conservando moneda, tasa y fecha. La población con cuentas del BCRA aporta contexto; no demuestra intención de compra. |
| 1:00–2:00 | Alcance: exactamente CU-001 movimientos; CU-002 cuentas y datos personales; CU-003 situación financiera; CU-004 portafolio. Telegram, OCR, importación, recurrentes y compartidos son variantes; no nuevos CU. Mostrar mapa de trazabilidad hasta requisitos, diagramas y pruebas. |
| 2:00–4:00 | CU-001: registrar un gasto y explicar edición/transferencia. Mostrar saldo anterior, importe, fecha, categoría, confirmación y estado esperado. La corrección de una operación revierte el efecto anterior y aplica el nuevo; no acumula otro débito. Compartidos guarda gasto y reparto de forma atómica. |
| 4:00–5:00 | CU-002: cuenta propia, historial y exportación. Explicar que exportar es parte de la portabilidad y permanece en Free. Identidad, propiedad de datos y preferencias atraviesan los otros objetivos. |
| 5:00–6:30 | CU-003: consolidación en ARS/USD con tasa fija visible. Mostrar cómo se conserva el importe original. Distinguir efectivo, deuda y posiciones; una tasa faltante exige aviso. Las proyecciones actuales trabajan sobre efectivo ARS y meses completos; no prometen patrimonio futuro. |
| 6:30–8:00 | CU-004: costo, valor, resultado realizado y no realizado. La aplicación registra una compra/venta efectuada fuera de ZARIX; no ejecuta órdenes ni mueve automáticamente caja. Mostrar ejemplo de compra o venta con cotización sintética y origen identificado. |
| 8:00–10:00 | Negocio y planilla: Free/Premium, hipótesis de USD 7,50/mes; M0 más 24 meses; tres escenarios. En base: aporte total USD 1.300, repago de caja M14 y VAN de caja USD 6.385,45. Al valorar tiempo fundador, VAN económico −USD 4.155,93 y sin repago económico. Explicar qué tendría que validarse para lanzar. |
| 10:00–11:30 | Evidencia: 304 pruebas locales y 39 comprobaciones SQL, con alcance delimitado; compilación y controles estáticos aprobados. Mostrar cobertura del calendario y un reporte. Checklist: 51 preparados, dos verificados en unidad acotada, seis pendientes. |
| 11:30–12:00 | Cierre: cuatro objetivos trazables, errores relevantes corregidos y modelo reproducible. Señalar pendientes reales: aceptación autenticada, integraciones, permisos remotos, migraciones y conformidad docente. |

Frase de apertura sugerida: «ZARIX integra registros cotidianos y seguimiento patrimonial para una persona que utiliza varias cuentas y monedas. El proyecto organiza esa necesidad en cuatro objetivos y permite explicar cada cálculo, su fuente y sus límites».

## Recorrido sintético propuesto y oráculos

No encadenar estos fixtures como si fueran una sola historia: cada fila empieza desde el estado indicado. Antes de la defensa, ensayar el recorrido elegido en un entorno identificado y guardar versión, entrada, respuesta y estado obtenido. Si ese ensayo no existe, presentar el diseño y los reportes locales como tales. Evitar proveedores vivos para el cálculo de los ejemplos.

| Objetivo y referencia | Entrada del fixture documentado | Oráculo: qué comparar |
|---|---|---|
| CU-001, CP1-01 | Cuenta A: ARS 10.000. Gasto Alimentos ARS 1.500, fecha 6/10/2026. | Una operación; A: ARS 8.500. Listado y cálculo muestran ARS 1.500. CP de aceptación diseñado; el trigger tiene evidencia SQL acotada. |
| CU-001, CP1-05 | Fixture independiente: A inicial ARS 10.000, gasto 1.500 persistido y saldo 8.500. Editar importe a 2.000. | A: ARS 8.000; una fila; sin doble débito. Comparar antes/después. |
| CU-002, CP2-01 | Usuario sintético U1 sin cuentas. Crear Banco ARS con saldo inicial 50.000. | Cuenta propia activa y saldo ARS 50.000; origen del saldo documentado. No declarar ejecución autenticada del CP. |
| CU-002, CP2-06 | U1 posee gasto 500, ingreso 700 y una transferencia; U2 posee otras filas. Exportar octubre de 2026. | Sólo datos U1; importes, monedas, fechas y relaciones conservados. Comparación fila a fila; no confundir respaldo de cinco tablas con restauración completa. |
| CU-003, CP3-04 | A: ARS 120.000; B: USD 100; sin cartera; tasa fija 1 USD = 1.200 ARS. | Total ARS 240.000 = USD 200. Originales 120.000/100 intactos. CP de aceptación diseñado. |
| CU-004, CP4-01 | Compra registrada de AAPL: 5 × USD 185; cotización fixture USD 190,50; sin comisiones. | Costo USD 925; valor 952,50; no realizado 27,50; 2,972972…%, mostrado 2,97%. No débito automático de cuenta. |
| CU-004, CP4-02 | Fixture independiente: lote 10 × USD 100; cotización USD 110. Registrar venta 4 × USD 120. | Remanente seis unidades, costo USD 600, valor 660; realizado 80 y no realizado 60. No crédito automático de caja. |

Como respaldo técnico de CU-001, el ensayo SQL de compartidos sí verificó localmente ARS 10,01 dividido en tres: 3,34 + 3,34 + 3,33. Un fallo inyectado al guardar splits conserva el estado previo. Esto acredita el RPC aislado; no autentica a una persona invitada. Un enlace revocable concede una capacidad limitada al grupo, no demuestra identidad personal mediante Auth.

## Preguntas frecuentes y respuestas defendibles

**¿Por qué cuatro CU si existen tantas funciones?** Cada CU representa un objetivo del actor. Capturar un ticket o importar movimientos son variantes de gestionar movimientos; exportar o cambiar preferencias pertenece a administrar datos. Los diagramas y pruebas mantienen esa agrupación sin perder excepciones.

**¿El negocio está validado?** No se aportaron entrevistas, pagos o contratos que prueben demanda. Segmentación, SAM y captación son hipótesis explícitas. El plan propone tareas, retención y cobro efectivo para contrastarlas. BCRA describe el contexto financiero, no compradores de ZARIX.

**¿Precio y cupos ya son una oferta operativa?** USD 7,50/mes, tres cuentas Free, veinte Premium, cuarenta consultas IA y veinte OCR por ciclo son la política propuesta. Requieren condiciones, configuración y controles coherentes antes de comercializar. La demo académica habilita capacidades para evaluación y no prueba un pago real.

**¿Por qué VAN positivo y económico negativo?** La caja no paga salario fundador. La vista económica descuenta ese trabajo a USD 12/h. Ambos usan los flujos y la tasa equivalente correspondiente, sin mezclar aporte de capital con ventas. Base requiere USD 1.300 en total; los USD 198 de M0 ya están incluidos.

**¿La TIR anual de caja garantiza un gran retorno?** No. La base de efectivo inicial es pequeña y el fundador trabaja sin retiro en esa vista. La TIR mensual base es 18,765% y su equivalente anual 687,521%; la dedicación cambia el diagnóstico. Priorizar VAN económico, caja, retención y capacidad. El adverso tiene flujos negativos: no existe TIR ni repago en 24 meses.

**¿Los impuestos son tasas reales?** Son provisiones de planificación; 30 USD fijos más 5% del cobro en base no acredita una alícuota. Encuadre, jurisdicción, facturación y contratos deben confirmarse antes del cobro.

**¿304 pruebas y 100% de cobertura demuestran todo?** Los 304 incluyen regresiones locales; SQL informa aparte 28 + 11. El 100% corresponde a sentencias y ramas instrumentadas del calendario. El conjunto instrumentado registra 60,96% de sentencias y 56,42% de ramas; no cubre toda ZARIX ni todos los caminos. Pruebas con dobles no acreditan proveedores o RLS reales.

**¿Qué resta para aceptación completa?** Seis criterios requieren validación, incluida conformidad de interesados/usuarios, RRR/PDR/CDR y trazabilidad ejecutada de todo el alcance. Faltan recorridos autenticados, permisos reales, carga, restauración e integraciones controladas. Tres migraciones están preparadas y sin aplicar remotamente; el código dependiente exige probarlas antes del despliegue. Las limitaciones se registran, no se sustituyen por firmas o ejecuciones inventadas.
