# Adenda técnica del TIF — auditoría del 14 de septiembre de 2026

Esta adenda actualiza la implementación que respalda el documento `Zarix_TIF_Jeffrey_Dietz.docx`. Conserva la metodología ICONIX, los patrones Strategy y Template Method y el alcance de aplicación financiera personal argentina. El [informe de auditoría](../AUDITORIA-2026-09-14.md) contiene los resultados de la revisión y las limitaciones de verificación. [RESULTADOS-PRUEBAS.md](RESULTADOS-PRUEBAS.md) sigue siendo evidencia histórica con su fecha original.

## Estado técnico y trazabilidad

| Aspecto | Implementación vigente | Artefacto académico |
|---|---|---|
| Plataforma | Next.js 15.5.25, React 19.3, Node.js 22; parámetros de rutas asincrónicos | Figuras 6, 7 y 10; sección de stack del DOCX |
| Dashboard CU-003 | Consultas iniciadas en paralelo y secciones independientes con Suspense; estados de indisponibilidad y privacidad | Figura 4; guía §6.2 |
| Patrimonio histórico | La visita lee historial; `net-worth-snapshot` escribe la captura diaria con datos completos, sin reemplazar fallos por cero | Figuras 4, 10 y 12; anexo de esta adenda |
| Cotizaciones RN-COT-001 | Strategy CriptoYa → DolarApi → BD; opción preferCache, validación de precios, espera acotada y agrupación de solicitudes iguales | Figura 11 |
| Automatización | Ocho schedules en `vercel.json`; autenticación del cron en `CronJob.run` | Figuras 7, 10 y 12 |
| Aislamiento | Propietario explícito en caché/cola offline; custom Telegram sin vínculo no resuelve otro usuario; consumo condicional del código de vínculo | Pruebas locales de regresión; anexo técnico |
| Entradas/salidas | Quoting CSV de todos los campos; neutralización de fórmulas; revisión acotada del ZIP antes de ExcelJS; identidad de MP tomada del ID firmado | Pruebas de CSV/XLSX y webhook |
| Calidad | Vitest 4.1.11, pruebas con IndexedDB simulado y dobles de proveedores; CI lint/typecheck/tests/build y auditoría de dependencias | ADR 0005 y `.github/workflows/ci.yml` |

## Alcance de las afirmaciones

Las pruebas locales de contratos y errores no son transacciones realizadas contra Supabase, Telegram ni Mercado Pago. Un build con variables de ejemplo tampoco verifica credenciales, permisos desplegados o facturación. La auditoría no acredita por sí sola los objetivos comerciales de latencia, uptime o precisión histórica. La matriz de resultados actual debe consultarse en el informe fechado; no se trasladan automáticamente números de corridas anteriores al documento académico.

Se conserva la separación entre RLS para clientes de sesión y filtros de propietario obligatorios en consultas service-role. No se aplican migraciones ni cambios de políticas a producción como parte de esta adenda. Las figuras editables y sus PNG fueron preparados para renderizado local y actualización de las imágenes incrustadas en el DOCX, conservando su portada y tablas.

## Cierre adicional de exportaciones

La exportación de movimientos y los cinco conjuntos del respaldo versión 1.0 se leen mediante páginas con cursor de ID, manteniendo el filtro del usuario en cada consulta. Una página corta no se interpreta como fin de datos, porque PostgREST puede limitarla. El historial descargado incluye cuentas archivadas. Los errores de lectura impiden entregar un archivo parcial como válido. Esta lectura entre varias consultas no equivale a un snapshot transaccional ni acredita recuperación completa de la aplicación.
