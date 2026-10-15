# Selección explícita de la fase global final

`build-technical-traceability.py --core-dir` selecciona los informes de una fase dentro del directorio de evidencia, sin sobrescribir la fase global anterior. El valor relativo se interpreta respecto de `--evidence-dir`; una ruta absoluta también es válida si permanece dentro de él. Un destino externo se rechaza. Sin la opción, se conserva el comportamiento anterior: `core/` si contiene `final-vitest.json`, o la raíz legacy.

Cuando el dueño haya terminado GLOBAL2 en `technical-20261015/core-final/`:

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools python3 scripts/build-technical-traceability.py \
  --evidence-dir docs/tif/v2.13/evidence/technical-20261015 \
  --core-dir core-final
```

El CLI lee Vitest y los tres reportes SQL usados para los contratos originales desde la fase seleccionada. Todas sus referencias, incluidas las equivalencias de outbox y los casos completos pendientes, apuntan a `core-final/`; `traceability-summary.json` registra `core_directory`. La existencia de una nueva fase, de Native/Auth o de FileVault no promueve contratos completos sin sus aserciones exactas.

[Cinco métodos CLI PASS](manifest.json), con logs y SHA256 de ambos scripts: el fixture pone resultados distintos en `core/` y `core-final/` y demuestra que se usan sólo los seleccionados, mantiene BLOCKED los CP/CNF completos, verifica referencias existentes, selecciona la equivalencia outbox actual y rechaza salir del directorio de evidencia. Son pruebas sintéticas del generador, no nuevas ejecuciones de los CU.

La evidencia global `core/` de `b456c4` se preserva. Los HTTP500 derivados con UUID válidos son defectos ejecutados que deben conservarse como FAIL antes de la corrección, aunque su comprobación de integridad haya aprobado; no se reclasifican como BLOCKED. La verificación HTTP y GLOBAL2 posteriores tienen sus propios informes y revisiones.
