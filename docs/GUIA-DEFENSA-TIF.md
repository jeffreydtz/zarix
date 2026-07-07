# GUÍA DE DEFENSA — Zarix TIF (documento + código, de pe a pa)

> Objetivo: que puedas responder **cualquier** pregunta del profesor sobre el TIF
> (`Zarix_TIF_Jeffrey_Dietz.docx` v2.1) y sobre el codebase, incluyendo pedidos de
> cambios de diseño. Cada afirmación referencia el archivo real del repo.
>
> Estructura: §1 qué es Zarix en 1 minuto · §2 el documento sección por sección ·
> §3 el codebase carpeta por carpeta · §4 base de datos a fondo · §5 los 13 diagramas
> y cómo se defienden · §6 flujos end-to-end (los que seguro pregunta) · §7 patrones
> y estilos · §8 seguridad · §9 cómo responder a cambios de diseño típicos ·
> §10 preguntas trampa y sus respuestas.

---

## 1. Zarix en un minuto (elevator pitch)

**Qué es:** PWA de finanzas personales diseñada nativamente para Argentina.
Unifica patrimonio en ARS/USD/USDT/BTC/ETH, movimientos, cotizaciones en tiempo
real (oficial, blue, MEP, CCL, crypto), portafolio de inversiones (Merval + USA),
presupuestos, transacciones recurrentes, gastos compartidos tipo Tricount,
asistente IA (Gemini) y bot de Telegram.

**Qué NO es:** no es billetera, no custodia activos, no mueve dinero, no da
asesoramiento financiero → por eso no requiere licencia BCRA/CNV (sección 9.4 del doc).

**Stack (memorizar):**
- **Frontend:** Next.js 14 (App Router, React Server Components), React 18, Tailwind CSS, Recharts, Framer Motion.
- **Backend:** route handlers serverless de Next.js en Vercel (`app/api/**`), capa de servicios TypeScript (`lib/services/`).
- **Datos:** Supabase = PostgreSQL 15 + Auth (JWT/GoTrue) + Storage. RLS en todas las tablas. Saldos por **trigger**, no por código.
- **Integraciones:** Telegram (Telegraf, webhook), Google Gemini (chat, OCR de tickets, anomalías), Mercado Pago (suscripciones, webhook HMAC), APIs de cotización (CriptoYa, DolarApi, CoinGecko, Yahoo Finance).
- **Automatización:** 7 cron jobs de Vercel Cron.
- **Metodología de análisis/diseño del TIF:** ICONIX (requerimientos → CU → dominio → robustez → secuencia → clases), según material de cátedra `sap_tfi_2026`.

**Frase clave si pregunta "¿por qué este stack?":** minimizar costo operativo
(tiers gratuitos de Vercel/Supabase, USD 12–50/mes) y maximizar velocidad de
iteración de un equipo unipersonal; serverless + BaaS eliminan operaciones de
infraestructura.

---

## 2. El documento, sección por sección

El docx tiene 4 grandes bloques: **A** Resumen Ejecutivo · **B** Plan de Negocios
(secciones 1–9) · **10** Solución Tecnológica (la parte ICONIX) · **C/D** Anexos.

### A. Resumen Ejecutivo
Zarix cubre la brecha: apps internacionales (Mint, YNAB) ignoran blue/cepo/Merval;
locales atacan segmentos aislados. Números clave: mercado accesible >2M personas,
proyección 7.000 usuarios y 560 premium al mes 24, inversión inicial < USD 100,
costos USD 10–20/mes, **punto de equilibrio con 7–10 suscriptores**.

### B.1 Descripción General
- Clasificación: **E-Business B2C, SaaS**, distribución PWA sin app store.
- Estado: **beta previa al lanzamiento**; módulos core operativos y desplegados en producción (Vercel).
- Diferenciales (1.3): dólar blue/MEP/CCL como ciudadanos de primera clase, bot Telegram, OCR de tickets, portafolio unificado, PWA mobile-first.
- Misión: empoderar decisiones financieras de argentinos. Visión: app de referencia en AR/LATAM para economías multi-moneda.
- Estrategia de inserción (1.12): **diferenciación (Porter)** + **nicho (Kotler)** — primero early adopters cripto/finanzas, después público general.

### B.2 Análisis Estratégico
- Contexto: inflación >200% anual, multi tipos de cambio, 70% ahorra en dólares y 30% tiene cripto (BCRA 2024). Lanzamiento desde Rosario, alcance nacional.
- Exposición regulatoria baja: Zarix solo registra y visualiza, no opera dinero.
- Competidores (2.2.1): Fintual (solo inversiones), Spendee (sin ARS/blue), Google Sheets (sin automatización), Monefy (sin inversiones), apps locales viejas (UX desactualizada). Ninguno integra todo.
- FCE (2.2.3): dashboard <2 s, precisión del blue, registro en ≤3 pasos, uptime >99.5%.

### B.3 FODA
- **F:** conocimiento local profundo, stack moderno, costos ~0, producto funcional.
- **D:** equipo unipersonal, sin marketing, dependencia de APIs externas gratuitas.
- **O:** mercado desatendido, fintech LATAM creciendo, comunidades activas.
- **A:** regulación cambiante, competidores con capital, desconfianza en apps financieras.
- Tesis: el localismo es la protección — replicarlo no es prioridad para jugadores globales en un mercado de 45M.

### B.4 Segmentación
Tres segmentos priorizados: **Early Adopter Tech-Finance** (25–35, IT/finanzas, cripto+dólares), **Profesional Independiente** (30–45, ingresos USD y gastos ARS), **Inversor Principiante** (22–35, CEDEARs/cripto). Público primario: 25–45, urbano (AMBA/Rosario/Córdoba), universitario, usa homebanking + billetera virtual.

### Business Model Canvas (Osterwalder & Pigneur, 2010)
9 bloques, orden de llenado: Segmento → Propuesta de Valor → Canales → Relación → Ingresos → Recursos → Actividades → Socios → Costos.
- **Propuesta de valor** (4 capas): patrimonio unificado con cotizaciones reales · eliminación de fricción (bot, OCR, recurrentes) · asistente IA que conoce tus números · detección proactiva y planes concretos. Posicionamiento: *"intuitivo para el que no sabe nada, potente para el que sabe todo"*.
- **Ingresos:** freemium. Free (masa crítica) + Premium USD 5–10/mes en ARS al TC oficial. Año 1: 2.000 usuarios × 8% conversión = USD 1.200/mes. Secundarias: alianzas fintech, B2B white-label.
- **Socios:** blandos (MP, Ualá, Naranja X, influencers, comunidades) y tecnológicos (Supabase, Vercel, Gemini, DolarApi/CriptoYa/CoinGecko, Yahoo Finance).
- **Costos:** lean, SaaS gratuito; Fase 1 USD 12–50/mes.

### B.5–B.7 Plan de Acción / Marketing / Operaciones
- Fases: MVP (m1–3, beta 50 usuarios) → Lanzamiento (m4–6, 500 usuarios, 30+ subs) → Crecimiento (m7–12, 2.000 usuarios, 150+ subs) → Expansión LATAM (año 2).
- Marketing $0: Twitter/X, Telegram, Reddit (r/merval, r/argentina), Product Hunt, SEO. Las **7 C** del sitio (6.6.2): Contexto, Contenido, Comunidad, Customización, Comunicación, Conexión, Comercio.
- Precio: **penetración** — bajo para capturar mercado. Free: dashboard, movimientos ilimitados, 2 cuentas. Premium: inversiones, bot, OCR, IA, recurrentes, cuentas ilimitadas, exportación.
- Operaciones: unipersonal (founder = PM+dev+UX+marketing), sprints de 2 semanas, GitHub + deploy automático a Vercel. Fase 3 incorpora dev frontend + community manager.

