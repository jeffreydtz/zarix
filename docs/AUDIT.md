# AUDIT — Zarix (product + ops)

**Fecha:** 2026-09-08  
**Repo:** https://github.com/jeffreydtz/zarix (`main` @ `a57b0df`)  
**Prod:** https://zarix-phi.vercel.app (Vercel project `zarix`, team Hobby, región de funciones `gru1`)  
**Alcance:** auditoría de arquitectura y estado real en producción. **Sin rewrite.** Los únicos cambios de código de este PR son docs + `.env.example` (el README apuntaba a un archivo que Git ignoraba).

Relacionado: `docs/EV-COD-zarix.md` (evidencia TIF, 2026-08-26), `docs/adr/*`, `docs/HANDOFF.md` (siguiente slice).

---

## TLDR

Zarix es una PWA Next.js 14 + Supabase + Vercel Cron + Telegram/Gemini + Mercado Pago, **desplegada y viva**. Landing, demo, login, health y DB responden. El core de finanzas (cuentas, movimientos, saldos por trigger SQL, dashboard, análisis, recurrentes) está implementado y el CI en `main` está verde.

No es un producto pulido y cobrable todavía. En prod hoy:

1. **`/auth/callback` devuelve 500** — `NEXT_PUBLIC_APP_URL` no está seteada. Se rompe confirmación de email, magic link y cualquier redirect de Supabase. Login por password de usuarios ya confirmados puede seguir andando.
2. **Open Graph apunta a `http://localhost:3000/...`** (mismo env faltante, bakeado en el build).
3. **Billing desalineado:** landing vende Premium a **USD 8/mes** y “2 cuentas” en Free; la API pública de planes devuelve el fallback **9.99 ARS**; los usuarios nuevos nacen `status = ACTIVE` (acceso al orquestador/bot). Los límites de Free **no existen en código**.
4. **Cron `update-prices` pega 429 de Yahoo** (AAPL, visto el 2026-09-08). El cron **sí corre**. El path de UI de inversiones tiene fallback Stooq; el cron no.
5. **No hay “olvidé mi contraseña”** en la UI. Mensajes de error lo mencionan.

Próximo slice recomendado: **Trust** (auth + claims honestos + precios/MP + cron de precios). Ver §5 y `docs/HANDOFF.md`.

---

## 1. Arquitectura actual

```text
Usuario ──► PWA Next.js 14 (App Router, Vercel gru1)
              │
              ├── páginas públicas: /  /demo  /login  /register  /shared/[token]
              ├── (authenticated): dashboard, expenses, accounts, investments,
              │                    analysis, budgets, recurring, categories,
              │                    settings, shared (dueño)
              └── app/api/**  (~55 route handlers)
                    │
                    ├── cookie session (anon key) ──► getUser() en cada ruta
                    ├── service-role ──► lib/services/*  (RLS bypasseado;
                    │                     scope obligatorio por user_id)
                    ├── crons Bearer CRON_SECRET
                    ├── Telegram webhook (secret_token)
                    └── MP webhook (HMAC x-signature, fail-closed)

Supabase: Postgres + Auth + RLS (defensa del camino cookie; no del service-role)
Telegram: Telegraf + Gemini function-calling (14 tools)
Mercado Pago: preapproval → users.status {ACTIVE, GRACE_PERIOD, PAST_DUE, CANCELED}
```

**Hechos de código (no claims de marketing):**

| Capa | Real |
|------|------|
| Frontend | Next.js 14.2.35, React 18, Tailwind, Recharts, Framer Motion. **No hay Zustand** (README mentía). |
| Datos | `NUMERIC(20,8)` + trigger `update_account_balance()`. Servicios TS usan `Number()` (IEEE-754) para agregados. |
| Auth | Supabase email/password, magic link, passkeys experimentales. Middleware guarda páginas; **`/api/*` queda fuera del matcher** (cada handler autentica). |
| Money path | POST `/api/transactions` → `transactionsService` → trigger SQL. Recurrentes: compare-and-swap de `last_executed_date` antes de insertar. |
| Bot | Webhook fail-closed. Vinculación por código de un solo uso (el POST viejo de `chat_id` responde 410). |
| Tests | Vitest, 19 archivos. CI: lint + typecheck + test + build (Node 20). Vercel runtime: Node **24.x**. |
| Observabilidad | `alertAdmin` por Telegram si `TELEGRAM_ADMIN_CHAT_ID`. Hobby: logs ~1 h. Sin Sentry. |

