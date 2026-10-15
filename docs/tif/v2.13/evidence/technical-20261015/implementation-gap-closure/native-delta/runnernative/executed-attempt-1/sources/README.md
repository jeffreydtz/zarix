# Runner focal preparado, sin ejecución

Estado de esta entrega: **PREPARED_NOT_EXECUTED**. Los archivos de este
directorio se escribieron y analizaron estáticamente; no se importó el worker,
no se inició Vitest, no se abrió una conexión ni se creó una identidad.

`run-native-cases.py` requiere los dos releases
`ZARIX_DELTA_NATIVE_WINDOW=parent-released-frozen-delta` y
`ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only`. Recibe `--targets` con el
`targets.metadata.json` del UUID nuevo y `--revision` con su revisión congelada.
No admite el nombre de DB original, un destino remoto, otros puertos, fuentes
de aplicación modificadas ni sobrescribir el resultado de una corrida previa.
El coordinador debe terminar `npm ci` y liberar la ventana antes de invocarlo.

Los inputs privados son los del preparador vecino y su
`services.metadata.json`: sólo controles y paths sin valores de credenciales.
El cron y las claves se leen en memoria de los archivos ya existentes; los
placeholders MP se derivan del UUID en memoria. No se copian secretos, tokens,
cookies ni entornos a archivos/logs nuevos, ni se generan claves externas.
Se clonan exclusivamente las dos identidades existentes. El launcher
registra hashes de los archivos Git ajenos a `docs/` antes/después, revisión,
comando y exit code; no copia stdout/stderr crudos a los informes. Congela
además copias exactas de estas fuentes sin secretos antes de invocar Vitest.
Puede aceptar que la revisión de código difiera de la del clon únicamente en
`scripts/test-atomic-account-recompute.mjs`, el ajuste de prueba autorizado;
cualquier otro delta de revisión se rechaza.

El worker importa los handlers y servicios actuales. Reemplaza únicamente el
adaptador Next/cookies por clientes Supabase reales: tres logins normales
(dos sesiones distintas de A y una de B) y el cliente backend con su rol real.
GoTrue, PostgREST, grants, RLS, RPC, triggers y PostgreSQL no tienen dobles.
`sendTelegramDm` es un doble de transporte que rechaza. Cotizaciones y MP
usan respuestas HTTP de un proveedor fixture en loopback; no son pruebas
de los proveedores externos, de sandbox MP ni de cobros reales.

Los 14 grupos focales comprueban:

- CP1-08: creación real de gasto1500, saldo8500, DELETE con JWT normal,
  saldo10000, OLD JSONB exacto, actor/rol, aislamiento y rechazo de auditoría
  fabricada; el reintento no duplica eventos.
- CP2-11/CP3-17: GET/PUT reales, ARS/USD y ocultar/mostrar persistentes entre
  dos sesiones A, servicios reales con ARS120000/USD100 y cotización fixture1200
  → USD200, conservación exacta de cuentas/movimientos/inversiones/historial.
- CP2-12: `ZZZ`, IDs adicionales y cuerpo parcial rechazados; B no lee ni
  actualiza A por RLS; una pestaña A no guarda después de cambiar la sesión a B.
- CU004: GET real de posición propia archivada200, ajena404, ID inválido400,
  `no-store` y ausencia de cambios de historial.
- Nueve correlaciones `corr-cnf13-01` a `09`: manual201, validación400, error
  SQL controlado500; cron válido, Bearer inválido y fallo Telegram posterior
  al commit; webhook firmado válido, firma falsa y proveedor HTTP503.
- Contrato observado: request/service/database/provider/outbox, referencias
  UUID, campos permitidos, timestamp, muestras de contador y ausencia de
  credenciales seleccionadas/payloads en la consola capturada.

El error SQL se provoca mediante una restricción CHECK temporal `NOT VALID`
acotada al UUID de una cuenta propia del clon y se retira en `finally`. No se
modifica ningún esquema original. La limpieza restaura las columnas de perfil
usadas por fixtures, cierra las sesiones nuevas y comprueba con SQL cero
sesiones/refresh grants. Los HTTP de logout se conservan con su resultado;
los ceros SQL son la evidencia autoritativa, no se supone que todos sean204.

El resultado permanece en `native-cases-result.private.json` y el registro
del launcher en `native-cases-execution.private.json`, ambos0600 bajo el UUID
privado. Sólo contienen aserciones seguras y observaciones permitidas. Un fallo
queda FAIL; no se reescriben matrices, respaldos ni reportes publicados.

Límites: esto prueba source worker/API/DB, no routing Next HTTP, cookies del
navegador, hidratación, interacción visual, accesibilidad, disponibilidad,
carga ni una restauración completa. El SSR Next3006 se prepara de manera
independiente. Arc permanece pendiente de reconciliación y no se abre Chrome.
