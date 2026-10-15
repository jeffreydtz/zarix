# Consolidación técnica del 15/10/2026 — borrador

La entrega es parcial y revisable. El alcance conserva exactamente CU001 movimientos, CU002 cuentas/datos personales, CU003 análisis financiero y CU004 inversiones. El PR sigue sin fusionar ni desplegar. Se usaron datos sintéticos y entornos locales; los resultados de una fase se atribuyen a sus fuentes y build concretos.

La última matriz reconciliada contiene **213 PASS, tres FAIL y 57 BLOCKED**, sobre los 273 casos originales. El paquete posterior de cuentas/análisis ya tiene revisión independiente e integración: registra ocho contratos PASS y dos FAIL observados, CP3-06 y CP3-18. Estos fallos se conservan durante su corrección; CI6 ya cerró sus gates; su copia ya está lista; las seis lecturas SSR de aceptación esperan su ventana independiente. Una prueba parcial, un arreglo implementado o una preparación de entorno no aprueban un contrato original completo.

## Revisiones y comandos

| Fase | Revisión del producto | Resultado global y alcance |
| --- | --- | --- |
| GLOBAL1 | `b456c4220ee524406670f65837fcd4fd6c4b8275` | [core/](../core/verification.json): 796/796 Vitest. Evidencia histórica anterior a los errores HTTP posteriores. |
| GLOBAL2 | `0169860016125480c19f1284890e2b578f3236af` | [core-final/](../core-final/verification.json): fuentes limpias/estables; incluye la corrección de tres UPDATE ajenos antes HTTP 500. |
| CI3 responsive | `bb2e8a6aa5de7f7f26ba745da67257b0f1f25e81` | [core-responsive/](../core-responsive/verification.json): 819/819 Vitest; 16 de 17 registros PASS y auditoría FAIL. |
| CI4 fiabilidad | `836fd18b310a51cced9074b372a80ce5d7e1a870` | [core-reliability/](../core-reliability/verification.json): 862/862 Vitest en 86 archivos; 16 de 17 registros PASS y auditoría FAIL. Las copias quinta, sexta e intermedia tienen builds propios. |
| CI5 aceptación | `7c3e8722d8fcdc5d95d205e9a12eb856647e0e06` | [core-acceptance/](../core-acceptance/verification.json): **891/891 Vitest en 89 archivos**, fuentes limpias/estables, 16 de 17 registros PASS. La consulta audit original falló; la reconsulta válida está separada. |
| CI6 cierre | `84df929ab2f169251a49f3e95d0e0c148dfcb87c` | [core-closure/](../core-closure/verification.json): **913/913 Vitest en 92 archivos**, fuentes limpias/estables, 16 de 17 registros PASS; audit FAIL de consulta. Nueva copia/build y contratos SSR posteriores separados. |

Cada informe conserva comandos, códigos de salida, logs, manifiesto y revisión. Los 17 registros incluyen `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:coverage`, `npm run test:db`, `npm run build` y comprobaciones SQL/trazabilidad adicionales. La instalación de CI5 usó Node 22 compatible y compilación aislada contra loopback.

CI5 instrumenta **37 archivos**: líneas 1810/2492 (72,63%), sentencias 2015/2895 (69,60%), funciones 281/414 (67,87%) y ramas 1587/2507 (63,30%). Es la cobertura del alcance configurado, no de toda la aplicación. Los siete informes SQL contienen **238 aserciones físicas PASS**: saldos 28, compartidos 11, planes 18, durable 25, importación 10, conciliación 18 y esquema/recuperación 128. `test:db` repite esos alcances; no son 238 casos originales distintos.

CI6 instrumenta también **37 archivos**: líneas 1824/2501 (72,93%), sentencias 2029/2904 (69,86%), funciones 283/416 (68,02%) y ramas 1617/2531 (63,88%). Los 17 registros cierran con 16 PASS y un fallo de consulta audit; la cobertura CI5 anterior queda separada.

La [auditoría CI5 original](../core-acceptance/dependency-audit.json) falló al consultar el registro y carece de metadata de vulnerabilidades. La [reconsulta válida actual](../dependencies/ci5-current/README.md) observa **siete altas y cero críticas**; `--omit=dev` observa cero. Se preservan ambas evidencias. La consulta a registros y fuentes primarias no identificó un parche compatible publicado para la cadena afectada; no se aplicaron cambios mayores incompatibles. El resultado completo sigue FAIL.

## Qué se comprobó

