# Chrome real, reintentos y aislamiento de referencias

Resultado compuesto: **4/4 comprobaciones acotadas PASS**, dentro de CU001 y CU002. Se ejecutaron Chrome instalado, login normal, UI→Next→PostgreSQL nativo y oráculos SQL independientes sobre la réplica API 57321/DB 57322. Esto no cierra todos los CP ni los CU completos y no agrega un quinto caso de uso.

El build fue `kxdFHyjeNiKh0b2feujgO`, aplicación compilada en `0169860016125480c19f1284890e2b578f3236af`. El perfil privado temporal 0700 reutilizó exactamente los usuarios A/B existentes. Los JSON identifican revisión, hashes, versiones, fechas, requests saneados, capturas y PID de Chrome. La guía de comandos es [isolated-offline-durability.md](../../../../../testing/isolated-offline-durability.md).

| Alcance | Evidencia real | Resultado |
| --- | --- | --- |
| CU001 offline | Gasto 11,11 persistido en IndexedDB; cero efectos SQL sin red; Chrome 96141 cerrado y nuevo 96411; selección del ID original en cola; un recibo y movimiento, saldo 9988,89 | PASS |
| CU001 pérdida de respuesta | `route.fetch` recibió HTTP 201 y SQL confirmó gasto 22,22; `route.abort` impidió el acuse; Chrome cerrado; Next 94395→96909 reiniciado por el padre con mismo build; recuperación del ID/recibo/huellas originales, un efecto y saldo 9966,67 | PASS |
| CU001 intenciones nuevas iguales | Dos altas UI nuevas, secuenciales, con payload idéntico 33,33; dos claves, IDs, recibos y efectos distintos; saldo 9900,01 | PASS |
| CU002 cambio A→B | Logout/signin normales en el mismo perfil; formulario abierto limpiado; cuenta/categoría/borrador A ausentes de referencias, opciones y menú de B online/offline; snapshot A previo de 3924 ms | PASS |

El [composite-verification.json](./browser-real-20261015-02/composite-verification.json) enlaza cada resultado con su caso y reporte originales. El [post-run-auth-and-cleanup.json](./browser-real-20261015-02/post-run-auth-and-cleanup.json) confirma nuevamente Auth normal A/B, logout local de sólo esas sesiones SDK temporales y cuatro movimientos/cuatro recibos/saldo 9900,01 después de la fase de identidad. No se repitieron los gastos para corregir el arnés. Las cuentas/categorías sintéticas adicionales del intento interrumpido se conservaron.

## Fallos y reparación conservados

`browser-real-20261015-01/prepare-verification.json` conserva FAIL del primer intento, antes de Chrome: el sandbox default rechazó sockets localhost con `EPERM`; el SDK devolvió `AuthRetryableFetchError` status 0. Los GET de salud sin credenciales a 3000 y 57321 también devolvieron `EPERM`. El permiso de sockets autorizado permitió la corrida 02. No fue un rechazo de credenciales del producto.

En la corrida 02, [prepare](./browser-real-20261015-02/prepare-verification.json) terminó `WAITING_SERVER_RESTART`; el padre produjo prueba de reinicio real de Next. [resume](./browser-real-20261015-02/resume-verification.json) conserva **FAIL global con sus dos comprobaciones CU001 PASS**: CU002 encontró dos botones `Nuevo` después de hidratar navegación y hero. El reporte original no llegó a su guard final de fuentes; su manifiesto inicial coincide con prepare.

El arnés se corrigió sólo para seleccionar el hero de Movimientos y ejecutar `identity` sin repetir las operaciones financieras. [identity](./browser-real-20261015-02/identity-verification.json) obtuvo CU002 PASS, `sourceStable=true`, el mismo build y el manifiesto de aplicación original exactamente igual. Registra por separado el arnés original `01ff7569…` y el reparado `6d3e0ce7…`. El cambio posterior del arnés tuvo node check/lint y [5 guardas de destinos/purpose PASS](./identity-harness-guards.json); no se atribuye al core819 anterior.

## Privacidad, perfil y límites

Siete capturas de la corrida fueron inspeccionadas directamente, también por `dependency_audit`: sólo datos sintéticos y formulario B offline, sin secretos visibles. El [scan de credenciales conocidas](./browser-real-20261015-02/known-credential-scan.json) no encontró valores privados de fixture, tokens ni claves anónima/service-role en los archivos revisados. No se publican cookies, JWT, passwords, capacidades, HAR ni trazas crudas. La inspección visual no afirma revisar metadatos PNG ni reemplaza las aserciones del caso.

El último Chrome, PID 99822, salió confirmado a `2026-10-15T01:37:12.585Z`. Después se eliminó **únicamente el perfil temporal propio**, comprobando PID ausente, directorio real con prefijo del runner, sin symlink y permisos 0700. La preferencia posterior del padre por retenerlo llegó después de ese cleanup; se conserva esta limitación explícita. El perfil no pertenecía al usuario original. Los datos SQL, reportes, capturas, hashes, fixture de login privado y estado 0600 permanecen. El estado conserva el item original seleccionado para pérdida de respuesta; **no es un respaldo completo de IndexedDB** y ya no se ofrece el perfil/IndexedDB bruto para auditoría o reanudación.

La concurrencia PostgreSQL, outbox, CU003/CU004, proveedores y requisitos visuales tienen evidencia separada. Aquí las dos intenciones nuevas son secuenciales y el reinicio probado es de Chrome y Next, no de máquina ni PostgreSQL. El reinicio oficial posterior del stack E2E corresponde a `environment/e2e-stack-restart.*`. El recorrido utilizó los dobles de cotizaciones configurables declarados para este entorno; no midió ni garantizó la salida global del servidor, cuyos widgets también contienen integraciones públicas reales. No ofrece aceptación de proveedores reales. CNF-02 mensual sigue requiriendo observación real durante el período.
