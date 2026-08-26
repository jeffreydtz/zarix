# EV-COD — Evidence pack (código) — Zarix

**Proyecto:** Zarix — finanzas personales (PWA)  
**Autor TIF:** Jeffrey Dietz (UAI)  
**Repositorio investigado:** monorepo raíz `/workspace` (app Next.js privada, `package.json` → `"private": true`)  
**Fecha del relevamiento:** 2026-08-26  
**Metodología:** inspección directa del código fuente; sin asumir el documento TIF como verdad; sin referencias a ERP/Odoo.

---

## 1. Árbol del repositorio y stack real

### 1.1 Árbol resumido (directorios principales)

```
/workspace/
├── app/                          # Next.js 14 App Router
│   ├── (authenticated)/          # Páginas con sesión (dashboard, cuentas, movimientos, …)
│   ├── api/                      # Route Handlers REST (~55 rutas)
│   ├── auth/callback/            # OAuth / magic-link Supabase
│   ├── login/, register/, demo/  # Públicas
│   └── shared/[token]/           # Gastos compartidos (invitados sin cuenta)
├── components/                   # UI React (~80 componentes)
├── lib/
│   ├── ai/                       # Gemini client, prompts, bot tools
│   ├── auth/                     # Sesión, mensajes de error
│   ├── cron/                     # Template Method para crons
│   ├── hooks/                    # PWA: service worker, offline queue
│   ├── services/                 # Capa de dominio (19 servicios)
│   ├── telegram/                 # Telegraf bot + webhook auth
│   └── supabase/                 # Clientes server/browser
├── supabase/
│   ├── schema.sql                # Baseline consolidado
│   ├── migrations/               # 18 migraciones SQL versionadas
│   └── seed.sql
├── __tests__/                    # 14 archivos Vitest (132 tests)
├── docs/                         # ADRs, guía TIF, diagramas PlantUML
├── public/                       # manifest.json, sw.js (PWA)
├── scripts/                      # webhook Telegram, compare import, set-password
├── .github/workflows/ci.yml
├── middleware.ts                 # Guard de sesión Supabase
├── vercel.json                   # 8 crons + región gru1
└── package.json
```

**~368 archivos** fuera de `node_modules`/`.git`/`.next` (conteo en el entorno de relevamiento).

### 1.2 Stack declarado vs. stack verificado

| Capa | Claim TIF / README | Evidencia en repo | Verificado |
|------|-------------------|-------------------|------------|
| Frontend | Next.js 14, React 18, Tailwind, Recharts, PWA | `package.json` (`next@14.2.35`, `react@18.3.1`, `tailwindcss`, `recharts`); `public/manifest.json`; `public/sw.js`; `lib/hooks/useServiceWorker.ts` | **Sí** |
| Backend | Supabase Postgres + Auth + RLS | `supabase/schema.sql`, `supabase/migrations/*`, `@supabase/supabase-js`, `@supabase/ssr` | **Sí** |
| Deploy | Vercel serverless + crons | `vercel.json` (8 paths cron, `"regions": ["gru1"]`) | **Sí** |
| Bot | Telegraf + webhook | `telegraf@4.16.3`, `lib/telegram/bot.ts`, `app/api/telegram/webhook/route.ts`, `app/api/telegram/webhook/u/[secret]/route.ts` | **Sí** |
| IA | Gemini (chat, OCR, voz) | `@google/generative-ai`, `lib/ai/gemini.ts`, `lib/ai/bot-tools.ts` | **Sí** |
| Cotizaciones | CriptoYa, DolarApi, CoinGecko, Yahoo | `lib/services/cotizaciones.ts` | **Sí** |
| OCR | Doc TIF menciona OpenAI Vision | **No hay dependencia ni código OpenAI**; OCR vía `GeminiClient.chatWithImage()` en `lib/telegram/bot.ts` (handler `message('photo')`) | **Mismatch** (ver §6) |
| Estado global | README cita Zustand | **No hay `zustand` en `package.json` ni imports** | **Mismatch** (ver §6) |
| Tests | Vitest (ADR 0005) | `vitest@2.1.9`, `vitest.config.ts`, `npm test` | **Sí** |
| E2E | Planificado Playwright (guía TIF) | **No hay `@playwright/test` en dependencias directas** (solo aparece como peer opcional transitivo en lockfile) | **No implementado** |

