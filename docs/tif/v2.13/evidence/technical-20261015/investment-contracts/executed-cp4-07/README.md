CP4-07: segundo diagnóstico autorizado

El intento anterior permanece en `attempt-1-effective-quote-fail.json`: obtuvo precio efectivo60000 y falló la expectativa110. Usó BTC y fecha06Oct, mientras el servidor era15Oct. No se atribuye de forma concluyente ese60000 a la respuesta503: el código tiene caché de aplicación y Nextfetch, y aquella respuesta podía provenir de un200 anterior. No se cambió producto ni tolerancia para cerrar el caso.

El segundo intento usa otro activo UUID sin caché previa y fecha actual para el precio110. El CSVCP4-07 no exige06Oct; ese valor perteneceCP4-06, que se conserva. Cada GETcaptura antes de las aserciones el precio, fuente, fecha, cantidad, costo, valor y P&L efectivos. El contador del servidor sintético registra una503 nueva para cada una de las dos ramas. Cada rama usa una posición nueva; sólo se archiva la anterior propia por API antes de continuar. La tercera posición propia conZZZ verifica error de valoración y fila completa sin cambios. No se borran cotizaciones.

`attempt-2-unique-fresh-cache-pass.json`:32assertionsPASS, fuente estable,12tablas originales intactas y limpieza de posiciones/cuenta propia. `attempt-2-readonly-receipts-and-positions.json` registra filas SQL tras limpieza y recibos inmutables de creación; estos recibos conservan la respuesta inicial, y no se presentan como una consulta SQL ejecutada antes de valorar. Cantidad6/costo600 se conservan en las tres filas y no hay ventas.

El controlador restauró los bytes exactos del control57910. Todo el proveedor es un doble local explícito: no demuestra una integración externa. El producto servido esGit836fd18/builda2WBtszbvrpoT9GHwToED; cambios actuales sin compilar se enumeran aparte.

Comando: `ZARIX_INVESTMENT_OFFLINE_PHASE=authorized-owned-57910-temporary ZARIX_INVESTMENT_FAULT_DDL=authorized-own-fresh-replica node docs/tif/v2.13/evidence/technical-20261015/investment-contracts/run-quote-offline-phase.mjs`. Sólo se ejecutó una vez el segundo diagnóstico autorizado.
