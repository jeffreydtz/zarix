# Complemento focal local CNF11, CNF13 y CNF10

La primera corrida terminó con **seis protocolos locales PASS y 182
aserciones**, **nueve correlaciones PASS y 41 aserciones**, y **tres
comprobaciones PASS** de rechazo del JWT normal en cron. Los resultados,
fuentes congeladas y comandos están en [executed-attempt-1](executed-attempt-1/execution.json).
La matriz original y el paquete Native14/159 permanecen intactos.

Se ejecutó exclusivamente la copia inmutable
`/tmp/zarix-app-delta-db3cf513-b7ad-4f2b-abcd-a2a44aeed27b`, revisión
`730767b1723502b495d371e69c44df31eb230b56`. Sus 514 archivos se contrastaron
con Git antes de la corrida y permanecieron estables, igual que el worker.
El checkout de trabajo posterior se registra sólo como procedencia: sus
cambios Telegram y pruebas no se atribuyen a esta copia. El esquema del clon
corresponde a `faae3a7858a6d4349e24880fc4858b826b9463bd`.

Cada protocolo tuvo **13 invocaciones del mismo comando financiero**: una
inicial, dos replays secuenciales y diez replays concurrentes. La fase
concurrente empezó después del primer commit. Se contrastaron snapshots
exactos del efecto y recibos tras los replays; no se afirma que esas diez
llamadas contendieran por una primera escritura todavía pendiente.

| Protocolo | Resultado comprobado |
| --- | --- |
| Gasto1500 | Una fila, un recibo y saldo8500. El consumidor descartó deliberadamente el cuerpo de la primera respuesta y recuperó la confirmación durable por replay; no fue una falla real de red. |
| Transferencia1500 | Una fila y recibo; origen8500/destino3500, total12000. Edición a2000 dejó8000/4000; DELETE restauró10000/2000. |
| Importación200+300 | Dos filas, un lote, dos recibos por fila y saldo9500. Se conservaron los dos importes legítimos. |
| Cron400 | Una ocurrencia, un recibo, un evento durable y saldo9600; identidad regla+fecha AR. |
| Venta4×120 de lote10×100 | Una venta y recibo, seis unidades restantes y realizado80USD. No se inventó una acreditación de cash. |
| Pago sintético | Mismo preapproval autorizado, estado ACTIVE y período previamente fijado al06/11/2026. Trece notificaciones no extendieron la vigencia ni crearon pago. Fixture HTTP61339 independiente. |

En otro fixture de transferencia, una restricción CHECK temporal aplicada
sólo al crédito destino produjo500 y revirtió débito, crédito, ledger y recibo.
No se desactivaron triggers. Una carrera adicional enfrentó dos comandos de
venta distintos de seis unidades sobre otro lote de diez: ambos RPC reales
alcanzaron una barrera de programación, uno se aceptó y otro se rechazó;
quedaron cuatro unidades, una venta y un recibo, sin cantidad negativa.

[Las nueve correlaciones nuevas](executed-attempt-1/cnf13-nine-literal.json)
usaron literalmente gasto1500→saldo8500, monto−1 y rechazo SQL sin fila;
cron válido, Bearer inválido y fallo Telegram posterior al commit; webhook
firmado, firma falsa y HTTP503 del proveedor. Produjeron **54 observaciones**.
Los tres señuelos requeridos y un PNG1×1 con sus representaciones se generaron
y usaron sólo en memoria, dentro de headers, texto, error y payload de prueba.
El campo de imagen sirve para detectar divulgación del payload: no acredita
OCR ni procesamiento de imagen por un proveedor.

[El complemento CNF10](executed-attempt-1/cnf10-user-jwt.json) presentó un JWT
normal emitido por GoTrue para A como Bearer de cron. Recibió401, sin efectos
en transacciones, recibos, outbox o reglas; no fue un token inventado.

La captura completa en memoria incluyó **357 llamadas de consola y 354
observaciones**: cero coincidencias contra13 valores privados seleccionados,
tres señuelos y cuatro representaciones de la imagen. No aparecieron nombres
de campos Auth sensibles. Sólo se publicaron observaciones permitidas y
conteos; ninguna consola cruda, imagen, cookie, token, contraseña o entorno.
[El control de publicación](executed-attempt-1/publication-check.json) comprobó
además ocho valores privados seleccionados contra nueve archivos candidatos,
sin coincidencias ni patrones JWT. Son alcances acotados, no ausencia universal.

La limpieza envió las restauraciones de perfil y `available_at` de los eventos
aplazados con respuestas de escritura sin error, y retiró las restricciones
temporales. El SQL final confirmó **cero sesiones y cero refresh tokens** e
historial global sin cambios. Dos logout SDK terminaron sin error: no se
deducen ni publican códigos HTTP de logout que no fueron capturados.
Los fixtures nuevos permanecen en el clon para la retención del coordinador.

Auth, PostgREST, PostgreSQL, grants, RLS, RPC y triggers fueron reales del clon.
El adaptador Next/cookies retornó clientes normales reales; Telegram fue un
doble de transporte que falla. MP y cotizaciones fueron fixtures HTTP locales,
con61329 restaurado para las nueve correlaciones y61339 separado para el
preapproval nominal. No se abrieron navegadores ni se ejecutó carga UI.

**CNF11 integral permanece BLOCKED**: este complemento no acredita canales
externos OCR/bot/pago, pérdida de respuesta por red o reinicio ni contención
inicial de diez comandos en cada canal. La evidencia anterior se conserva
para composición explícita por revisión; no se extrapola un PASS total.
