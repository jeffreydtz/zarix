# Importe cero en importación JSON

El ensayo nativo CP1-20 sobre `836fd18` recibió HTTP503. La lectura SQL independiente confirma dos movimientos válidos (500 y700), saldo10200 y dos recibos; la fila de importe0 no tiene recibo. El contador `pending` de esa respuesta no se guardó y no se infiere como medición.

El parseo JSON dejaba pasar el importe0 a la RPC. El contrato de base ya lo rechaza; la reconciliación conservadora de errores RPC lo mantenía pendiente. CSV descarta ese mismo importe antes de escribir. El parche valida el importe positivo finito después de consultar recibos previos y antes de persistir, conservando los índices y hashes de las filas válidas.

Las dos regresiones de array/backup fallaron antes (24PASS/2FAIL) y pasaron después (26PASS). Comprueban `[500,0,700]`, recibos `transaction:0`/`transaction:2`, reintento del mismo lote sin nuevos efectos y ninguna consulta FX. Auth y RPC son dobles explícitos; no sustituyen la prueba nativa. TypeScript y lint focal terminaron con código0. Los logs originales, las respuestas Vitest y los hashes están en [verification.json](verification.json).

Pendientes: CI5 completo y API compilada final, incluido replay del lote antiguo sin reactivar su cuenta archivada. El formato y los contadores existentes de respuesta permanecen iguales.
