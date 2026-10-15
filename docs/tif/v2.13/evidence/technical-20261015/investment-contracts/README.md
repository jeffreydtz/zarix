# Inversiones: contratos preparados y ejecución aislada

Estado actual de esta fase: siete contratos originales completos PASS (CP4-02/04/05/07/10/11/12); CP4-01/06 tienen API/SQL PASS y aceptación UI pendiente, por eso permanecen PARTIAL. `executed/` conserva los primeros ocho resultados y el downgrade; `executed-cp4-07/` conserva tanto el fallo anterior como el segundo diagnóstico autorizado PASS. `executed-sources/` y los manifiestos por fase guardan bytes exactos, sin atribuir resultados viejos a la fuente más reciente. CP4-03 pertenece al focal del coordinador y CP4-08/09 a las dos simulaciones ya reconciliadas; no se duplican.

El downgrade local derivado y el nuevo ensayo separado de diez clientes HTTP son PASS por su alcance. El ensayo anterior que exigía diez sesiones PG permanece FAIL (18PASS/1FAIL, ocho201/dos500). El replay tras reinicio oficial también pasó40aserciones en `executed-restart/`, con mismo build y PGstart/NextPID distintos; no se infiere del replay normal. No hay promoción de estas pruebas derivadas a nuevos casos CSV ni a CNF de carga.

`preparation.json` se conserva como snapshot histórico de las03:41UTC, cuando todavía no había ejecución. Sus cero llamadas/resultados y hashes pertenecen exclusivamente a esa preparación; no describen el estado posterior. Los `node --check` sólo prueban sintaxis, mientras los informes ejecutados contienen Auth/API/SQL reales y sus límites. El CSV/matriz principal no se modifica aquí.

Los requests usan las dos identidades Auth normales existentes. BPremium se identifica explícitamente como U1 lógico y AFree como U2 lógico; la prueba exige el límite Premium20 existente y nunca altera planes. El SDK refresca normalmente la sesión local60s si faltan menos de10s, con una única promesa de refresco por usuario. No se crean credenciales, identidades ni recursos externos.

| Caso | Oráculo ejecutable preparado |
| --- | --- |
| CP4-01 | AAPL5×185 con fixture manual190.50USD: costo925, valor952.50, PnL27.50 y porcentaje27.5/925×100. La visualización+2.97% requiere UI real; API-only conserva el resultado parcial. El fixture manual no se declara integración real de cotizaciones. |
| CP4-02 | Compra10×100, venta4×120: remanente6/costo600, realizado80, valor660 y no realizado60 con precio110. Recibo original de compra y fila/endpoint de historial de venta permanecen separados; caja no cambia automáticamente. |
| CP4-04 | Literal q6/costo600, intento7:4xx conocido y comparación completa de posición, costo, ventas, recibos, cuenta y movimientos antes/después. No se infiere de una prueba vecina con otra cantidad. |
| CP4-05 | Dos fallos reales temporales, después de insertar posición y después de insertar el recibo de creación cuando ambas filas ya existen:500 y marcador único en log privado vinculado al proceso;0posiciones/0operaciones durables/caja intacta. Tras quitar el fallo, mismo ID/payload confirma una posición10/costo1000 y un recibo; reintento no duplica. |
| CP4-06 | FOOFIX manual2×50/actual55:100/110/10, fuente manual y timestamp fijo06Oct mediante UPDATE normal JWT sobre la posición nueva. API/DB prueban timestamp; la UI Manual/Precio ingresado no se presenta como mercado en vivo. La UI actual no muestra el timestamp manual: se declara el límite. |
| CP4-07 | Proveedor crypto local503 vinculado a PID/build, fiat1200 existente: conserva cache110/fecha actual y valor660; sin cache usa compra100 como `purchase_reference`, valor600 y timestamp null. ZZZ sin FX produce indisponibilidad explícita sin mutar cantidades/costo, nunca cero financiero inventado. |
| CP4-10 | Cuenta U2 y cuenta propia nueva desactivada: compras rechazadas404, sin posición/recibo nuevo. Portfolio propio y consulta normal JWT excluyen posición U2; todas sus columnas, caja, movimientos y ventas permanecen iguales. No se agrega GET individual ausente. |
| CP4-11 | Lotes6×100 y4×200 después de vender4 del original10: q10/costo1400/valor1500/no realizado100/realizado80. Precio original100, nuevo200; no promedio140. Ejecutar antes de cualquier venta histórica de B porque la API suma también ventas de posiciones archivadas. |
| CP4-12 | Efectivo externo0USD ya conciliado y cartera activa vacía: compra externa10×100 deja caja/movimientos intactos y posición1000; API cuentas+portfolio y suma independiente dan patrimonio1000USD. La regla existente no debita caja automáticamente. |

