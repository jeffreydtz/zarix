# QA visual — formato UAI, páginas 2–67

**Resultado:** aprobado en el alcance revisado, sin defectos de maquetación que impidan la lectura. Se registra un detalle tipográfico menor, no bloqueante, en la página 49.

**Objeto revisado:** los PNG originales `tmp/formato_uai/render/page-N.png` del render informado de 198 páginas. Se abrió cada página individualmente con `view_image`, `detail: original`, y se visualizó a resolución original; no se utilizaron miniaturas ni mosaicos como sustituto. No se modificaron fuentes ni documento, no se compiló y no se utilizó LibreOffice.

## Cobertura efectiva

Se visualizaron las **66 páginas asignadas**, sin omisiones:

- 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19.
- 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31.
- 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43.
- 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55.
- 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67.

La portada y su logo (página 1), así como las páginas 68–198, quedan fuera de esta revisión.

## Comprobaciones

| Aspecto | Observación visual |
|---|---|
| Encabezados de tablas | Fondo bordó oscuro y texto blanco en negrita: contraste claro y lectura cómoda. No se observan texto blanco sobre fondo blanco ni encabezados ilegibles. |
| Filas alternas | Blanco y tono muy claro rosado/gris, con texto negro legible. Las bandas diferencian las filas sin ocultar contenido. |
| Continuidad de tablas | Encabezados reiterados y filas completas en las continuaciones: revisión de cambios 3→4, 9→10, 17→18, 23→24, 29→30, 37→38, 39→40, 40→41→42→43, 43→44, 49→50 y 65→66→67. No se observan filas mutiladas ni cambios de ancho que hagan perder columnas. |
| Márgenes y separación | Texto y tablas permanecen dentro de la zona útil, separados del encabezado y del pie. No se observan invasiones del número de página, superposiciones ni contenido que salga de la hoja. |
| Índice y títulos | Índice de página 2 legible; títulos conservan jerarquía y comienzos de contenido. No se observan títulos aislados sin contenido de apoyo. |
| Tablas de negocio y finanzas | FODA, Canvas, Free/Premium, operaciones, costos, indicadores y escenarios se leen completos; las celdas admiten sus textos sin estrechamientos que oculten datos. |
| Requisitos y escenarios | RF, RNF, glosario y escenarios CU-001 mantienen columnas legibles, encabezados contrastados y espacios suficientes. |
| Figuras y prototipos | PT01–PT12 en páginas 51–62 y diagrama de cuatro CU en página 64 completos y legibles, sin recortes de controles, textos o contornos. |
| Interior institucional | Encabezado y pie mantienen presentación sobria. Fecha y versión se encuentran en la ficha interior de página 3; no se detecta una interferencia de estos datos con la maquetación interior. |

La valoración de contraste es visual; no constituye una medición formal de relación de contraste WCAG. La presentación del visor puede deduplicar elementos repetidos; no se interpreta esa omisión de presentación como un defecto del PNG.

## Observación menor

**Página 49, tabla de prototipos, fila P06 Configuración y acceso, columna «Casos y estados obligatorios»:** la secuencia `pendiente/aprobado/rechazado/vencido` se ajusta como `venc` / `ido` entre dos líneas. No faltan letras ni se pierde el sentido. Mejora opcional: separar los estados con comas o espacios para que el ajuste ocurra entre palabras. Este detalle ya existía en la revisión anterior y no proviene del contraste bordó/blanco.

## Límite de la conclusión

Se aprueba la legibilidad y maquetación del tramo 2–67 del nuevo formato UAI. Esta revisión de PNG no repite la conciliación numérica del modelo financiero, la validación de enlaces o la aceptación académica; tampoco certifica la portada ni el resto de las páginas.
