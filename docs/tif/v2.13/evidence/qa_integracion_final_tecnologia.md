# QA de integración final — tecnología

Resultado: las **57 figuras reparadas** se integraron correctamente en el documento definitivo de **198 páginas**, con el índice actualizado. No se detectaron nuevos defectos de colocación que requieran modificar fuentes o reconstruir el documento.

## Artefacto revisado

- DOCX: `output/ZARIX-Plan-de-Desarrollo-Tecnologico-v2.13.docx`.
- Render: `tmp/revision/docx_render_final/`, PDF de 198 páginas y PNG de página completa.
- Todas las 57 páginas indicadas abajo fueron **abiertas e inspeccionadas visualmente con `view_image`, solicitando detalle original**. Esta comprobación corresponde a la colocación dentro de Word, además de la revisión previa de los PNG de figura.
- Alcance: figuras asignadas a tecnología. No se extiende esta conclusión a páginas revisadas por otros integrantes.

## Comprobaciones

- Leyendas de figura completas y correctamente asociadas con su imagen, sin quedar en una página distinta.
- Títulos, nodos, flechas, guardas y marcos de escenarios completos; sin recortes en los límites de imagen o página.
- Notas de las secuencias enteras dentro de sus recuadros, incluido RF11, cola/sincronización y Strategy/Adapter.
- Márgenes, encabezado y pie sin invasión por las figuras. Las figuras altas terminan antes del pie; el texto posterior de las páginas 119 y 150 queda separado.
- Etiquetas opuestas de robustez separadas y legibles; importación conserva A04 y avisos conserva A06.
- DOM-Personal (p. 76), ER-Snapshots (p. 84) y patrones de cotizaciones (p. 195) conservan las etiquetas completas y la separación corregida.
- Proyección (p. 141) muestra `hasData=false` cuando falta una tasa. Simulación (p. 150) conserva las tres fórmulas, incluido el divisor 100 para bonos.

## Tamaño de letra en el DOCX

Se identificó cada PNG incrustado mediante igualdad SHA-256 con el PNG reparado y se leyó el tamaño real `wp:extent` del DOCX. El tamaño mínimo se calculó desde la tipografía y dimensiones de su SVG, aplicando el factor de escala real de Word. Las **57 figuras mantienen al menos 8 pt**; mínimo observado: **8,020 pt**, SEC-CU003-Proyeccion (p. 141). El registro de dimensiones reales y resultados está en `tmp/revision/metricas_integracion_word_final.json`.

La revisión visual confirma que esa integración no introduce textos truncados ni superposiciones que impidan leer las etiquetas. Hay algunos cruces de aristas en espacios vacíos de diagramas de robustez; no tapan texto y no constituyen un defecto de colocación.

## Páginas vistas

76, 84, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 195, 197, 198.

## Registro por figura