CP4-05 declara una diferencia de arquitectura: el texto original habla de operación seguida por persistencia de posición; `create_investment_once` inserta posición y después recibo durable dentro de la misma transacción. El arnés usa ese recibo como reconocimiento de compra y prueba ambos puntos reales de rollback, incluso cuando ambas filas ya existen. No inventa tabla de operaciones ni cambia el orden del producto. El resultado debe revisarse con esta reconciliación explícita; ninguna prueba derivada se promociona como otro caso original.

`DERIVED-INV-CONCURRENCY` abre un bloqueo nativo `FOR UPDATE` sobre una posición nueva, inicia requests normales y exige observar2 o10 conexiones PostgreSQL bloqueadas enlazadas transitivamente a ese PID mediante `pg_blocking_pids`. Sólo entonces libera el bloqueo y coteja HTTP, cantidad, ventas y recibos. Dos ventas distintas4 sobre q6 dan un201/un400 y q2;2 y10 reintentos del mismo ID dan el mismo saleID y un solo efecto. `Promise.all` por sí solo no acredita concurrencia; aquí únicamente recoge promesas que ya tienen handlers de rechazo. El timeout de PostgreSQL y HTTP es17s y la espera de solapamiento máximo12s. No es una prueba de carga del navegador ni CNF-11 completo.

La misma prueba descarta el cuerpo de una respuesta real201 después de recibir sus headers y comprueba replay único. Es pérdida del cuerpo antes de consumirlo, sin proxy, y no prueba pérdida de todos los paquetes. Guarda `restart-replay.json` sólo con IDs/payload sintéticos y hashes, sin credenciales. `DERIVED-INV-RESTART-RESUME` exige un reinicio oficial realizado por el coordinador: starttime PostgreSQL y PID Next deben cambiar, el build debe permanecer igual y el mismo comando devuelve el saleID original sin drift. El arnés nunca reinicia procesos. Las pruebas previas de cola offline/outbox conservan su propio alcance: este suplemento no las reemplaza.

Los contratos CU004 y concurrencia/fallos aceptan exclusivamente la réplica nueva API58321/PG58322 en127.0.0.1, Next3000/3002. Sólo DERIVED-PLAN-DOWNGRADE acepta la sexta59321/59322 y Next3003; no hay intercambio implícito de targets. SOURCE/RESTORE/LOAD/E2E original no se aceptan. Antes de cualquier mutación se consumen los manifiestos nativos reales, sin renombrar purposes ni fabricar otro wrapper:

- `proof-private/preparation.json` debe ser PASS_PREPARED, API58321 y projectUUID/stackID concretos. `proof-logins.json` exige purpose `fifth-isolated-acceptance-replica`, dos correos sintéticos `zarix-…@example.invalid` e IDs idénticos a sus dos comprobaciones Auth normales. La configuración física `proof/supabase/config.toml` debe conservar su hash documentado.
- El state nativo de ese stack debe apuntar al proyecto físico exacto `proof`; `SHOW data_directory` debe resolver al directorio de su propia instancia de servicio database, y `current_database()` a la base de la configuración. El log PostgreSQL se deriva únicamente de ese instanceID/launchID; nunca se enumeran contenidos de logs ajenos. Se publica sólo su hash de estado/directorio, no credenciales.
- `proof-build-proof.json` debe acreditar exitCode0, timestamps de inicio/fin, revisión, sourceCount/lista y mismo copyRoot/BUILD_ID/origenAPI/manifiesto que `proof-app-state.json`. Se cotejan BUILD_ID físico, PID escuchando y hashes de todas las fuentes protegidas tanto en repositorio como en copia construida. Todas las fuentes responsables de estos contratos deben existir en la lista, no basta una lista vacía. La estabilidad del momento se calcula con estos cotejos reales y no se inventa un booleano histórico.

