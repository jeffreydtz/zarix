# CNF-10: secretos y canales locales

Se corrigieron nueve registros de excepciones crudas: dos en las rutas de webhook de Telegram y siete en los manejadores de la aplicación del bot. Ahora conservan únicamente el texto fijo del evento. No cambian la autenticación, el dueño o chat actuante, las respuestas al usuario ni el `200` que confirma un update ya autenticado.

La reproducción anterior al cambio tuvo **17 PASS y 9 FAIL**. Las mismas 26 pruebas pasan después del cambio; la corrida de regresión relacionada tiene **60/60 PASS en siete archivos**, incluidas esas 26. Typecheck y lint de los cinco archivos tocados terminan con código 0. [verification.json](verification.json) conserva comandos, resultados, contrato CSV exacto, límites y vínculos de fuentes; [manifest.json](manifest.json) fija sus hashes. La revisión de producto anterior coincide con Git `730767b1723502b495d371e69c44df31eb230b56`.

Las pruebas invocan los handlers reales de ambos webhooks y el template real de cron. Para el bot se ejecutan sus middleware, manejadores y catches de aplicación, con Telegraf y las fronteras de datos/proveedores reemplazados por dobles explícitos. Cada test prohíbe `fetch` externo. Los valores de secretos y el portador de usuario son sintéticos; no se crea ni valida aquí una sesión GoTrue real.

- Cron: portador ausente, portador sintético de usuario y secreto incorrecto devuelven `401` sin crear cliente de DB ni ejecutar trabajo. El secreto válido ejecuta sólo su trabajo una vez.
- Webhook compartido: cabecera ausente, incorrecta o de otro canal devuelve `401` sin cliente ni bot. La configuración vacía falla cerrada; la cabecera válida entrega el update exacto una sola vez al bot compartido.
- Webhook por usuario: path corto o cabecera inválida se rechaza antes de crear cliente. Una cabecera derivada correcta con capacidad ausente, revocada o no coincidente necesita **una lectura de resolución**, y rechaza sin despachar el bot. El caso válido pasa el dueño y chat almacenados, en vez de adoptar campos de identidad del payload.
- Fallas autenticadas: ambas rutas mantienen su confirmación existente; las siete ramas internas mantienen sus mensajes públicos. Errores con señuelos de secreto, cabecera, token y texto no llegan a `console.error/warn/log/info`.

La inspección de las tres fuentes seleccionadas no encontró llamadas `console.log/warn/info/debug`. Sus diez registros `console.error` restantes usan textos constantes, incluido el aviso preexistente de token no configurado. Esto no declara que se hayan inspeccionado todos los logs de la aplicación o del alojamiento.

Los contadores de creación de cliente, lectura, trabajo y despacho son spies locales, **no efectos PostgreSQL observados**. Tampoco se afirma entrega real Telegram, registro de webhook, control físico de un chat, OCR/Gemini, navegador ni inspección de access logs desplegados. La matriz de aceptación original no se modifica desde este paquete. Los contratos de proveedores conservan sus evidencias o bloqueos separados; CNF-10 no añade Mercado Pago ni exige por sí mismo una entrega Telegram real.

Reproducción de la fase final, desde el repositorio y con Node 22 compatible:

```sh
node node_modules/vitest/vitest.mjs run \
  __tests__/channel-secrets-routes.test.ts \
  __tests__/telegram-error-log-privacy.test.ts \
  __tests__/webhook-auth.test.ts \
  __tests__/cron-auth.test.ts \
  __tests__/cron-job-structural.test.ts \
  __tests__/notification-outbox-route.test.ts \
  __tests__/billing-nonbilling-telegram-isolation.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next lint \
  --file app/api/telegram/webhook/route.ts \
  --file 'app/api/telegram/webhook/u/[secret]/route.ts' \
  --file lib/telegram/bot.ts \
  --file __tests__/channel-secrets-routes.test.ts \
  --file __tests__/telegram-error-log-privacy.test.ts
```

Los informes anteriores y sus fuentes se preservan en `focused-before.json` y `before-sources/`; las fuentes finales están en `after-sources/`. Los snapshots de tests terminan en `.test-source.ts`, por lo que no duplican pruebas durante la suite global. Los gates/build históricos `730767b` siguen correspondiendo a esa revisión, no a este delta posterior.