### 1.3 `package.json` — dependencias clave

```json
"dependencies": {
  "@google/generative-ai": "^0.19.0",
  "@supabase/ssr": "^0.10.3",
  "@supabase/supabase-js": "^2.106.2",
  "next": "14.2.35",
  "telegraf": "^4.16.3",
  "yahoo-finance2": "^3.14.0",
  "exceljs": "^4.4.0",
  "zod": "^3.23.8",
  "recharts": "^2.12.7"
}
"devDependencies": {
  "vitest": "^2.1.9",
  "typescript": "^5.5.2"
}
```

Scripts relevantes: `dev`, `build`, `test` (`vitest run`), `db:push`, `db:reset`, `telegram:webhook`, `test:bot`.

### 1.4 Supabase

| Artefacto | Ruta |
|-----------|------|
| Schema baseline | `supabase/schema.sql` |
| Migraciones | `supabase/migrations/*.sql` (18 archivos, 20260401–20260819) |
| Seed | `supabase/seed.sql` |
| Tipos TS | `types/database.ts` |
| Cliente server | `lib/supabase/server.ts` (`createClient`, `createServiceClientSync`) |

**Nota:** no existe `supabase/config.toml` en el repo; el CLI se invoca vía scripts npm pero la configuración local del CLI no está versionada.

### 1.5 Tablas PostgreSQL (evidencia)

Definidas en `supabase/schema.sql` (+ tablas añadidas solo en migraciones):

| Tabla | Archivo principal |
|-------|-------------------|
| `users` | `supabase/schema.sql:30` |
| `accounts` | `supabase/schema.sql:79` |
| `categories` | `supabase/schema.sql:117` |
| `transactions` | `supabase/schema.sql:141` |
| `recurring_rules` | `supabase/schema.sql:199` |
| `budgets`, `budget_alerts` | `supabase/schema.sql:226`, `:395` |
| `investments` | `supabase/schema.sql:262` |
| `investment_sales` | migración `20260526130000_investment_sales.sql` |
| `portfolio_performance_snapshots` | `supabase/schema.sql:300` |
| `net_worth_snapshots` | migración `20260814120000_net_worth_snapshots.sql` |
| `bot_sessions` | `supabase/schema.sql:359` |
| `exchange_rates` | `supabase/schema.sql:374` |
| `market_data_cache` | migración `20260401160000_market_data_cache.sql` |
| `shared_groups`, `shared_group_members`, `shared_expenses`, `shared_expense_splits` | migración `20260609120000_shared_expenses.sql` |

Trigger de saldo: `trigger_update_account_balance` → función `update_account_balance()` en `supabase/schema.sql:584–586`.

---

## 2. Mapeo CU-001…CU-006 (+ RF10/RF11 → CU-007/008)

Convención: **EVIDENCIA** = rutas/archivos/tablas encontrados; **NO EVIDENCE** = no hay implementación localizable.

### CU-001 — Registrar Movimiento

| Aspecto | Evidencia |
|---------|-----------|
| **UI web** | `app/(authenticated)/expenses/page.tsx` — listado y filtros; `components/expenses/CreateTransactionButton.tsx`, `EditTransactionModal.tsx`, `InlineQuickCreate.tsx` |
| **API REST** | `app/api/transactions/route.ts` (GET/POST), `app/api/transactions/[id]/route.ts`, `app/api/transactions/bulk/route.ts` |
| **Servicio** | `lib/services/transactions.ts` — clase `TransactionsService`, export `transactionsService` |
| **Tabla** | `transactions` (`supabase/schema.sql:141`) |
| **Actualización de saldo** | Trigger SQL `update_account_balance()` (`supabase/schema.sql:584–586`) |
| **Extensión E1 — Telegram** | `lib/telegram/bot.ts` — comandos y texto; `lib/telegram/executeBotTransaction.ts`; webhook `app/api/telegram/webhook/route.ts` |
| **Extensión E2 — OCR ticket (foto)** | `lib/telegram/bot.ts` — handler `bot.on(message('photo'), …)` → `gPhoto.chatWithImage(...)` (`lib/ai/gemini.ts:187`) |
| **Include I1/I2** | Validación en route POST (`amount <= 0` → 400) y en servicio; saldo vía trigger |