Config/logins privados0600 existentes por defecto: `account-analysis-proof.env`, `proof-logins.json`, `proof-app-state.json`, bajo `/tmp/zarix-runtime-20261015`; los overrides sólo aceptan ese runtime. `ZARIX_INVESTMENT_TARGET_MANIFEST` opcional debe apuntar al mismo preparation nativo real; `ZARIX_INVESTMENT_BUILD_PROOF` permite el proof real ya existente, con su schema nativo. No se imprime su contenido. Los nuevos directorios de evidencia son0700 y archivos0600. Los informes sólo contienen datos financieros sintéticos y metadatos públicos de prueba. Logs originales con diagnóstico técnico se leen en privado sólo para buscar el marcador propio y no se copian al informe.

Los fallos DDL requieren además `ZARIX_INVESTMENT_FAULT_DDL=authorized-own-fresh-replica`, autorización ya limitada por el coordinador. Cada función/trigger se llama con UUID propio y predicado de dueño+cuenta nueva+nombre propio o dueño+requestID+respuesta propia. No hay grants públicos. La obligación de cleanup se registra antes del CREATE para cubrir fallo de transporte posterior al COMMIT; `finally` quita únicamente ese namespace. Se compara definición/ACL de funciones y triggers antes/después, además del snapshot financiero. El bloqueo de concurrencia también queda registrado para liberar únicamente su propio proceso/conexión.

Todos los caminos de error y cleanup se manejan. Sólo se archivan posiciones y cuentas creadas por esta corrida; se conserva historial/recibos y se cotejan todas las columnas de cada fila original en doce tablas. No se eliminan ni archivan originales para acomodar precondiciones. CP4-11 debe ejecutarse antes de casos con ventas; CP4-12 exige ausencia de riqueza activa ajena al fixture. Para CP4-07 el coordinador debe emitir `ZARIX_INVESTMENT_QUOTE_PROOF` con modo `crypto-unavailable-fiat1200`, PID/build/fuentes estables y orígenes upstream exclusivamente loopback.

Automatización Codex→Arc ya fue concedida y el preflight nativo terminó0. El bloqueo actual es−1728 al resolver la referencia devuelta de la nueva ventana privada; cierre propio no confirmado. Se espera la respuesta humana en el chat principal sobre si apareció/quedó cerrada, sin crear nuevas ventanas ni cerrar ventanas no identificadas. LittleArc está preparado/revisado pero no ejecutado; AX/ScreenCapture/ajusteJavaScript siguen sin habilitar. Los−1744 de artefactos previos son históricos. Este arnés no ejecuta navegador ni fallback. `--api-only` ejecuta los subscopes independientes y deja UI BLOCKED en un resultado PARTIAL/complete=false; sin ese flag, la aceptación que necesita UI bloquea antes de escribir el fixture. Sin aserciones ejecutadas no se produce PASS. La UI real futura necesita un driver separado autorizado, no un hero simulado.

Comando reproducible, sólo al liberar la ventana serial después de CI4/cotizaciones/focales/finanzas:

```sh
ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only \
ZARIX_INVESTMENT_WINDOW=after-ci4-and-finance \
ZARIX_INVESTMENT_FAULT_DDL=authorized-own-fresh-replica \
node docs/tif/v2.13/evidence/technical-20261015/investment-contracts/run.mjs --case CP4-04 --api-only
```

Los defaults descritos deben existir y acreditar el build/proyecto reales; cualquier override conserva los mismos guards. Una falla real ejecutada es FAIL; una precondición realmente ausente es BLOCKED; API/SQL comprobado con aceptación UI pendiente es PARTIAL. Ninguno implica aceptación completa de los cuatro CU, proveedores reales, disponibilidad mensual o cobertura global CI4.

## Suplemento de downgrade local de la sexta réplica

`DERIVED-PLAN-DOWNGRADE` sólo acepta59321/59322, Next3003 y `ZARIX_PLAN_TRANSITION_FIXTURE=authorized-sixth-cloned-B-only`. Usa `import-target.env` con sus claves reales ZARIX_IMPORT_* (incluida ZARIX_IMPORT_PG_BIN), logins purpose `sixth-isolated-acceptance-replica`, `import-target-private/preparation.json`, `import-target-app-state.json`, `import-target-build-proof.json` y copia `/tmp/zarix-app-import-target-20261015`. Valida los mismos vínculos físicos de proyecto/config/instancia/build/PID/fuentes. Los nombres privados originales se conservan, sin credenciales nuevas. Debe ejecutarse después de las pruebas Premium y sólo cuando el coordinador libere ese writer; CP2-07 usa A y este suplemento B.

