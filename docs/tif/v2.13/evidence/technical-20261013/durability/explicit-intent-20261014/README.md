# Intenciones financieras explícitas — 14/10/2026

El protocolo distingue crear una operación nueva de retomar una operación guardada. Cada formulario nuevo genera un UUID propio, aun cuando otro formulario tenga el mismo propietario, contexto y contenido. Un reintento conserva sólo el ID explícito de la operación anterior. `draftScope` identifica el contexto de formulario y ya no se usa como identidad del comando.

La cola conserva operaciones y confirmaciones en IndexedDB. Tras recarga o reinicio, el usuario selecciona una solicitud por ID y usa **Reintentar esta solicitud** o **Ver confirmación**. La recuperación lee su contenido original; no lo reconstruye a partir de los campos de un formulario nuevo. Una confirmación guardada se observa sin otro envío HTTP. El hook verifica propietario o grupo y conserva el orden de ventas/ediciones sobre el mismo recurso. Los formularios vivos conservan su propio ID pendiente y sus guards de doble clic.

La [corrida final focalizada](focused-vitest.json) aprobó **76/76 aserciones en ocho archivos**. [verification.json](verification.json) registra la revisión base `316b393577fe15ffac81cf5595459a191337aeaf`, comando, Node 22.17.0, tiempos, resultado y hashes de las fuentes con cambios locales, estables durante la ejecución. Typecheck, ESLint de los archivos afectados y `git diff --check` terminaron con código 0. La publicación final deberá identificar el commit que incluya estas fuentes.

Regresiones del protocolo comprobadas:

- Dos altas independientes concurrentes e iguales generan dos IDs y dos efectos; perder ambas respuestas conserva ambas solicitudes separadas.
- Dos reintentos concurrentes bajo un ID explícito conservan una solicitud y un efecto; contenido distinto bajo ese ID se rechaza sin otro envío.
- Formularios independientes de movimientos y cuentas no adoptan la intención de otro formulario. Doble clic del mismo formulario sólo inicia una operación.
- Selección de una solicitud guardada tras pérdida de respuesta, confirmación en background, fallo de almacenamiento o expiración/relogin conserva su ID.
- La selección desde la cola no reintenta ni elimina solicitudes de otro usuario o grupo, y no adelanta una venta pendiente sobre otra de la misma posición.
- Una operación nueva no consume silenciosamente una confirmación anterior guardada.

Las pruebas de cola ejecutan código real de store, hooks y handlers con la API de `fake-indexeddb`, lifecycle React y servidor financiero dobles. No constituyen aceptación de navegador, GoTrue, PostgREST ni base nativa. El almacenamiento sigue siendo durable por ID; abrir un formulario nuevo por sí solo no declara que el usuario está reintentando otra intención.

Las cuatro pruebas de recurrentes/outbox ejecutan migraciones reales en PostgreSQL WASM con un directorio temporal persistente. Comprueban cerrar/reabrir la base, recibos y leases, confirmación perdida y recuperación posterior. Auth es sintético, el adaptador de consulta sustituye PostgREST y Telegram es un doble explícito. No mutan el stack Supabase local ni proveedores externos.

[reconciled-contracts.json](reconciled-contracts.json) conserva las equivalencias ejecutadas RTV-034/RTV-038: una intención outbox por movimiento, y fallo de Telegram sin revertir el movimiento. La entrega sigue siendo **al menos una vez**: una confirmación perdida puede repetir el aviso, conservando un único efecto financiero. CP1-24/CP1-26 y los recorridos completos necesitan su propia evidencia UI→API→DB/proveedor.

La corrida histórica de 64 aserciones queda preservada en el directorio padre, con una advertencia explícita de supersesión. Su expectativa de fusionar formularios nuevos era incorrecta y no se usa para aceptar este protocolo.

Reproducción desde las fuentes de esta revisión:

```sh
node node_modules/vitest/vitest.mjs run __tests__/offline-durable-store.test.ts __tests__/offline-queue-sync.test.ts __tests__/investment-create-durable-store.test.ts __tests__/financial-intent-hooks.test.ts __tests__/account-create-handler-outcomes.test.ts __tests__/notification-outbox.test.ts __tests__/recurring-job-regression.test.ts __tests__/recurring-outbox-equivalence.test.ts
```

Las 76 aserciones focalizadas forman parte de la suite global cuando se ejecuta: no se suman nuevamente como casos únicos.
