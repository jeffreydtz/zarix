# QA visual del formato UAI — páginas 133–198

Resultado: **aprobado en el tramo revisado, sin defectos materiales de formato**.

Se inspeccionaron individualmente los 66 PNG de `tmp/formato_uai/render`, mediante `view_image` con `detail: original`. No se recompiló el documento ni se modificaron fuentes, código o Word.

Páginas efectivamente vistas: 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197 y 198.

| Tramo | Verificación visual | Resultado |
|---|---|---|
| 133–150 | Secuencias, notas, alternativas, figuras completas y simulación con factor 100 para bonos / 1 para el resto | Sin cortes, solapamientos ni invasión de márgenes |
| 151–153 | Tablas de responsabilidades y firmas; encabezado blanco sobre bordó; continuidad 152→153 | Texto legible, filas íntegras y encabezado repetido |
| 154–163 | DTO y clases; campo de destino completo; dependencias del análisis; comienzo de trazabilidad | Figuras completas y separadas de encabezado/pie |
| 164–168 | Continuidad de trazabilidad y catálogo; tabla de evidencia; contratos monetarios; firma del calendario | Contraste correcto, contenido dentro de las celdas y márgenes |
| 169–174 | Dos vistas del CFG; tablas de particiones y SQL; cartera, cron y cola offline | Identificadores y resultados legibles; filas completas en las transiciones 170→171 y 171→172 |
| 175–180 | Matriz RF/RNF y checklist de testing | Encabezados repetidos, alternancia continua, RF05 pendiente y RNF01–08 visibles sin recortes |
| 181–186 | Bibliografía y anexos de evidencia/reproducibilidad; continuidad de métricas 184→185 | Hipervínculos distinguibles, tablas legibles, 304/304 y 39/39 visibles; lista de 15 archivos completa |
| 187–192 | Tablas de los 59 criterios de la cátedra, con estados en negrita | Bordó uniforme, texto blanco con contraste suficiente y filas alternas suaves; continuaciones completas |
| 193–198 | Prosa y figuras finales de patrones, incluida nota de Strategy/Adapter | Texto y diagramas completos, notas contenidas y margen inferior libre |

En las 66 páginas, el encabezado mantiene `ZARIX` y `Trabajo Final de Ingeniería`; el pie conserva `Universidad Abierta Interamericana` y la numeración central consecutiva. No aparecen fecha/versión en estos encabezados o pies. El responsable de integración confirmó que esta ausencia es intencional: fecha/versión se conservan en la ficha interior y el historial/evidencia. La portada y la ficha de la página 3 quedan fuera de este tramo de QA.

Las páginas 180, 182 y 194 tienen poca ocupación, como en la paginación previa; se observa contenido de continuación completo y salto hacia la sección/figura siguiente, sin indicios de pérdida de texto. No requieren corrección para este cambio de formato.

Si el render final cambia únicamente el logo de portada y se confirma identidad SHA de los PNG 133–198, este resultado conserva validez para ese render. No se atribuye esta comparación de archivos a la presente revisión visual.
