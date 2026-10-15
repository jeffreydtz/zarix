# CNF11: seis protocolos nominales y fallo DB de pago

Estado del alcance focal: **PASS en el intento 2**, con 217 aserciones y 79 llamadas a handlers (6 × 13 más un fallo DB de pago). Fuente ejecutada `b965ca960ff66d7507bf2fc642ec0919391ea48d0dbe42310eb0aaaa5cae381d`; copia producto `f5f362ee9dbb81da5268049cab41b357d90eccf1`, 517 archivos idénticos a Git antes y después. Los resultados completos están en [el informe del intento 2](executed-attempt-2/nominal-six-and-payment-rollback.json) y [su ejecución](executed-attempt-2/execution.json). Este resultado no promueve por sí solo CNF11 completo ni la matriz.

El [intento 1 se conserva FAIL](executed-attempt-1/nominal-six-and-payment-rollback.json), con sus fuentes y resultados intactos. Sus 217 aserciones funcionales pasaron, pero dos indicadores de limpieza quedaron falsos: el verificador que preparé leía `SELECT is_active`, cuyo resultado PostgreSQL `f` no es JSON. Una [inspección SQL independiente](../coordinator/nominal-attempt1-cleanup-readonly.json) confirmó seis cuentas archivadas, una regla inactiva, Auth en cero y la causa `f` frente a `false`. El único cambio del intento 2 es envolver ambas lecturas en `to_json(is_active)`; no cambió el producto ni los protocolos. Root revisó el diff y autorizó explícitamente ambos intentos.

En el intento 2, los seis canales observaron `TimeoutError` nativo y un máximo de diez handlers simultáneos en cada ola de replays. La limpieza pasó: cuatro campos del plan restaurados exactamente, B completo intacto, sólo `updated_at` automático como delta de A, preferencias e historia sin cambios, filas financieras anteriores intactas, cuentas nuevas archivadas, regla nueva inactiva, CHECK eliminado y `auth.sessions = auth.refresh_tokens = 0`. Las dos salidas globales mediante SDK no dieron error. El grupo propio PID/PGID 7533 terminó con cero miembros; no fue necesario usar señales de timeout del launcher. La captura de 302 llamadas de console examinó 14 valores privados en RAM y registró cero coincidencias. No se guardaron logs crudos, claves, JWT, cookies ni env derivados.

El launcher requiere la ventana explícita del padre, las dos identidades sintéticas existentes y la copia inmutable de `f5f362ee9dbb81da5268049cab41b357d90eccf1`. Valida 517 archivos contra Git y el manifiesto canónico `6c108712a7d338b4c6c1d14dca798921637abc9e5f2aa3009318fdf7b24e3a29` antes de ejecutar; vuelve a comprobar fuentes al terminar. El alias `@` apunta a la copia indicada por metadata, no al checkout de trabajo.

| Protocolo | Oráculo tras la primera respuesta real, antes del timeout |
| --- | --- |
| Gasto | 1 gasto de ARS 1500, saldo 10000 → 8500, 1 recibo durable |
| Transferencia | 1 transferencia de ARS 1500, saldos 10000/2000 → 8500/3500, total 12000, 1 recibo |
| Importación CSV | Gastos ARS 200 + 300, saldo 9500, 1 lote, 2 recibos por fila |
| Cron | 1 gasto recurrente ARS 400, saldo 9600, 1 recibo y 1 intención outbox durable sin entregar |
| Venta | 4 × USD 120 de lote 10 × USD 100: quedan 6, realizado USD 80, 1 venta y 1 recibo; caja sin crédito inventado |
| Pago sintético | Preapproval autorizado con estado ACTIVE y período ya vigente hasta 2026-11-06 12:00 UTC: **NOOP** completo; no renueva período ni inventa recibo |

En cada protocolo, el adaptador llama al handler real importado, confirma el estado en PostgreSQL real y retiene la respuesta. Sólo entonces arma `AbortSignal.timeout(40)`. El consumidor recibe el `signal.reason` nativo `TimeoutError` tras vencer ese plazo. Se registran tiempos monotónicos de handler, oráculo y timeout. Se reintenta exactamente el mismo comando o evento dos veces y luego diez veces con una barrera común; se comprueban estados, recibos y respuestas durables. El cron puede devolver un contador procesado distinto en sus reintentos, conservando idéntico estado durable. Se mide el solapamiento de llamadas y se exige un máximo simultáneo de al menos dos.