**Estado:** **EVIDENCIA COMPLETA**

### CU-002 — Gestionar Cuentas

| Aspecto | Evidencia |
|---------|-----------|
| **UI** | `app/(authenticated)/accounts/page.tsx`, `app/(authenticated)/accounts/[id]/page.tsx`; `components/accounts/*` |
| **API** | `app/api/accounts/route.ts`, `app/api/accounts/[id]/route.ts`; ajustes: `adjust-balance`, `adjust-secondary-balance`, `reconcile-balance`, `correct-debt-sign`, `repair-currency-range` |
| **Servicio** | `lib/services/accounts.ts` — `AccountsService`, `accountsService` |
| **Tabla** | `accounts` (`supabase/schema.sql:79`) |
| **Extensión E1 — Tarjeta bi-moneda** | Columnas `is_multicurrency`, `secondary_currency` (`supabase/schema.sql:101–103`); RPC `get_multicurrency_balances` usado en `lib/services/accounts.ts:89`; migraciones `20260504104000_*`, `20260504164000_*` |
| **Include I1 — Saldo por moneda** | `accountsService.list()` enriquece balances multi-moneda |

**Estado:** **EVIDENCIA COMPLETA**

### CU-003 — Visualizar Dashboard

| Aspecto | Evidencia |
|---------|-----------|
| **UI** | `app/(authenticated)/dashboard/page.tsx` |
| **Componentes** | `components/dashboard/NetWorthHero.tsx`, `MarketStrip.tsx`, `MonthFlowCard.tsx`, `RecentTransactions.tsx`, `AnomaliesWidget.tsx`, `InternalAiChat.tsx`, etc. |
| **Servicios agregadores** | `lib/services/net-worth.ts`, `month-flow.ts`, `upcoming.ts`, `budget-summary.ts`, `cotizaciones.ts`, `investments.ts` |
| **Include I1 — Cotizaciones** | `cotizacionesService.getAllQuotes()`; API `app/api/cotizaciones/route.ts`; fallback Strategy en `lib/services/cotizaciones.ts` |
| **Include I2 — Patrimonio** | `computeNetWorth`, `getNetWorthHistory` (`lib/services/net-worth.ts`); snapshot cron `app/api/cron/net-worth-snapshot/route.ts` |
| **Extensión E1 — Asistente IA (chat)** | `components/dashboard/InternalAiChat.tsx` → `POST /api/ai/chat` |
| **Extensión E2 — Anomalías** | `components/dashboard/AnomaliesWidget.tsx` → `GET /api/ai/anomalies` |

**Estado:** **EVIDENCIA COMPLETA**

### CU-004 — Gestionar Portafolio de Inversiones

| Aspecto | Evidencia |
|---------|-----------|
| **UI** | `app/(authenticated)/investments/page.tsx`; `components/investments/*` |
| **API** | `app/api/investments/route.ts`, `[id]/route.ts`, `[id]/sell/route.ts`, `portfolio/route.ts`, `performance/route.ts`, `quote/route.ts`, `ticker-search/route.ts` |
| **Servicio** | `lib/services/investments.ts` — P&L, cotización Yahoo/Data912/Stooq |
| **Tablas** | `investments`, `investment_sales`, `portfolio_performance_snapshots` |
| **Include I1 — Precios mercado** | Cron `app/api/cron/update-prices/route.ts`; `lib/yahoo-finance-quotes.ts`, `lib/market-data/data912-client.ts` |
| **Include I2 — P&L** | `InvestmentsService.getPortfolioSummary()` — campos `profit_loss`, `profit_loss_percent`, etc. |

**Estado:** **EVIDENCIA COMPLETA**

### CU-005 — Importar / Exportar Datos (+ OCR en extend de CU-001, no import OCR)

