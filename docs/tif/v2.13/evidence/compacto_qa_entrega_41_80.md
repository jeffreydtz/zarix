# QA de entrega compacta — páginas 41–80

**Resultado: 40/40 páginas cubiertas, sin defectos materiales de maquetación.** Las dos observaciones menores de la ronda anterior quedaron corregidas.

Render revisado: `tmp/compacto/render-entrega`, documento principal de 122 páginas. Se compararon por SHA-256 los PNG de todas las páginas 41–80 con el render anterior `render-final`. Las páginas **41–55 (15 páginas)** son idénticas byte por byte: conserva validez su inspección individual registrada en `qa_41_80.md`. Las páginas **56–80 (25 páginas)** cambiaron y se abrieron de nuevo individualmente con `view_image`, solicitando `detail: original`. El detalle de hashes está guardado en `qa_entrega_41_80_sha256.json`.

Los originales son de 1547 × 2002 píxeles; el visor comunicó una presentación reducida a 1376 × 1780. Esta constancia verifica el render y su lectura visual; no mide de forma independiente los puntos tipográficos. El piso de 9,5 pt para figuras reducibles y la conservación de originales menores se apoyan en las métricas de escala del ensamblador. Visualmente no se observa reducción que vuelva ilegibles las figuras.

No se modificaron el documento, las fuentes o las imágenes; no se renderizó ni se utilizó LibreOffice.

Comprobaciones satisfactorias:

- Figuras con sus captions en la misma página, bordes completos y etiquetas legibles.
- Tablas bordó/blanco de buen contraste, alternancia suave, cabeceras repetidas y filas sin superposición.
- Márgenes, encabezados y pies conservados, sin invasión del contenido.
- Figuras de dominio/ER, arquitectura y robustez completas, con multiplicidades y etiquetas íntegras.
- Secuencias de creación y edición/eliminación completas; nota de edición dentro de su rectángulo y fragmentos sin cortes.
- Título de la tabla CU004 trasladado a p57 junto a la tabla; ADR02 comienza p71 junto a su motivo y costo. Ya no están separados de su contenido.

La zona blanca de p58 queda antes de una figura alta que no cabe completa con su caption en el espacio restante; la figura aparece íntegra en p59. También queda espacio bajo algunas figuras indivisibles. No se encontraron páginas vacías ni pérdida de continuidad en el tramo.

| Página | Método | Contenido y resultado |
|---|---|---|
| 41 | SHA idéntico | RN02–RN06; inspección anterior válida, texto legible y completo. |
| 42 | SHA idéntico | RN07–RN11; inspección anterior válida, sin cortes. |
| 43 | SHA idéntico | RF11/RF10; inspección anterior válida, fórmulas y contratos legibles. |
| 44 | SHA idéntico | Matriz P01–P06; inspección anterior válida, buen contraste de tabla. |
| 45 | SHA idéntico | Matriz P07–P12; inspección anterior válida, cabecera repetida. |
| 46 | SHA idéntico | Figura 1 PT01; inspección anterior válida, controles y estados completos. |
| 47 | SHA idéntico | Figura 2 PT05; inspección anterior válida, wireframe legible. |
| 48 | SHA idéntico | Figura 3 PT07; inspección anterior válida, paneles y avisos legibles. |
| 49 | SHA idéntico | Figura 4 PT09; inspección anterior válida, figura y sección siguiente bien separadas. |
| 50 | SHA idéntico | Figura 5 UC-General; inspección anterior válida, cuatro óvalos completos. |
| 51 | SHA idéntico | CU001 A01–A04; inspección anterior válida, filas íntegras. |
| 52 | SHA idéntico | CU001 A05–A10; inspección anterior válida, tabla legible. |
| 53 | SHA idéntico | CU001 A11/E01–E04 e inicio CU002; inspección anterior válida. |
| 54 | SHA idéntico | CU002 A01–A07/E01; inspección anterior válida, tabla completa. |
| 55 | SHA idéntico | CU002 E02–E04 y CU003; inspección anterior válida. |
| 56 | Vista original nueva | CU003 y ficha CU004 completas; título de tabla ya no queda aislado. |
| 57 | Vista original nueva | Título junto a tabla CU004; filas completas e inicio del dominio legible. |
| 58 | Vista original nueva | Continuación del dominio completa; espacio previo a figura indivisible, sin pérdida. |
| 59 | Vista original nueva | Figura 6 DOM finanzas completa; campos y cardinalidades legibles. |
| 60 | Vista original nueva | Figura 7 DOM automatización completa; etiquetas sin superposición. |
| 61 | Vista original nueva | Figura 8 DOM inversiones completa; caption asociado. |
| 62 | Vista original nueva | Figura 9 DOM personal completa; relaciones bien separadas. |
| 63 | Vista original nueva | Figura 10 DOM compartidos; inicio ER con separación suficiente. |
| 64 | Vista original nueva | Tabla de persistencia y seguridad completa; buen contraste y ajuste de nombres largos. |
| 65 | Vista original nueva | Figura 11 ER movimientos; destino exacto y demás campos completos. |
| 66 | Vista original nueva | Figura 12 ER cuentas/categorías completa y legible. |
| 67 | Vista original nueva | Figura 13 ER identidad/plan; campos comerciales íntegros. |
| 68 | Vista original nueva | Figura 14 ER lotes/ventas; campos largos y relaciones completos. |
| 69 | Vista original nueva | Figura 15 ER compartidos; arquitectura comienza debajo sin invadirla. |
| 70 | Vista original nueva | Tabla de arquitectura y ADR01 legibles; ADR02 ya no queda aislado al pie. |
| 71 | Vista original nueva | ADR02 con su explicación; ADR03–ADR09 y versiones legibles. |
| 72 | Vista original nueva | Figuras 16–17 arquitectura; ambas completas con sus captions. |
| 73 | Vista original nueva | Introducción y tabla de cuatro familias ROB; texto y filas completos. |
| 74 | Vista original nueva | Figura 18 ROB-CU001; BCE, flechas y etiquetas legibles. |
| 75 | Vista original nueva | Figura 19 ROB-CU002; nodos y asociaciones sin cortes. |
| 76 | Vista original nueva | Figura 20 ROB-CU003; controles, entidades y caption íntegros. |
| 77 | Vista original nueva | Figura 21 ROB-CU004 e inicio SEC; figura, texto y primera fila bien separados. |
| 78 | Vista original nueva | Continuación de tabla SEC; cabecera repetida y fuentes completas. |
| 79 | Vista original nueva | Figura 22 SEC-CU001 crear; participantes, alt/opt y mensajes completos. |
| 80 | Vista original nueva | Figura 23 SEC-CU001 editar/eliminar; nota contenida y ramas/resultados completos. |

Alcance: únicamente páginas 41–80 del principal de entrega. Las restantes páginas y el anexo digital requieren las constancias de sus revisores asignados.
