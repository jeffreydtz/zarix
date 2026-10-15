# Publicación de la continuación técnica — cierre del 15 de octubre de 2026

Los dos controles globales se ejecutaron, en orden y con outputs nuevos, después del congelamiento de producto, documentos y matriz y del manifiesto final Native. Los resultados brutos se conservan: el exacto global sigue **FAIL con cinco rutas**; el control específico Native conserva sus **29 coincidencias iniciales y 30 actuales**. La revisión semántica no reemplaza esos resultados.

| Control | Alcance observado | Resultado bruto y revisión |
| --- | --- | --- |
| [Heurístico global](evidence-secret-scan-post-implementation-20261015.json) | 1926 archivos UTF-8 de cuatro raíces de evidencia | Dos campos de metadatos descriptivos; mismos archivos y hashes previamente adjudicados. **128 archivos binarios/imágenes excluidos y no inspeccionados.** |
| [Exacto global](exact-private-value-scan-post-implementation-20261015.json) | 53 valores privados históricos seleccionados frente a 2931 archivos versionados o no ignorados | **FAIL, cinco rutas**. Las cinco son byte idénticas al helper público de Git `84df929ab2f169251a49f3e95d0e0c148dfcb87c`, SHA-256 de archivo `1502eba6281f098c2d7cff8c6cbeb60a795dc0ef16b11239c8b6132af0ee7362`, que contiene un fallback local público. No hay exención general de valores por defecto. |
| [Control Native acotado](../native-delta/publication-selected-private-values.json) | Nueve valores seleccionados; 100 archivos anteriores al dictamen | Exacto bruto **FAIL con 30 archivos**, frente a 29 en el [primer intento preservado](../native-delta/publication-attempt-1-ambiguous-token/publication-selected-private-values.json). [La revisión independiente](../native-delta/independent-publication-candidate-review.json) clasifica las 60 líneas reportadas como identificadores, rutas, esquemas URI o literales del clasificador. El suplemento contextual de cero asignaciones/URLs no equivale a cero coincidencias exactas. |

El [dictamen final](publication-privacy-post-implementation-review.json) fija cada candidato por ruta/hash, las fuentes, comandos, outputs y límites. Ningún valor sospechoso, fragmento coincidente o hash de valor se publica; los hashes corresponden a archivos completos.

Los scanners preparados se ejecutaron con Node 22.17.0 y `DEVELOPER_DIR=/Library/Developer/CommandLineTools`, desde la raíz del repositorio:

```sh
node docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/publication/scan-evidence-post-implementation.mjs evidence-secret-scan-post-implementation-20261015.json
node docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/publication/scan-exact-private-values-post-implementation.mjs exact-private-value-scan-post-implementation-20261015.json
```

Ambos procesos terminaron con código 0. El JSON exacto conserva FAIL; el código de proceso no sustituye su lectura. Cada programa usa un basename local validado y escritura `wx`; no se sobrescribieron scanners ni informes históricos.

El producto estaba en `f5f362ee9dbb81da5268049cab41b357d90eccf1`; las pruebas Native corresponden a `730767b1723502b495d371e69c44df31eb230b56`. El [manifiesto Native final](../native-delta/native-delta-final-manifest.json), SHA-256 `5342ebfdb8e5e2b6a96d642d716b9993db453eaa6c4861172d393e28e47182a1`, contiene 105 archivos cuyos tamaños y hashes se comprobaron. El [peer de matriz](../independent-matrix-closure-review.json), SHA-256 `e72780a8312205812f3a2d08bf25ad1d1824d15685cf4f8426e1fe4695aa1920`, mantiene 273 casos: 238 PASS, 1 FAIL y 34 BLOCKED. Este cierre de privacidad no modifica ni promueve casos funcionales.

Los 53 valores históricos no representan los tokens/cookies nuevos que sólo estuvieron en RAM o en entornos de proceso Native. Sus controles tienen otro alcance: [CNF13 en RAM](../native-delta/runnernative/cnf13-robust-only/executed-attempt-1/privacy-and-cleanup.json) registra 13 valores seleccionados, 55 llamadas de consola capturadas, cero coincidencias y calibración positiva; su [publicación de ocho archivos](../native-delta/runnernative/cnf13-robust-only/executed-attempt-1/publication-check.json) compara ocho valores. No se suman ni se intercambian esas coberturas. La imagen sintética se generó en RAM, pero su base64 pudo persistir en una nota del clon privado y en su respaldo: no se describe como exclusivamente volátil.

Las revisiones públicas de [retención inicial](../native-delta/retention/independent-public-retention-review.json) y [retención CNF13](../native-delta/retention-cnf13-robust/independent-public-retention-review.json) conservan sus límites: fuentes y metadatos de respaldo/parada, 39 tablas originales protegidas, archivo nuevo con 65 tablas, Auth con cero sesiones/grants y actores detenidos según los informes. No se abrieron los respaldos privados ni se infiere una nueva prueba integral de restauración o Storage de estas retenciones.

El heurístico añadió explícitamente la raíz CP1-08 a las tres raíces técnicas. El exacto conserva su inventario explícito de material privado existente, compara bytes elegibles incluso binarios y excluye archivos ignorados/externos. Ninguno prueba ausencia universal de secretos; los binarios no reciben una revisión visual en este cierre.

Los outputs se crean después de su propia enumeración. El heurístico precede al exacto, por lo que el segundo incluye el informe heurístico. Este documento y el dictamen final se redactaron después de ambos y se revisaron como metadatos públicos, sin nueva lectura privada ni reejecución. No se presentan como inputs de esos controles. Cualquier cambio posterior queda fuera de estos resultados y debe mantener ese límite.