| Aspecto | Evidencia |
|---------|-----------|
| **UI import/export** | `components/settings/ExportImport.tsx` (en `app/(authenticated)/settings/page.tsx`) |
| **Export CSV/JSON** | `app/api/export/transactions/route.ts` |
| **Export backup** | `app/api/export/backup/route.ts` |
| **Import CSV/XLSX/JSON** | `app/api/import/transactions/route.ts` (~1560 líneas; parsers CSV + ExcelJS) |
| **Script de verificación** | `scripts/compare-import-with-export.ts` |
| **Include I1 — Validar formato** | Validación Zod/headers en import route (ej. error 400 `"CSV debe tener columnas \"Fecha\" y \"Monto\""` — ver `docs/tif/RESULTADOS-PRUEBAS.md`) |
| **Include I2 — Mapear categorías/cuentas** | Flujo `unresolvedAccounts` + resoluciones en `ExportImport.tsx` y body del import |

**Estado:** **EVIDENCIA COMPLETA** (import/export de movimientos; OCR de tickets es vía Telegram/Gemini, no vía import de archivos)

### CU-006 — Gestionar Reglas Recurrentes

| Aspecto | Evidencia |
|---------|-----------|
| **UI** | `app/(authenticated)/recurring/page.tsx` (~959 líneas, CRUD client-side) |
| **API CRUD** | `app/api/recurring/route.ts`, `app/api/recurring/[id]/route.ts` |
| **Servicio** | `lib/services/recurring.ts` — `RecurringService` |
| **Tabla** | `recurring_rules` (`supabase/schema.sql:199`) |
| **Include I1 — Ejecutar recurrente** | Cron diario `app/api/cron/recurring/route.ts` (clase `IterativeCronJob`); schedule `vercel.json` `"0 8 * * *"` |

**Estado:** **EVIDENCIA COMPLETA**

### CU-007 (propuesto) — Asistente IA (RF10)

No aparece como “CU-007” en código, pero RF10 está implementado:

| Aspecto | Evidencia |
|---------|-----------|
| **Web chat** | `components/dashboard/InternalAiChat.tsx` → `POST app/api/ai/chat/route.ts` → `processInternalAiChatMessage()` (`lib/services/internal-ai-chat.ts`) |
| **Telegram + tools** | `lib/ai/bot-tools.ts` (14 function declarations: `create_transaction`, `get_spending`, `get_portfolio`, …); loop en `GeminiClient.chatWithTools()` (`lib/ai/gemini.ts`) |
| **Resúmenes cron con IA** | `app/api/cron/weekly-summary/route.ts`, `app/api/cron/monthly-summary/route.ts` |
| **Config API key** | `users.gemini_api_key` — migración `20260401140000_user_integrations_gemini_telegram.sql`; UI `components/settings/SettingsForm.tsx` |
| **Suscripción requerida** | `subscriptionsService.ensureOrchestratorAccess()` en `app/api/ai/chat/route.ts:40` |

**Estado:** **EVIDENCIA COMPLETA** (como RF10 / extensión CU-003-E1)

### CU-008 (propuesto) — Anomalías y proyecciones (RF11)

| Aspecto | Evidencia |
|---------|-----------|
| **Anomalías (heurística, sin LLM)** | `app/api/ai/anomalies/route.ts` — ratio ≥2× vs promedio 3 meses; widget `components/dashboard/AnomaliesWidget.tsx` |
| **Proyecciones (heurística lineal)** | `app/api/ai/projections/route.ts` — promedios 3 meses, proyección 3/6/12; widget `components/analysis/ProjectionsWidget.tsx` |
| **Uso de Gemini** | **NO** — rutas bajo `/api/ai/*` pero lógica puramente algorítmica (confirmado en `docs/adr/0003-gemini-bot-asistente.md:44–45`) |

**Estado:** **EVIDENCIA COMPLETA** (como RF11; no usa IA generativa)

### Funcionalidad fuera del catálogo CU-001…006 (información adicional)

| Feature | Evidencia |
|---------|-----------|
| Presupuestos | `app/(authenticated)/budgets/page.tsx`, `lib/services/budgets.ts`, cron `budget-alerts` |
| Análisis / gráficos | `app/(authenticated)/analysis/page.tsx`, `lib/services/analytics.ts` |
| Gastos compartidos (Tricount) | `app/(authenticated)/shared/page.tsx`, `lib/services/sharedExpenses.ts`, tablas `shared_*` |
| Suscripciones Mercado Pago | `lib/services/mercado-pago-service.ts`, `app/api/webhooks/mercado-pago/route.ts` |

