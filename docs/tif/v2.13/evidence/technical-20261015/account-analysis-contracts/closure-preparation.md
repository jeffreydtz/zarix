Preparación separada para CI6; ninguna corrida acreditada aquí

El perfil `final-core-closure` admite sólo CP2-05 y CP3-04/05/06/08/18. Se fija Git84df929ab2f169251a49f3e95d0e0c148dfcb87c y `core-closure`, después de los17gates deCI6. Los resultadosCI5 en `executed-final/` permanecen byteporbyte, incluidos306/318FAIL y205FAILderivado/originalPASS.

Native confirmó estos archivos privados: `closure-proof-build-proof.json`, `closure-proof-app.env`, `closure-proof-clock-app-state.json`, `closure-proof-clock-observation.json` y `closure-proof-clock-gemini-*`. La copia es `/tmp/zarix-app-closure-final-20261015`; el state purpose sigue `account-analysis-proof` y state/proof runtimeProfile `final-core-closure`. API58321/PG58322 y Next3002 son la misma quinta réplica sintética; Native usa `proof.env` para vincular sus credenciales sólo en memoria. El directorio de preparación versionado es `closure-final-preparation/`. El guard compara core limpio/estable, todos los bytes físicos/fuentesGit, BUILD_ID, entorno nativo/proyecto/config/data_directory y PID/listener/cwd, más observación de reloj/preload y guardGemini real. No basta cambiar el nombre del perfil.

Orden propuesto, sólo después de READY y release explícitos del padre: CP3-18 parcial primero, CP3-06 precisión, y calibracionesCP2-05/CP3-04/CP3-05/CP3-08 en serie. No se recrean identidades, planes ni proveedores externos. Se crean fixtures nuevos propios y se archivan al finalizar; filas anteriores se preservan en13tablas. El literal deCP3-06 exige181.67 y el texto SSR se comprueba; el texto de205/304/305 se registra sin agregar un criterio decimal al CSV.

CP3-18 crea ARS120000 y un fixture legado propioZZZ10 mediante Auth/RLS normal, con ledger consistente, sin agregar endpoint. El API debe conservar10ZZZ y explicar la falta de cotización, sin fabricar conversión0/1. El SSRreal debe demostrar subtotal120000ARS/100USD, valoración parcial y exclusión explícita del UUIDZZZ con causa. `--ssr-partial` protege todas las filas de `net_worth_snapshots`, incluidoUUID125cf6c5-58b2-4bc8-be34-fd4a479eaea0 retenido deCI5, y compara tabla completa antes/después. No se borra/restaura una fila para ocultar un fallo. Los GETdashboard de valoración completa posteriores pueden actualizar sólo ese UUID propio si se entrega el reporte privado que prueba su creación inicial donde había0filas, con proyecto/owner/hash exactos; los demás snapshots nunca se excluyen de la protección.

Los helpers analizan sólo JSONdeFlight y HTMLdel response Auth normal, sin ejecutarJavaScript ni abrir navegador. El módulo de los props debe coincidir con el manifiesto compilado realNetWorthHero o AnalysisCharts/AnalysisPeriodPicker. No se afirma aceptación de animación, hidratación, gráficos o visual por estas lecturasSSR.

Comando preparado deCP3-18:

```sh
ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only \
ZARIX_ACCOUNT_ANALYSIS_WINDOW=after-load-quotes-focal-finance \
node docs/tif/v2.13/evidence/technical-20261015/account-analysis-contracts/run.mjs \
  --case CP3-18 --profile final-core-closure --runtime-mode clock --api-only --ssr-partial
```

Para306/205/304/305 se usa `--ssr-wealth` y el reporte privado original de propiedad como `ZARIX_ACCOUNT_ANALYSIS_SSR_OWNERSHIP_SOURCE`. Para308 se usa `--ssr-analysis`. Estas recetas preparadas y los `node --check` no son una ejecución ni un PASS financiero. No se ejecutan hasta READY/release.