| Página | Figura | Fuente | Letra mínima en Word | Integración visual |
|---:|---:|---|---:|---|
| 76 | 17 | DOM-Personal | 19.639 pt | Correcta |
| 84 | 23 | ER-CU003-Snapshots | 14.388 pt | Correcta |
| 98 | 34 | ROB-CU001-Registro | 15.546 pt | Correcta |
| 99 | 35 | ROB-CU001-OCR | 11.056 pt | Correcta |
| 100 | 36 | ROB-CU001-Importacion | 14.911 pt | Correcta |
| 101 | 37 | ROB-CU001-Telegram | 17.496 pt | Correcta |
| 102 | 38 | ROB-CU001-Reglas | 16.958 pt | Correcta |
| 103 | 39 | ROB-CU001-Cron | 14.053 pt | Correcta |
| 104 | 40 | ROB-CU001-Aviso | 11.689 pt | Correcta |
| 105 | 41 | ROB-CU001-Presupuesto | 17.040 pt | Correcta |
| 106 | 42 | ROB-CU001-Compartidos | 16.957 pt | Correcta |
| 107 | 43 | ROB-CU002-Cuentas | 15.786 pt | Correcta |
| 108 | 44 | ROB-CU002-Datos | 16.326 pt | Correcta |
| 109 | 45 | ROB-CU002-Preferencias | 16.376 pt | Correcta |
| 110 | 46 | ROB-CU002-Acceso | 16.959 pt | Correcta |
| 111 | 47 | ROB-CU002-Plan | 17.272 pt | Correcta |
| 112 | 48 | ROB-CU003-Patrimonio | 12.664 pt | Correcta |
| 113 | 49 | ROB-CU003-Cotizaciones | 12.602 pt | Correcta |
| 114 | 50 | ROB-CU003-Resumen | 17.554 pt | Correcta |
| 115 | 51 | ROB-CU003-Chat | 12.278 pt | Correcta |
| 116 | 52 | ROB-CU003-RF11 | 15.833 pt | Correcta |
| 117 | 53 | ROB-CU004-Operacion | 10.111 pt | Correcta |
| 118 | 54 | ROB-CU004-Referencias | 11.323 pt | Correcta |
| 119 | 55 | ROB-CU004-Simulacion | 13.783 pt | Correcta |
| 121 | 56 | SEC-CU001-Crear | 8.120 pt | Correcta |
| 122 | 57 | SEC-CU001-EditarEliminar | 8.783 pt | Correcta |
| 123 | 58 | SEC-CU001-OCR | 9.385 pt | Correcta |
| 124 | 59 | SEC-CU001-Telegram | 10.185 pt | Correcta |
| 125 | 60 | SEC-CU001-Importar | 9.543 pt | Correcta |
| 126 | 61 | SEC-CU001-ReglasPresupuestos | 11.950 pt | Correcta |
| 127 | 62 | SEC-CU001-CronSeleccion | 10.603 pt | Correcta |
| 128 | 63 | SEC-CU001-CronOcurrencia | 9.154 pt | Correcta |
| 129 | 64 | SEC-CU001-Cuotas | 9.140 pt | Correcta |
| 130 | 65 | SEC-CU001-Cola | 13.991 pt | Correcta |
| 131 | 66 | SEC-CU001-Sincronizacion | 9.421 pt | Correcta |
| 132 | 67 | SEC-CU002-AccesoPreferencias | 9.669 pt | Correcta |
| 133 | 68 | SEC-CU002-PagoInicio | 12.654 pt | Correcta |
| 134 | 69 | SEC-CU002-PagoWebhook | 10.623 pt | Correcta |
| 135 | 70 | SEC-CU003-Dashboard | 9.284 pt | Correcta |
| 136 | 71 | SEC-CU003-Cotizaciones | 8.690 pt | Correcta |
| 137 | 72 | SEC-CU003-ChatIntencion | 10.997 pt | Correcta |
| 138 | 73 | SEC-CU003-ChatRespuesta | 11.875 pt | Correcta |
| 139 | 74 | SEC-CU003-AnomaliasSeleccion | 13.330 pt | Correcta |
| 140 | 75 | SEC-CU003-AnomaliasCalculo | 10.662 pt | Correcta |
| 141 | 76 | SEC-CU003-Proyeccion | 8.020 pt | Correcta |
| 142 | 77 | SEC-CU004-Compra | 11.524 pt | Correcta |
| 143 | 78 | SEC-CU004-VentaValidar | 11.699 pt | Correcta |
| 144 | 79 | SEC-CU004-VentaRPC | 11.401 pt | Correcta |
| 145 | 80 | SEC-CU004-Valoracion | 8.354 pt | Correcta |
| 146 | 81 | SEC-CU001-CompartidosGrupo | 11.501 pt | Correcta |
| 147 | 82 | SEC-CU001-CompartidosReparto | 10.002 pt | Correcta |
| 148 | 83 | SEC-CU002-CuentasAlta | 11.215 pt | Correcta |
| 149 | 84 | SEC-CU002-CuentasDatos | 10.698 pt | Correcta |
| 150 | 85 | SEC-CU004-Simulacion-Detalle | 8.366 pt | Correcta |
| 195 | 98 | PATRONES-Cotizaciones | 9.681 pt | Correcta |
| 197 | 100 | SEC-StrategyAdapter | 13.013 pt | Correcta |
| 198 | 101 | SEC-TemplateMethod | 10.919 pt | Correcta |

## Identificación de la versión

- SHA-256 DOCX: `bd5eb503065a2263cb46fa7a80d47afe20bbc8e46b591e0eb222dcecbda0a5e4`.
- SHA-256 PDF inspeccionado: `aa873527d8766038dfdfb5c70c694a8349033d2ce44b5c4c3db111c8ea6c768f`.

No se editaron fuentes de diagramas, builder, documento ni código durante esta QA de integración.