### B.8 Plan Financiero
- Ingresos: mes 6 = USD 300; mes 12 = 1.200; mes 24 = 4.480 (7.000 usuarios, 8% conversión, ticket USD 8).
- Egresos: Supabase 0–25, Vercel 0–20, Gemini 10–50, dominio 2 → Fase 1 total 12–50/mes.
- **Punto de equilibrio: 7–10 suscriptores**. Repago mes 5–6. VAN positivo (tasa 10%, 2 años). TIR >200% (inversión mínima).
- Impuestos: Monotributo (persona física) ahora, SAS en Fase 3. IIBB Santa Fe ~3.5%.
- Contingencia: bajar a tiers free, pivot B2B white-label, afiliados. Salida: exportar datos de usuarios, open-source del código, venta de marca/base a fintech local.

### B.9 Factibilidades
Técnica alta (stack probado, founder capacitado), comercial alta (demanda comprobada en comunidades, precio <0.5% del ingreso del segmento), administrativa alta (Monotributo simple), legal alta (no custodia activos → sin licencia BCRA/CNV; cumple Ley 25.326 de Protección de Datos).

### 10. Solución Tecnológica (sección ICONIX — el corazón técnico)
- **10.4 Documento Visión:** propuesta de valor, **RF01–RF11** y **RNF01–RNF05** (ver §5.1 abajo), alcance (dentro/fuera), glosario, entorno (cliente: browser PWA ≥320px; servidor: Supabase PG15 + Vercel serverless).
- **10.5.1 Mapa de navegación:** Dashboard/Movimientos/Cuentas/Configuración = free; Inversiones/Análisis/IA/Presupuestos/Recurrentes = premium; Gastos Compartidos = público vía enlace.
- **10.5.2–3:** índice de CU + especificaciones completas (ver §5.2).
- **10.5.4–10.5.12:** modelo de dominio, robustez ×2, secuencia, paquetes, componentes, clases, ER, despliegue (ver §5).
- **10.5.13:** 11 casos de prueba CP-xxx vinculados a CU.
- **10.5.14:** 3 prototipos de UI en formato tabla (elemento/descripción/interacción), mismo formato que la cátedra.
- **10.5.15:** matriz de trazabilidad RF → CU → RN → diagramas → tablas → CP.

### C. Anexos
- **11.1 Normas de calidad:** TypeScript strict, ESLint+Prettier, testing planificado (Jest+RTL+Playwright; hoy smoke manual `npm run test:bot`), git flow con PR, RLS en todas las tablas, mitigaciones OWASP Top 10.
- **Anexo A:** 16 tablas (enumerarlas: users, accounts, categories, transactions, recurring_rules, budgets, investments, portfolio_performance_snapshots, investment_sales, bot_sessions, exchange_rates, budget_alerts, shared_groups, shared_group_members, shared_expenses, shared_expense_splits). Todas con UUID, created_at/updated_at con trigger, RLS.
- **Anexo B:** formato CSV import/export (columnas ES/EN, ida y vuelta sin pérdida; errores por fila sin abortar el lote).
- **11.3 Bibliografía:** Larman, Fowler (PoEAA), Evans (DDD), GoF, Cristiá (formato de documentación de patrones FCEIA-UNR), Porter, Kotler, Ries.

### D. Anexo Técnico
Dos patrones GoF documentados con el estándar Cristiá/FCEIA (`Pattern X based on Y because … where … comments`) + 8 estilos arquitectónicos (ver §7).

---

## 3. El codebase, carpeta por carpeta

```
zarix/
├── app/                  ← Next.js App Router: páginas + API routes
│   ├── page.tsx          ← landing pública (redirige a /dashboard si hay sesión)
│   ├── login/ register/ demo/ shared/[token]/   ← públicas
│   ├── (authenticated)/  ← grupo con layout que exige sesión
│   │   ├── dashboard/ expenses/ accounts/ accounts/[id]/ investments/
│   │   ├── analysis/ budgets/ categories/ recurring/ settings/ shared/
│   ├── api/              ← route handlers serverless (backend)
│   └── auth/callback/    ← intercambio de código OAuth/magic-link por sesión
├── middleware.ts         ← guard de sesión (redirige a /login)
├── components/           ← 83 componentes React por área + ui/ primitivos
├── lib/
│   ├── services/         ← CAPA DE DOMINIO (accounts, transactions, cotizaciones, …)
│   ├── supabase/         ← clientes (anon browser, anon SSR, service-role)
│   ├── auth/ cron/ telegram/ ai/ market-data/ hooks/ …
├── supabase/             ← schema.sql (1444 líneas) + 14 migraciones + seed
├── types/                ← database.ts (espejo TS del esquema) + contratos IA/import
├── scripts/              ← setup-telegram-webhook, set-password, compare-import
├── public/               ← manifest.json + sw.js (PWA)
├── vercel.json           ← schedules de los 7 cron jobs
└── docs/tif/             ← 13 diagramas PlantUML (.puml) + PNGs del TIF
```

### 3.1 Páginas (app/**/page.tsx)

**Públicas:**
| Ruta | Tipo | Qué hace |
|---|---|---|
| `/` | server | Landing marketing (Hero, Features, Pricing, Spline 3D). Si hay sesión → redirect `/dashboard` (`app/page.tsx:50-55`). |
| `/login` | client | Password, magic link, passkey (WebAuthn) y reenvío de confirmación. |
| `/register` | client | `signUp` con `emailRedirectTo=/auth/callback`; valida password ≥6. |
| `/demo` | client | Demo 100% en memoria (useState, sin Supabase). TC fijo 1000, datos semilla. |
| `/shared/[token]` | server | Vista de invitado de gastos compartidos. Valida token 32-hex, `force-dynamic`, `noindex`. |

**Autenticadas** (grupo `(authenticated)`, su layout llama `getCachedUser()` y muestra banner si `status='GRACE_PERIOD'`):
| Ruta | Tipo | Datos que carga |
|---|---|---|
| `/dashboard` | server | `Promise.all`: cuentas, últimas 5 tx, resumen portafolio, todas las cotizaciones. Widgets lazy con `next/dynamic` + Suspense. |
| `/expenses` | server | Transacciones con filtros por searchParams (cuenta, categoría, tipo, fechas, búsqueda, montos). |
| `/accounts` y `/accounts/[id]` | server | Listado + archivadas; detalle con 500 tx, FX rates, paneles de reparación/conciliación. |
| `/investments` | server | Resumen de portafolio, cuentas de inversión, vencimientos ≤30 días. |
| `/analysis` | server | 5 llamadas a `analyticsService` (breakdown por categoría ×2, tendencia mensual 6m, diaria 30d, top gastos, por cuenta). Charts con `ssr:false`. |
| `/budgets` | client | Fetch a `/api/budgets`, `/api/budgets/status`, `/api/categories`. Navegador de mes. |
| `/recurring` | client | ~955 líneas; reglas + suscripciones (catálogo Netflix/Spotify/…); costo mensual/anual. |
| `/categories` | server | Categorías propias + de sistema. |
| `/settings` | server | Perfil, integraciones (Gemini key, bot Telegram propio), passkeys, export/import, logout. |
| `/shared` | client | Grupos del dueño; crear/eliminar/copiar link público. |

### 3.2 API routes (app/api/**) — el "backend"