---

## 3. Tests

### 3.1 Archivos de test (Vitest)

| Archivo | Qué cubre |
|---------|-----------|
| `__tests__/transaction-exchange.test.ts` | `normalizeCurrency`, `approximateCrossRate`, `effectiveAmountInAccountCurrencyForMovement` |
| `__tests__/transaction-account-impact.test.ts` | Impacto de movimientos en saldo (`impactInAccountCurrency`, agregaciones) |
| `__tests__/transaction-date.test.ts` | Parsing de fechas (`todayLocalYmd`, `calendarDateToUtcNoonIso`, bot date) |
| `__tests__/transaction-currencies.test.ts` | Monedas permitidas ARS/USD/EUR |
| `__tests__/shared-expenses.test.ts` | Split equitativo, balances, settlements, tokens de share |
| `__tests__/sanitize-amount-input.test.ts` | Normalización de montos en UI |
| `__tests__/evaluate-simple-amount-expression.test.ts` | Calculadora de montos |
| `__tests__/sanitize-for-prompt.test.ts` | Sanitización de prompts IA + `mapHistoryToGemini` |
| `__tests__/billing-plans.test.ts` | Planes Mercado Pago / env overrides |
| `__tests__/cron-auth.test.ts` | Bearer de crons (`verifyCronBearer`) |
| `__tests__/webhook-auth.test.ts` | Secretos webhook Telegram custom |
| `__tests__/secure-compare.test.ts` | Comparación timing-safe |
| `__tests__/rate-limit.test.ts` | Rate limit in-memory |
| `__tests__/notification-schedule.test.ts` | Schedule resúmenes Telegram |

**Total:** 14 archivos, **132 tests** (según corrida local).

### 3.2 Cobertura / CFG / informes

| Artefacto | Estado |
|-----------|--------|
| Informe de cobertura (Istanbul/c8/nyc) | **NO EXISTE** — no hay script `test:coverage` ni config de coverage en `vitest.config.ts` |
| CFG / análisis estático de flujo | **NO EXISTE** en el repo |
| Pruebas manuales documentadas | `docs/tif/RESULTADOS-PRUEBAS.md` — CP-001-01…CP-005-02 con evidencia HTTP (2026-08-12) |
| E2E Playwright | **NO IMPLEMENTADO** (planificado en `docs/adr/0005-estrategia-testing-risk-based.md` y `docs/GUIA-DEFENSA-TIF.md`) |
| CI | `.github/workflows/ci.yml` — lint + typecheck + test + build en cada push/PR |

### 3.3 Salida real de `npm test` (2026-08-26)

```
> zarix@0.1.0 test
> vitest run

 RUN  v2.1.9 /workspace

 ✓ __tests__/transaction-exchange.test.ts (14 tests)
 ✓ __tests__/transaction-account-impact.test.ts (12 tests)
 ✓ __tests__/shared-expenses.test.ts (10 tests)
 ✓ __tests__/notification-schedule.test.ts (11 tests)
 ✓ __tests__/billing-plans.test.ts (10 tests)
 ✓ __tests__/transaction-date.test.ts (14 tests)
 ✓ __tests__/transaction-currencies.test.ts (5 tests)
 ✓ __tests__/sanitize-amount-input.test.ts (17 tests)
 ✓ __tests__/webhook-auth.test.ts (4 tests)
 ✓ __tests__/secure-compare.test.ts (6 tests)
 ✓ __tests__/cron-auth.test.ts (6 tests)
 ✓ __tests__/evaluate-simple-amount-expression.test.ts (18 tests)
 ✓ __tests__/rate-limit.test.ts (1 test)
 ✓ __tests__/sanitize-for-prompt.test.ts (4 tests)

 Test Files  14 passed (14)
      Tests  132 passed (132)
   Duration  1.17s
```

**Lo que NO está cubierto por tests automatizados:** rutas API completas, componentes React, trigger SQL `update_account_balance`, flujos E2E CU-001/CU-003, integración real con Supabase/Gemini/Telegram.

