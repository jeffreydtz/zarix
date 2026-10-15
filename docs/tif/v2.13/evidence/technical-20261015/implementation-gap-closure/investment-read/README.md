# Lectura individual de posición — GET faltante

Implementado `GET /api/investments/[id]` con **14 pruebas focales PASS**. El test inicial de existencia conservado falló porque el módulo no exportaba GET; no se presenta como una respuesta HTTP real. Las pruebas finales llaman al handler y a `requireUser`/`errorResponse` reales con dobles de Auth y Data API. No ejecutaron sesiones JWT, RLS, consultas DB, proveedores ni navegador reales.

El GET reutiliza el cliente de la solicitud normal autenticada y aplica simultáneamente `id` y `user_id` verificado, además de RLS. No usa `createServiceClientSync` ni el `getById` del servicio privilegiado. Posiciones propias, incluidas archivadas, responden 200 con `Cache-Control: no-store`; ausentes o ajenas quedan indistinguibles como 404. Se conserva 401 para sesión ausente/rechazada y 503 para indisponibilidad de Auth. UUID inválido produce 400 antes de consultar inversiones y un fallo DB imprevisto devuelve 500 seguro, sin detalles crudos en respuesta ni logs.

Los bloques completos de PATCH y DELETE conservan exactamente sus bytes y SHA antes/después. No se modificaron cuotas, compras, ventas, cotizaciones, planes, tipos o esquema. Tampoco se añadió CRUD de preferencias para satisfacer una prueba.

Comando: `node22 node_modules/vitest/vitest.mjs run __tests__/investment-individual-read.test.ts --reporter=json --outputFile=<reporte>`, con Node instalado 22.17.0. [manifest.json](manifest.json) fija fuentes, snapshots no descubribles como tests globales, reportes y comprobación de preservación. El typecheck completo y lint focal final también terminaron con salida0; no sustituyen la próxima corrida global congelada.

Esto cierra la falta de implementación del recurso de lectura de posiciones relevante para CP2-19. La aceptación nativa del ID propio/ajeno con JWT real y los snapshots de U2 deben verificarse en la siguiente ventana aislada autorizada. No se promueve CP2-19 completo desde estos dobles ni se atribuye este delta al build anterior.