Regla general: cada handler valida sesión con `supabase.auth.getUser()` (las APIs **no** pasan por el middleware — el matcher las excluye; la auth es por handler). Grupos:

- **CRUD de dominio:** `accounts` (+adjust-balance, adjust-secondary-balance, correct-debt-sign, reconcile-balance, repair-currency-range), `transactions` (+`[id]`, `bulk` máx 500, `summary`; DELETE all exige `confirm:'DELETE_ALL'`), `categories` (PATCH con validación anti-ciclo de jerarquía, hasta 20 niveles), `budgets` (+status), `investments` (+sell, portfolio, performance, quote, ticker-search), `recurring`.
- **IA:** `ai/chat` (requiere suscripción, delega en `processInternalAiChatMessage`), `ai/anomalies` y `ai/projections` (**algorítmicos, sin Gemini**: anomalía = gasto del mes ≥2× promedio de 3 meses o categoría nueva >5000; proyección = lineal 3/6/12 meses sobre ahorro promedio).
- **Cotizaciones:** `cotizaciones`, `cotizaciones/transactions-fx`, `market-data` (top crypto + tickers US/AR, caché en tabla singleton `market_data_cache`, TTL 3 min).
- **Import/Export:** `export/transactions` (CSV/JSON, sanitiza inyección de fórmulas CSV + BOM), `export/backup` (JSON completo), `import/transactions` (~1490 líneas: CSV/XLSX/JSON, límite 12 MB, modos preview/import, zod, conversión de moneda, resolución de cuentas).
- **Webhooks:** `telegram/webhook` (header secreto, timing-safe, siempre 200 tras auth), `telegram/webhook/u/[secret]` (bot propio por usuario), `webhooks/mercado-pago` (firma HMAC-SHA256, fail-closed).
- **Cron:** 7 rutas bajo `api/cron/*` (ver §6.4).
- **Auth/Billing/User:** `auth/link-telegram` (RPC `link_telegram_to_user`), `auth/dev-login` (solo dev, 404 en prod), `billing/subscription-link` (crea preapproval MP, anti open-redirect en `back_url`), `user/integrations`, `user/notification-preferences`, `user/onboarding`, `user/subscription`.
- **Compartidos:** `shared-groups` (dueño, con sesión) vs `shared/[token]/**` (**público por capability token** 32-hex: unirse, agregar/editar/borrar gastos).

### 3.3 middleware.ts

Refresca la sesión de Supabase en cada request y redirige a `/login` si no hay usuario y la ruta no es pública. Públicas: `/`, `/demo*`, `/login*`, `/register*`, `/auth*`, `/shared/*` (con barra = invitados; `/shared` exacto es privado). El matcher **excluye** `api`, estáticos e imágenes → las APIs se autoprotegen.

### 3.4 lib/ — la capa de servicios (el "dominio")

Todos los servicios son **singletons** (`export const xxxService = new XxxService()`), scoped por `userId`, y usan `createServiceClientSync()` (service-role):

| Servicio | Métodos clave | Tablas |
|---|---|---|
| `accountsService` (829 líneas) | create, list (con balances multi-moneda), update, delete, `findByNameFuzzy` (resolución difusa para el bot, con confidence exact/high/medium/low), aggregateAccountTotals, getMulticurrencyBreakdown | accounts, transactions |
| `transactionsService` (736) | create (recalcula saldo), list, delete, createBalanceAdjustment, recomputeAccountBalanceFromLedger, getMonthSummary, repairCrossCurrencyInDateRange | transactions, accounts |
| `cotizacionesService` | getDolarQuotes (Strategy+fallback), getExchangeRate, getCryptoQuote, getStockQuote, getAllQuotes | exchange_rates |
| `investmentsService` (786) | create, list, update, sell (→investment_sales), getPortfolioSummary, recordDailySnapshot | investments, investment_sales, portfolio_performance_snapshots |
| `analyticsService` | getCategoryBreakdown, getMonthlyTrend, getDailyTrend, getTopExpenses, getAccountBreakdown | transactions (vía RPCs `analytics_*`) |
| `budgetsService` | create, list, getStatus, checkAndSendAlerts (→Telegram) | budgets, budget_alerts, users |
| `recurringService` | listActive, create | recurring_rules |
| `sharedExpensesService` (481) | createGroup, getGroupByToken, addExpenseByToken, `computeBalances`, `computeSettlements` (minimiza transferencias — algoritmo puro) | shared_* |
| `botSessionsService` | getStoredTurns, appendBotTurn (tope 24 mensajes ≈ 12 intercambios) | bot_sessions |
| `subscriptionsService` | getUserState, updateUserState, hasOrchestratorAccess, ensureOrchestratorAccess | users |
| `mercadoPagoService` | createPreapproval, getPreapproval, mapPreapprovalStatusToSubscription | (API MP) |

Otros módulos de `lib/`:
- `lib/supabase/`: `client.ts` (browser, anon, singleton por pestaña), `server.ts` (anon+cookies SSR que **respeta RLS**; `createServiceClient[Sync]()` service-role que **saltea RLS**).
- `lib/auth/session.ts`: `getCachedUser()` con `react.cache`.
- `lib/cron-auth.ts` + `lib/secure-compare.ts`: `verifyCronBearer` y `timingSafeStringEqual` (comparación en tiempo constante; fail-closed sin secret).
- `lib/cron/cron-job.ts`: clases `CronJob` / `IterativeCronJob` (Template Method — §7.2).
- `lib/telegram/bot.ts` (708 líneas): Telegraf; bot compartido + bots propios por usuario (`Map<token, Telegraf>`); comandos `/start /cuentas /cotizaciones /resumen /help /reset /resumenes`; handlers de foto (OCR), voz (transcripción) y texto (IA).
- `lib/ai/gemini.ts`: `GeminiClient` con modelos `gemini-2.5-flash` (full) y `flash-lite`; `chatWithTools()` = loop de function-calling hasta 8 rondas; API key: primero la del usuario (`users.gemini_api_key`), luego env.
- `lib/ai/bot-tools.ts`: **15 tools** declaradas (create_transaction, create_account, get_spending, get_portfolio, get_net_worth, list_recurring, create_recurring, …), ejecutadas por `executeBotTool` siempre scoped por userId.
- `lib/ai/prompts.ts`: system prompt con regla de alcance (solo finanzas), jerga argentina, sanitización de inputs.
- `lib/market-data/`, `yahoo-finance-quotes.ts`, `stooq-us-quote.ts`: precios de mercado (Yahoo, Stooq fallback, catálogo argentino data912).
- `lib/chart-theme.ts`: paleta única de charts (regla del DESIGN.md).

### 3.5 components/ y sistema de diseño

- Carpetas por área: `dashboard/`, `expenses/`, `accounts/`, `investments/`, `analysis/`, `budgets/`, `recurring/` (en página), `settings/`, `shared/`, `landing/`, `onboarding/`, `ui/` (primitivos: PageScaffold, ChartTooltip, Skeleton, Animated*).
- **DESIGN.md** (raíz): estética tipo Supabase — canvas casi negro, un solo color de marca (esmeralda `#22C55E`); tokens CSS en `globals.css` expuestos como utilidades Tailwind (`bg-background`, `bg-card`, `text-foreground`); **prohibido** hex crudos o clases tipo `bg-blue-500` en TSX; charts solo con `lib/chart-theme.ts`. `tailwind.config.ts` no define hex — todo delega en CSS custom properties (única fuente de verdad, flip claro/oscuro automático).
- **Data fetching:** React Server Components + capa de servicios. **No hay** Redux/SWR/react-query. Único provider global: `ThemeProvider` (next-themes). ⚠️ `zustand` figura en package.json pero **no se usa** (dependencia huérfana — si el profesor lo nota: "quedó de una iteración anterior, es candidata a remover").

