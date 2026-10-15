## Anexo C Seguimiento de los 59 criterios de la cátedra
Fuente: [Checklist SAP TFI 2026](https://cursos-uai.github.io/sap_tfi_2026/checklist.html). El estado documental no equivale a aprobación académica ni a aceptación de todo el producto. Las pruebas ejecutadas y sus límites figuran en el anexo A.
### Requerimientos
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| req-0 Funcionales identificados, numerados y sin decisiones de implementación Cada requisito expresa una capacidad observable. | 10.4.2 a 10.4.7; matriz RF/CU | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| req-1 No funcionales clasificados Considerar seguridad, desempeño, usabilidad, portabilidad y disponibilidad. | 10.4.2 a 10.4.7; matriz RF/CU | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| req-2 Alcance, actores y glosario acordados El vocabulario es consistente en todos los artefactos. | 10.4.2 a 10.4.7; matriz RF/CU | **Pendiente de validación.** El vocabulario está unificado; falta conformidad real sobre el alcance. |
| req-3 Cada requisito se vincula con casos de uso La matriz permite recorrer REQ → CU. | 10.4.2 a 10.4.7; matriz RF/CU | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| req-4 Al menos un criterio de aceptación por requisito Debe ser comprobable y describir el resultado esperado. | 10.4.2 a 10.4.7; matriz RF/CU | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Casos de uso y especificaciones
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| cu-0 Diagrama general con actores, casos y límite del sistema Cada actor persigue un objetivo claro. | 10.5.2 y 10.5.3; cuatro fichas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| cu-1 include y extend usados con sentido include es obligatorio reutilizado; extend, opcional o condicionado. | 10.5.2 y 10.5.3; cuatro fichas | **Preparado documentalmente.** No se extraen casos técnicos reutilizados; include/extend no aplican al modelo agregado de cuatro objetivos, según justificación 10.5.2. |
| cu-2 Una especificación por caso relevante Incluye objetivo, actor, precondiciones, disparador y postcondiciones. | 10.5.2 y 10.5.3; cuatro fichas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| cu-3 Curso básico escrito en voz activa Cada paso muestra actor, acción y respuesta del sistema. | 10.5.2 y 10.5.3; cuatro fichas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| cu-4 Alternativos, excepciones y reglas documentados Cada desvío tiene condición, respuesta y cierre. | 10.5.2 y 10.5.3; cuatro fichas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| cu-5 Hito RRR revisado con interesados Casos de uso, dominio y prototipo capturan los requerimientos. | 10.5.2 y 10.5.3; cuatro fichas | **Pendiente de validación.** RRR preparado; falta revisión fechada de los interesados. |
### Modelo de dominio
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| dom-0 Clases tomadas del lenguaje del negocio No incluye pantallas, controles ni detalles técnicos. | 10.5.4; DOM Conceptual | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| dom-1 Atributos conceptuales relevantes Evita claves foráneas y decisiones de persistencia. | 10.5.4; DOM Conceptual | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| dom-2 Relaciones y multiplicidades justificadas Cada asociación expresa un hecho del dominio. | 10.5.4; DOM Conceptual | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| dom-3 Nombres sin sinónimos ni ambigüedades El mismo concepto conserva su nombre. | 10.5.4; DOM Conceptual | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| dom-4 Modelo actualizado después de robustez Todas las entidades descubiertas aparecen en el dominio. | 10.5.4; DOM Conceptual | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Prototipo
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| ui-0 Pantallas y estados relevantes representados Incluye formularios, listados, mensajes, confirmaciones y errores. | 10.5.1; prototipos P01 a P12 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| ui-1 Cada pantalla se vincula con casos y actores La navegación materializa cursos básicos y alternativos. | 10.5.1; prototipos P01 a P12 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| ui-2 Controles y datos coinciden con las especificaciones No hay acciones huérfanas ni entradas faltantes. | 10.5.1; prototipos P01 a P12 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| ui-3 Prototipo revisado con usuarios Se registraron observaciones y decisiones. | 10.5.1; prototipos P01 a P12 | **Pendiente de validación.** Faltan participantes, observaciones y decisiones de una revisión real. |
| ui-4 Se usa como especificación, no como producto final Sirve para desambiguar y descubrir fronteras. | 10.5.1; prototipos P01 a P12 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Arquitectura
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| arch-0 Vistas funcional, de datos y del sistema separadas Cada una responde una pregunta arquitectónica. | 10.5.5 y 10.5.6; tres vistas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| arch-1 Componentes, capas, responsabilidades e interfaces visibles Las dependencias respetan el estilo declarado. | 10.5.5 y 10.5.6; tres vistas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| arch-2 Despliegue, nodos y tecnologías documentados Incluye persistencia e integraciones externas. | 10.5.5 y 10.5.6; tres vistas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| arch-3 Decisiones justificadas por requerimientos No se basan sólo en preferencias tecnológicas. | 10.5.5 y 10.5.6; tres vistas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| arch-4 Calidad y testing considerados Contempla cambio, seguridad, rendimiento y comprobabilidad. | 10.5.5 y 10.5.6; tres vistas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Diagramas de robustez
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| rob-0 Un diagrama por caso de uso diseñado El texto se sigue frase por frase. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-1 Actor, Boundary, Control y Entity diferenciados Fronteras y entidades son sustantivos; controles, acciones. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-2 Reglas de comunicación respetadas Actor↔Boundary; Boundary↔Control; Entity↔Control. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-3 Una frontera clara por pantalla o interfaz Los nombres coinciden con prototipo y texto. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-4 Entidades consistentes con el dominio Toda entidad está en el modelo actualizado. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-5 Controles cubren cursos básicos y alternativos Sin asignar todavía métodos ni algoritmos. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-6 Hito PDR aprobado Texto, robustez, dominio, datos y arquitectura son consistentes. | 10.5.7; ROB CU001 a CU004 | **Pendiente de validación.** PDR preparado; falta aprobación académica registrada. |
### Diagramas de secuencia
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| seq-0 Un diagrama por caso de uso Incluye curso básico y alternativos. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| seq-1 Participantes derivados de robustez No aparecen objetos sin responsabilidad explicada. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| seq-2 Texto del caso mapeado a mensajes Orden, retornos, condiciones y ciclos son visibles. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| seq-3 Controles asignados a operaciones u objetos Cada mensaje llega al responsable del comportamiento. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| seq-4 Mensajes respetan arquitectura y patrones El detalle orienta la implementación. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| seq-5 Errores y resultados observables representados Las respuestas regresan a la frontera. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Diagrama de clases
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| class-0 Clases con responsabilidades, atributos y operaciones Las operaciones surgen de secuencia. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-1 Tipos, visibilidad y firmas especificados Los contratos permiten comprender la colaboración. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-2 Relaciones y multiplicidades correctas Herencia y composición tienen necesidad demostrable. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-3 Alta cohesión y bajo acoplamiento revisados Cada clase protege un secreto coherente. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-4 Interfaces aíslan decisiones que pueden cambiar Se aplica ocultamiento de información. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-5 Consistencia con dominio, secuencias y código No faltan ni sobran elementos sin trazabilidad. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-6 Hito CDR aprobado Diseño completo, correcto, realizable y alineado. | 10.5.9; vistas de dominio y aplicación | **Pendiente de validación.** CDR preparado; falta aprobación académica registrada. |
### Patrones de diseño
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| patterns-0 Cada patrón resuelve un problema concreto Se explica contexto y necesidad. | Anexo D; estructura y colaboración | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| patterns-1 Participantes y colaboraciones identificados Las clases del TP se mapean a roles. | Anexo D; estructura y colaboración | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| patterns-2 Clases reflejan la estructura del patrón No es sólo un ejemplo genérico copiado. | Anexo D; estructura y colaboración | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| patterns-3 Secuencias reflejan su comportamiento Los mensajes muestran un escenario real. | Anexo D; estructura y colaboración | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| patterns-4 Alternativas, beneficios y costos documentados Evalúa acoplamiento, extensión y complejidad. | Anexo D; estructura y colaboración | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Testing estructural
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| test-0 Unidad, especificación y dominio de entrada definidos Cada caso usa valores concretos y salida esperada. | 10.5.12; anexo A; casos CSV y reportes | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| test-1 Grafo de flujo de control construido Nodos, decisiones y flechas corresponden al código. | 10.5.12; anexo A; casos CSV y reportes | **Preparado documentalmente.** CFG del calendario extraído del código revisado; los grafos de contratos adicionales se identifican como diseño cuando no tienen instrumentación real. |
| test-2 Criterio de cobertura declarado Distingue sentencias, ramas, condiciones y caminos. | 10.5.12; anexo A; casos CSV y reportes | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| test-3 Conjunto de pruebas satisface el criterio Vincula entrada, camino, esperado y obtenido. | 10.5.12; anexo A; casos CSV y reportes | **Verificado en unidad acotada.** Se mide el conjunto configurado y la unidad calendario; la cobertura no acredita todo el sistema ni equivale a cubrir condiciones o todos los caminos. |
| test-4 Cobertura medida y evidencia adjunta Incluye reporte o cálculo verificable. | 10.5.12; anexo A; casos CSV y reportes | **Verificado en unidad acotada.** Se mide el conjunto configurado y la unidad calendario; la cobertura no acredita todo el sistema ni equivale a cubrir condiciones o todos los caminos. |
| test-5 Casos normales, límites y fallas incluidos La selección busca revelar defectos. | 10.5.12; anexo A; casos CSV y reportes | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| test-6 Pruebas re-ejecutables y resultado registrado Documenta ambiente, versión, fecha y estado. | 10.5.12; anexo A; casos CSV y reportes | **Preparado documentalmente.** Comandos, versión, ambiente, fecha y reportes conservados para las ejecuciones locales de la revisión. |
| test-7 Trazabilidad hasta TEST comprobada Una prueba demuestra cada requisito del alcance. | 10.5.12; anexo A; casos CSV y reportes | **Pendiente de validación.** Existe diseño REQ→CU→TEST; faltan ejecuciones funcionales integrales y RNF para demostrar todos los requisitos. |