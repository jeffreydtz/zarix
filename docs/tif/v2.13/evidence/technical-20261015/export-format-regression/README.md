# Exportación: versión y zona explícitas

El contrato original CP2-06 exige formato, versión y zona informados. La ejecución real contra Next CI4 `836fd18` y la réplica sintética58321 conservó filas, quince columnas, importes, fechas y relaciones: once aserciones PASS y una FAIL por metadatos ausentes. Las doce tablas preexistentes conservaron sus huellas; las cuentas nuevas se archivaron, sin borrar historial. Se conserva el resultado en `cp2-06-before-api.json` y el CSV sintético correspondiente.

La corrección añade `X-Zarix-Export-Version: 1` y `X-Zarix-Export-Timezone: UTC` a ambos formatos. La versión1 identifica las quince columnas CSV y el array JSON existentes. CSV usa ahora una fecha de calendario UTC explícita; JSON conserva sus timestamps y estructura, incluida la compatibilidad con importación. No se añade un wrapper JSON ni una fila de comentarios CSV.

Regresión: `npx vitest run __tests__/transaction-export-format.test.ts --reporter=json --outputFile=<before|after>.json`. Antes: tres FAIL; después: tres PASS. Incluye una operación a las00:30Z con zona del servidor Argentina para evitar cambio de día implícito. Los reportes y logs se conservan por fase. La revisión independiente examinó los bytes y ambos JSON, sin repetir la ejecución.

Estos resultados unitarios no prueban el endpoint compilado corregido: CI5 y el reintento API de CP2-06 están pendientes. La copia servida CI4 no se modificó. El round trip CP2-07 se ejecuta y documenta por separado.
