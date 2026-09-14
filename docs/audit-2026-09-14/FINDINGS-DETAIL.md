# Flujos y límites de los hallazgos

Referencias reproducibles sobre `git show d7b3219:<archivo>`. El árbol actual contiene correcciones. No se enviaron payloads a sistemas reales.

## Bot Telegram propio sin vínculo puede resolver otra cuenta

Estado original en commit d7b3219. El guard establece ownerUserId pero no forcedUserId cuando no hay chat vinculado; resolveActingUser busca por chat.id recibido. Un callback sum:weekly llega a actualizar preferencias del usuario resuelto antes de responder a Telegram. No se afirma exfiltración por reply: la entrega a un chat ajeno requiere condiciones adicionales.

- `app/api/telegram/webhook/u/[secret]/route.ts:46` (POST): Update aceptado tras validar secretos del webhook del dueño.
- `lib/telegram/bot.ts:796` (getBotForTelegramToken): Guarda dueño; si chatId del dueño es null continúa sin forcedUserId.
- `lib/telegram/bot.ts:90` (resolveActingUser): Fallback utiliza chat.id del update.
- `lib/telegram/bot.ts:387` (registerBotHandlers): Callback de resúmenes actualiza preferencias del usuario resuelto con service role.

Resultado: Cambio de preferencias de notificaciones de otra cuenta bajo privilegios del servidor.

Corrección: Rechazar resolución por chat para todo contexto ownerUserId sin forcedUserId. Mantener canje condicionado al dueño y consumir código mediante UPDATE condicional atómico. Pruebas telegram-owner-isolation y telegram-link-code.

## Caché offline compartida entre usuarios del navegador

Estado original en commit d7b3219. La caché local de cuentas y categorías usa claves globales; cerrar sesión elimina CacheStorage pero no snapshots. Una cuenta nueva recibe datos previos dentro del TTL sin consultar API.

- `components/settings/LogoutButton.tsx:14` (handleLogout): Cierra sesión sin eliminar snapshots de localStorage.
- `lib/offline-reference-cache.ts:7` (KEYS): Las claves no contienen propietario.
- `lib/offline-reference-cache.ts:134` (fetchReferenceList): Devuelve snapshot previo por TTL sin petición autenticada.

Resultado: B recibe nombres y datos de cuentas/categorías de A en el mismo navegador.

Corrección: Claves y singleflight por userId obtenido de la sesión local; descartar respuestas en vuelo tras cambio de sesión; limpiar snapshots al salir. Cola separada por propietario y validación del propietario esperado en API. Pruebas offline-reference-cache/offline-queue.

## Importación XLSX sin límite de expansión

Estado original en commit d7b3219. Se comprueba solo tamaño comprimido de 12 MiB. ExcelJS descomprime entradas antes de interpretar hojas; archivo pequeño puede expandirse a memoria muy superior. Se validó localmente con una muestra acotada; no se ejecutó agotamiento de recursos.

- `app/api/import/transactions/route.ts:1002` (POST): Solo controla tamaño del archivo comprimido.
- `app/api/import/transactions/route.ts:805` (parseXlsxWorkbook): ExcelJS materializa contenido descomprimido sin cuota de expansión.

Resultado: Asignación de memoria desproporcionada; múltiples archivos grandes pueden agotar la instancia.

Corrección: Preflight yauzl de entradas y bytes realmente descomprimidos (256 entradas, 8 MiB por entrada, 32 MiB total), cuotas de filas/columnas y archivo. Test con planilla normal y expansión rechazada.