ADRs vigentes: 0001 RLS/service-role, 0002 serverless crons, 0003 Gemini, 0004 MP, 0005 testing por riesgo, 0006 migraciones (baseline CLI **pendiente**).

---

## 2. Deploy status — qué anda vs qué está roto

Proyecto Vercel `prj_K16EpV6Y3YUISohZkFSh6hGUYnpK`, último production `dpl_GonMVDGJU1EbdVz8XBkt5d2MvFoE` (commit `a57b0df`, PR #9 — fix 500 al editar saldo). Dominios: `zarix-phi.vercel.app` (+ aliases de git). **No hay dominio custom** (`zarix.app` es mock del landing). Plan **Hobby**. SSO protection en previews, no en el dominio custom (no hay). Headers de seguridad presentes (CSP, HSTS, XFO DENY).

| Superficie | HTTP / evidencia | Estado |
|------------|------------------|--------|
| Landing `/` | 200 | OK |
| Demo `/demo` | 200, estado en memoria | OK (CTA usa `bg-info`, no el primary del design system) |
| Login `/login` | 200 | OK como página; ver auth callback |
| Register `/register` | 200 | OK como página; confirmación de email **rota** (callback 500) |
| Dashboard sin sesión | redirect a `/login` | OK |
| `/api/health` | `{"status":"ok","db":"ok"}` ~1.1 s | OK (DB viva) |
| `/api/cotizaciones` anónimo | 401 | OK |
| `/api/cron/*` sin Bearer | 401 | OK (fail-closed; implica `CRON_SECRET` seteado) |
| `/api/webhooks/mercado-pago` sin firma | 401 | OK (fail-closed; implica `MP_WEBHOOK_SECRET` seteado **o** rechazo por secret vacío) |
| `/api/telegram/webhook` GET | 405 | Endpoint existe (solo POST) |
| `/api/auth/dev-login` | 404 | OK (cerrado en production) |
| `/api/billing/subscription-link` GET | 200, plan fallback 9.99 ARS | **Desalineado** vs landing USD 8 |
| `/auth/callback` | **500** cuerpo vacío | **ROTO** |
| OG / Twitter image | `http://localhost:3000/logo-formats/og-image-1200x630.png` | **ROTO** (el PNG en sí da 200 en el host prod) |
| `manifest.json` / `sw.js` | 200 | OK |
| Cron `update-prices` | Runtime errors Yahoo 429, última 2026-09-08 10:00 UTC | **Corre**, precios US frágiles |
| Account PATCH 500 | 5 ocurrencias 2026-09-03; fix mergeado en #9 | **Resuelto en el deploy actual** |
| CI `main` | último run success (PR #9) | OK |

**No verificado con sesión de usuario** (no hay credenciales de prueba en este entorno): dashboard autenticado, alta de movimiento, Telegram end-to-end, checkout MP, import/export, gastos compartidos con token real.

**Señales de que crons corren:** Hobby permite hasta 100 crons diarios; los 8 de `vercel.json` son todos ≥1/día, así que son legales. Evidencia dura: `update-prices` loguea 429 todos los días. El resto (recurring, summaries, grace, budgets, snapshots) **no se puede confirmar** con logs Hobby (retención 1 h). No hay tabla de “last run”.

---

## 3. Gaps P0 / P1 / P2

Prioridad = daño a confianza o a plata, no volumen de código.

### P0 — bloquea confianza o dinero

| ID | Gap | Por qué importa | Fix acotado |
|----|-----|-----------------|-------------|
| **P0-1** | `NEXT_PUBLIC_APP_URL` ausente → `/auth/callback` 500 | Registro y magic link no cierran. Un producto de plata que no deja entrar no es creíble. | Setear `https://zarix-phi.vercel.app` (o dominio final) en Vercel **Production + Preview**, redeploy. Verificar 302 en `/auth/callback` sin code y un magic link real. Código: `lib/auth/email-redirect.ts` + `app/layout.tsx`. |
| **P0-2** | Landing vs realidad de planes | “2 cuentas”, “USD 8”, Free vs Premium. API 9.99 ARS. Nuevos users `ACTIVE` (schema default). No hay `MAX_ACCOUNTS`. | Elegir **una** verdad: (A) beta abierta, landing dice “todo incluido, cobro después”; o (B) default `PAST_DUE`/`CANCELED` + enforce límites + precio ARS real en `MP_SUBSCRIPTION_*`. No las dos. |
| **P0-3** | Mercado Pago no está “en producción comercial” | GET planes = fallback de código. POST `createPreapproval` explota sin `MP_ACCESS_TOKEN`. Webhook HMAC está bien diseñado. | O configurar token + monto ARS + preapproval sandbox E2E, o esconder el CTA Premium / Settings checkout. |
| **P0-4** | Precios US del cron | P&L de AAPL/CEDEAR US puede quedar congelado. Cron usa `getStockQuote` (Yahoo, throw); UI usa Stooq. | Reusar `fetchStooqUsQuote` en `update-prices` / `getStockQuote`; no pisar `current_price` si el fetch falla. |
| **P0-5** | Sin recuperación de contraseña | Error copy dice “recuperar”; no hay `resetPasswordForEmail`. | Pantalla/link en `/login` + template Supabase + `NEXT_PUBLIC_APP_URL`. |

### P1 — pulido / seguridad de producto

| ID | Gap | Notas |
|----|-----|-------|
| **P1-1** | Entitlements del orquestador | `ensureOrchestratorAccess` solo mira `ACTIVE`/`GRACE_PERIOD`. Con default ACTIVE, el paywall no existe. |
| **P1-2** | Password min 6 | Register acepta 6 chars. Subir a ≥10 o reglas Supabase. |
| **P1-3** | Passkeys en `*.vercel.app` | RP ID / dominio de Supabase Auth. Sin custom domain es frágil. Experimental en `@supabase/ssr`. |
| **P1-4** | Telegram en prod | Webhook requiere `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` + `npm run telegram:webhook` (usa `NEXT_PUBLIC_APP_URL`). No auditable desde afuera. Confirmar `getWebhookInfo`. |
| **P1-5** | Crons opacos | Sin `cron_runs`. Hobby ±59 min, UTC. Summaries a “9:00” no son 9:00 ART. |
| **P1-6** | JS `Number` vs `NUMERIC(20,8)` | OK para ARS cotidianos; riesgo en BTC/ETH y sumas largas. No reescribir money; sí redondear a 2/8 decimales en bordes. |
| **P1-7** | `withAuth` muerto | `lib/api-handler.ts` existe; las rutas siguen copypasteando `getUser()`. Drift de 401. |
| **P1-8** | Rate limit in-memory | No comparte isolates. Suficiente anti-burst, no WAF. |
| **P1-9** | Legal | Tesis cita Ley 25.326. No hay `/privacidad` ni `/terminos`. Finanzas + Telegram + Gemini lo van a pedir. |
| **P1-10** | Dominio + marca | Mock `zarix.app/dashboard`. OG/passkeys/emails mejoran con un dominio. |
| **P1-11** | Migraciones | ADR 0006: prod se tocó a mano; `supabase/config.toml` no está. Drift silencioso. |
| **P1-12** | Observabilidad | 1 h de logs. Yahoo 429 se vio porque Observability Errors agrega 7 d. Subir Pro o Sentry antes de usuarios reales. |
| **P1-13** | Shared groups | Token 32-hex = capability. Ya hay caps de miembros y menos PII (hardening #2). Falta rate-limit por token y rotación. |
| **P1-14** | Service-role | Toda query nueva **debe** filtrar `user_id`. Checklist de PR, no un rewrite RLS. |
| **P1-15** | Offline queue | IndexedDB de movimientos. Confirmar idempotencia / duplicados al re-sync. |

### P2 — deuda, no el camino crítico

- README: Zustand (este PR lo corrige). `claude.md` dice “no hay tests”.
- E2E Playwright (ADR 0005 lo deja explícito como futuro).
- Coverage solo en 4 archivos (`vitest.config.ts`).
- Node 20 CI vs 24 Vercel.
- Demo/landing CTAs `bg-info` (viola DESIGN.md: azul ≠ CTA).
- Health ~1 s (frío).
- Anomalías/proyecciones viven en `/api/ai/*` pero son heurísticas (naming).
- Import de ~1560 líneas: funciona; no tocar en el slice Trust.
- Custom bot Telegram: flujo complejo; no expandir.

---

## 4. Matriz por área pedida

### Auth

- Password login + resend confirmation: implementados.
- Magic link: UI sí; **callback 500**.
- Passkeys: UI sí; dominio no de producto.
- Dev-login: cerrado en prod.
- Middleware: páginas sí, API no (correcto si cada ruta chequea).

### Money safety

- Saldos en DB por trigger (bien).
- Recurrentes: claim-before-insert (bien).
- Ajuste de saldo: bug de moneda “fantasma” **arreglado en #9**.
- Import: hardening previo (no repricear historia con FX live).
- Tests unitarios de impacto/FX/settlements; **cero test del trigger SQL**.
- Dual path Yahoo vs Stooq en precios.

### Mercado Pago

- Máquina de estados + HMAC + fail-closed: código sólido.
- Cron `subscription-grace`: `GRACE_PERIOD → PAST_DUE`.
- Comercialmente: precio/landing/API/default `ACTIVE` no cierran un cobro real.

### Telegram bot

- Arquitectura lista (secret header, 200 siempre para no duplicar, confirmación en writes de foto, tools scoped).
- Depende de env + webhook register + Gemini key (BYO o server).
- Gating por suscripción es no-op si todos están ACTIVE.

### Crons

```
weekly-summary     0 9 * * 1
monthly-summary    0 9 1 * *
recurring          0 8 * * *
maturity-alerts    0 9 * * *
update-prices      0 10 * * *
net-worth-snapshot 30 10 * * *
subscription-grace 15 7 * * *
budget-alerts      30 10 * * *
```

Todos diarios o menos → Hobby OK. Precisión ±1 h UTC. `update-prices` evidenciado. Resto: asumir que Vercel los dispara, no hay prueba de negocio (¿se creó el recurrente de hoy?).

### UX / PWA

- Mobile tab bar, captura rápida, design tokens, privacy mask de montos.
- PWA: manifest + SW que **no** cachea HTML autenticado ni `/api` (bien, post-hardening).
- Offline: “Sin conexión.” en navegación; cola de altas.
- Confianza UX: precios contradictorios, OG localhost, sin términos, demo con CTAs azules, login sin reset.

---

## 5. Siguiente slice (1–2 semanas de foco)

**Nombre:** Trust — entrar, creer el número, no mentir el precio.

**Fuera de alcance:** nuevas features, rewrite RLS, Playwright completo, custom domain (salvo que el env ya apunte al dominio).

### Definition of Done

1. `GET https://zarix-phi.vercel.app/auth/callback` → **302** a `/login?error=...`, nunca 500.
2. Registro nuevo: mail de confirmación abre la app y deja sesión (o mensaje claro). Magic link idem.
3. Meta OG/Twitter usa `https://zarix-phi.vercel.app/...` (redeploy después del env).
4. Landing y `/api/billing/subscription-link` muestran **el mismo** precio y moneda, **o** Premium está marcado “Próximamente” y Settings no redirige a MP.
5. Copy de Free no promete “2 cuentas” a menos que el POST de cuentas lo enforce.
6. `/login` tiene flujo “olvidé mi contraseña” que aterriza en callback sano.
7. Cron `update-prices`: un 429 de Yahoo **no** deja el error cluster diario; o bien Stooq/último precio, o skip explícito. Verificar en Vercel Runtime Errors 48 h.
8. `docs/HANDOFF.md` actualizado con el resultado (env que faltaba, decisión A/B de entitlements).
9. CI verde. Sin migración de schema salvo que se elija (B) default no-ACTIVE (eso sí es migración + confirmación explícita).

Checklist operativo (Vercel dashboard, no código): `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `TELEGRAM_*`, `MP_*`, `SUPABASE_*`, Site URL de Supabase = misma origin.

---

## 6. Método

- Código en `main` @ `a57b0df`.
- Vercel MCP: project, deployments, runtime errors 7 d, protection.
- HTTP real a `zarix-phi.vercel.app` (health, billing, callback, cron 401, headers).
- GitHub: PRs 1–9, CI success.
- No se tocó la DB de prod. No hay `.env` en el repo (`.env*` estaba gitignoreado, incluido `.env.example`).
