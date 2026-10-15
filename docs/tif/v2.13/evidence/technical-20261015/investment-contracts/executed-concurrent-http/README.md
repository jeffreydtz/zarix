Diez clientes HTTP: prueba derivada separada

El ensayo previo `executed/derived-inv-concurrency-fail.json` permaneceFAIL:18asercionesPASS, unaFAIL al exigir10sesionesPG; ocho201 y dos500 observados. No se atribuye causalidad concluyente ni se rebaja ese oráculo.

En esta prueba autorizada se despachan10clientesHTTP con intentos distintos y la misma clave durable. Los diez comienzan a04:16:22.392–.393Z; se observan exactamente2sesionesPG vinculadas al bloqueo propio y se comienza a liberar a.526Z. La primera respuesta se observa a.610Z. El bloqueo mantiene0ventas. Los diez reciben201/mismoID, con1venta/1recibo y q6/costo600. No se esperaron10sesionesPG ni se indujo el bloqueo12s del ensayo anterior.

Las dos respuestas500 anteriores se reintentan con su clave/payload originales: ambas reconocen el recibo ya existente, sin cambiar la posición, ventas, cuenta, ledger ni recibos previos. Otra posición propia recibe201 por una venta1, descarta realmente el cuerpo de respuesta y reintenta: q5/costo500,1venta/1recibo. El archivo `restart-replay.json` queda preparado para reinicio oficial deNext+Postgres; aquí NO se ejecutó reinicio.

Resultado32assertionsPASS, fuentes estables y12tablas originales intactas. Cada snapshot es exactamente el código ejecutado, separado de fuentes posteriores. Todo ocurrió con Auth normal en58321 y productoGit836/builda2WBtszbvrpoT9GHwToED. No es una pruebaCNFde carga ni aceptación completa de un nuevo caso original.

Comando: `ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only ZARIX_INVESTMENT_WINDOW=after-ci4-and-finance ZARIX_INVESTMENT_FAULT_DDL=authorized-own-fresh-replica node docs/tif/v2.13/evidence/technical-20261015/investment-contracts/run.mjs --case DERIVED-CONCURRENT-10-HTTPCLIENTS --api-only`.
