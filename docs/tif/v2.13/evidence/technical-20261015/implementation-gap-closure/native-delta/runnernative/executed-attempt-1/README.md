# Delta focal Native ejecutado

**PASS 14/14 grupos y 159 aserciones**, revisión de fuentes
`730767b1723502b495d371e69c44df31eb230b56`; esquema clonado de
`faae3a7858a6d4349e24880fc4858b826b9463bd`. El único delta entre esas revisiones
es el ajuste autorizado del harness `scripts/test-atomic-account-recompute.mjs`.
No se modificó el checkpoint publicado ni la matriz original.

[verification.json](verification.json) conserva cada comprobación y las
60 observaciones permitidas; [execution.json](execution.json), el comando,
exit0, revisión y hashes estables de fuentes de aplicación y worker. Las
[fuentes exactas previas a la corrida](sources/manifest.json) se conservaron
antes de ejecutar y no se reparó ni repitió esta primera corrida.

Se verificaron CP1-08 con POST/DELETE reales, saldo10000→8500→10000 y OLD/actor
exactos; CP2-11/12 y CP3-17 con dos sesiones normales A, una B, persistencia,
RLS, moneda inválida e IDs manipulados; y GET de inversión propia archivada200,
ajena404 e ID inválido400. Los servicios reales calcularon USD200 a partir de
ARS120000/USD100 con cotización fixture1200 y conservaron el historial.

Las nueve solicitudes `corr-cnf13-01` a `09` cubrieron creación201,
validación400 y fallo SQL500; cron válido/Bearer401/fallo Telegram posterior
al commit; webhook MP firmado200/firma falsa401/proveedor HTTP503→500.
La restricción SQL temporal se retiró, los perfiles fixture se restauraron y
SQL confirmó cero sesiones y cero refresh grants; los tres logout devolvieron204.

Auth, RLS, grants, RPC, triggers, PostgREST y PostgreSQL fueron reales del clon.
Sólo se reemplazaron el adaptador Next/cookies por clientes normales reales y
el transporte Telegram por un doble que falla. Cotizaciones y MP fueron
fixtures HTTP en loopback: no se probaron proveedores externos ni cobros.
Esto no prueba routing Next HTTP, cookies del navegador, hidratación, interacción
visual, disponibilidad, carga ni restauración integral.

No se copiaron claves, sesiones, cookies, entornos ni consolas crudas a archivos.
[publication-check.json](publication-check.json) verificó en memoria ocho
valores privados seleccionados contra siete archivos candidatos: cero
coincidencias exactas y cero patrones JWT. Ese alcance no es una afirmación
universal de ausencia de secretos. Los inputs metadata sólo referencian
archivos privados existentes; los placeholders MP se derivaron en memoria.

Las cuentas sintéticas y el outbox pendiente permanecen en el clon para el SSR
complementario del coordinador. No quedó ningún proceso nuevo de este worker.
Al terminar, A recuperó su estado inicial CANCELED/ARS/visible y B
ACTIVE/ARS/visible. La lectura posterior solicitada para preparar oráculos SSR
no reejecutó pruebas: las cuentas incluidas eran ARS120000 y USD100; audit10000,
manual9999, cron9000 y cash de inversión0 estaban excluidas del total.
