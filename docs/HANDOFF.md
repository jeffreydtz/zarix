> **Referencia histórica.** Para la entrega v2.13 del 6 de octubre de 2026, el alcance final, las versiones y los resultados vigentes están en [docs/tif/v2.13](tif/v2.13/README.md). Los CU y mediciones que siguen pertenecen al relevamiento anterior y no acreditan la nueva revisión.

# HANDOFF — Zarix

Documento operativo para el próximo agente / sesión. Producto: PWA de finanzas personales (Argentina, TIF UAI).  
Auditoría completa: [`docs/AUDIT.md`](./AUDIT.md) (2026-09-08).

---

## Estado al 2026-09-08

- **Repo:** `jeffreydtz/zarix`, branch de trabajo de producto = `main`.
- **Prod:** https://zarix-phi.vercel.app — deploy `a57b0df` (PR #9, fix PATCH de cuenta).
- **No reescribir.** El producto es grande y ya endurecido (PRs #2–#3 security, #8 análisis, #9 saldos).
- **P0 vivo:** `/auth/callback` → **500** porque falta `NEXT_PUBLIC_APP_URL` en el entorno de build/runtime. OG tags salen con `http://localhost:3000`.

Si solo hay tiempo para **una** acción: setear ese env en Vercel, redeploy, confirmar que el callback redirige.

---

## Cómo correrlo

```bash
cp .env.example .env.local   # placeholders; nunca commitear .env.local
npm install
npm run dev
npm test
npm run typecheck
npm run lint
```

Supabase es cloud (no hay `supabase/config.toml` en el repo). `npm run db:push` / `db:reset` **solo con permiso explícito** — hay drift histórico (ADR 0006).

Telegram webhook (después de tener `NEXT_PUBLIC_APP_URL` real):

```bash
npm run telegram:webhook
```

---

## Mapa corto

| Quiero… | Dónde |
|---------|--------|
| Páginas logueadas | `app/(authenticated)/` |
| APIs | `app/api/` — **no** pasan por el guard de `middleware.ts` |
| Dinero (TS) | `lib/services/transactions.ts`, `accounts.ts` |
| Resumen de tarjeta | `lib/card-statement.ts`, `lib/services/card-statement.ts`, `GET /api/accounts/[id]/statement` |
| Dinero (SQL) | `update_account_balance()` en `supabase/schema.sql` + migraciones |
| Bot | `lib/telegram/bot.ts`, `lib/ai/bot-tools.ts` |
| Crons | `app/api/cron/*`, template `lib/cron/cron-job.ts`, schedule `vercel.json` |
| MP | `lib/services/mercado-pago-service.ts`, `app/api/webhooks/mercado-pago/` |
| Auth redirect | `lib/auth/email-redirect.ts` (** explota en prod sin env **) |
| Design | `DESIGN.md`, tokens en `app/globals.css` — UI en **es-AR** |

**Invariante de seguridad:** `createServiceClientSync()` ignora RLS. Toda lectura/escritura de usuario lleva `.eq('user_id', …)` (o token de shared group). Un olvido = fuga cross-tenant.

---

## Slice a shipear ahora — “Trust”

Detalle y DoD: `docs/AUDIT.md` §5.

Orden sugerido (no paralelizar de más; 1–2 es ops, el resto es código chico):

1. **Ops:** `NEXT_PUBLIC_APP_URL=https://zarix-phi.vercel.app` en Vercel Production y Preview. Alinear Supabase Auth → Site URL y Redirect URLs. Redeploy. Probar callback + mail.
2. **Auth UX:** “Olvidé mi contraseña” en `/login` (`resetPasswordForEmail` + recovery en callback).
3. **Honestidad comercial:** decisión A (beta, copy honesto, sin paywall) o B (default no-ACTIVE + límites + ARS de MP). Implementar **una**. Alinear `PricingSection` con `getBillingPlans()`.
4. **Precios US:** fallback Stooq / last-price en `cotizacionesService.getStockQuote` o en el cron `update-prices` (la UI de investments ya tiene Stooq).
5. Cerrar el slice actualizando este archivo (qué se eligió A/B, env que quedó).

**No hacer en este slice:** Playwright, migrar service-role→RLS, rediseño dashboard, features nuevas, tocar trigger de saldos salvo bug reproducido.

---

## Credenciales / env

Grupos (ver `.env.example`):

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- App: `NEXT_PUBLIC_APP_URL` ← **faltaba en prod el día del audit**
- Crons: `CRON_SECRET` (prod lo tiene: cron sin Bearer = 401)
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, opcional `TELEGRAM_ADMIN_CHAT_ID`
- Gemini: `GEMINI_API_KEY` (fallback; usuarios pueden BYO)
- MP: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_SUBSCRIPTION_*`
- No usar `ALLOW_DEV_LOGIN` en prod (el handler ya 404 si `NODE_ENV=production`)

---

## Tests y CI

- `npm test` — Vitest, lógica monetaria + auth helpers + billing plans.
- GitHub Actions `.github/workflows/ci.yml` — lint, tsc, test, build (placeholders de Supabase).
- No hay E2E. Verificar UI en el browser o curl contra prod como en el AUDIT.

---

## Contacto de contexto

TIF / defensa: `docs/GUIA-DEFENSA-TIF.md`, `docs/EV-COD-zarix.md`.  
Owner: Jeffrey Dietz. Vercel team Hobby `jeffreys-projects-591940ca`.