### 3.6 package.json — dependencias que hay que saber justificar

`next` 14.2 (App Router+RSC), `@supabase/supabase-js` + `@supabase/ssr` (auth por cookies en SSR), `recharts` (charts), `telegraf` (bot), `@google/generative-ai` (Gemini), `yahoo-finance2` (precios), `exceljs` (XLSX import/export), `zod` (validación), `date-fns`, `framer-motion`, `lucide-react`, `next-themes`. Scripts: `dev/build/start/lint`, `db:push`/`db:reset` (Supabase CLI), `telegram:webhook`, `test:bot`, `set-password`, `compare:import`.

---

## 4. Base de datos a fondo (supabase/schema.sql, 1444 líneas + 14 migraciones)

### 4.1 Las 16 tablas

**Núcleo (las 8 del diagrama ER, Figura 9):**
1. **`users`** — PK = `id` UUID **referencia a `auth.users`** (misma identidad que Supabase Auth). Integraciones: `telegram_chat_id` (UNIQUE), `gemini_api_key`, `telegram_bot_token`, `telegram_webhook_secret`. Suscripción: `mp_preapproval_id`, `status` (enum `subscription_status`, default ACTIVE), `current_period_end`, `grace_period_end`. Preferencias: `default_currency` ('ARS'), `timezone` (Buenos Aires), flags de resúmenes, `onboarding_done`.
2. **`accounts`** — FK user_id. `type` (enum account_type), `currency`, **`balance` NUMERIC(20,8) mantenido por trigger**, `is_debt`, `include_in_total`, `include_in_liquid`. Tarjeta: `credit_limit`, `closing_day`/`due_day` (CHECK 1–31), `last_4_digits`. Bimoneda: `is_multicurrency`, `secondary_currency`.
3. **`categories`** — `user_id` NULL = de sistema (se siembran 17 gastos + 8 ingresos); `parent_id` self-FK (jerárquicas); `type` expense/income; `icon`.
4. **`transactions`** — corazón. FKs: `account_id` (RESTRICT), `destination_account_id` (transferencias), `category_id` (SET NULL). `type` (expense/income/transfer/adjustment), `amount`, `currency`, **`amount_in_account_currency`** (lo que consume el trigger), `exchange_rate`, `tags[]`, cuotas (`installment_*`). CHECKs: `positive_amount`, `valid_transfer` (transfer ⇒ destino no nulo).
5. **`recurring_rules`** — `frequency` (enum), `start_date`, `end_date`, **`last_executed_date`** (clave anti-duplicado del cron), `is_subscription`, `subscription_name`, `is_active`.
6. **`budgets`** — `month`, `amount`, `alert_at_percent` (default 80). UNIQUE(user, categoría, mes).
7. **`investments`** — `type` (11 valores: stock_arg, cedear, stock_us, etf, crypto, plazo_fijo, fci, bond, caucion, real_estate, other), `ticker`, `quantity` (CHECK ≥0 — relajado de >0 para permitir cierre total), `purchase_price`, `current_price`, `is_manual_price`, `maturity_date`.
8. **`exchange_rates`** — histórico global (sin user_id): `source` (blue/oficial/mep/ccl/coingecko…), `from/to_currency`, `rate`, `timestamp`. UNIQUE(source,from,to,timestamp).

**Soporte:** `portfolio_performance_snapshots` (foto diaria PnL/ROI en USD y blue; UNIQUE(user,fecha)), `investment_sales` (ventas realizadas con PnL, pobladas atómicamente), `bot_sessions` (contexto JSONB del bot), `budget_alerts` (dedupe de alertas), `market_data_cache` (singleton `id=1` JSONB, RLS sin políticas = solo service role).

**Gastos compartidos (Tricount):** `shared_groups` (owner + `share_token` UNIQUE 32-hex), `shared_group_members` (invitados sin cuenta: display_name/email/phone), `shared_expenses`, `shared_expense_splits` (UNIQUE(expense,member)).

### 4.2 El trigger estrella: `update_account_balance()` (schema.sql:437-574)

`AFTER INSERT OR UPDATE OR DELETE ON transactions FOR EACH ROW`. **El saldo nunca se escribe desde la app** — es una consecuencia derivada de las transacciones.

- INSERT: expense resta, income suma, transfer resta origen y suma `amount*exchange_rate` al destino, adjustment suma.
- DELETE: revierte exactamente el efecto original.
- UPDATE: calcula delta; si cambió la cuenta, revierte en la vieja y aplica en la nueva; re-liquida ambas patas de una transferencia.
- Caso especial bimoneda: un `adjustment` en la moneda secundaria de una tarjeta **no** toca el balance primario (los saldos secundarios se calculan con `get_multicurrency_balances`).

**Por qué en la BD y no en código (pregunta segura):** consistencia garantizada ante cualquier vía de escritura (web, bot, import masivo, cron), atomicidad con la transacción SQL, imposible de "olvidar" en un code path nuevo. Es RN-MOV-003 del documento.

### 4.3 Funciones SQL que hay que conocer

- `handle_new_user()` — SECURITY DEFINER; crea la fila en `public.users` al registrarse en `auth.users` (idempotente, ON CONFLICT DO NOTHING).
- `get_multicurrency_balances()` — CTE **recursivo**; "waterfall" bidireccional de pagos en tarjetas bimoneda (un pago en USD cancela primero deuda USD y el remanente derrama a ARS, y viceversa). La función con más iteraciones en migraciones (3 versiones).
- `analytics_*` (5 funciones SQL STABLE) — breakdown por categoría, tendencia mensual/diaria (`generate_series`), por cuenta, top gastos. Alimentan `/analysis`.
- `get_budget_status()` — presupuesto vs gastado vs % por categoría/mes.
- `link_telegram_to_user()` — SECURITY DEFINER; **vincula siempre al `auth.uid()`**, rechaza si el argumento difiere (no confía en el input).
- `sell_investment_position()` — venta **atómica** con lock de fila y decremento condicional (`quantity >= p_quantity`), inserta en `investment_sales` en la misma transacción → **evita oversell por doble click**. REVOKE a todos, GRANT solo `service_role`.
- `create_installment_transactions()` — genera N cuotas mensuales con `installment_group_id` común.
- Vistas: `v_user_balance_summary` (totales convertidos a USD/blue, `security_invoker=true` → respeta RLS), `v_current_month_expenses`.

### 4.4 RLS (Row Level Security)

Regla general: `auth.uid() = user_id` en todas las tablas de usuario (`FOR ALL`). Detalles defendibles:
- `users`: el UPDATE tiene `WITH CHECK` que **congela** `status`, `mp_preapproval_id`, `current_period_end`, `grace_period_end` → el usuario no puede auto-otorgarse premium.
- `categories`: SELECT permite `is_system = TRUE OR auth.uid() = user_id`.
- `exchange_rates`: lectura para cualquier autenticado (dato global).
- `budget_alerts` y `shared_*`: políticas vía `EXISTS` sobre la tabla padre.
- `market_data_cache`: RLS ON **sin políticas** = solo service role.
- Invitados de `shared_*`: sin política; su acceso pasa por la API validando `share_token` (capability token).

**Defensa en profundidad:** además del RLS, la capa de servicios filtra por `.eq('user_id', …)` (RN-CTA-001) porque los servicios usan service-role (que saltea RLS).