---

## 4. Patrones de diseño (solo si presentes)

| Patrón | Ubicación | Símbolos |
|--------|-----------|----------|
| **Strategy** (cotizaciones dólar) | `lib/services/cotizaciones.ts:41–51` | `DolarRateProvider`, `CriptoYaProvider`, `DolarApiProvider`, `DbCacheProvider`; contexto `CotizacionesService` (`:211`) |
| **Template Method** (crons) | `lib/cron/cron-job.ts:8–54` | `CronJob.run()`, subclases implementan `execute()` |
| **Template Method iterativo** | `lib/cron/cron-job.ts:56–80` | `IterativeCronJob<TItem>` — usado en `app/api/cron/recurring/route.ts` |
| **Service layer (singletons)** | `lib/services/*.ts` | `transactionsService`, `accountsService`, `investmentsService`, `cotizacionesService`, … (clases `*Service` + export const) |
| **Adapter-like** (fuentes externas) | `lib/market-data/data912-client.ts`, `lib/yahoo-finance-quotes.ts`, `lib/stooq-us-quote.ts` | Adaptan APIs externas al modelo interno de cotización (sin nombre formal “Adapter”) |
| **Repository** | — | **NO EVIDENCE** — acceso a datos vía Supabase client directo en servicios, no hay capa Repository nombrada |
| **Function calling (IA)** | `lib/ai/bot-tools.ts`, `lib/ai/gemini.ts` | `BOT_TOOL_DECLARATIONS`, `GeminiClient.chatWithTools()` |

Diagramas de patrones en repo: `docs/tif/diagrams/fig11_patron_strategy.puml`, `fig12_patron_template_method.puml`.

---

## 5. Evidencia RLS / autenticación

### 5.1 Supabase Auth + middleware

| Mecanismo | Archivo |
|-----------|---------|
| Middleware refresca sesión y redirige a `/login` | `middleware.ts:47–70` |
| Cliente SSR con cookies | `lib/supabase/server.ts:5–29` |
| Callback OAuth | `app/auth/callback/route.ts` |
| Helper cacheado de usuario | `lib/auth/session.ts` — `getCachedUser()` |
| API routes verifican `supabase.auth.getUser()` | Patrón en `app/api/transactions/route.ts:10–16`, `app/api/accounts/route.ts:9–15`, etc. |

### 5.2 Row Level Security (PostgreSQL)

RLS habilitado en tablas core (`supabase/schema.sql:591–599`):

- `users`, `accounts`, `categories`, `transactions`, `recurring_rules`, `budgets`, `budget_alerts`, `investments`, `bot_sessions`

Políticas representativas:

```sql
-- accounts: solo filas propias
CREATE POLICY accounts_select_own ON accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- transactions: CRUD acotado a user_id
CREATE POLICY transactions_all ON transactions FOR ALL
  USING (auth.uid() = user_id);

-- categories: sistema visibles para todos; custom solo owner
CREATE POLICY categories_select ON categories FOR SELECT USING (
  is_system = TRUE OR auth.uid() = user_id
);
```

Tablas **sin acceso directo del usuario autenticado** (solo service role / cron):

- `net_worth_snapshots` — `REVOKE ALL … FROM anon, authenticated` (`20260814120000_net_worth_snapshots.sql:23`)
- `market_data_cache` — RLS on, comentario “solo service role” (`20260401160000_market_data_cache.sql:10`)

### 5.3 Endpoints no-RLS (auth alternativa)

| Endpoint | Auth |
|----------|------|
| Crons `/api/cron/*` | Bearer `CRON_SECRET` — `lib/cron-auth.ts`, `lib/cron/cron-job.ts:26` |
| Telegram webhook | Secret path + header derivado — `lib/telegram/webhook-auth.ts` |
| Shared expenses público | Token hex 32 chars — `app/shared/[token]/page.tsx`, `app/api/shared/[token]/*` |
| Mercado Pago webhook | HMAC — `app/api/webhooks/mercado-pago/route.ts` |

### 5.4 Hardening de secretos

