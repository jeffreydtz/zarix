# Revisión independiente de cambios financieros y seguridad

Fecha: 2026-10-09, cierre de revisión de fuente 04:41 UTC.

Se revisaron aislamiento por tenant, permisos de tablas/RPC, recibos y outbox reservados al backend, cobro por factura autorizada y actualizaciones condicionadas, propiedad de las colas, reintentos de importación, altas/ventas de inversión y propagación de fechas de cotizaciones. Se verificó además que las 21 migraciones anteriores conservaron sus hashes Git originales.

La revisión ejecutó 264 pruebas focalizadas en 26 archivos, todas aprobadas. Ese conteo precede las nueve regresiones finales de importación/cotizaciones; esas correcciones recibieron revisión de fuente independiente y se incluyen en la corrida agregada final. No se presenta el conteo focalizado como una ejecución completa del proyecto.

Hallazgos corregidos antes del agregado:

- Venta calculada sobre una base de costo modificada concurrentemente: snapshot de precio/moneda/tipo validado bajo lock; recuperación del recibo anterior antes de esa validación.
- Alta de inversión sin recibo durable y solicitud de venta sin fecha que cambiaba su huella entre días: alta atómica con clave persistente y huella estable.
- Importación que describía como omitida una fila ya confirmada en DB cuya respuesta se perdió: conciliación de recibo exacto, estado pendiente cuando no es demostrable el resultado y conservación del lote. La misma protección alcanza la falla de cotización en un reintento concurrente.
- Fecha de cotización renovada al guardarse en el portafolio: hora original conservada o null si no hay fuente verificable; una edición manual conserva su fecha de edición.

No quedaron hallazgos P1/P2 identificados dentro del alcance revisado. Esto no equivale a una garantía de ausencia de defectos. Auth real, PostgREST, UI autenticada, carreras nativas, restauración de Auth/Storage y proveedores sandbox siguen bloqueados según el reporte técnico. La auditoría transitiva de dependencias se informa por separado y no queda aprobada por esta revisión de código.