| Alcance | Resultado y evidencia | Límite |
| --- | --- | --- |
| Auth, RLS, grants y RPC nativos | [Native22](../native-full/README.md): 22/22 grupos PASS, baseline y 27 migraciones, dos usuarios normales y capacidad de invitado. Incluye IDs manipulados, tokens, concurrencia, rollback, idempotencia y planes. | Los grupos y pruebas internas no se suman como casos originales únicos. |
| Conciliación atómica de saldos | [Ensayo focal](../account-recompute/README.md): 18 SQL, siete grupos nativos y 11 Vitest PASS, con reproducciones anteriores conservadas. | Informe separado de los 22 grupos. Tipos: 27 tablas/30 funciones. Advisors: nueva RPC sin hallazgos; catálogo restante con 61 INFO, 31 WARN y cero ERROR. |
| API y UI de los cuatro CU | [E2E](../e2e/README.md): siete grupos API y cuatro recorridos UI acotados PASS, general PARTIAL, sobre producto/build históricos explícitos. | No aprueba todos los CP ni código posterior. Hubo lecturas públicas incidentales del widget Mercados; no fue íntegramente double-only. |
| Rechazo de UUID ajenos válidos | [Retest HTTP](../security-matrix/foreign-updates-corrected.json): tres UPDATE HTTP 404 con Auth normal y filas de B intactas. | Los tres HTTP 500 anteriores son FAIL conservados; integridad y contrato HTTP se evalúan por separado. La matriz compuesta conserva seis celdas BLOCKED. |
| Durabilidad Chrome | [Cuatro controles](../offline-durability/README.md) PASS, general PARTIAL: offline 11,11; pérdida de respuesta 22,22 y reinicio Chrome/Next; dos nuevas intenciones iguales 33,33; cambio A→B. | Cuatro filas/cuatro recibos, saldo 9900,01. Las intenciones nuevas iguales fueron secuenciales. Perfil propio eliminado tras cerrar Chrome; queda un item privado seleccionado, no un dump íntegro de IndexedDB. |
| Reinicio y replay | [E2E/PG](../environment/e2e-stack-restart.json): 17 comparaciones PASS; [recibo API](../e2e/api-replay-after-restart/api-verification.json) PASS, un efecto y saldo 198500. [Quinta](../environment/proof-stack-restart.json): 11 comparaciones PASS; [replay inversión](../investment-contracts/independent-restart-review.json): 40 aserciones PASS. | Reinicios reales administrados, datos y build preservados; no caída del host. Cada comparación y replay conserva su alcance, sin sumarlos a Native22. |
| Visual responsive Chrome | [Antes](../e2e/visual-attempt-1/visual-verification.json): 28 PASS/cuatro FAIL reales. [Después](../e2e/visual/visual-verification.json): 32/32 celdas acotadas PASS y 40 PNG, general PARTIAL. | Cuatro CU × cuatro viewports × dos zooms. La calibración de bitmap al 200% se separa de las métricas DOM. No es la matriz completa de navegadores y acciones originales. |
| Carga local | [Intento interrumpido](../load/browser-attempt-1-interrupted/interruption.json): warm 100/100 FAIL y cold 60/60 observadas FAIL; 40 cold sin observar y outage BLOCKED. | El raw RUNNING y todos los errores permanecen. REST registró 504/PGRST003 y Auth 504; [agregado](../environment/load-native-log-aggregate.json) sin causalidad aislada. No se repite carga masiva ni se acredita equivalencia del despliegue. |
| Cotizaciones | [Lecturas públicas](../public-quote-providers.json) y [dos perfiles por la aplicación](../public-quotes/README.md), estos últimos PASS con ocho FX nuevas cada uno y originales/canónico25/cache intactos. | Referencias reales y dobles explícitos. Next Data Cache impide asegurar un socket externo nuevo en cada respuesta; no acredita SLA ni proveedores autenticados. |

La copia CI5 independiente conserva el build `vPLjt1QViugJhUWR62DPp`, 480 fuentes, [Auth/API 200](../acceptance-final/final-clock-executed/README.md) y Date sólo del proceso Next en 06/10 a las 12:00Z. GoTrue, el sistema y los runners mantienen su reloj real y JWT de 60 segundos. El canary Gemini fue denegado por el guard antes del fetch nativo, sin credenciales ni socket externo; esto no simula una caída real de Google. Los assets de navegador comparados tuvieron cero coincidencias exactas de service-role y `CRON_SECRET`; anon es configuración pública por diseño. El [cierre propio de Next CI5](../closure-final-preparation/ci5-owned-next-stop/verification.json) preservó estado, entorno y build, y dejó libre 3002 para la futura copia CI6.

