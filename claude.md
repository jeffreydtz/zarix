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
  shared/[token]/       PÚBLICO: gastos compartidos por link (estilo Tricount);
                        invitados sin cuenta, token 32-hex = capability
  (authenticated)/      rutas con login: dashboard, expenses, accounts,
                        investments, analysis, budgets, recurring,
                        categories, settings, shared (gestión de grupos)
  api/                  route handlers (transactions, accounts, ...)
    shared-groups/      CRUD de grupos compartidos (sesión, solo dueño)
    shared/[token]/     API pública de invitados (GET grupo, POST unirse,
                        POST/DELETE gastos) — autorizada SOLO por share_token
  auth/ login/ register/
components/              UI por feature + components/ui/ (primitivas)
lib/
  services/             acceso a datos (transactionsService, accountsService,
                        cotizacionesService, sharedExpensesService,
                        recurringService) — capa principal de DB
  supabase/             clients: server.ts (cookies + service role), client.ts
  auth/                 getCachedUser() — sesión cacheada server
  telegram/             bot Telegraf: bot.ts (handlers texto/foto/voz),
                        executeBotTransaction.ts, send.ts
  ai/                   gemini.ts (client + function-calling loop),
                        bot-tools.ts (tools del bot/chat), prompts.ts
  cron/                 cron-job.ts: clases base CronJob / IterativeCronJob
                        (patrón Template Method) para app/api/cron/**
  market-data/ constants/ hooks/
middleware.ts           refresh de sesión + guard de rutas (rutas públicas
                        listadas en isPublicPath; /shared/[token] es pública,
                        /shared exacto requiere login)
supabase/schema.sql     esquema + RLS (mantener espejado con supabase/migrations/)
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
- **Gastos compartidos (estilo Tricount):** el acceso de invitados se basa
  SOLO en `share_token` (32 hex, único, validar con `isValidShareToken`).
  No hay sesión para invitados: todo handler nuevo bajo
  `app/api/shared/[token]/` DEBE resolver el grupo vía token y scopear cada
  query por `group_id` (nunca confiar en IDs sueltos del body). No loguear ni
  exponer `share_token` ajenos. RLS solo cubre al dueño autenticado; los
  invitados pasan por service role. Lógica de saldos/liquidación en
  `lib/services/sharedExpenses.ts` (`computeBalances`/`computeSettlements`).
- **Bot/chat AI — tools:** las herramientas viven en `lib/ai/bot-tools.ts`
  (`BOT_FUNCTION_DECLARATIONS` + `executeBotTool`); el system prompt que las
  lista está en `lib/ai/prompts.ts` — mantener AMBOS sincronizados al agregar
  una tool, y agregar tools de escritura a `BOT_WRITE_TOOLS`. Todo dato de
  usuario interpolado en prompts pasa por `sanitizeForPrompt`
  (anti prompt-injection) — no quitarlo.
- **Webhook MercadoPago:** valida firma `x-signature` (HMAC) y es fail-closed:
  sin `MP_WEBHOOK_SECRET` en prod responde 401. No debilitar; configurar el
  env var en cada entorno.

## Contexto académico (TIF UAI)

Zarix es también el caso del **Trabajo Integrador Final** (UAI, Facultad de
Tecnología Informática). El documento `Zarix TIF v2.docx` (raíz del repo) cubre el
plan de negocio + la solución técnica con metodología **ICONIX**. La sección 10 y el
Anexo D contienen 13 diagramas (casos de uso con include/extend, modelo de dominio,
robustez, secuencia, clases, ER, paquetes, componentes, despliegue, 2 patrones de
diseño y estilos arquitectónicos), más reglas de negocio (RN-xxx) y matriz de
trazabilidad (10.5.15).

- **Fuentes editables** de los diagramas: `docs/tif/diagrams/*.puml` (PlantUML) y
  `docs/tif/png/`. Cómo regenerarlos (render LOCAL con plantuml.jar + JRE portable;
  no subir los .puml a servidores externos) e incrustarlos en el `.docx`:
  ver `docs/tif/README.md`. Los diagramas se derivan del **código real**; si cambiás
  el modelo de datos, una ruta o un servicio, actualizá el `.puml` correspondiente
  Y la tabla equivalente en el `.docx` (deben contar la misma historia).
- **Material de cátedra** (ICONIX aplicado a Odoo, plantillas y checklists de
  calidad por tipo de diagrama): `https://github.com/cursos-uai/sap_tfi_2026`.
  Los diagramas de Zarix siguen sus checklists; puntos que el profesor valida:
  include/extend con flecha correcta (base→incluido; extensor→base), robustez SOLO
  con mensajes actor→boundary→control→entity (un entity nunca inicia mensajes;
  verbos: Invoca/Pide/Solicita hacia control, Lee/Escribe/Crea/Actualiza hacia
  entity), secuencia con SQL explícito + activate/deactivate + alt/opt, modelo de
  dominio conceptual sin campos técnicos, y patrones documentados en formato
  FCEIA-UNR (Cristia 2015: `Pattern X based on Y because... where... comments`).
- Convención de los diagramas: título `ZARIX — … (CU-xxx)`, leyenda abajo a la
  derecha (Proyecto/Autor/Metodología/Fuente), `linetype ortho`, fondo blanco,
  Arial.

## Patrones de diseño aplicados

- **Strategy** — `lib/services/cotizaciones.ts`: la cotización del dólar se resuelve
  con un arreglo ordenado de estrategias `DolarRateProvider` (`CriptoYaProvider` →
  `DolarApiProvider` → `DbCacheProvider`). `getDolarQuotes()` (el *Context*) las recorre
  con fallback hasta obtener una cotización válida, cachea (TTL 300s) y persiste solo las
  fuentes en vivo en `exchange_rates`. **Agregar una fuente = implementar
  `DolarRateProvider` y sumarla a `dolarProviders` en el constructor; no tocar
  `getDolarQuotes()`** (principio Open/Closed). Documentado en el Anexo D.1 del TIF
  (`docs/tif/diagrams/fig11_patron_strategy.puml`).
- **Template Method** — `lib/cron/cron-job.ts`: los 6 cron jobs de `app/api/cron/**`
  extienden `CronJob` (o `IterativeCronJob<TItem>`). `run()` es el template method:
  valida el bearer de Vercel Cron, crea el service client y envuelve todo en JSON
  uniforme; las subclases implementan `fetchItems()`/`processItem()` y los hooks
  `shouldProcess`/`beforeAll`/`afterAll`. **Agregar un cron = una subclase + un GET
  de una línea (`return new XxxJob().run(request)`); NO redefinir `run()` ni volver
  a validar el secreto a mano.** Instanciar un job nuevo por request (las subclases
  guardan estado por corrida y Vercel reutiliza el módulo). Documentado en el Anexo
  D.2 del TIF (`docs/tif/diagrams/fig13_patron_template_method.puml`).