### 4.5 Índices y migraciones (si pregunta por performance/evolución)

- Índices compuestos por patrones de consulta: `transactions(user_id, transaction_date DESC)`, `(user_id, type, date)`, GIN en `tags`, **GIN full-text español** en description + **GIN trigramas** (búsqueda difusa).
- 14 migraciones cronológicas — las que vale la pena citar: `20260401180000` (fix: DELETE de adjustment no revertía saldo), `20260504*` (waterfall bimoneda, 3 iteraciones hasta bidireccional), `20260526130000` (investment_sales), `20260609120000` (shared expenses), `20260702120000` (venta atómica anti-oversell).

---

## 5. Los artefactos ICONIX y cómo defender cada uno

**ICONIX en una frase:** metodología liviana entre RUP y XP que va de requerimientos → casos de uso → modelo de dominio → **robustez** (el diferenciador: valida que el CU sea implementable con objetos boundary/control/entity) → secuencia → clases, con trazabilidad continua. En Zarix todos los diagramas se derivaron por **ingeniería inversa del código real** y se auditaron contra el fuente.

### 5.1 Requerimientos (§10.4.2)

- **RF01** registrar movimientos · **RF02** cotizaciones (oficial/blue/MEP/CCL + crypto) · **RF03** patrimonio consolidado ARS/USD · **RF04** múltiples cuentas · **RF05** inversiones con P&L · **RF06** bot Telegram · **RF07** import/export CSV/JSON · **RF08** OCR de tickets · **RF09** recurrentes con cron · **RF10** asistente IA (Gemini) · **RF11** anomalías y proyecciones.
- **RNF01** dashboard <2s · **RNF02** disponibilidad >99.5% · **RNF03** HTTPS + cifrado en reposo + RLS · **RNF04** mobile-first · **RNF05** navegadores modernos.
- Cada RF tiene fila en la matriz de trazabilidad (10.5.15) → CU → RN → figuras → tablas → CP.

### 5.2 Casos de uso (Figura 1 + especificaciones 10.5.3)

6 CU core + sub-CU include/extend + CU-AUTH-001 transversal:

| CU | Nombre | Includes | Extends | Código |
|---|---|---|---|---|
| CU-001 | Registrar Movimiento | I1 Actualizar Saldo, I2 Validar Datos | E1 por Telegram, E2 Ticket por imagen | `POST /api/transactions`, trigger, bot |
| CU-002 | Gestionar Cuentas | I1 Calcular Saldo por Moneda | E1 Tarjeta Bi-Moneda | `/api/accounts*`, `get_multicurrency_balances` |
| CU-003 | Visualizar Dashboard | I1 Obtener Cotizaciones, I2 Calcular Patrimonio | E1 Consultar IA, E2 Detectar Anomalías | `dashboard/page.tsx`, `cotizacionesService` |
| CU-004 | Gestionar Portafolio | I1 Precios de Mercado, I2 Calcular P&L | — | `investmentsService` |
| CU-005 | Importar/Exportar | I1 Validar Formato, I2 Mapear Categorías/Cuentas | — | `import/transactions` (1490 líneas) |
| CU-006 | Gestionar Recurrentes | I1 Ejecutar Transacción Recurrente | — | `/api/cron/recurring` |

**Include vs extend (pregunta clásica):** *include* = comportamiento **siempre** ejecutado como parte del CU base (validar datos, actualizar saldo — no hay registrar movimiento sin ellos). *Extend* = comportamiento **opcional/condicional** que agrega funcionalidad en un punto de extensión (registrar por Telegram usa otro canal y otro flujo; no siempre ocurre). CU-001-E1 se modela extend y no otro CU porque el resultado es el mismo (un movimiento registrado) con disparador y canal distintos.

Cada especificación tiene: ID, nombre, descripción, actor principal, precondiciones, postcondiciones, flujo principal numerado, flujos alternativos (notación 3a/5a/9a = alternativa al paso N), includes/extends. Formato = el del material de cátedra.

**Reglas de negocio (RN) con evidencia en código:**
- RN-MOV-001 monto>0 → validación en POST /api/transactions + CHECK en BD.
- RN-MOV-002 conversión de moneda con TC vigente → `transactionsService.create` + `getExchangeRate`.
- RN-MOV-003 saldo por trigger, nunca por código → `update_account_balance()`.
- RN-CTA-001 todo filtra por user_id → servicios + RLS.
- RN-REC-001 una regla no se ejecuta 2 veces el mismo día → el cron **reclama la fecha antes** de crear el movimiento.
- RN-REC-002 regla sobre cuenta desactivada se saltea → `shouldProcess()`.
- RN-COT-001 fallback ordenado CriptoYa→DolarApi→BD, caché 300s → patrón Strategy.
- RN-SEG-001 crons con bearer secreto; webhooks con firma/secreto.

### 5.3 Modelo de Dominio (Figura 2, `fig02_modelo_dominio.puml`)

8 entidades **conceptuales en español** (Usuario, Cuenta, Movimiento, Categoría, Inversión, ReglaRecurrente, Presupuesto, Cotización) con atributos en lenguaje natural (sin campos técnicos: ni id, ni user_id, ni timestamps) y relaciones con cardinalidad (Usuario 1..* Cuenta; Cuenta 1..* Movimiento; Movimiento *..1 Categoría; ReglaRecurrente genera Movimientos…). **Diferencia con el diagrama de clases:** el dominio es conceptual (qué existe en el negocio); las clases (Figura 8) son técnicas (servicios TS + entidades tipadas). Diferencia con el ER (Figura 9): el ER usa los nombres reales de tablas, PKs, FKs.

### 5.4 Diagramas de Robustez (Figuras 3 y 4)

Solo 3 estereotipos: **boundary** (pantallas/forms), **control** (lógica), **entity** (datos). Reglas de conexión ICONIX: actor↔boundary, boundary↔control, control↔entity, control↔control; **nunca** actor↔entity ni boundary↔entity directo.

- **Figura 3 (CU-001):** Usuario → [Pantalla Nuevo Movimiento] → [Controlador de Movimientos] → [Validador de Datos] → {Movimiento, Cuenta, Categoría}; [Calculador de Saldo] → {Cuenta}; [Invalidador de Caché] → [Pantalla Dashboard]. Alternativo: Bot Telegram → [Parser de Mensaje] → controlador.
- **Figura 4 (CU-003):** [Controlador Dashboard] → [Gestor de Cotizaciones] → APIs externas / {Cotización caché}; [Calculador de Patrimonio] → {Cuenta, Posición, Cotización}; widgets como boundaries.
- Mapeo a código: boundary = componentes React (`TransactionForm`), control = route handler + servicio (`transactionsService`), entity = tablas.

### 5.5 Diagrama de Secuencia (Figura 5, CU-001)

Participantes: actor Usuario + boundary `TransactionForm` + control route handler `/api/transactions` + `transactionsService` + `cotizacionesService` + `database PostgreSQL` (con SQL explícito). Los 11 pasos: form → POST → `auth.getUser()` → validación (400 si inválido) → `create(input)` → `SELECT accounts WHERE id=? AND user_id=?` → `getExchangeRate` solo si moneda≠cuenta (caché 300s) → `INSERT INTO transactions` → **TRIGGER** `update_account_balance()` → 201 → confirmación. Convención cátedra: activate/deactivate, alt/opt para condicionales.

### 5.6 Arquitectura (Figuras 6, 7, 10, 13)

