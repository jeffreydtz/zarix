# 0002 — Next.js App Router en Vercel + cron jobs (sin worker persistente)

- **Estado:** Aceptada
- **Fecha:** 2026-08-11

## Contexto

Zarix necesita tanto servir la app (SSR, páginas, API) como ejecutar tareas
programadas: resúmenes semanales y mensuales, movimientos recurrentes, alertas
de vencimiento, actualización de precios, degradación de suscripciones vencidas
y alertas de presupuesto. Un worker persistente (proceso siempre encendido)
implicaría un servidor a mantener, monitorear y pagar 24/7, algo desproporcionado
para un equipo unipersonal con tráfico bajo.

## Decisión

Desplegar sobre **Vercel** con **Next.js 14 App Router**: las páginas y los
route handlers de `app/api/**` son **funciones serverless** (región `gru1`).
Las tareas programadas se implementan como **Vercel Cron** declarados en
`vercel.json` (7 crons), cada uno apuntando a un endpoint `/api/cron/*`
protegido por `CRON_SECRET` (Bearer, fail-closed si el secreto no está seteado).

## Consecuencias

- **Sin estado en memoria:** cada invocación es efímera y puede caer en una
  instancia distinta. No se puede guardar estado en variables de módulo/`global`
  entre requests. Todo el estado vive en Postgres (p. ej. la memoria del bot en
  `bot_sessions`, la propuesta de un ticket antes de confirmarlo, etc.).
- **Idempotencia obligatoria:** Vercel puede reintentar y los crons pueden
  solaparse, así que cada job debe ser idempotente. Ejemplo real: el cron de
  recurrentes reclama `last_executed_date` con un UPDATE **antes** de crear el
  movimiento, de modo que una segunda corrida no duplica el gasto.
- **Límites de ejecución:** las funciones tienen tope de duración; el trabajo
  pesado se acota o se parte (p. ej. `maxDuration` en el webhook de MP).
- Ganancia: cero ops, escala a cero, deploy automático desde git.
- Trade-off: no hay procesos long-running ni colas propias; si en el futuro se
  necesitan, habría que sumar un componente externo (cola/worker gestionado).
