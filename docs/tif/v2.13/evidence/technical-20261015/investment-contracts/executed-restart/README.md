Replay después de reinicio oficial: PASS por alcance derivado

El coordinador autorizó un único reinicio oficial de la quinta réplica. El agente de entorno reinició PostgreSQL y relanzó la misma copia físicaGit836, mismoBUILD_IDa2WBtszbvrpoT9GHwToED y entorno original de reloj normal; publicó state separado `proof-restart-app-state.json`. Este arnés no reinició procesos ni cambió código/configuración.

El único replay exige PGstart distinto y NextPID distinto(99286), manteniendo buildId. Con Auth normal y la clave/payload originales devuelve201 y exactamente el saleID0332bec5-2cb3-46d8-a81c-ac93569a9d91, q5. La comparación completa de posición, ventas, cuenta/ledger y recibos permanece idéntica; el recibo durable sigue siendo uno.40asercionesPASS,12tablas originales intactas, fuente estable y ningún error de cleanup.

El manifiesto une el informe previo de pérdida real del cuerpo201, su artefacto y las fuentes exactas ejecutadas. El informe de preservación64tablas/Auth/Storage del reinicio pertenece al agente de entorno; este resultado sólo prueba su replay financiero, sin apropiarse de aquella observación. No es una prueba de cola offline/browser ni de carga, y no crea otro casoCSV. Los cambios actuales no compilados están enumerados aparte.

Comando: `ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only ZARIX_INVESTMENT_WINDOW=after-ci4-and-finance ZARIX_INVESTMENT_APP_STATE=/tmp/zarix-runtime-20261015/proof-restart-app-state.json ZARIX_INVESTMENT_RESTART_ARTIFACT=/tmp/zarix-runtime-20261015/investment-contracts-78e3c532-f80f-4b76-9d8c-1e31132818b5/restart-replay.json node docs/tif/v2.13/evidence/technical-20261015/investment-contracts/run.mjs --case DERIVED-INV-RESTART-RESUME --api-only`.