- **Figura 6 Paquetes:** 6 capas con dependencias dirigidas hacia abajo: Presentación (React) → Routing/Middleware → Servicios (dominio) → Integración/Infra (supabase-js, Telegraf, Gemini) → Persistencia (Supabase) · Servicios externos al costado.
- **Figura 7 Componentes:** PWA Frontend ↔ Route Handlers ↔ Capa de Servicios ↔ supabase-js; Bot Telegram, Motor IA, Cron Jobs (7), Auth JWT, APIs externas, Mercado Pago — con interfaces provistas/requeridas.
- **Figura 10 Despliegue:** nodos = Browser (PWA+SW) → Vercel Edge (Next.js serverless + webhooks + crons) → Supabase (PG15+RLS+GoTrue) + APIs externas + MP + Telegram. Deploy automático desde GitHub.
- **Figura 13 Estilos:** los 8 estilos mapeados sobre la arquitectura (ver §7.3).

### 5.7 Clases y ER (Figuras 8 y 9)

- **Figura 8 (clases técnico):** servicios con métodos reales (`TransactionsService.create/list/delete`, `CotizacionesService` con su arreglo `dolarProviders: DolarRateProvider[]`, `InvestmentsService.getPortfolioSummary/sell`) + entidades tipadas (`Account`, `Transaction`, `Category`, `Investment`, `RecurringRule`, `Budget`) espejo de `types/database.ts`.
- **Figura 9 (ER):** las 8 tablas núcleo con PKs/FKs reales y nota de RLS. El esquema completo tiene 16 (el diagrama muestra el núcleo; el resto se enumera en Anexo A).

### 5.8 Prototipos (10.5.14) y Casos de Prueba (10.5.13)

- 3 prototipos en formato tabla (elemento UI / descripción / interacción o campo / tipo UI / validación): Dashboard (grilla de widgets, barra de patrimonio, FAB), Nuevo Movimiento (bottom sheet, toggle Gasto/Ingreso/Transferencia con color, monto grande, grilla de categorías), Portafolio (header con total y P&L del día, lista ordenable). Mismo formato texto que la cátedra (`prototipo_formulario_presupuesto.md`).
- 11 CP: felices + errores (monto 0, CSV sin columna monto, API caída → última cotización con indicador, eliminar cuenta con movimientos → error y sugerencia de desactivar).

### 5.9 Matriz de Trazabilidad (10.5.15)

Formato cátedra: RF → CU → RN → Robustez → Secuencia → Clases → tablas → CP. Garantiza que cada artefacto sea verificable contra código. Ejemplo de fila: RF01 → CU-001 → RN-MOV-001..003 → Fig 3 → Fig 5 → Fig 8 → transactions/accounts/categories → CP-001-01..04.

---

## 6. Flujos end-to-end (memorizar estos 6)

### 6.1 Registrar movimiento (CU-001 — el flujo del diagrama de secuencia)
1. `TransactionForm` (client) → `POST /api/transactions`.
2. Handler: `auth.getUser()` → 401 si no hay sesión; valida tipo/moneda/monto → 400.
3. `transactionsService.create()`: busca la cuenta (`WHERE id=? AND user_id=?`); si moneda del movimiento ≠ moneda de la cuenta → `cotizacionesService.getExchangeRate()` (caché 300s o Strategy) y persiste `amount_in_account_currency` + `exchange_rate`.
4. `INSERT INTO transactions` → dispara **trigger** `update_account_balance()` que actualiza `accounts.balance`.
5. 201 + revalidación del dashboard.

### 6.2 Dashboard (CU-003)
Server Component: `getCachedUser()` → `Promise.all(accounts.list, transactions.list(5), investments.getPortfolioSummary, cotizaciones.getAllQuotes)` → agrega totales → renderiza widgets lazy. Si las APIs de cotización fallan, el Strategy cae a `DbCacheProvider` (último valor persistido) → el dashboard nunca se queda sin cotización (CP-003-02).

### 6.3 Bot Telegram + IA (CU-001-E1, CU-001-E2, RF10)
1. Telegram → `POST /api/telegram/webhook` con header `x-telegram-bot-api-secret-token`; se valida timing-safe; tras autenticar **siempre responde 200** (evita re-entregas).
2. `getUserFromTelegramId` (tabla users por chat_id). Gate de suscripción (`hasOrchestratorAccess`).
3. Texto → `processInternalAiChatMessage` → Gemini `chatWithTools` (hasta 8 rondas de function-calling) → `executeBotTool` (15 tools, scoped por userId) → p.ej. `create_transaction` → `executeBotTransaction` que resuelve la cuenta con `findByNameFuzzy` (confianza exact/high/medium acepta; low → sugiere; sin match → aborta).
4. Foto → Gemini `chatWithImage` extrae JSON (monto/comercio/fecha/categoría) → guarda propuesta en `bot_sessions` → pide confirmación → el "sí" dispara la tool. Voz → transcripción → mismo flujo de texto.
5. Memoria conversacional en `bot_sessions.context` (tope 24 mensajes).

### 6.4 Cron de recurrentes (CU-006-I1) y los otros 6 crons
`vercel.json` define 7 schedules; Vercel invoca GET con `Authorization: Bearer CRON_SECRET`; `CronJob.run()` valida timing-safe y crea service client.
- `recurring` (diario 08:00 UTC): busca reglas activas que tocan hoy; **reclama `last_executed_date` ANTES de crear** el movimiento (anti-duplicado, RN-REC-001); salta cuentas inactivas (RN-REC-002); notifica por Telegram.
- `update-prices` (10:00): refresca `current_price` de inversiones no manuales.
- `weekly-summary` (lunes 09:00) y `monthly-summary` (día 1): resumen por Telegram redactado con Gemini.
- `maturity-alerts` (09:00): inversiones que vencen en ≤3 días.
- `budget-alerts` (10:30): umbral `alert_at_percent` y 100%, dedupe vía `budget_alerts`.
- `subscription-grace` (07:15): un solo UPDATE atómico GRACE_PERIOD→PAST_DUE vencido (por eso extiende `CronJob` directo, no el iterativo).

### 6.5 Suscripción Mercado Pago
1. Usuario → `POST /api/billing/subscription-link` → `mercadoPagoService.createPreapproval` (external_reference = userId) → devuelve `init_point` (checkout MP).
2. MP notifica → `POST /api/webhooks/mercado-pago`: **verifica firma HMAC-SHA256** del header `x-signature` (manifest `id:…;request-id:…;ts:…;`), fail-closed si falta el secret.
3. Resuelve usuario por `mp_preapproval_id` (fallback external_reference) → `mapPreapprovalStatusToSubscription`: authorized→ACTIVE; rejected→GRACE_PERIOD 7 días (si venía ACTIVE); cancelled→CANCELED; pending→PAST_DUE.
4. Si falla, responde 500 → MP reintenta (el mapeo es idempotente).
5. El cron `subscription-grace` degrada GRACE→PAST_DUE al vencer. El layout autenticado muestra banner en gracia. `users` RLS impide que el usuario edite su propio `status`.

### 6.6 Venta de inversión (anti-oversell) y gastos compartidos
- Venta: `POST /api/investments/[id]/sell` → `sell_investment_position()` en SQL: lock de fila + decremento condicional + INSERT en `investment_sales` en la misma transacción → dos clicks concurrentes no pueden vender más de lo que hay.
- Compartidos: dueño crea grupo (`share_token` 32-hex) → invitados **sin cuenta** operan vía `/shared/[token]` (capability token, sin RLS: la API con service role valida el token). `computeSettlements` minimiza la cantidad de transferencias para saldar.

---

