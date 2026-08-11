# 0004 — Mercado Pago (preapproval) como único medio de pago

- **Estado:** Aceptada
- **Fecha:** 2026-08-11

## Contexto

Zarix apunta al mercado argentino, donde **Mercado Pago** es el medio de cobro
más adoptado y el que mejor maneja pagos recurrentes en ARS. La monetización es
**freemium**: un plan premium por suscripción mensual. Se necesita cobro
recurrente confiable y un mecanismo para reflejar el estado de pago en la app
sin exponerla a fraude.

## Decisión

Usar **Mercado Pago** como único medio de pago, vía **preapproval**
(suscripción recurrente). El estado de la suscripción de cada usuario se modela
como una **máquina de estados** (`SubscriptionStatus`) con cuatro estados:

- `ACTIVE` — al día.
- `GRACE_PERIOD` — pago rechazado estando activo; 7 días de gracia con banner.
- `PAST_DUE` — venció la gracia sin regularizar; se corta el acceso pago.
- `CANCELED` — suscripción cancelada.

El acceso a las features de mayor costo variable (asistente IA y bot) se
controla con `hasOrchestratorAccess(status)`, que sólo admite `ACTIVE` y
`GRACE_PERIOD` (`lib/services/subscriptions.ts`). El cron
`/api/cron/subscription-grace` degrada `GRACE_PERIOD → PAST_DUE` al vencer.

## Consecuencias

- **Webhooks idempotentes y verificados por HMAC:** el endpoint
  `/api/webhooks/mercado-pago` valida la firma `x-signature` (manifest
  `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, HMAC-SHA256 con
  `MP_WEBHOOK_SECRET`, comparación timing-safe) y es **fail-closed**: si el
  secreto no está configurado, rechaza los webhooks (no dejar abierto el
  endpoint que controla el acceso pago). MP reintenta, así que el
  procesamiento debe ser idempotente sobre el `preapproval_id`.
- **Sin estado en memoria:** el estado de pago se persiste en `users` y se lee
  en cada request; el acceso se decide en el momento, no en una sesión cacheada.
- Trade-off: acoplamiento a un solo proveedor y una sola moneda operativa (ARS).
  Es aceptable dado el mercado objetivo; sumar otro medio de pago sería un
  segundo adaptador contra el mismo `subscriptionsService`, no un rediseño.
- Riesgo de fraude/spoofing mitigado por la verificación HMAC fail-closed; sin
  ella, cualquiera podría marcarse como `ACTIVE`.
