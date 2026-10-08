# ZARIX v2.13 — Nota de entrega

La presentación se actualizó el 8 de octubre de 2026: portada institucional con la marca oficial UAI, fecha y versión en la ficha interna, tablas bordó y blanco y encabezados/pies uniformes. Se conserva el contenido académico, el índice y la evidencia de la revisión técnica original. Ver evidence/qa_formato_uai.json.

Revisión del 6 de octubre de 2026. El documento principal es `ZARIX-Plan-de-Desarrollo-Tecnologico-v2.13.docx`; la planilla complementaria es `ZARIX-Modelo-financiero-v2.13.xlsx`. La versión v2.13 consolida negocio, tecnología, diagramas, pruebas y pendientes alrededor de **exactamente cuatro casos de uso**. Para defender esta revisión deben conservarse juntos el documento, la planilla, el código corregido y los reportes de evidencia.

El negocio describe una propuesta comercial futura: Free con tres cuentas y exportación de datos propios; Premium de USD 7,50/mes con capacidades y cupos. Precio, captación, contratación y provisiones fiscales son hipótesis explícitas. La planilla reproduce M0 y 24 meses de tres escenarios. En base, VAN de caja USD 6.385,45 y repago M14; al valorar el tiempo del fundador, VAN económico −USD 4.155,93 y sin repago económico en ese horizonte. Las cifras no demuestran demanda o rentabilidad comercial ya obtenidas.

## Qué se puede respaldar con evidencia

- **304/304 pruebas Vitest** aprobadas en 32 archivos y **39/39 comprobaciones SQL** aprobadas: 28 del saldo/transferencias y 11 de gastos compartidos. Las regresiones están incluidas en los 304; no se suman dos veces.
- La cola offline conserva las operaciones pendientes cuando la sesión responde 401; las doce regresiones nuevas están incluidas en las 304 pruebas.
- TypeScript, lint y compilación aprobados en el entorno documentado, con datos sintéticos y credenciales ficticias.
- **53 de 59 criterios del checklist** tienen artefacto preparado o verificación parcial: 51 preparados documentalmente y dos verificados en una unidad acotada. Los seis restantes están pendientes de validación. Este conteo no equivale a 53 aprobaciones docentes ni a aceptación integral del sistema.
- La unidad calendario alcanza 100% de sentencias y ramas instrumentadas en la medición registrada. La cobertura del conjunto configurado es 659/1081 sentencias (60,96%), 549/973 ramas (56,42%), 71/112 funciones (63,39%) y 601/958 líneas (62,73%); no representa toda la aplicación ni todos sus caminos.
- El modelo financiero tiene 75 filas conciliadas y fórmulas recalculables. El contraste de las cifras del capítulo de negocio con su fuente produjo 117 coincidencias sin diferencias.

## Pendientes que deben explicarse en la defensa

- Conformidad de alcance e interesados, revisión con usuarios y aprobaciones académicas RRR/PDR/CDR. Los espacios de firma se completan sólo cuando esas revisiones ocurran.
- Recorridos autenticados integrales de los cuatro CU; aislamiento real mediante RLS/permisos, carga y restauración en un entorno identificado. El ensayo de la demostración pública y los dobles de servicios no sustituyen esa aceptación.
- Pruebas controladas con OCR, Telegram, Gemini y pasarela reales; operación comercial, cobros, contratos, licencias de cotizaciones y encuadre administrativo/fiscal. No se ejecutaron pagos reales ni se modificó producción.
- **Tres migraciones nuevas preparadas, todavía sin aplicar a una base remota**: trigger de saldos, RPC atómico de gastos compartidos e importe autoritativo del destino. Antes de desplegar el código dependiente, probarlas en una copia con permisos y datos representativos. Los históricos no se repararon o revaluaron automáticamente.
- Persistencia de idempotencia en canales que aún la necesitan, notificaciones sin outbox durable y límites Free/Premium coherentes antes de comercializar. El respaldo actual de cinco tablas no equivale a restauración completa del producto.
- Siete entradas de severidad alta en la auditoría de dependencias derivan de `braces`, sin parche publicado al revisar; no hubo entradas críticas ni moderadas. Debe conservarse el informe y volver a auditar al existir una solución compatible.

Los resultados de pruebas y sus límites están en el anexo A; el estado de los 59 criterios está en el anexo C. Una defensa precisa distingue **diseñado**, **ejecutado localmente**, **pendiente de validación real** y **aprobado por la cátedra**.