- Columnas `gemini_api_key`, `telegram_bot_token` excluidas de selects cliente — `lib/constants/user-columns.ts`, migración `20260811120000_security_hardening.sql`
- Política `users_update` impide auto-escalada de campos de suscripción (`supabase/schema.sql:603–617`)

ADR: `docs/adr/0001-supabase-postgres-rls.md`.

---

## 6. Mismatches TIF / documentación vs. código

| Tema | Claim (TIF / README / landing) | Código real | Severidad |
|------|-------------------------------|-------------|-----------|
| **OCR / visión** | TIF cita OpenAI Vision; diagrama CU-001-E2 dice “OCR/Gemini” | Solo **Google Gemini** (`chatWithImage`); **cero** referencias a OpenAI en TS/SQL | Doc desactualizado |
| **Anomalías/proyecciones** | Nombre de ruta `/api/ai/*` sugiere LLM | Heurísticas puras en `anomalies/route.ts`, `projections/route.ts` | Naming confuso, comportamiento correcto |
| **Estado global Zustand** | `README.md:79` | No está en dependencias ni código | Doc incorrecto |
| **Tests E2E** | Guía TIF planifica Playwright CU-001/CU-003 | No hay suite Playwright | Planificado, no entregado |
| **Tests unitarios framework** | TIF impreso mencionaba Jest | **Vitest** (`vitest.config.ts`, ADR 0005) | Doc desactualizado |
| **Crons** | TIF puede listar subset | **8 crons** en `vercel.json` (recurring, update-prices, net-worth-snapshot, budget-alerts, maturity-alerts, weekly/monthly summary, subscription-grace) | Verificar numeración en doc |
| **Supabase CLI local** | Scripts `db:push`/`db:reset` | Sin `supabase/config.toml` versionado | Setup local incompleto en repo |
| **claude.md interno** | Dice “No hay framework de tests” | 132 tests Vitest + CI | Doc interno obsoleto |

---

## 7. Matriz de trazabilidad rápida

| CU / RF | RF | Rutas API principales | Servicio | Tabla(s) |
|---------|-----|----------------------|----------|----------|
| CU-001 | RF01 | `/api/transactions*` | `transactionsService` | `transactions`, `accounts` |
| CU-002 | RF04 | `/api/accounts*` | `accountsService` | `accounts` |
| CU-003 | RF02, RF03 | `/dashboard`, `/api/cotizaciones` | `cotizacionesService`, `net-worth` | `exchange_rates`, cuentas+inversiones |
| CU-004 | RF05 | `/api/investments*` | `investmentsService` | `investments`, `investment_sales` |
| CU-005 | RF07 | `/api/import/transactions`, `/api/export/*` | import inline + `transactionsService` | `transactions` |
| CU-006 | RF09 | `/api/recurring*`, `/api/cron/recurring` | `recurringService` | `recurring_rules` |
| RF06 | Bot | `/api/telegram/webhook*` | `lib/telegram/bot.ts` | `users`, `bot_sessions` |
| RF08 | OCR | (Telegram foto) | `GeminiClient.chatWithImage` | — |
| RF10 / CU-007 | IA chat | `/api/ai/chat` | `internal-ai-chat`, `bot-tools` | `bot_sessions` |
| RF11 / CU-008 | Anomalías | `/api/ai/anomalies`, `/api/ai/projections` | lógica en routes | `transactions` |

---

## 8. Conclusión EV-COD

1. **Zarix es una PWA Next.js privada** con backend Supabase; no hay código ERP/Odoo en el producto.
2. **CU-001 a CU-006 tienen evidencia directa** en rutas, servicios, UI y tablas PostgreSQL.
3. **RF10 (IA) y RF11 (anomalías/proyecciones) están implementados**; RF11 sin LLM; RF10 con Gemini + function calling.
4. **Tests:** 132 unit tests Vitest pasando; **sin** informes CFG/coverage; E2E planificado pero ausente.
5. **Principales correcciones al TIF:** reemplazar OpenAI Vision → Gemini multimodal; aclarar RF11 algorítmico; actualizar Jest→Vitest; quitar Zustand del stack declarado.

---

*Generado por relevamiento de código. Cada afirmación apunta a rutas verificables en el repositorio Zarix.*