## 7. Patrones GoF y estilos arquitectónicos (Anexo D)

### 7.1 Strategy — cotizaciones (`lib/services/cotizaciones.ts`)
- **Problema:** la cotización depende de APIs externas frágiles (pueden caer o devolver blue en 0).
- **Solución:** interfaz `DolarRateProvider` (`name` + `fetch(): Promise<Record<string, DolarQuote>>`); estrategias `CriptoYaProvider` (primaria; si blue=0 lanza para caer a la siguiente), `DolarApiProvider` (fallback HTTP, timeout 8s), `DbCacheProvider` (último valor en `exchange_rates`). Contexto `CotizacionesService.getDolarQuotes()` recorre `this.dolarProviders` en orden; el primero que responde gana; se cachea (TTL 300s, en memoria de módulo) y se persiste en BD si vino de fuente viva.
- **Open/Closed:** fuente nueva = implementar la interfaz + sumarla al arreglo. El documento admite que también exhibe rasgos de **Chain of Responsibility** (semántica de fallback ordenado) — si el profesor lo menciona, es un punto a favor reconocerlo.
- Documentado con formato Cristiá/FCEIA: `Pattern ObtencionDeCotizaciones based on Strategy because…`.

### 7.2 Template Method — cron jobs (`lib/cron/cron-job.ts`)
- **Problema:** 7 crons repetían ~80 líneas de andamiaje (validar bearer, service client, iterar tolerando errores por ítem, resumen JSON).
- **Solución:** `abstract class CronJob` con **template method `run(request)`** (no redefinible): valida bearer → service client → `this.execute()` → respuesta JSON uniforme. `IterativeCronJob<TItem>` agrega el sub-esqueleto fetch → filtrar → procesar de a uno con try/catch por ítem → contadores. Primitivas: `fetchItems`, `processItem`. Hooks opcionales: `shouldProcess`, `beforeAll`, `afterAll`, `emptyMessage`.
- 7 subclases: RecurringRulesJob, UpdatePricesJob, WeeklySummaryJob, MonthlySummaryJob, MaturityAlertsJob, BudgetAlertsJob (iterativos) y SubscriptionGraceJob (extiende CronJob directo: un UPDATE atómico). Cada route handler quedó en `return new XxxJob().run(request)`.
- **Principio de Hollywood:** las subclases no pueden saltearse la autenticación porque está en el esqueleto. Job nuevo = una subclase (Open/Closed).

### 7.3 Los 8 estilos arquitectónicos (Figura 13)
1. **Cliente-Servidor** — browser PWA → Vercel; el servidor nunca inicia.
2. **N-Tier** — Cliente · API · Servicios · Datos.
3. **Layered** — rutas → servicios → clientes Supabase; cada capa depende solo de la inferior.
4. **Serverless/FaaS** — funciones + 7 crons bajo demanda en Vercel.
5. **BaaS** — Supabase provee PG, Auth, Storage gestionados.
6. **Repository** — los `*Service` encapsulan el acceso a datos; nadie más hace SQL.
7. **Event-Driven** — triggers de BD, crons, webhooks (Telegram, MP).
8. **Strategy/Adapter** — proveedores de cotización normalizados tras una interfaz.

Trade-off declarado en el doc: la dispersión entre capas y servicios externos exige disciplina en el filtrado por user_id (la seguridad no depende solo del RLS).

Otros patrones presentes si pregunta "¿algún otro?": **Singleton** (todos los servicios y el browser client), **Facade** (cada service es fachada de su agregado), **function-calling/Command** (las 15 bot tools despachadas por nombre).

---

## 8. Seguridad (resumen defendible)

**Tres esquemas de autenticación coexistentes:**
1. **Sesión (cookies JWT Supabase)** — páginas y APIs de usuario: `auth.getUser()` por handler; middleware redirige a /login.
2. **Bearer secreto** — crons: `CRON_SECRET` comparado timing-safe (`timingSafeEqual`); fail-closed (sin secret ⇒ 401).
3. **Secretos/firma de webhook** — Telegram: header `x-telegram-bot-api-secret-token` timing-safe; bot propio: secret en el path revalidado contra `users.telegram_webhook_secret`; **Mercado Pago: firma HMAC-SHA256** de `x-signature` con manifest `id;request-id;ts`, fail-closed.

**Capas de aislamiento de datos:** RLS (`auth.uid() = user_id`) + filtrado explícito por `user_id` en servicios (que usan service-role y saltean RLS) = defensa en profundidad.

**Mitigaciones puntuales que impresionan:**
- RLS de `users` congela campos de suscripción (no podés auto-darte premium).
- `link_telegram_to_user` SECURITY DEFINER que solo vincula al `auth.uid()`.
- `sell_investment_position` atómica, solo service_role (anti-oversell).
- Export CSV sanitiza inyección de fórmulas (`=`, `+`, `-`, `@` al inicio de celda).
- Anti open-redirect en `billing back_url` y `auth/callback`.
- Anti-ciclo en jerarquía de categorías (recorre ancestros hasta 20 niveles).
- Webhooks idempotentes: Telegram responde 200 siempre tras auth; MP 500 → retry con mapeo idempotente; cron recurrentes "reclama el día" antes de crear.
- `DELETE /api/transactions` (borrar todo) exige `confirm: 'DELETE_ALL'`.
- dev-login: 404 en producción y detrás de `ALLOW_DEV_LOGIN`.
- Comparaciones de secretos siempre en tiempo constante (`lib/secure-compare.ts`).
- API keys de usuario (Gemini) por fila; secretos solo por variables de entorno.

---

## 9. Si el profesor pide un cambio de diseño — recetario

Metodología para responder EN VIVO: (1) clasificarlo (¿nuevo CU? ¿cambio de dominio? ¿cambio de arquitectura?), (2) decir qué artefactos ICONIX se actualizan, (3) decir qué archivos del código se tocan. Casos probables:

**"Agregá un caso de uso nuevo (ej. Metas de Ahorro)"**
→ Artefactos: nueva especificación CU-007 (tabla formato cátedra) + agregarlo a Figura 1 + entidad `Meta` en dominio (Fig 2) + robustez y secuencia si es core + tabla nueva en ER + fila en matriz de trazabilidad + RN si tiene reglas.
→ Código: migración SQL (tabla `savings_goals` con RLS `auth.uid()=user_id` + índice `(user_id, …)`), tipos en `types/database.ts`, servicio `lib/services/goals.ts` (singleton, scoped por userId), rutas `app/api/goals/route.ts` (+`[id]`), página `app/(authenticated)/goals/page.tsx`, componentes en `components/goals/` usando tokens del DESIGN.md, link en `Navigation.tsx`.

**"Agregá una fuente de cotización nueva"**
→ Es el caso feliz del Strategy: clase `NuevaFuenteProvider implements DolarRateProvider` con su `fetch()`, sumarla al arreglo `dolarProviders` en el constructor. **Cero cambios** en consumidores. Actualizar Figura 11 y RN-COT-001.

**"Agregá un cron job nuevo (ej. recordatorio de vencimiento de tarjeta)"**
→ Caso feliz del Template Method: subclase de `IterativeCronJob` (fetchItems = tarjetas con `due_day` próximo; processItem = `sendTelegramDm`), route `app/api/cron/card-due/route.ts` con `return new CardDueJob().run(request)`, entrada en `vercel.json`. Autenticación y tolerancia a errores vienen gratis del esqueleto. Actualizar Figura 12 (nueva ConcreteClass) y la lista de crons en Fig 7/10.

