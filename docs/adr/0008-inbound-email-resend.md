# 0008 — Inbound email genérico (Resend u otro) para carga automática

- **Estado:** Aceptada
- **Fecha:** 2026-11-10

## Contexto

Hace falta recibir mails reenviados de Mercado Pago y de bancos, extraer
movimientos y dejarlos en la bandeja de pendientes. El stack es Next.js en
Vercel + Supabase: no hay worker de IMAP ni buzón propio. Crear una cuenta
en un proveedor desde el agente no está permitido (previews comparten secretos
con producción).

Opciones evaluadas:

1. **Resend Inbound** — webhook JSON a una ruta de Next, dominio o subdominio,
   adjuntos. Encaja con Vercel. Requiere cuenta y DNS del dueño.
2. **SendGrid Inbound Parse / Postmark inbound** — mismo patrón, otra cuenta.
3. **IMAP polling** — no hay proceso persistente; Vercel cron cada minuto es
   frágil y guarda credenciales de mail.
4. **Una dirección `@zarix…` alojada por nosotros** — implica proveedor + DNS
   de producción, fuera de alcance de un PR.

## Decisión

Exponer `POST /api/ingest/email` como webhook genérico:

- Autenticación fail-closed con `INBOUND_EMAIL_WEBHOOK_SECRET`.
- Dirección por usuario: `zrxm_<token>@INBOUND_EMAIL_DOMAIN` (el token se
  hashea en `inbound_email_mailboxes`).
- Payload: Resend (`type: email.received`) o JSON `{ mailboxToken, text,
  attachments[].contentBase64 }`. No se descargan URLs (SSRF).
- Extraído → `parkRegistryWrite` con `source=email`. **Nunca** `confirmPendingItem`.
- PDF/CSV por la app o Telegram usan `source=statement` y la misma bandeja.

No se crea la cuenta de Resend (ni de otro) en este cambio. Sin los env el
endpoint responde 503 y la UI lo dice.

## Consecuencias

- El dueño configura Resend (o equivalente) cuando quiera, apunta el inbound
  al webhook y pone el secreto en Vercel **production** (no en una preview
  que comparte Supabase).
- Los previews no aplican la migración: el servicio hace fail-soft si falta
  `inbound_email_mailboxes`.
- Los PDFs y el cuerpo del mail se tratan como datos no confiables
  (`wrapUntrustedExtract` + system instruction). El adjunto no se persiste.