El alcance es **handler/API en proceso → Auth/REST/PostgreSQL locales reales → consumidor en proceso**. La retención es un adaptador explícito del acuse posterior al commit. No demuestra una caída física de red, UI, reinicio, cola offline ni diez primeros commits simultáneos. El pago es un NOOP verificado antes de retener su respuesta, no una mutación presentada como commit. Mercado Pago es un servidor HTTP sintético local con HMAC de prueba derivada en RAM; no acredita aceptación del proveedor externo.

Se añade una única prueba de fallo DB de pago: firma y proveedor válidos, respuesta `cancelled`, y un CHECK temporal limitado al UUID de A que impide ese cambio. Exige HTTP 500, observación real de persistencia fallida y fila completa de A idéntica, incluido `updated_at`; tampoco puede variar el historial financiero. El CHECK se elimina en `finally` sin desactivar triggers. Los casos de edición/borrado de transferencia, rollback débito/crédito y sobreventa se componen de evidencia anterior, sin ejecutarlos otra vez; las referencias exactas están en [composition.json](composition.json).

Cada fixture usa UUID nuevos. Se registran los UUID y el CHECK antes de escribir. Las cuentas creadas aquí se archivan después de sus oráculos para no ampliar el límite Premium de 20 cuentas; sus transacciones, recibos, saldos y posiciones permanecen en el clon. Se exige capacidad previa para dos cuentas. El cron rehúsa ejecutarse si cualquier regla anterior vencería o tendría trabajo pendiente hoy; no altera ni desactiva reglas previas. Sólo desactiva la regla nueva al terminar. No se entrega el outbox ni se crean asociaciones de chat.

Se guardan un checkpoint privado del plan antes de su primer UPDATE y un journal del proceso propio. El checkpoint modo 0600 contiene UID y sólo cuatro campos de restauración: estado, ambos períodos y la asociación MP original, incluido null explícito cuando corresponda; agrega hashes del resto. El ID de recurso MP no es una credencial Auth. No copia una fila completa del perfil. Se compara todo el perfil de A: sólo `updated_at` automático puede diferir. B se compara completo, sin excepciones. Las preferencias, historia y filas financieras anteriores deben quedar intactas. Ambas sesiones normales se cierran globalmente mediante SDK y se exige SQL `auth.sessions = 0` y `auth.refresh_tokens = 0`; no se presentan estados HTTP de logout inferidos como capturados.

Las claves, contraseñas, JWT, cookies y env derivados permanecen en memoria. No se crean archivos de credenciales. La captura de las llamadas públicas de console usa `formatWithOptions` con profundidad ilimitada y examina sus argumentos para los secretos en RAM; sólo publica contadores, nunca logs crudos. Esta fase no afirma calibración canary propia ni cobertura de todas las representaciones posibles.

El launcher inicia un grupo de procesos propio y registra PID/PGID. Un timeout solicita SIGTERM a ese grupo identificado, con escalamiento sólo sobre el mismo grupo si no termina. Una señal no garantiza que JavaScript ejecute `finally`: el resultado será BLOCKED y **root** deberá inspeccionar los checkpoints y SQL antes de recuperación o retención. No existe recuperación automática de DB ni se concede un cierre limpio por terminar el proceso.

El comando ejecutado para el segundo intento fue:

```sh
ZARIX_CNF11_EXTENSION_WINDOW=parent-released-cnf11-extension \
ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only \
python3 docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/cnf11-extension/nominal/run-nominal.py \
  --targets /tmp/zarix-runtime-20261015/cnf11-extension-27e6af51-dcbd-4498-99ef-aec049bb9cc0/targets.metadata.json \
  --attempt attempt-2
```

Los resultados de cada intento se escribieron en una carpeta privada nueva y se exportaron sin alterar sus informes sanitizados. Los checkpoints privados del perfil no se exportaron. Los manifiestos preparados originales conservan sus SHA de preejecución; el manifiesto final describe este árbol después de la ejecución. El worker bot/OCR es independiente y se libera secuencialmente después del cierre de este worker. No se cambió producto, esquema versionado, tipos, índices Git ni artefactos publicados previamente.