El perfil intermedio CI4 conserva un intento HTTP 500 causado por el shim de Date del arnés. Next copia descriptores propios; la corrección declaró `parse` y `UTC` propios, se probó contra la extensión real de Next y relanzó el mismo build. [Intento original y retry](../acceptance-final/README.md) permanecen separados. Los 21 modelos/extensión y 11 fixtures no se agregan a Vitest global.

La [copia CI6 de cierre](../closure-final-preparation/clock-executed/README.md) usa 483 fuentes del freeze `84df929`, build `aIWVMIWgvq5sbeEtZAZEh` y Next 39320. Repite los controles reales Auth/API 200 y la comprobación de 135 assets sin service-role/CRON, con los mismos límites de reloj/guard. Esta preparación no sustituye las seis lecturas SSR pendientes ni reescribe los dos FAIL CI5.

## Recuperación y permisos

Native22 empezó con SOURCE y RESTORE vacíos. Restauró **64 tablas: 27 públicas, 27 Auth y 10 Storage**, incluyendo datos, esquema, propietarios, grants, privilegios predeterminados, RLS, funciones, constraints, triggers y hashes. Probó tanto una base literalmente vacía `TEMPLATE template0` como un segundo stack de plataforma sin datos. Dos usuarios normales pudieron volver a login/getUser. El objeto privado Storage se respaldó fuera del dump y se descargó con el mismo hash; dueño permitido, B y anon denegados. Dumps, tokens y bytes íntegros son privados.

La [lectura restaurada](../restored-ui/README.md) ejecutó exactamente cuatro CU con Chrome: **4/4 PASS; general PARTIAL**, cuatro PNG revisadas y copia CI3 independiente. Los oráculos SQL concordaron con movimiento 12,34 ARS, saldo 9987,66 ARS, análisis 0/12,34/−12,34 y posición 4 × 20 USD = 80, P&L no realizado 0 y realizado 30. Se añadieron ocho FX auxiliares sintéticas a 1200 después del restore, expresamente declaradas; FX anteriores, canónico25, market cache y grants se preservaron. Los retries insertaron cero FX adicionales. Se conservan intentos previos de selector/animación. Acredita funcionamiento leído con ese complemento, no un backup original autocontenido para todas las cotizaciones ni CNF-12 completo.

El sign-out global invalidó refresh, pero el JWT de acceso anterior respondió 200 hasta su vencimiento: no se afirma revocación inmediata de JWT stateless. El invitado fue probado inválido, rotado e inactivo, incluso frente a replay. El outbox sobrevivió restauración y claim; no acredita entrega real a Telegram. Las réplicas [quinta](../fresh-proof/README.md) y [sexta](../import-target/README.md) usan las mismas identidades sintéticas clonadas, inicialmente sin sesiones ni finanzas, con Free/Premium como setup administrativo local; no es aceptación de Mercado Pago.

## Los 273 contratos originales

[casos_prueba.csv](../../../casos_prueba.csv) conserva sus 273 filas y SHA256 `887adbef81be56f781133ced65bee1c92effcf9af9a3e0b1b389eed0e4e2717d`. Distribución: CU001 184, CU002 25, CU003 30 y CU004 34. Los 168 PASS/105 BLOCKED del 09/10 son históricos.

La [matriz derivada](../case-traceability.csv), elegida con `--core-dir core-closure`, registra **213 PASS, tres FAIL y 57 BLOCKED**. [case-status-delta.json](case-status-delta.json) identifica 48 cambios desde el 09/10 y 225 estados sin cambio. [system-case-results.json](../system-case-results.json) y el [adaptador](reconcile-reviewed-contracts.py) conservan aserciones, evidencia, revisiones y revisiones independientes exactas. El flag `complete_original_contract` significa cobertura ejecutada; no convierte un FAIL en aceptación PASS.

Uno de los tres FAIL literales actuales es **CP2-09**: se ejecutaron los diez negativos, nueve PASS y uno FAIL. GoTrue rechazó contraseña incorrecta con HTTP 400 `invalid_credentials`, mientras el contrato pide 401/403; no emitió usuario/token. Anti-enumeración, JWT alterado/vencido, recovery expirado/reusado, controles normales API 200 y ZARIX API 401 por sesión realmente vencida/revocada pasaron. No se remapea el proveedor para fabricar PASS. [Revisión y raw](../fresh-proof/auth-negative-contract/independent-review.json) conservan el resultado y doce tablas financieras intactas.