La precondición exige B literalmente sin cuentas, movimientos ni posiciones, con Premium de fixture y mp_preapproval_id null. Crea cuatro cuentas propias nuevas (tres bancarias y una de inversión), cuatro ingresos10USD y una posición manual. Guarda exports JSON propios bajo Premium. El único DML administrativo de negocio es UPDATE a ese ID B clonado: status=CANCELED, current_period_end=now−1s y grace_period_end=null. Es una expiración explícita del fixture autorizado; `updated_at` se modifica por su trigger normal. No cambia mp_preapproval_id, Auth, perfiles, A ni ninguna fila financiera preexistente. No se llama a MercadoPago, no se registra cobro ni se acredita un período real abonado.

Auth normal confirma Free y límite3. Cuatro cuentas habilitadas bloquean nuevo movimiento403; la quinta cuenta y selección4 se rechazan sin efecto. Selección3 normal sólo afecta las cuatro cuentas creadas aquí, dado el guard de vacío literal; la cuarta permanece activa/legible pero no habilitada para nuevas operaciones. Una cuenta seleccionada acepta una alta; todos los cuatro movimientos anteriores conservan cada columna, se leen y se exportan idénticos, incluso desde la cuenta no seleccionada. La posición previa permanece y el portfolio sigue legible. Se cotejan todas las columnas AuthA/B y todos los otros campos públicos B mediante hashes.

Se conservan intencionalmente las cuatro cuentas nuevas, posición e historial para revisión, con tres habilitadas y BFree final. El informe identifica exactamente el delta permitido en usersB (status, período, gracia y updated_at); no dice que las doce tablas sean byte a byte idénticas. El guard final exige que todos los otros campos B y todas las demás filas originales mantengan sus hashes. No se restaura el plan ni se retrocede updated_at, no se usa session_replication_role, no se desactiva ni altera un trigger y no se hace cleanup oculto para maquillar hashes. Las funciones de rollback temporal de CP4-05 permanecen limitadas a583 y no se reutilizan aquí.

Comando reproducible adicional, con ventana general ya liberada y los proofs de la sexta efectivos:

```sh
ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only \
ZARIX_INVESTMENT_WINDOW=after-ci4-and-finance \
ZARIX_PLAN_TRANSITION_FIXTURE=authorized-sixth-cloned-B-only \
node docs/tif/v2.13/evidence/technical-20261015/investment-contracts/run.mjs --case DERIVED-PLAN-DOWNGRADE --api-only
```

Este suplemento produce evidencia de reglas locales Free/Premium y conservación durante downgrade; no promueve un caso CSV inexistente ni sustituye UI real, billing sandbox o lifecycle del proveedor.

## Resultados actuales y alcance temporal

- `executed-cp4-07/attempt-2-manifest.json`: producto servidoGit836/builda2WB;32asercionesPASS, dos503 locales observadas, fuentes estables y12tablas originales intactas. El control del doble57910 se restaura byte por byte. La fecha fija06Oct se mantiene enCP4-06, cuyo CSV sí la exige.
- `executed-concurrent-http/manifest.json`: diez despachosHTTP anteriores a la liberación y primera respuesta, exactamente dos sesionesPG observadas, diez201 con mismoID/una venta/recibo. Los dos500 previos reconocen su recibo existente sin escrituras nuevas; otra venta descarta cuerpo201 y reintenta con un solo efecto.32asercionesPASS. No afirma10sesionesPG ni aceptación de carga.
- `executed/derived-plan-downgrade-pass.json`:60asercionesPASS en la sexta réplica. El finalFree, las cuatro cuentas/posición/historial nuevos y la actualización normal deB son intencionales; todos los otros campos y originales quedan protegidos. No es un pago o suscripción real.

Los cambios actuales del checkout posteriores aGit836 (entre ellos export, UI de cotización, presupuesto y validación de cuentas) están declarados en `unbuiltCurrentDeltas` y no fueron ejecutados por estos builds congelados. CI4 no se atribuye a los arneses posteriores. Los manifests físicos del build y los hashes fuente antes/después delimitan cada resultado.

- `executed-restart/manifest.json`: único replay normalAuth después del reinicio oficial del mismo build836;40asercionesPASS, mismo saleID/q5, snapshot completo idéntico y12tablas originales intactas. La preservación64tablas/Auth/Storage del entorno pertenece al informe independiente del agente de entorno.
