# Registro histórico de cola durable — interpretación de concurrencia supersedida

> La revisión independiente invalidó la interpretación inicial de concurrencia de esta corrida: dos formularios nuevos e independientes, aunque tengan el mismo propietario/scope/contenido, deben producir dos intenciones distintas. Las 64 aserciones de este registro **no validan el protocolo actual**. Los archivos originales se conservan; la corrección y su evidencia actual están en [explicit-intent-20261014/README.md](explicit-intent-20261014/README.md). Los párrafos siguientes registran la interpretación inicial, no la conclusión vigente.

En el head base `b40feeed28d6e9ea6e8b0b2f112119e2435de1df`, la recuperación del borrador leía IndexedDB y creaba su clave en transacciones separadas. Dos formularios concurrentes del mismo propietario y scope podían obtener dos claves. Las dos nuevas regresiones fallaron antes de corregirlo (`expected 2 to be 1`). La recuperación y el alta del borrador ahora ocurren en una única transacción `readwrite`, antes del envío. No se deduplican operaciones legítimas ya confirmadas: mantienen claves distintas.

La [corrida focalizada](focused-vitest.json) aprobó 64 aserciones en seis archivos. [verification.json](verification.json) registra comando, Node, revisión base, tiempos, salida y SHA256 de las fuentes utilizadas, estables durante la ejecución. La prueba de respuesta perdida crea el efecto en un servidor doble, pierde ambas respuestas concurrentes, recupera el borrador sin referencias en memoria y confirma un solo efecto bajo la misma clave. El almacenamiento de navegador usa `fake-indexeddb`; no equivale a ejecución en un navegador real.

## Contratos históricos reconciliados explícitamente

Los originales permanecen preservados en `casos_prueba.csv`. [reconciled-contracts.json](reconciled-contracts.json) enlaza cada nombre histórico con su aserción ejecutada:

| Caso | Contrato actual comprobado | Resultado |
| --- | --- | --- |
| RTV-034 | Un movimiento, saldo 9000, fecha marcada, recibo y una intención outbox; un envío confirmado del dispatcher independiente. | PASS de equivalencia acotada |
| RTV-038 | Telegram indisponible conserva movimiento, saldo, fecha y aviso pendiente; cerrar/reabrir la base conserva el recibo, y el reintento entrega el mismo evento. | PASS de equivalencia acotada |

`recurring-outbox-equivalence.test.ts` ejecuta las migraciones SQL en PostgreSQL WASM con directorio temporal persistente y elimina sólo su propio fixture al finalizar. Cierra y reabre la base, comprueba leases persistidos, recuperación tras vencimiento y rechazo de confirmaciones de un lease antiguo. Un adaptador de consultas sustituye PostgREST; Auth sigue siendo sintético y Telegram es un doble explícito. No se simula una integración real como aprobada.

La entrega es **al menos una vez**. El envío aceptado cuyo acuse de base se pierde puede repetirse tras el reinicio; la prueba verifica dos envíos del doble, un solo evento y el mismo movimiento financiero. No se promete entrega externa exactamente una vez.

La evidencia no completa CP1-24/CP1-26, los cuatro recorridos UI→API→DB, concurrencia de sesiones nativas ni Telegram real. Esos casos requieren su propia ejecución y autorización de proveedor cuando corresponda. El texto histórico de CP1-26 que dice que no hay outbox implementado describe un estado anterior y debe contrastarse con esta implementación/evidencia, sin transformarlo automáticamente en aceptación del sistema.

Reproducción desde la revisión final que incluya estos cambios:

```sh
node node_modules/vitest/vitest.mjs run __tests__/offline-durable-store.test.ts __tests__/offline-queue-sync.test.ts __tests__/account-create-handler-outcomes.test.ts __tests__/notification-outbox.test.ts __tests__/recurring-job-regression.test.ts __tests__/recurring-outbox-equivalence.test.ts
```

`npm run typecheck` también terminó con código 0 después de los cambios de tipos. Los checks globales, cobertura y publicación corresponden a la evidencia agregada de esta revisión; las 64 aserciones focalizadas no deben sumarse nuevamente al total general como casos únicos.
