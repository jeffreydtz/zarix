# ZARIX TFI v2.13

La presentación se actualizó el 8 de octubre de 2026: portada institucional con la marca oficial UAI, fecha y versión en la ficha interna, tablas bordó y blanco y encabezados/pies uniformes. Se conserva el contenido académico, el índice y la evidencia de la revisión técnica original. Ver evidence/qa_formato_uai.json.

Esta es la revisión canónica del trabajo académico del 6 de octubre de 2026. Sustituye para esta entrega los catálogos de CU y resultados históricos de docs/tif, docs/testing, EV-COD y la guía de defensa anteriores. Las fuentes completas del plan, checklist y diagramas se integran en esta carpeta.

## Alcance final

1. CU001 Gestionar movimientos financieros.
2. CU002 Administrar cuentas y datos personales.
3. CU003 Consultar y analizar la situación financiera.
4. CU004 Seguir el portafolio de inversiones.

Transferencias, OCR, Telegram, recurrencias, cuotas, presupuestos, importación y compartidos son escenarios de esos cuatro objetivos. Una compra o venta de inversión registrada no mueve efectivo de una cuenta automáticamente.

## Evidencia ejecutada

Node 22.17.0, Next.js 15.5.27 y Vitest 5.0.3. La suite local ejecutó 304 pruebas en 32 archivos; SQL aislado ejecutó 28 casos monetarios y 11 casos de gastos compartidos. Compilación de producción, TypeScript y lint aprobaron. Ver evidence/verification.json, vitest-results.json, sql-tests.log, production-build.log y coverage-summary.json. La cobertura general es del conjunto instrumentado en vitest.config.ts; no mide toda la aplicación. El calendario recurrente cubre sus 30 ramas instrumentadas; no implica cobertura completa de condiciones o caminos del producto.

## Migraciones y puesta en funcionamiento

Las tres migraciones nuevas fueron preparadas y probadas en PostgreSQL embebido aislado, sin aplicarlas a una base remota. Antes de desplegar esta revisión:

1. Respaldar la base y verificar restauración en una instancia separada.
2. Aplicar en un entorno de pruebas las migraciones 20261006235424, 20261006235955 y 20261007000231 en ese orden, revisar restricciones e índices con datos representativos y validar permisos/RLS.
3. Desplegar el código en ese entorno y ejecutar los cuatro recorridos con dos usuarios y un invitado, incluidos rechazos de acceso, transferencias multimoneda y correcciones de movimientos.
4. Verificar cron, cotizaciones, Telegram, Gemini y pagos con credenciales de prueba. Sólo entonces programar la actualización productiva con respaldo y control del saldo.

La nueva columna destination_amount_in_account_currency conserva el importe exacto acreditado de las transferencias nuevas. Las filas históricas sin ese valor usan el cálculo de compatibilidad; ninguna migración inventa importes ni recalcula saldos históricos automáticamente. Ante una reversión, el código antiguo ignora la columna nueva y conserva el antiguo algoritmo; no borrar datos financieros ni revertir funciones SQL a ciegas. La retirada del cambio necesita revisión del historial y un plan de compensación específico.

## Límites pendientes

No se ejecutaron pagos reales, integración autenticada de los cuatro CU, matriz RLS completa, carga/desempeño, restauración ni validación de usuarios/profesor. No hay aprobación RRR/PDR/CDR registrada. Las cuotas y el precio comercial son hipótesis del plan; no se presentan como restricciones implementadas. La auditoría de dependencias registra siete entradas de gravedad alta asociadas al mismo aviso sin parche de braces en herramientas de desarrollo; no se afirma cero alertas.

Para repetir controles: npm ci; npm test -- --coverage; npm run test:db; npm run typecheck; npm run lint; npm run build. La compilación necesita variables públicas de Supabase; para revisión local se usaron valores ficticios y no hubo conexión productiva.


## Archivos del plan

[Plan editable Word](ZARIX-Plan-de-Desarrollo-Tecnologico-v2.13.docx), [plan consultable](plan.md), [modelo financiero](ZARIX-Modelo-financiero-v2.13.xlsx), [matriz de negocio](matriz_negocio_v2.13.md), [checklist](checklist_final.md) y [guía de defensa](guia_defensa_v2.13.md).

Las figuras están divididas para lectura impresa y pertenecen a los mismos cuatro casos de uso. El SVG/PNG incorporado se conserva en figures y su fuente DOT/Mermaid en diagramas. Un prototipo propuesto no sustituye la revisión con usuarios. Los archivos de evidence distinguen resultados anteriores a la corrección, corridas selectivas y corrida general final.