**"Cambiá X por notificaciones por email en vez de Telegram"**
→ Hoy el envío está acoplado a `sendTelegramDm` en los crons. Propuesta: extraer interfaz `NotificationChannel` (Strategy de nuevo) con implementaciones TelegramChannel/EmailChannel (Resend/SES), elegir por preferencia del usuario (`users`). Artefactos: Fig 7 (componente nuevo), dominio no cambia.

**"¿Y si esto escala a 100k usuarios?"**
→ Cuellos: crons iterativos por fila (paginar/batch o mover a colas — p.ej. Supabase Queues/QStash), caché de cotizaciones en memoria por instancia serverless (mover a Redis/Upstash o a la tabla, que ya existe como fallback), límites del tier free (upgrade Supabase/Vercel — el doc ya lo prevé en 8.2). El diseño serverless escala horizontal solo.

**"Agregá multiusuario/familias"**
→ Cambio de dominio real: entidad `Hogar` con miembros; decisión clave: user_id → household_id en tablas núcleo + RLS por membresía (`EXISTS` como ya hacen las `shared_*` — el patrón ya existe en el código). Está declarado **fuera del alcance** en 10.4.3; responder con esa cita y el camino técnico.

**"¿Por qué no microservicios?"**
→ Equipo unipersonal, dominio cohesivo, costo: un monolito modular serverless (capas + repository) da los mismos límites lógicos sin costo operativo. Los "servicios" ya están separados en módulos con interfaz clara; extraerlos sería mecánico si hiciera falta.

**"Agregale tests"**
→ El doc ya lo declara planificado (11.1): Jest + React Testing Library para componentes críticos, Playwright e2e para CU-001/CU-003. Primer objetivo racional: tests del trigger de saldos (SQL) y de `computeSettlements`/`getExchangeRate` (funciones puras, fáciles de testear).

**Reglas generales al aceptar cualquier cambio:** nueva tabla ⇒ RLS + índice por user_id + tipos TS + migración versionada; nueva ruta ⇒ `getUser()` o secreto según el actor; nuevo componente ⇒ tokens del DESIGN.md; y siempre actualizar matriz de trazabilidad.

---

## 10. Preguntas trampa probables y respuestas cortas

- **"¿Por qué el saldo se calcula por trigger y no en el service?"** — Múltiples vías de escritura (web, bot, import, cron); el trigger garantiza consistencia y atomicidad en todas. El service no podría garantizar que un INSERT directo mantenga el saldo.
- **"¿RLS y encima filtrás por user_id en el código? ¿No es redundante?"** — Es defensa en profundidad deliberada: los servicios usan service-role (saltea RLS) por necesidad de webhooks/crons, así que el filtro explícito es obligatorio; el RLS protege el camino anon/cookie y cualquier acceso directo.
- **"¿Dónde está el 'backend'? No veo Express."** — Los route handlers de `app/api/**` SON el backend: funciones serverless HTTP. La capa de servicios (`lib/services`) es el dominio. Arquitectura N-Tier sin servidor propio.
- **"El diagrama de clases tiene servicios sin atributos, ¿por qué?"** — Son stateless por diseño serverless (cada invocación es efímera); el estado vive en la BD. La excepción es `CotizacionesService.dolarProviders` (configuración del Strategy) y el caché de módulo.
- **"¿Extend o include para Telegram y por qué?"** — Extend: canal opcional/condicional con disparador propio; el CU base es completo sin él. Include serían Validar Datos y Actualizar Saldo (siempre ocurren).
- **"¿Qué pasa si dos requests venden la misma inversión a la vez?"** — `sell_investment_position()` con lock de fila y decremento condicional en una transacción SQL: uno gana, el otro recibe error. Antes existía riesgo de oversell; se corrigió en la migración 20260702.
- **"¿Y si CriptoYa Y DolarApi caen?"** — `DbCacheProvider` devuelve el último valor persistido en `exchange_rates` con su timestamp; la UI lo muestra con indicador de antigüedad (CP-003-02). Si nunca hubo valor, el servicio lanza (no inventa un 0 — decisión explícita para no persistir montos en cero).
- **"¿Cómo evitás que el cron duplique un gasto recurrente?"** — Reclama `last_executed_date` con un UPDATE **antes** de crear el movimiento (RN-REC-001); si el cron corre dos veces, la segunda no encuentra la regla pendiente.
- **"Veo zustand en package.json pero no lo usás."** — Correcto: quedó de una iteración anterior; el estado de servidor vive en Server Components y el local en useState. Candidata a remover.
- **"types/database.ts no tiene onboarding_done y la tabla sí."** — Discrepancia menor conocida: el campo se consulta con query directa en su ruta; el tipo global no lo modela aún. Se corrige agregándolo a la interfaz User.
- **"¿No hay tests?"** — Declarado en 11.1: planificados Jest+RTL+Playwright; hoy smoke manual (`npm run test:bot`) + revisión de código. Prioridad de testeo: trigger de saldos y funciones puras.
- **"¿Anomalías y proyecciones usan IA?"** — No: son **heurísticas algorítmicas** (ratio ≥2× vs promedio 3 meses; proyección lineal). Gemini se usa en chat/tools, OCR, transcripción de voz y redacción de resúmenes. RF11 se cumple con estadística simple — decisión defendible por costo y determinismo.
- **"¿Los invitados de gastos compartidos no violan el RLS?"** — No tienen sesión ni política: acceden solo por la API que valida el `share_token` (capability token de 32 hex) usando service role. Patrón capability en vez de identidad.
- **"¿Por qué Gemini y no OpenAI/Claude?"** — Costo (tier gratuito generoso), multimodal nativo (OCR + audio en el mismo cliente), function-calling maduro, y opción de que cada usuario traiga su propia API key (`users.gemini_api_key`) para escalar costo a cero.
- **"¿Qué es exactamente amount_in_account_currency?"** — El monto ya convertido a la moneda de la cuenta al TC del momento (RN-MOV-002). Es lo único que consume el trigger; `amount`+`currency` guardan el valor original para auditoría/export.
- **"¿Qué pasa si el usuario paga y MP tarda en avisar?"** — El estado se actualiza al llegar el webhook (idempotente, con retries de MP). Si el pago se rechaza estando activo → GRACE_PERIOD 7 días con banner; el cron subscription-grace degrada a PAST_DUE al vencer.

---

## Apéndice: números para tener a mano

| Dato | Valor |
|---|---|
| Tablas | 16 (8 núcleo en el ER) |
| Migraciones | 14 versionadas |
| Cron jobs | 7 (Vercel Cron) |
| Casos de uso core | 6 (+9 include/extend + CU-AUTH-001) |
| Requerimientos | RF01–RF11, RNF01–RNF05 |
| Reglas de negocio | 8 (RN-MOV/CTA/REC/COT/SEG) |
| Casos de prueba | 11 (CP-xxx) |
| Figuras del TIF | 13 |
| Bot tools (function-calling) | 15 |
| Comandos del bot | /start /cuentas /cotizaciones /resumen /help /reset /resumenes |
| TTL caché cotizaciones | 300 s |
| Memoria del bot | 24 mensajes (~12 intercambios) |
| Gracia de suscripción | 7 días |
| Monedas soportadas | ARS, USD, USDT, BTC, ETH |
| Modelos IA | gemini-2.5-flash (full) / flash-lite |
| Punto de equilibrio | 7–10 suscriptores premium |
| Precio premium | USD 5–10/mes (en ARS al TC oficial) |
| Patrones GoF documentados | Strategy (cotizaciones) + Template Method (crons) |
| Estilos arquitectónicos | 8 |

