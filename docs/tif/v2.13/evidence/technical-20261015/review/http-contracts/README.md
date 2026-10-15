# Contratos HTTP de consultas acotadas por dueño

Corrección en `6815bdcd325f49564961368cef289d3d85f51597`; fuentes exactas en `after-manifest.json`. No se modificaron SQL, grants, filtros de dueño, validaciones de negocio, rutas disponibles ni contratos de DELETE. El endpoint GET individual de inversiones no existe y no fue agregado.

La matriz nativa previa ejecutó con sesión A tres UPDATE de IDs B válidos: `PATCH /api/investments/{id}`, `PUT /api/recurring/{id}` y `PUT /api/budgets/{id}`. Los tres devolvieron HTTP500 genérico con todas las columnas B intactas. Esa observación prueba preservación de esos datos, pero falla el contrato HTTP; no corresponde BLOCKED por falta de acceso. SQL_security conserva el intento original y su delta en `../../security-matrix/review-reconciliation-before-http-fix.json`. El primer fixture de inversión en cuenta bancaria también expuso HTTP500 para una regla de elegibilidad ya existente.

Los tres UPDATE por clave primaria y `user_id` ahora clasifican exclusivamente `PGRST116` como 404. Estas consultas pueden devolver como máximo una fila; no se aplica un mapping global del código. Los demás errores siguen propagándose a HTTP500 genérico. El helper existente de inversiones devuelve 404 para cuenta ausente/ajena/inactiva y 400 para una cuenta cuyo tipo no es inversión; consulta y condición permanecen iguales. Un error de su `maybeSingle`, incluso un `PGRST116` inesperado, continúa como 500.

La revisión reprodujo además que GET y PATCH de movimientos confundían fallas desconocidas con ausencia: `PGRST205` producía 404 al leer el movimiento y 400 al leer sus cuentas. GET usa ahora el mapping de ausencia en el servicio y el handler conserva 500 desconocido. PATCH distingue el error desconocido antes de aplicar los 404/400 existentes; una fila perdida al UPDATE final devuelve 404, con los mismos filtros y sin reintento. No se tocaron `getById` ni `sell` de inversiones, fuera de los tres negativos observados.

## Evidencia ejecutada

El test nuevo ejecuta handlers y servicios reales con dobles sintéticos de Auth, base y cotizaciones. Antes: **11 PASS, 12 FAIL esperados de 23**, conservados en `before-tests.json`. Después: **23/23 PASS nuevos**, incluidos en **44/44 PASS** al ejecutar también tres archivos de regresión existentes (`after-tests.json`); no sumar ambos conteos. `npm run typecheck` y `npm run lint`: salida 0. SQL_security revisó estáticamente el diff y no encontró un defecto material.

Los controles verifican filtros ID+owner, ausencia de consulta sin dueño/reintento, 404 conocido, 400 de elegibilidad, 200 de fila propia, error desconocido 500 sin detalle interno y que una falla en las lecturas impida llegar al UPDATE/RPC del doble. Esto no equivale a observar efectos, rollback o RLS en Postgres real. El retest de los tres negativos con sesiones normales requiere la nueva compilación de root; permanece pendiente al generar esta evidencia. La verificación global anterior de 796 pruebas corresponde a `b456c4`, no a este cambio.

Comandos ejecutados desde la raíz, Node 22.17.0 / Vitest 5.0.3:

```sh
node node_modules/vitest/vitest.mjs run __tests__/owner-scoped-http-errors.test.ts --reporter=json --outputFile=docs/tif/v2.13/evidence/technical-20261015/review/http-contracts/before-tests.json
node node_modules/vitest/vitest.mjs run __tests__/owner-scoped-http-errors.test.ts __tests__/financial-validation-http.test.ts __tests__/investment-retry-boundaries.test.ts __tests__/investment-create-route.test.ts --reporter=json --outputFile=docs/tif/v2.13/evidence/technical-20261015/review/http-contracts/after-tests.json
npm run typecheck
npm run lint
```

La primera ejecución ocurrió antes del patch, con las fuentes de `before-manifest.json`. Para reproducirla ahora, crear un checkout temporal separado de `0c828ecdbcfab8842dcab071a4573ca6e91fd1d6`, copiar únicamente el nuevo test de `6815bdc` y usar el mismo lock/runtime. No revertir el checkout de trabajo compartido. El archivo `fixture-initial-before-*` conserva una primera ejecución con idénticas aserciones, anterior a corregir sólo las etiquetas parametrizadas y la limpieza del spy de consola; el resultado siguió siendo 11 PASS / 12 FAIL.

Los manifiestos, resultados JSON, stdout/stderr y `verification.json` hacen explícitos revisión y alcance. La recompilación, corrida global y resultado nativo posteriores deben guardarse como fases nuevas; estos intentos anteriores no se sobrescriben ni se promueven a aceptación integral.

## Seguimiento posterior a recompilar

`../global2-followup-verification.json` contrasta los resultados posteriores de root y SQL_security en `0169860`: global **819/819 PASS**, gates aprobados excepto audit de dependencias (7 high / 0 critical), y **3/3 UPDATE ajenos HTTP404** con snapshots completos B intactos. `../../security-matrix/foreign-updates-corrected.json` conserva el retest nativo; la matriz compuesta alcanza 42 PASS / 6 BLOCKED / 0 FAIL sobre sus 48 celdas únicas. El intento anterior con tres 500 y su delta de tres FAIL permanecen conservados. Esta revisión leyó y contrastó esos reportes; no los suma a las 44 pruebas focales ni los ejecutó de nuevo.
