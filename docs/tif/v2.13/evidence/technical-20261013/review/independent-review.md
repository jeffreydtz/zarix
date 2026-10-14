# Revisión independiente — continuidad del 13 al 14/10/2026

**Los dos defectos materiales identificados están corregidos y tienen prueba focal. La aceptación final del sistema sigue pendiente de la corrida estable del padre.** Esta revisión no fusionó ni desplegó el PR y no accedió a producción o al proyecto Supabase ajeno.

La base de comparación es `b40feeed28d6e9ea6e8b0b2f112119e2435de1df`. Se capturó primero el árbol de trabajo con HEAD `f3218f97efc4f1a84c8f41a3491952d55c283d60`; tras la integración remota, HEAD observado es `316b393577fe15ffac81cf5595459a191337aeaf`. Las fuentes aún tienen cambios locales. [source-manifest-reviewed.json](source-manifest-reviewed.json) identifica 45 archivos relacionados y SHA256 del manifiesto `faa9b854fd0da301bc3be2038e74d9ec512b26fb9993f80787f774a0a8922547`. Es la identidad del árbol revisado, no una afirmación de commit limpio o estabilidad futura.

## Hallazgos y cierre

1. **P1, cerrado en la fuente revisada — intenciones financieras simultáneas fusionadas.** El borrador anterior se recuperaba por propietario + `draftScope`, aunque los dos formularios no declararan un reintento. Dos altas nuevas con el mismo contenido podían terminar confirmadas con un único ID/efecto. La reproducción contra el snapshot previo falla con `expected 1 to be 2`. Ahora una intención nueva genera UUID propio; sólo `pending`/`intentId` explícito o la selección `recoverFinancialOperation(id)` recuperan el ID y payload existentes. Se revisaron el hook, creación de cuenta, reintento de cola, filtro de propietario/grupo y orden de operaciones PUT/venta. La cola explica que volver a cargar desde un formulario nuevo crea una intención nueva; después de reiniciar se selecciona la solicitud guardada, sin adivinar por contenido. [Reproducción previa](independent-focals-pre-fix.json): 3 PASS y 1 FAIL esperado. [Fuente corregida](independent-focals-after-fix.json): 4/4 PASS con dobles explícitos.

2. **P2, corregido por esta revisión — BLOCKED convertido en FAIL.** `scripts/build-technical-traceability.py` admitía un registro de sistema `BLOCKED`, pero todo match que no fuera PASS se agregaba como FAIL. La agregación ahora da precedencia a una falla ejecutada; después conserva BLOCKED; sólo emite PASS si todos los resultados pasan. `scripts/test-technical-traceability.py` ejecuta el CLI real con evidencia sintética temporal: PASS/FAIL/BLOCKED de sistema, combinaciones PASS+BLOCKED y FAIL+BLOCKED, múltiples resultados aprobados, caso sin evidencia, conteos de la matriz y exactamente cuatro CU. [Antes](traceability-before-fix.log) reproduce tres subfallos de estado; [después](traceability-after-fix.log) pasan los tres métodos de regresión. Estos fixtures prueban agregación de informes, no los contratos originales de los CU.

## Pruebas ejecutadas y alcance

- **58/58 pruebas focalizadas en cinco archivos**: simulación matemática y handlers con hooks dobles, metadata FX de servicio y render SSR, y guardas puras de destino nativo. [JSON](review-focals.json). No se suman al total de la corrida final como casos únicos adicionales.
- **4/4 focales independientes después del fix**: intenciones nuevas simultáneas, scopes diferentes y `/health` mínimo/error. Auth, IndexedDB, HTTP y cliente de servicio usan dobles declarados. La prueba de `/health` exige lectura de `id`, filtro `is_system=true`, límite 1 y respuesta sólo estado/latencia; el error de backend produce 503 sin copiar su detalle.
- **Tres métodos Python de regresión de trazabilidad**, con subcasos y CLI real sobre fixtures. No hubo actualización de dependencias ni instalación por esta fase.

[review-proofs.json](review-proofs.json) conserva comandos, códigos, artefactos y hashes del fixture/snapshots. El fixture temporal inicial omitía el header obligatorio `Idempotency-Key` en su respuesta doble; se corrigió antes de clasificar el fallo. La salida inicial no se usa como evidencia de defecto del producto.

