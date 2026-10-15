# Publicación de la continuación: preparada, sin ejecutar

Estas copias conservan intactos los scanners y resultados históricos. El heurístico añade explícitamente `docs/tif/v2.13/evidence/delta-20261015-cp1-08` a las tres raíces técnicas, de modo que incluye los tres paquetes actuales. El exacto conserva su inventario privado explícito y sustituye cualquier fallo de lectura/JSON privado por errores genéricos; no publica inputs, excepciones ni diagnósticos crudos.

Sólo se ejecutó la comprobación de sintaxis de ambas fuentes, con código 0. No se abrió ningún archivo privado ni se ejecutó un scanner. [El dictamen de preparación](independent-publication-preparation-review.json) fija fuentes, cambios, límites y antecedentes por hash.

Tras el congelamiento y el release del padre, desde la raíz del repositorio y con Node 22:

```sh
node docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/publication/scan-evidence-post-implementation.mjs evidence-secret-scan-post-implementation-20261015.json
node docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/publication/scan-exact-private-values-post-implementation.mjs exact-private-value-scan-post-implementation-20261015.json
```

El orden es heurístico y luego exacto. Los nombres sólo admiten basenames JSON locales y los programas rechazan outputs existentes, además de escribir con wx. Si hace falta otra fase, elegir otro basename; no borrar ni sobrescribir evidencia. Un proceso que termina con código 0 no adjudica candidatos: el exacto puede conservar status FAIL y el heurístico requiere revisar su lista.

El heurístico excluye binarios/imágenes y el exacto cubre sólo sus valores seleccionados, aunque compare sus bytes con archivos binarios del repositorio. No se afirma ausencia universal de secretos. Los tokens/cookies nuevos de Native730 quedaron en RAM/entornos de proceso según su owner; no se presentan como valores comparados por el collector histórico. Cada candidato nuevo requiere revisión concreta, aunque parezca un antecedente conocido.