Las promociones revisadas incluyen los contratos completos de API/DB, split 100/3 y netos 0, JSON export/import a otra réplica vacía, RF11, inversiones y simulaciones históricas. CP3-01/02 son una composición explícita de servicio CI4 y SSR del formatter posterior sobre la misma respuesta capturada; no se afirma que el Next CI4 incluyera ese formatter. CP1-22 usa una decisión compuesta declarada de HTTP 400 sin DML y retorno temprano de parser; el raw mide `transaction_requests`, no una observación directa de `import_batches`. Las fases anteriores quedan en [phases/](phases/core-acceptance-reviewed-194-1-78-summary.json).

## Bloqueos y observaciones pendientes

- **CNF-02** requiere observación real mensual ≥99,5%; una prueba breve no puede aprobarlo.
- **CNF-01** carece de equivalencia de hardware/topología/dispositivo de despliegue y el intento local observado falló. No se eliminan errores ni muestras ausentes del denominador.
- **CNF-03** no tiene endpoint HTTPS/certificado de pruebas. API y PG públicos son loopback; el REST interno Native usa wildcard. No hay prueba de aislamiento LAN ni cambio de firewall o permisos del sistema.
- **CNF-04/CP2-19** conservan el alcance integral pendiente. FileVault local observado y RLS/grants parciales no sustituyen todos los canales y configuración del proveedor.
- **CNF-05 a CNF-09** siguen limitados por acciones/matriz original. Chrome 146 es el navegador real ejecutado. El usuario rechazó instalar Firefox/Edge; Safari WebDriver permanece disabled. Arc fue autorizado preservando perfil/tabs personales, pero no existe aceptación UI y la ventana/cierre personal sigue UNKNOWN; no se alteran sus permisos.
- **CNF-10/11/13** requieren todos los canales, fixture de correlación y proveedores originales; pruebas de recibos, rollback y escáneres parciales no los aprueban íntegramente.
- **CNF-12** exige además fixture nominal (dos cuentas, veinte movimientos, tres lotes, una regla y un grupo), snapshot 05/10→06/10, gasto posterior 1500, RPO/RTO y fronteras 24h/4h/+1s y respaldo del plan contratado. Native64 y las cuatro lecturas restauradas sí se ejecutaron, pero no sustituyen esas condiciones nominales.
- **CP3-19** pide MEP seleccionable y contradice RN08 blue.sell. La evidencia derivada blue no aprueba el contrato MEP.
- Integraciones reales pendientes: `GEMINI_API_KEY` para OCR/IA; `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, bot/chat/HTTPS de prueba; `MP_ACCESS_TOKEN` de pruebas, `MP_WEBHOOK_SECRET` y recursos sandbox con importe/moneda/período. No se crearon credenciales externas ni se enviaron mensajes/cobros reales.

Los otros dos FAIL literales actuales, CP3-06 y CP3-18, ya están incorporados en la matriz: precisión visible 182 frente a 181,67 y HTTP 500 en vez de subtotal conocido con exclusión. Sus fixes y aceptación compilada esperan CI6; no son BLOCKED por un permiso ausente ni se ocultan sus raws. Los restantes casos permitidos sólo cambian de estado mediante evidencia del contrato exacto y revisión, sin inferir PASS desde conteos agregados.

## Reproducción y conservación

Los comandos reproducibles están en cada paquete y en los informes globales. Ejecutar con fixtures propias y destinos guardados; no volver a sembrar instancias pobladas. El [generador técnico](build-draft.py) produce una matriz de alcances y [evidence-index.json](evidence-index.json) guarda sus hashes; esas filas no son casos originales únicos. La trazabilidad se reconstruye con:

```sh
python3 docs/tif/v2.13/evidence/technical-20261015/consolidated/reconcile-reviewed-contracts.py
python3 scripts/build-technical-traceability.py --evidence-dir docs/tif/v2.13/evidence/technical-20261015 --core-dir core-closure
python3 docs/tif/v2.13/evidence/technical-20261015/consolidated/build-draft.py
```

La retención privada final de seis stacks y su parada oficial están [preparadas, no ejecutadas](../environment/native-retention-six-plan.md), en fases separadas y después de todos los escritores/escáneres. El destino autorizado será un directorio hermano `zarix-private-final-<UTC>` fuera de Git, 0700/0600; los datos originales en `/tmp` se conservan. Seis dumps y TOC/checksums no serían por sí solos una nueva prueba de restauración. No se publica ningún secreto, dump íntegro, cookie o perfil personal.
