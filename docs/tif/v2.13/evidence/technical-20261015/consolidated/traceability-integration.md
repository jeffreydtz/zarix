# Integración exacta de la matriz derivada

La matriz original `docs/tif/v2.13/casos_prueba.csv` conserva 273 filas y no se modifica. Su SHA256 es `887adbef81be56f781133ced65bee1c92effcf9af9a3e0b1b389eed0e4e2717d`. El CLI del commit `b456c4220ee524406670f65837fcd4fd6c4b8275` produce otra matriz y sus conteos, sin alterar el diseño original.

El script exige la evidencia final real en `core/final-vitest.json`, `core/balance-sql.json`, `core/shared-sql.json` y `core/database-verification.json`. La fase global `core/` de b456 tiene 796 aserciones Vitest y se preserva. GLOBAL2 en `core-final/` tiene 819/819 sobre freeze `0169860016125480c19f1284890e2b578f3236af`; una aserción focal o un grupo nativo no aprueba un contrato original completo. La selección nativa ahora prioriza `native-full/native-verification.json` y conserva el fallback histórico `native/native-verification.json`. Si existe `environment/runtime-manifest.json`, usa esa ruta en lugar de una referencia inexistente a `environment-and-blockers.json`. La regresión CLI ejecutó cuatro métodos, incluidas ambas estructuras de directorios, todos PASS; en el fixture sin aserciones exactas, las 273 filas permanecen BLOCKED y CNF-12 conserva el pendiente temporal y de browser.

## Reconciliación RTV-034/RTV-038

`consolidated/reconciled-contracts.json` preserva el contrato inline anterior y cita exactamente las dos aserciones de equivalencia outbox que volvieron a ejecutar las 819 pruebas actuales de GLOBAL2. El PASS corresponde a la equivalencia explícita con dobles y SQL aislado; no a entrega real de Telegram ni a un mecanismo inline inalterado. El generador lee esa definición desde `durability/reconciled-contracts.json`. El dueño de la consolidación puede instalar este pequeño artefacto de mapeo público después de revisar sus aserciones:

```sh
mkdir -p docs/tif/v2.13/evidence/technical-20261015/durability
cp docs/tif/v2.13/evidence/technical-20261015/consolidated/reconciled-contracts.json \
  docs/tif/v2.13/evidence/technical-20261015/durability/reconciled-contracts.json
DEVELOPER_DIR=/Library/Developer/CommandLineTools python3 scripts/build-technical-traceability.py \
  --evidence-dir docs/tif/v2.13/evidence/technical-20261015 \
  --core-dir core-final
```

No se copian informes viejos para aprobar una ejecución actual. El CLI sólo acepta esta reconciliación si el nombre completo de la aserción sustituta existe en `core/final-vitest.json`; su estado ejecutado decide PASS/FAIL/BLOCKED. Sin esa coincidencia, el caso sigue BLOCKED. Las tres antiguas aserciones de conciliación paginada son suplementarias posteriores al diseño original, sin IDs en las 273 filas: su reemplazo está documentado en `recompute-contract-reconciliation.json`, y no se inventan tres aprobaciones originales.

## Casos de sistema

`system-case-results.json` es opcional. Sólo agregar una fila con `complete_original_contract: true` cuando se haya ejecutado el contrato original completo, con todas sus precondiciones/oráculos, evidencias existentes y nombres de aserción exactos. Nunca poblarlo a partir de un recorrido parcial, de una lectura en otro browser, de un grupo nativo o de un listado de IDs en el harness.

Los informes de API y E2E declaran cobertura parcial. CP2-19 exige aislamiento SELECT/INSERT como U2 y UPDATE/DELETE mediante API y JWT/DB sobre cuentas, movimientos, posiciones, reglas, presupuestos y preferencias; los subconjuntos actuales no cierran esa matriz completa. CNF-01 carece de equivalencia del entorno de despliegue; CNF-02 no tiene observación mensual; CNF-03 y CNF-04 no acreditan TLS/cifrado de la instancia. CNF-09 no tiene la suite crítica en los cuatro navegadores y versiones actual/anterior. CNF-12 sigue sin el snapshot temporal y UI posteriores originales. No registrar esas filas como PASS por evidencia vecina.

Después de los resultados finales, ejecutar nuevamente:

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools python3 \
  docs/tif/v2.13/evidence/technical-20261015/consolidated/build-draft.py
```

Este helper regenera sólo `consolidated/technical-evidence-matrix.csv` y `consolidated/evidence-index.json`; no ejecuta SQL/API, no crea fixtures, no modifica fuentes ni aprueba contratos originales. Si el CLI produjo `traceability-summary.json`, conserva sus conteos exactos. Las filas de la matriz técnica son alcances y verificaciones solapadas, no casos únicos nuevos. Los informes no finales continúan BLOCKED.

La opción `--core-dir` es obligatoria al elegir GLOBAL2: no selecciona automáticamente un informe nuevo ni mezcla fases. Consulte la [regresión de selección de fase](traceability-guards-phase2/README.md), cinco métodos PASS. GLOBAL2 ya existe y la matriz actual fue regenerada con esa opción; la fase derivada anterior de `core/` se conserva en el commit e187b6c, además de su evidencia original intacta.
