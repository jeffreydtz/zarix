# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project Context

> Digest operativo para entender el proyecto al arrancar sin revisar todo.
> Detalle de producto/usuario: ver `README.md` (no duplicar acá).

## Qué es

**Zarix** — app de finanzas personales individual, enfocada en Argentina.
Trackea patrimonio multi-moneda (ARS/USD/cripto) con cotizaciones del mercado
argentino (blue, MEP, CCL, Merval). UI 100% en español rioplatense (`es-AR`).

## Stack

- **Next.js 14.2 (App Router)** + React 18 + TypeScript (strict)
- **Supabase** (Postgres + Auth + RLS) — cloud hosteado
- **Tailwind** + tokens CSS custom (`.card`, `surface-*`, `primary`, `foreground`)
- Framer Motion (animaciones), Recharts (gráficos), Lucide (íconos)
- Integraciones: Telegram (Telegraf), Gemini (IA anomalías), Yahoo Finance
- **Deploy:** Vercel. **Node:** v22. No hay test runner.

## Comandos

```bash
npm run dev              # desarrollo local (next dev)
npm run build            # build producción (validación principal)
npx tsc --noEmit         # typecheck (correr siempre tras editar TS/TSX)
npm run lint             # next lint
npm run db:push          # supabase db push   (SOLO si se pide explícito)
npm run db:reset         # supabase db reset  (SOLO si se pide explícito)
npm run telegram:webhook # configura webhook del bot
```

Verificación sin tests: `npx tsc --noEmit` → `npm run build` → smoke en `npm run dev`.

## Mapa de arquitectura

```
app/
  page.tsx              landing (público) + components/landing/
  demo/                 demo aislada pública (sin Supabase, estado en memoria)
  (authenticated)/      rutas con login: dashboard, expenses, accounts,
                        investments, analysis, budgets, recurring,
                        categories, settings
  api/                  route handlers (transactions, accounts, ...)
  auth/ login/ register/
components/              UI por feature + components/ui/ (primitivas)
lib/
  services/             acceso a datos (transactionsService, accountsService,
                        cotizacionesService) — capa principal de DB
  supabase/             clients: server.ts (cookies + service role), client.ts
  auth/                 getCachedUser() — sesión cacheada server
  telegram/ ai/ market-data/ constants/ hooks/
middleware.ts           refresh de sesión + guard de rutas (rutas públicas
                        listadas en isPublicPath)
supabase/schema.sql     esquema + RLS
types/                  tipos de DB
```

Variables de entorno: ver `.env.example` (claves Supabase, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`, `GEMINI_API_KEY`, flags `NEXT_PUBLIC_ENABLE_*`).
Nunca commitear `.env.local` ni imprimir secretos.

## Reglas duras (siempre)

1. **UI/textos en español `es-AR`** (rioplatense), igual que el resto de la app.
   Código y comentarios pueden ir en inglés.
2. **No hay framework de tests.** No inventar tests ni asumir jest/vitest.
   Verificar con tsc + build + dev.
3. **No tocar Supabase sin pedir permiso:** `supabase/schema.sql`, migraciones,
   políticas RLS, `db:push`/`db:reset`. Riesgo de seguridad y de datos.
   Confirmar explícitamente antes.

## Gotchas (zonas frágiles — cuidado extra)

- **Auth / middleware / RLS:** `middleware.ts` refresca sesión y bloquea rutas
  no públicas (redirige a `/login`). Una ruta pública nueva debe agregarse a
  `isPublicPath`. RLS en Supabase es la barrera real de datos — un cambio mal
  hecho abre acceso entre usuarios. Tratar como cambio de seguridad: explicar
  y confirmar antes.
- **Bot de Telegram / webhook:** depende de `TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_WEBHOOK_SECRET` y de registrar el webhook (`npm run telegram:webhook`).
  Frágil de configurar; el secreto valida requests entrantes — no debilitarlo.
- **RLS bypass por diseño:** casi toda la API usa `createServiceClientSync()`
  (service-role, **ignora RLS**) y reaplica el scope a mano con
  `.eq('user_id', user.id)`. RLS NO es red de seguridad acá. **Checklist
  obligatorio:** toda ruta/servicio nuevo que lea o escriba datos de usuario
  DEBE filtrar por `user_id` (o `auth.uid()`); una sola query sin ese filtro =
  fuga total entre usuarios. Migrar al client con RLS es grande/riesgoso —
  no hacerlo sin pedir.
- **PENDIENTE CRÍTICO — webhook MercadoPago:**
  `app/api/webhooks/mercado-pago/route.ts` NO valida firma `x-signature`;
  un POST falso puede spoofear estado de suscripción de cualquier usuario.
  Reportado, sin arreglar (falta confirmar el env var del secret de MP).
  Priorizar cuando se retome seguridad.
