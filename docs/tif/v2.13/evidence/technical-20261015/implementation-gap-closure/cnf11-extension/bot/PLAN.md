# Suplemento CNF-11: bot y OCR

Preparación, todavía sin ejecutar. Se conserva el checkpoint 23d91aeda8a22903d2bd795dd4ce9f3970ea1b5b. El producto ejecutado será exclusivamente la copia Git f5f362ee9dbb81da5268049cab41b357d90eccf1 (517 fuentes, manifiesto 6c108712a7d338b4c6c1d14dca798921637abc9e5f2aa3009318fdf7b24e3a29).

Se invoca `handleCustomTelegramUpdate` real. Los únicos dobles funcionales son el transporte/dispatcher Telegraf, el cliente Gemini y la descarga de media; cuota, herramientas, resolución de cuentas, historial, servicios monetarios, RPC, Auth, PostgREST y PostgreSQL son reales. El dueño se suministra como en el canal custom ya autenticado; esto no sustituye la prueba del secret del webhook. El token sintético vive sólo en RAM y no se guarda ningún mapping de chat/token en el perfil.

Se ejecutan secuencialmente gasto de texto 1500 (10000→8500), transferencia 1500 (10000/2000→8500/3500) y foto→propuesta persistida→confirmación de texto 1500. Antes de confirmar la foto se exige cero movimiento y cero recibo financiero. Cada comando se entrega una vez, luego dos repeticiones secuenciales y diez concurrentes del mismo evento. La concurrencia empieza después del primer resultado; no se atribuye contención del primer commit. En los tres nominales el primer acuse final se retiene en el doble de transporte; se comprueban SQL ledger/recibo/cuota completed antes de iniciar un AbortSignal.timeout real de 40 ms y se conserva el TimeoutError y su cronometraje. No se crea otro socket ni proveedor. Se observan recibo/cuota/ledger/saldo, y lectura RLS y exportación del dueño. Cada replay exige el RPC de reserva y la respuesta exacta del resultado durable. La historia del bot puede anexarse de nuevo; no es invariante monetaria.

Un cuarto alcance derivado hace fallar Gemini después de una llamada monetaria real exitosa. La reserva AI sin resultado se conserva sin TTL ni liberación artificial. Repetir el evento debe conservar un solo efecto y permitir lectura/exportación, aunque el bot siga indicando solicitud en proceso. No se exige HTTP409 del bot, ni respuesta recuperada automáticamente, ni un nuevo requisito funcional ajeno al CSV.

`prepare` guarda únicamente IDs, eventos sintéticos, claves lógicas y hashes en un fixture privado sin credenciales. Después de terminar el proceso, `replay` abre otro proceso y sesiones normales nuevas, reenvía las mismas entradas sobre la misma DB y exige cero trabajo adicional `chatWithTools`/tool/OCR, un solo efecto y los mismos recibos/cuotas. No reinicia PostgreSQL ni demuestra reinicio de hardware. No crea otra identidad, recurso, servicio o ventana.

El preflight exige dos identidades existentes, cero sesiones/refresh grants y a lo sumo 18 cuentas activas/habilitadas de A. Se archivan sólo cuentas UUID propias después de cada fixture y sus repeticiones, preservando movimientos/recibos. Si el plan exige configuración temporal, se checkpointan primero sus tres campos, se restauran exactamente y se comparan todas las demás columnas salvo el `updated_at` automático del trigger. No se cambian límites, chats, secretos, preferencias ni datos previos.

Las guardas fijan propósito, DB UUID, puertos 58322/61321/61329, copia y revisión. Antes/después se rehashean las 517 fuentes y los tres archivos del worker. El fetch sólo permite esos dos orígenes HTTP loopback. Logs se inspeccionan sólo en RAM con `formatWithOptions(showHidden:true, depth:null, customInspect:false)` calibrado mediante Error/cause/stack no enumerables antes de Auth/SQL, y se escanean secretos exactos RAM y señuelos. No se publican logs crudos, claves, cookies ni imágenes.

Comandos previstos, exclusivamente tras release de raíz y runtime coordinado:

```text
ZARIX_CNF11_EXTENSION_WINDOW=parent-released-cnf11-extension ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only python3 docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/cnf11-extension/bot/run-bot.py --targets <targets.metadata.json privado> --phase prepare --attempt attempt-1
ZARIX_CNF11_EXTENSION_WINDOW=parent-released-cnf11-extension ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only python3 docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/cnf11-extension/bot/run-bot.py --targets <mismo targets.metadata.json> --phase replay --replay-fixture <replay-fixture.json del prepare> --attempt attempt-1
```

No promueve CNF-11 ni UI por preparación. Proveedor real, webhooks externos, navegador, entrega Telegram real y interpretación OCR real quedan fuera del alcance de este suplemento local.