## Inspección adicional

- **Simulación:** función pura, entradas finitas, mínimo -100%, overflow, precio por VN100 de bonos, moneda, privacidad, precio/fecha de referencia congelados y gating Premium. No se encontró una llamada de escritura desde el cálculo/formulario. Historial/lectura no se retiran al deshabilitar la simulación.
- **Metadata FX:** tipo, lado, tasa, proveedor y fecha viajan con la muestra realmente usada por cuentas/posiciones. Patrimonio conserva referencias por componente; el respaldo persistido no inventa proveedor original. Los cruces de otras monedas y la procedencia histórica se declaran aparte. No se aprobó CP3-19, cuyo MEP seleccionable contradice la referencia blue documentada.
- **Nativo/recuperación:** destinos loopback, rechazo de redirects y parámetros de conexión, saneamiento de variables libpq, guardas de base distinta/vacía, Auth normal, RPC backend denegado a roles ordinarios, locks de sesiones independientes, rollback y comparación de catálogo/datos. La continuación de recuperación valida el manifiesto SQL contra el checkpoint y distingue las pruebas anteriores de las ejecutadas de nuevo. La segunda instancia restaura login Auth y binario Storage por separado, sin confundir el dump SQL con cobertura de archivos. Esta revisión inspeccionó código; no ejecutó ese stack.
- **API/E2E/carga:** clientes normales sintéticos, SQL independiente, observaciones sin cookies/headers/cuerpo y capacidades redactadas. E2E ya incluye escenarios de simulación con hashes financieros antes/después y manifiesto estable. Carga separa perfil caliente, arranque frío y caída de proveedor, conserva errores/timeouts, declara red CDP por target y deja bloqueada equivalencia de despliegue. No se llamó Safari a WebKit ni se atribuyó aceptación de cuatro navegadores a Chrome. No se ejecutaron estos runners en esta revisión.
- **Orquestador:** conserva manifiestos antes/después y estado git; build usa Supabase ficticio explícito; auditoría FAIL no se suprime en evidencia. Datos sintéticos SQL, sesiones nativas, UI y proveedores mantienen informes separados. Las equivalencias de outbox declaran PGlite/Auth/Telegram doble y aviso al menos una vez; no se promete entrega exactamente una vez a Telegram.

## Pendientes y límites

Se comunicó al dueño del harness nativo una precaución concreta de publicación: `test()` y el catch final aún copiaban `error.message`, y `command()` incorporaba stderr completo de psql/pg_restore. Un error SQL puede contener valores del fixture Auth o capacidades. **No se observó una filtración de secreto en la evidencia leída**, pero esos errores crudos deben permanecer privados y sanitizarse antes de versionar informes. No se modificó el harness ajeno.

La revisión se hizo sobre fuentes en evolución; el manifiesto lista qué cambió respecto del primer snapshot. El padre debe consolidar la revisión definitiva y ejecutar los gates/integraciones/E2E contra esa fuente estable. Las pruebas focales no acreditan proveedores sandbox reales, restore ejecutado, carga equivalente, compatibilidad visual completa, HTTPS/cifrado de la instancia ni CNF-02 mensual. No se fabricó evidencia para cerrar esos límites.

Las interrupciones observadas devolvieron `exec-server transport disconnected`. No se observó en las herramientas un aviso de producto «desactualizado», ni se dedujo una versión incorrecta a partir del timeout.

## Reproducción focal

Desde la raíz del repositorio, Node 22–24 e instalación existente:

```sh
python3 scripts/test-technical-traceability.py
node docs/tif/v2.13/evidence/technical-20261013/review/reproduce-independent-focals.mjs
node docs/tif/v2.13/evidence/technical-20261013/review/reproduce-independent-focals.mjs --before
```

El último comando ejecuta snapshots anteriores conservados y debe fallar únicamente en el caso de las dos intenciones nuevas (3 PASS / 1 FAIL). Los fixtures y matrices se crean en directorios temporales locales (`/tmp` o el temporal del sistema); no escriben datos del producto ni usan integraciones externas. Los snapshots son fuente de código, no una copia de credenciales, sesiones o datos reales.
