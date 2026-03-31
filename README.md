# 💰 Zarix

**Aplicación financiera personal optimizada para el mercado argentino.**

App web PWA + Bot de Telegram con IA para gestionar tus finanzas personales de forma inteligente y sin costo.

---

## 📊 ¿Qué es Zarix?

Una app financiera personal que:
- ✅ Registra gastos/ingresos por **Telegram con lenguaje natural** ("gasté 5000 en el super")
- ✅ Soporta **múltiples monedas**: ARS, USD, USDT, BTC, ETH + dólar blue/MEP/CCL/oficial
- ✅ Gestiona **inversiones**: acciones/CEDEARs, crypto, plazos fijos, FCI, bonos, cauciones
- ✅ Muestra **cotizaciones en tiempo real** (dólar, crypto)
- ✅ **Dashboard visual** con charts y análisis
- ✅ **PWA instalable** en iPhone (funciona como app nativa)
- ✅ **100% gratuito** (solo ~$1/mes de IA si superás tier free)

---

## 🚀 Stack Tecnológico

- **Frontend**: Next.js 14 (App Router) + Tailwind CSS + PWA
- **Backend**: Next.js API Routes (Vercel Serverless, Node.js runtime)
- **Database**: Supabase PostgreSQL (tier gratuito: 500MB)
- **Bot**: Telegram Bot API con Gemini AI (dual-tier: Flash-Lite + Flash)
- **Cotizaciones**: CriptoYa API (dólar) + CoinGecko API (crypto)
- **Auth**: Supabase Auth (magic link por email)
- **Deploy**: Vercel (tier gratuito, deploy automático)

---

## 💵 Costo Real Mensual

| Servicio         | Límite Free           | Uso Estimado     | Costo      |
| ---------------- | --------------------- | ---------------- | ---------- |
| **Vercel**       | 100GB bandwidth       | ~500MB/mes       | **$0**     |
| **Supabase**     | 500MB DB, 2GB storage | ~10MB/mes        | **$0**     |
| **Telegram**     | Ilimitado             | ~200 msgs/mes    | **$0**     |
| **CriptoYa**     | Sin límite            | ~100 calls/mes   | **$0**     |
| **CoinGecko**    | 10-30 calls/min       | ~50 calls/mes    | **$0**     |
| **Gemini Lite**  | 1M tokens/día         | ~150k tokens/mes | **$0.15**  |
| **Gemini Full**  | 1M tokens/día         | ~50k tokens/mes  | **$0.80**  |
| **TOTAL**        |                       |                  | **~$0-1/mes** |

**Si usás poco el bot:** $0/mes (tier gratuito de Gemini cubre todo)
**Si lo usás mucho:** ~$1/mes (solo IA)

---

## 📦 Instalación Completa (Paso a Paso)

### 🔧 Prerequisitos

- [ ] Cuenta GitHub (gratis)
- [ ] Cuenta Vercel (gratis)
- [ ] Cuenta Supabase (gratis)
- [ ] Cuenta Telegram (gratis)
- [ ] Cuenta Google AI Studio (gratis)
- [ ] Node.js 18+ instalado

---

### 1️⃣ CLONAR E INSTALAR

```bash
# Clonar el repo
git clone https://github.com/tu-usuario/zarix.git
cd zarix

# Instalar dependencias
npm install
```

---

### 2️⃣ CREAR PROYECTO EN SUPABASE

#### 2.1 Crear Base de Datos

1. Andá a [https://supabase.com](https://supabase.com)
2. `New Project`
3. Elegí:
   - **Name**: `zarix`
   - **Database Password**: (generá uno fuerte)
   - **Region**: `South America (São Paulo)` (más cerca de Argentina)
   - **Pricing Plan**: `Free`
4. Clickeá `Create new project`
5. Esperá 2-3 min que termine de provisionar

#### 2.2 Ejecutar Schema SQL

1. En el dashboard de Supabase: `SQL Editor` (ícono de código)
2. `+ New query`
3. Abrí el archivo `supabase/schema.sql` de este repo
4. Copiá **TODO** el contenido (son ~700 líneas)
5. Pegalo en el editor SQL de Supabase
6. Clickeá `Run` (abajo a la derecha)
7. Deberías ver: `Success. No rows returned`

**Esto crea:**
- ✅ 10 tablas (users, accounts, transactions, categories, budgets, investments, etc.)
- ✅ Enums y tipos custom
- ✅ Índices optimizados
- ✅ Triggers para actualizar saldos automáticamente
- ✅ Funciones SQL (cuotas, vinculación Telegram, resúmenes)
- ✅ Row Level Security (RLS) en todas las tablas
- ✅ Categorías del sistema pre-cargadas

**🔄 Si ya tenés datos y estás actualizando:**

Si ya ejecutaste el schema antes y querés agregar los campos de tarjetas de crédito, ejecutá esto por separado en el SQL Editor:

```sql
ALTER TABLE accounts 
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS closing_day INTEGER CHECK (closing_day >= 1 AND closing_day <= 31),
  ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day >= 1 AND due_day <= 31),
  ADD COLUMN IF NOT EXISTS last_4_digits TEXT CHECK (length(last_4_digits) = 4);
```

**⚠️ Para permitir saldos negativos (recomendado):**

Por defecto, las cuentas no pueden quedar en negativo. Si querés permitirlo (más realista), ejecutá:

```sql
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS positive_balance_if_not_debt;
```

#### 2.3 Obtener API Keys

1. `Settings` → `API` (en el sidebar)
2. Copiá estos 3 valores:

```bash
Project URL: https://tu-proyecto.supabase.co
anon public: eyJhbGc... (key pública)
service_role: eyJhbGc... (key secreta, NUNCA la expongas en cliente)
```

---

### 3️⃣ CREAR BOT DE TELEGRAM

#### 3.1 Crear el Bot

1. Abrí Telegram
2. Buscá: `@BotFather`
3. Mandá: `/newbot`
4. Elegí nombre: `Zarix Bot` (o el que quieras)
5. Elegí username: `tu_zarix_bot` (tiene que terminar en `_bot`)
6. BotFather te responde con el token:

```
Use this token to access the HTTP API:
123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

7. Guardá ese token

#### 3.2 Configurar el Bot (opcional pero recomendado)

Volvé a hablar con `@BotFather` y mandá:

```
/setdescription
→ seleccioná tu bot
→ escribí: "Tu asistente financiero personal argentino con IA"

/setabouttext
→ seleccioná tu bot
→ escribí: "Registrá gastos, consultá saldos, analizá tu plata"

/setcommands
→ seleccioná tu bot
→ copiá y pegá esto:
cuentas - Ver saldos de todas las cuentas
cotizaciones - Dólar blue, MEP, BTC, ETH
resumen - Resumen del mes actual
help - Lista de comandos
```

---

### 4️⃣ OBTENER GEMINI API KEY

1. Andá a [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Logueate con tu cuenta Google
3. Clickeá `Create API Key`
4. Elegí un proyecto existente o creá uno nuevo
5. Copiá la key: `AIzaSyC...`

**Límites del tier gratuito:**
- ✅ 15 requests por minuto
- ✅ 1 millón de tokens por día
- ✅ Suficiente para 500+ mensajes/día de uso personal

---

### 5️⃣ CONFIGURAR VARIABLES DE ENTORNO

#### 5.1 Crear archivo local

```bash
cp .env.example .env.local
```

#### 5.2 Editar `.env.local`

Abrí `.env.local` y reemplazá con tus valores reales:

```bash
# ============================================================================
# SUPABASE
# ============================================================================
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...tu-service-role-key

# ============================================================================
# TELEGRAM BOT
# ============================================================================
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_WEBHOOK_SECRET=genera-un-string-random-aca
TELEGRAM_BOT_USERNAME=tu_zarix_bot

# Para generar el secret:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ============================================================================
# GOOGLE GEMINI API
# ============================================================================
GEMINI_API_KEY=AIzaSyC...tu-api-key
GEMINI_MODEL_LITE=gemini-2.5-flash-lite
GEMINI_MODEL_FULL=gemini-2.5-flash

# ============================================================================
# APIS DE COTIZACIONES (dejar default)
# ============================================================================
CRIPTOYA_API_URL=https://criptoya.com/api
COINGECKO_API_URL=https://api.coingecko.com/api/v3

# ============================================================================
# CONFIGURACIÓN
# ============================================================================
TZ=America/Argentina/Buenos_Aires
EXCHANGE_RATE_CACHE_TTL=300
TRANSACTIONS_PER_PAGE=50

# Feature flags
NEXT_PUBLIC_ENABLE_INVESTMENTS=true
NEXT_PUBLIC_ENABLE_BUDGETS=true
NEXT_PUBLIC_ENABLE_EXPORT=false
NEXT_PUBLIC_ENABLE_GEOLOCATION=false
```

**Para generar `TELEGRAM_WEBHOOK_SECRET`:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 6️⃣ PROBAR EN LOCAL (Opcional)

```bash
# Correr el servidor de desarrollo
npm run dev
```

Abrí: [http://localhost:3000](http://localhost:3000)

**IMPORTANTE:** El bot de Telegram NO va a funcionar en local porque Telegram necesita una URL pública. Podés:
- Usar **ngrok** para exponer tu localhost (ver sección de desarrollo)
- O skipear este paso y deployar directo a Vercel

---

### 7️⃣ PUSH A GITHUB

```bash
# Inicializar git (si no lo hiciste)
git init

# Agregar todos los archivos
git add .

# Primer commit
git commit -m "Initial commit: Zarix financial app"

# Crear repo en GitHub (desde la web):
# https://github.com/new → nombre: zarix

# Conectar con el remote
git branch -M main
git remote add origin https://github.com/tu-usuario/zarix.git

# Push
git push -u origin main
```

---

### 8️⃣ DEPLOY EN VERCEL

#### 8.1 Importar Proyecto

1. Andá a [https://vercel.com](https://vercel.com)
2. `Add New...` → `Project`
3. Clickeá `Import Git Repository`
4. Seleccioná tu repo `zarix`
5. Framework Preset: `Next.js` (detecta automático)
6. Root Directory: `./` (default)


#### 8.2 Configurar Environment Variables

**ANTES de deployar**, agregá las mismas variables de `.env.local` en Vercel:

1. En la pantalla de configuración, bajá hasta `Environment Variables`
2. Agregá **UNA POR UNA** todas las variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh...
TELEGRAM_BOT_TOKEN=123456789:ABC...
TELEGRAM_WEBHOOK_SECRET=tu-secret-random
TELEGRAM_BOT_USERNAME=tu_zarix_bot
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL_LITE=gemini-2.5-flash-lite
GEMINI_MODEL_FULL=gemini-2.5-flash
CRIPTOYA_API_URL=https://criptoya.com/api
COINGECKO_API_URL=https://api.coingecko.com/api/v3
TZ=America/Argentina/Buenos_Aires
EXCHANGE_RATE_CACHE_TTL=300
TRANSACTIONS_PER_PAGE=50
NEXT_PUBLIC_ENABLE_INVESTMENTS=true
NEXT_PUBLIC_ENABLE_BUDGETS=true
NEXT_PUBLIC_ENABLE_EXPORT=false
NEXT_PUBLIC_ENABLE_GEOLOCATION=false
```

3. Asegurate que todas las variables estén en `Production`, `Preview`, y `Development`

#### 8.3 Deploy

1. Clickeá `Deploy`
2. Esperá 2-4 minutos
3. Cuando termine, vas a ver: `🎉 Congratulations!`
4. Copiá tu URL de producción: `https://zarix-tu-usuario.vercel.app`

---

### 9️⃣ CONFIGURAR WEBHOOK DE TELEGRAM

Ahora que tu app está en producción, necesitás que Telegram sepa dónde enviar los mensajes.

#### 9.1 Agregar URL en Vercel

1. En Vercel: `Settings` → `Environment Variables`
2. Agregá una variable nueva:

```bash
NEXT_PUBLIC_APP_URL=https://zarix-tu-usuario.vercel.app
```

3. Guardá y esperá 10 segundos
4. Andá a `Deployments` (arriba)
5. Clickeá en el último deployment
6. `...` (3 puntitos) → `Redeploy`
7. Esperá que termine el redeploy (~2 min)

#### 9.2 Ejecutar Script de Setup

En tu máquina local:

```bash
# 1. Asegurate que .env.local tenga TODAS las variables actualizadas
# (especialmente NEXT_PUBLIC_APP_URL con tu URL de Vercel)

# 2. Ejecutar el script
npm run telegram:webhook
```

**Output esperado:**

```
🔧 Configurando webhook de Telegram...
   URL: https://zarix-tu-usuario.vercel.app/api/telegram/webhook
✅ Webhook configurado correctamente!
   {"ok":true,"result":true,"description":"Webhook was set"}
```

#### 9.3 Verificar que funciona

1. Abrí Telegram
2. Buscá tu bot: `@tu_zarix_bot`
3. Mandá: `/start`

El bot debería responder en 1-2 segundos:

```
¡Hola! 👋

Soy tu asistente financiero personal argentino.

Para vincular tu cuenta, andá a:
https://zarix-tu-usuario.vercel.app/settings

Y pegá este código: 123456789

O escribime tu User ID de Supabase y te vinculo manual.
```

**Si NO responde:**
- Revisá logs en Vercel: `Dashboard` → `Logs` → filtrá por `telegram`
- Verificá el webhook:

```bash
curl https://api.telegram.org/bot<TU_TOKEN>/getWebhookInfo
```

Debería mostrar tu URL de Vercel.

---

### 🔟 CREAR TU USUARIO Y VINCULAR TELEGRAM

#### 10.1 Login en la App

1. Abrí tu app: `https://zarix-tu-usuario.vercel.app`
2. Ingresá tu email
3. Clickeá `Enviar link mágico`
4. Revisá tu correo (puede tardar 1-2 min)
5. Clickeá en el link del email
6. Te redirige al dashboard

#### 10.2 Vincular Telegram (Método Manual - Rápido)

1. En Telegram, escribile a tu bot: `/start`
2. El bot te responde con un chat ID (ej: `123456789`)
3. Copiá ese número
4. Andá a Supabase Dashboard: `Table Editor` → `users`
5. Encontrá tu usuario (buscá por email)
6. Clickeá en la fila para editar
7. En el campo `telegram_chat_id`, pegá el número
8. `Save`

#### 10.3 Vincular Telegram (Método desde la App - TODO en V2)

La app debería tener una página en `/settings` que te permite vincular automáticamente. Si no está implementada aún, usá el método manual de arriba.

---

### 1️⃣1️⃣ CREAR TUS PRIMERAS CUENTAS

#### 11.1 Desde la App Web

1. En el dashboard, andá a `Cuentas`
2. Clickeá `+ Nueva Cuenta`
3. Elegí un preset (ej: `Efectivo ARS`)
4. Saldo inicial: `10000` (o el que tengas)
5. `Crear`

**Cuentas sugeridas para empezar:**
- ✅ Efectivo ARS (saldo: tu efectivo real)
- ✅ Cuenta bancaria principal (ej: BBVA)
- ✅ Billetera digital (ej: Mercado Pago)
- ✅ Tarjeta de crédito (saldo: 0 o deuda actual como negativo)
- ✅ Efectivo USD (si tenés dólares físicos)

#### 11.2 Desde el Bot (V2)

En el futuro, vas a poder crear cuentas desde Telegram:

```
crear cuenta efectivo con 10 mil pesos
```

Pero por ahora, hacelo desde la app web.

---

### 1️⃣2️⃣ PROBAR EL BOT

Ahora que tenés tu cuenta vinculada y al menos una cuenta creada, probá el bot:

#### 12.1 Ver tus cuentas

```
/cuentas
```

**Respuesta:**

```
💰 TUS CUENTAS

💵 Efectivo ARS
   $10,000.00 ARS

🏦 BBVA
   $50,000.00 ARS

━━━━━━━━━━━━━━━━━━━━━━
📊 TOTAL PATRIMONIO
💵 $60,000 ARS
```

#### 12.2 Ver cotizaciones

```
/cotizaciones
```

**Respuesta:**

```
💱 COTIZACIONES (actualizadas hace 2 min)

🇦🇷 DÓLAR
💵 Blue: $1,300.00
🏛️ Oficial: $950.00
📊 MEP: $1,250.00
📈 CCL: $1,280.00

₿ CRYPTO
BTC: USD 87,500 (+2.34%)
ETH: USD 3,200 (-0.87%)
USDT: USD 1.0002
```

#### 12.3 Registrar un gasto

```
gasté 5000 en el super
```

**Respuesta:**

```
✅ Listo, registré $5,000 en Comida desde Efectivo ARS

Nuevo saldo: $5,000 ARS
```

#### 12.4 Verificar en la app

1. Abrí la app web
2. Andá a `Movimientos`
3. Deberías ver el gasto de $5000 que acabás de registrar

---

### 1️⃣3️⃣ INSTALAR PWA EN TU IPHONE

#### 13.1 Agregar a la Pantalla de Inicio

1. Abrí **Safari** (no Chrome)
2. Andá a tu app: `https://zarix-tu-usuario.vercel.app`
3. Tocá el botón de **Compartir** (cuadrado con flecha hacia arriba)
4. Scroll hacia abajo
5. Tocá `Agregar a pantalla de inicio`
6. Editá el nombre si querés: `Zarix`
7. Tocá `Agregar`

#### 13.2 Ya tenés la app instalada

Ahora vas a ver el ícono de Zarix en tu home screen.

**Beneficios:**
- ✅ Se abre como app nativa (sin barra de navegador)
- ✅ Funciona offline (cache de datos)
- ✅ Más rápido (service worker)
- ✅ Notificaciones push (V2)

---

## ✅ CHECKLIST COMPLETO

- [ ] Supabase proyecto creado
- [ ] Schema SQL ejecutado sin errores
- [ ] API Keys de Supabase copiadas
- [ ] Bot de Telegram creado con @BotFather
- [ ] Bot configurado (descripción y comandos)
- [ ] Gemini API Key obtenida
- [ ] Repo pusheado a GitHub
- [ ] Proyecto importado en Vercel
- [ ] Environment variables configuradas en Vercel
- [ ] Deploy exitoso en Vercel
- [ ] `NEXT_PUBLIC_APP_URL` agregada y redeployado
- [ ] Webhook de Telegram configurado (`npm run telegram:webhook`)
- [ ] Usuario creado (login con magic link)
- [ ] Telegram vinculado (chat ID en tabla `users`)
- [ ] Al menos 1 cuenta creada
- [ ] Bot responde a `/cuentas`
- [ ] Bot responde a `/cotizaciones`
- [ ] Bot registra gastos correctamente
- [ ] PWA instalada en iPhone

---

## 🏗️ Estructura del Proyecto

```
zarix/
├── app/
│   ├── (authenticated)/      → Rutas protegidas con layout compartido
│   │   ├── dashboard/        → Home con resumen de patrimonio
│   │   ├── accounts/         → Gestión de cuentas
│   │   ├── expenses/         → Listado de transacciones
│   │   ├── investments/      → Portafolio de inversiones
│   │   ├── analysis/         → Charts y estadísticas
│   │   └── settings/         → Configuración de usuario
│   ├── api/
│   │   ├── accounts/         → CRUD de cuentas
│   │   ├── transactions/     → CRUD de transacciones
│   │   ├── investments/      → CRUD de inversiones
│   │   ├── budgets/          → CRUD de presupuestos
│   │   ├── categories/       → CRUD de categorías
│   │   ├── cotizaciones/     → Proxy a CriptoYa + CoinGecko
│   │   ├── telegram/webhook/ → Recibe updates de Telegram
│   │   ├── ai/chat/          → Chat directo con Gemini
│   │   └── auth/link-telegram/ → Vincular Telegram con usuario
│   ├── auth/callback/        → OAuth callback de Supabase
│   ├── login/                → Página de login (magic link)
│   ├── layout.tsx            → Layout raíz (metadata, PWA)
│   └── globals.css           → Estilos globales
│
├── lib/
│   ├── ai/
│   │   ├── gemini.ts         → Cliente Gemini (dual-tier: lite/full)
│   │   └── prompts.ts        → System prompts optimizados
│   ├── services/             → Lógica de negocio (Fat Service Layer)
│   │   ├── accounts.ts       → CRUD + balance conversions
│   │   ├── transactions.ts   → CRUD + summaries
│   │   ├── investments.ts    → CRUD + P&L calculations
│   │   ├── budgets.ts        → CRUD + status checks
│   │   ├── categories.ts     → CRUD
│   │   └── cotizaciones.ts   → APIs externas + cache
│   ├── supabase/
│   │   ├── client.ts         → Cliente browser (anon key)
│   │   └── server.ts         → Cliente server (service role key)
│   ├── telegram/
│   │   ├── bot.ts            → Configuración del bot + handlers
│   │   └── test-bot.ts       → Script de testing local
│   └── utils/
│       └── currency.ts       → Formateo y parseo de monedas
│
├── components/
│   ├── dashboard/            → Componentes del home
│   │   ├── QuotesWidget.tsx
│   │   ├── BalanceSummary.tsx
│   │   └── RecentTransactions.tsx
│   ├── accounts/
│   │   ├── AccountCards.tsx
│   │   └── CreateAccountButton.tsx
│   ├── expenses/
│   │   ├── TransactionsList.tsx
│   │   └── CreateTransactionButton.tsx
│   ├── investments/
│   │   ├── PortfolioSummary.tsx
│   │   └── InvestmentList.tsx
│   ├── analysis/
│   │   └── ExpensesPieChart.tsx
│   ├── settings/
│   │   └── SettingsForm.tsx
│   ├── Navigation.tsx        → Menú principal
│   └── ClientProviders.tsx   → PWA service worker registration
│
├── types/
│   └── database.ts           → TypeScript types (DB + enums)
│
├── supabase/
│   ├── schema.sql            → Schema completo (tablas, triggers, RLS)
│   └── seed.sql              → Datos de ejemplo (opcional)
│
├── public/
│   ├── manifest.json         → PWA manifest
│   ├── sw.js                 → Service worker (cache offline)
│   ├── icon-192.png          → Ícono 192x192
│   └── icon-512.png          → Ícono 512x512
│
├── scripts/
│   └── setup-telegram-webhook.js → Script de setup del webhook
│
├── .env.example              → Template de variables de entorno
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── README.md                 → Este archivo
```

---

## 🤖 Cómo Usar el Bot de Telegram

### Comandos Formales

```
/start          → Vincular cuenta
/cuentas        → Ver todos los saldos
/cotizaciones   → Ver dólar y crypto
/resumen        → Resumen del mes actual
/help           → Ayuda
```

### Lenguaje Natural (NLP)

El bot entiende español argentino coloquial:

#### ✅ Registrar gastos

```
gasté 5000 en el super
pagué 15 dólares de netflix con la visa
compré nafta, 8 lucas
uber 3500
me cortaron el pelo, 12 mil pesos
salí a comer, 25k
```

#### ✅ Registrar ingresos

```
me depositaron el sueldo, 800 lucas
cobré un freelance, 500 dólares
me devolvieron 20 mil
```

#### ✅ Transferencias entre cuentas

```
transferí 50k de Mercado Pago a BBVA
compré 100 dólares a 1250
pasé 200 usd de Wise a crypto wallet
```

#### ✅ Consultas

```
cuánto gasté este mes?
cuánto gasté en comida?
cuánto tengo en total?
a cómo está el blue?
cuánto vale bitcoin?
```

#### ✅ Análisis con IA (usa Gemini Flash, más inteligente)

```
en qué estoy gastando más?
cómo puedo ahorrar?
llegué a fin de mes con poca guita, qué puedo recortar?
comparame este mes con el anterior
estoy gastando más de lo normal?
```

### Abreviaturas que Entiende

- **lucas** = miles → `5 lucas = 5000`
- **palo** = millón → `1 palo = 1.000.000`
- **verdes** = USD → `50 verdes = 50 USD`
- **k** = mil → `8k = 8000`

---

## 💳 Tarjetas de Crédito

Zarix tiene soporte completo para tarjetas de crédito con tracking de límites, fechas y utilización.

### Crear una Tarjeta

1. Andá a **Cuentas** → **+ Nueva Cuenta**
2. Seleccioná el tipo **💳 Tarjeta de Crédito**
3. Completá:
   - **Nombre**: Ej: Visa Galicia, Naranja X
   - **Límite de crédito**: Ej: 500000 (obligatorio)
   - **Día de cierre**: Ej: 15 (opcional)
   - **Día de vencimiento**: Ej: 25 (opcional)
   - **Últimos 4 dígitos**: Ej: 1234 (opcional)
   - **Saldo inicial**: Ej: -25000 (negativo = consumido)

### Características

- **Exclusión del patrimonio total**: Las tarjetas se muestran por separado del saldo general
- **Widget dedicado en Dashboard**: Resumen visual con barra de utilización
- **Semáforo de uso**:
  - 🟢 Verde: < 50% utilizado
  - 🟡 Amarillo: 50-80% utilizado
  - 🔴 Rojo: > 80% utilizado
- **Indicadores útiles**:
  - Crédito usado
  - Crédito disponible
  - Porcentaje de utilización
  - Días de cierre y vencimiento

### Registrar Gastos con Tarjeta

Desde el bot de Telegram:

```
gasté 15 lucas con la visa en el super
pagué 8500 con naranja en la farmacia
compré ropa con mastercard, 35 mil
```

El bot automáticamente:
- Descuenta del saldo de la tarjeta
- Actualiza la utilización
- Categoriza el gasto

---

## 📱 Funcionalidades Actuales (MVP)

### ✅ Cuentas
- CRUD completo de cuentas (crear, editar, eliminar)
- Soporta múltiples tipos: efectivo, banco, tarjetas de crédito, crypto, billeteras digitales
- Soporta ARS, USD, BTC, ETH, USDT
- Balance en tiempo real
- Conversión automática a moneda base (ARS o USD)
- **Tarjetas de crédito**: límite, día de cierre, día de vencimiento, últimos 4 dígitos
- **Indicadores visuales**: utilización de crédito, disponible vs usado
- **Inversiones separadas**: no afectan el saldo del día a día

### ✅ Transacciones
- Gastos, ingresos, transferencias
- Categorización automática
- Búsqueda y filtros
- Cuotas (soporte básico)
- Gastos recurrentes (soporte básico)

### ✅ Categorías
- CRUD completo de categorías
- Categorías del sistema (no editables)
- Categorías personalizadas
- Organización por tipo (ingreso/gasto)
- Iconos personalizables

### ✅ Presupuestos
- Presupuestos mensuales por categoría
- Alertas cuando llegás al 80% y 100%
- Rollover opcional (sobra del mes pasa al siguiente)

### ✅ Inversiones
- Vista separada del flujo principal
- Acciones/CEDEARs
- Crypto (BTC, ETH, USDT)
- Plazos fijos
- FCI (Fondos Comunes de Inversión)
- Bonos
- Cauciones
- Cálculo de P&L (ganancia/pérdida)
- Actualización de precios on-demand
- **Cuentas investment**: trackean el patrimonio invertido sin molestar en el día a día

### ✅ Cotizaciones
- Dólar: Blue, Oficial, MEP, CCL
- Crypto: BTC, ETH, USDT
- Actualización cada 5 minutos
- Cache en memoria para performance

### ✅ Bot de Telegram
- Comandos formales: `/cuentas`, `/cotizaciones`, `/resumen`
- Lenguaje natural en español argentino
- Parseo inteligente con Gemini AI
- Dual-tier (Lite para registros, Full para análisis)

### ✅ Dashboard Web (PWA)
- Home con resumen de patrimonio (excluyendo inversiones)
- Widget de tarjetas de crédito con barras de progreso
- Charts (pie chart de gastos por categoría)
- Listado de transacciones con filtros
- Gestión de cuentas y categorías
- Portafolio de inversiones (vista separada)
- Análisis y estadísticas
- Instalable como app nativa
- Responsive (mobile-first)

---

## 🔄 Funcionalidades Pendientes (Roadmap)

### V2 — Próximos Pasos

#### 🎯 Prioridad Alta (4-6 semanas)

- [ ] **Parseo de fotos de tickets** (Gemini Vision)
  - Mandás foto del ticket → bot extrae monto, comercio, categoría
  - Confirmás o editás → se registra automáticamente

- [ ] **Cuotas automáticas**
  - "compré una tele en 12 cuotas de 50 mil"
  - Genera 12 transacciones futuras automáticamente
  - Trigger mensual que las marca como efectivas

- [ ] **Notificaciones programadas**
  - Resumen diario (22hs): gastos del día
  - Resumen semanal (lunes 9am): comparativa vs semana anterior
  - Resumen mensual (día 1, 10am): análisis completo con IA
  - Alerta de presupuesto (80%, 100%)
  - Alerta de vencimiento de inversiones (3 días antes)

- [ ] **Charts avanzados**
  - Evolución mensual (line chart histórico)
  - Flujo de caja (cashflow)
  - Distribución por cuenta (donut)
  - Performance de inversiones (line chart con markers)
  - Comparativa año vs año

- [ ] **Export CSV/PDF**
  - Transacciones a CSV (para Excel)
  - Reporte mensual en PDF (con charts)
  - Backup completo en JSON

- [ ] **Categorías custom**
  - Crear/editar/eliminar desde la app
  - Asignar íconos y colores

- [ ] **Editar/eliminar transacciones desde app**
  - Por ahora solo creás, no editás

#### 🎯 Prioridad Media (2-3 meses)

- [ ] **Resumen inteligente de tarjetas**
  - Cálculo automático del monto a pagar según fecha de cierre
  - Notificación días antes del vencimiento
  - Detalle de consumos del período

- [ ] **Análisis IA mensual automático**
  - Día 1 de cada mes: análisis profundo con Gemini Flash
  - Insights: en qué gastaste más, comparativa, sugerencias de ahorro

- [ ] **Import desde otras apps**
  - CSV de Gasti, Money Manager, Wallet
  - Resumen de tarjeta (foto → OCR → batch insert)

- [ ] **Proyecciones futuras**
  - "Si seguís gastando así, llegás a fin de mes con $X"
  - Proyección de ahorro a 3-6 meses

- [ ] **Detección de anomalías**
  - "Gastaste 3x más en delivery que tu promedio"
  - ML básico con TensorFlow.js

- [ ] **Geolocalización**
  - Auto-detectar comercio por ubicación
  - Mapa de gastos (heatmap)

- [ ] **Rate limiting y monitoring**
  - Rate limiting en APIs (1 req/seg por usuario)
  - Error tracking (Sentry free tier)
  - Logs estructurados (Pino)
  - Monitoring (Vercel Analytics free)

#### 🎯 Prioridad Baja (futuro)

- [ ] **Multi-user**
  - Compartir cuentas con pareja/familia
  - Permisos granulares (read/write/admin)

- [ ] **Sincronización bancaria**
  - Scraping de home banking (muy complejo)
  - Import automático desde email (Gmail API)

- [ ] **Gamification**
  - Metas de ahorro
  - Streaks (días sin gastar)
  - Logros (badges)

- [ ] **Backup automático**
  - Backup diario en Supabase Storage
  - Restore desde backup

---

## 🛠️ Desarrollo Local (para contribuidores)

### Setup Rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar .env.local (ver sección anterior)
cp .env.example .env.local

# 3. Correr en desarrollo
npm run dev
```

### Webhook Local con ngrok

Si querés probar el bot en local:

```bash
# Terminal 1: Correr ngrok
ngrok http 3000
# Output: Forwarding https://abc123.ngrok.io -> http://localhost:3000

# Terminal 2: Configurar webhook
NEXT_PUBLIC_APP_URL=https://abc123.ngrok.io npm run telegram:webhook

# Terminal 3: Correr Next.js
npm run dev
```

Ahora el bot funciona en local.

### Testing del Bot sin Telegram

```bash
# Correr script de test local
npm run test:bot
```

Esto simula el bot con un contexto mock y muestra el output JSON sin necesitar Telegram.

---

## 🔐 Seguridad

### ✅ Implementado

- **Row Level Security (RLS)** en todas las tablas
  - Cada usuario solo ve sus datos
  - Policies estrictas en `users`, `accounts`, `transactions`, `investments`, `budgets`
  - Solo `exchange_rates` es pública (lectura)

- **Auth con Magic Link** (sin contraseña)
  - Supabase Auth maneja todo
  - Email verification automática

- **Service Role Key** nunca expuesta
  - Solo se usa en API routes server-side
  - NUNCA en el cliente

- **Webhook validado**
  - Telegram envía secret token en header
  - Vercel valida antes de procesar

### ⚠️ Pendiente (V2)

- [ ] Rate limiting en API routes (1 req/seg por usuario)
- [ ] CSRF tokens en mutations
- [ ] Error tracking (Sentry)
- [ ] Logs estructurados (no console.log)
- [ ] Sanitización de inputs (prevenir XSS)

---

## 🐛 Troubleshooting

### Bot no responde

**Verificar webhook:**

```bash
curl https://api.telegram.org/bot<TU_TOKEN>/getWebhookInfo
```

**Output esperado:**

```json
{
  "ok": true,
  "result": {
    "url": "https://zarix-tu-usuario.vercel.app/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "max_connections": 40
  }
}
```

**Si el URL está mal:**

```bash
npm run telegram:webhook
```

**Ver logs en Vercel:**

1. Vercel Dashboard → tu proyecto → `Logs`
2. Filtrá por `/api/telegram/webhook`
3. Deberías ver los requests de Telegram

---

### Cotizaciones no cargan

**CriptoYa está caído (pasa seguido):**
- Esperá 5-10 minutos
- El app muestra el último valor cacheado

**CoinGecko rate limit:**
- Esperá 1 minuto
- Tier gratuito: 10-30 calls/min

**Ver en consola:**

```bash
curl https://criptoya.com/api/dolar
curl https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd
```

---

### Login no funciona

**Verificar variables en Vercel:**

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**Verificar Supabase Auth:**

1. Supabase Dashboard → `Authentication` → `Email Templates`
2. Confirmá que el template de magic link esté activo
3. Revisá spam en tu email

---

### Deploy falla en Vercel

**Error común: "Module not found: crypto"**

Ya está arreglado. Las API routes usan Node.js runtime (no Edge) porque `telegraf` y Supabase necesitan módulos de Node.

**Error: "Dynamic server usage"**

Ya está arreglado. Las rutas que usan `cookies()` están marcadas con `export const dynamic = 'force-dynamic'`.

**Ver logs de build:**

```bash
Vercel Dashboard → Deployments → clickeá en el deployment → Build Logs
```

---

### PWA no se instala en iPhone

1. Usá **Safari** (no Chrome)
2. Verificá que estés en la URL de producción (no localhost)
3. El archivo `manifest.json` debe ser accesible: `https://tu-app.vercel.app/manifest.json`

---

## 🧪 Testing (TODO en V2)

### Unit Tests

```bash
npm run test
```

### E2E Tests

```bash
npx playwright install
npm run test:e2e
```

### Manual Testing Checklist

- [ ] Login con magic link
- [ ] Crear cuenta
- [ ] Registrar gasto desde bot
- [ ] Ver gasto en app web
- [ ] Ver cotizaciones actualizadas
- [ ] Crear presupuesto
- [ ] Ver alerta de presupuesto
- [ ] Crear inversión
- [ ] Ver P&L del portafolio

---

## 📈 Optimización de Performance

### Cache Strategy

**1. Exchange Rates (5 min TTL)**
```typescript
// lib/services/cotizaciones.ts
const cache: Record<string, CachedRate> = {};
const CACHE_TTL = 300_000; // 5 min
```

**2. Next.js Cache (Server Components)**
```typescript
// app/(authenticated)/dashboard/page.tsx
const accounts = await accountsService.list(userId);
// Next.js cachea automáticamente con revalidate: 300
```

**3. Service Worker (Offline)**
```javascript
// public/sw.js
// Cachea assets estáticos (HTML, CSS, JS, íconos)
```

### Query Optimization

**N+1 Prevention:**
```typescript
// ✅ BUENO: una query con JOIN
const transactions = await supabase
  .from('transactions')
  .select('*, category:categories(name, icon), account:accounts(name)')
  .eq('user_id', userId);

// ❌ MALO: N+1 queries
const transactions = await supabase.from('transactions').select('*');
for (const tx of transactions) {
  const category = await supabase.from('categories').select('*').eq('id', tx.category_id);
}
```

**Índices en la DB:**
```sql
-- Todas las queries rápidas con índices compuestos
CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX idx_accounts_user_active ON accounts(user_id, is_active);
CREATE INDEX idx_investments_user_type ON investments(user_id, type);
```

---

## 🎯 Decisiones Técnicas

### ¿Por qué Next.js y no Django?

**Pro Next.js:**
- Deploy en Vercel serverless → $0/mes fijo
- Edge functions → latencia ultra-baja
- PWA out-of-the-box
- TypeScript full-stack (menos context switch)
- React Server Components (performance)

**Con Django:**
- Necesitarías servidor 24/7 (Railway $5/mes, Fly.io $5/mes)
- Más latencia (sin edge)
- Frontend separado (complejidad extra)
- Deploy más complicado

**Conclusión:** Para proyecto personal con $0 de budget, Next.js + Vercel es superior.

---

### ¿Por qué Gemini y no Claude/GPT?

**Costo comparativo (1M tokens input):**
- Gemini Flash-Lite: $0.018 (el más barato)
- Gemini Flash: $0.075
- GPT-4o mini: $0.15 (2x más caro)
- Claude Haiku: $0.25 (3x más caro)

**Calidad:** Gemini Flash es excelente para español rioplatense y parseo de finanzas.

**Conclusión:** Gemini es 10x más barato que la competencia y la calidad es comparable.

---

### ¿Por qué Supabase y no Firebase?

**Supabase pros:**
- PostgreSQL real (queries complejos, joins, triggers, functions)
- Row Level Security nativo
- Tier gratuito más generoso (500MB DB)
- Open source (self-hosteable)
- SQL directo (control total)

**Firebase pros:**
- Mejor para real-time (WebSockets)
- SDK más maduro en mobile

**Conclusión:** Necesitamos queries relacionales complejos y triggers → PostgreSQL es mejor.

---

### ¿Por qué Telegram y no WhatsApp?

**Telegram pros:**
- API oficial gratuita e ilimitada
- Webhooks nativos (no scraping)
- Bots first-class citizens
- Sin restricciones de rate limiting

**WhatsApp cons:**
- API de Meta: requiere Business account verificada
- Rate limiting estricto
- Costo por mensaje
- Proceso de aprobación largo

**Conclusión:** Telegram es 100x más fácil y 100% gratis.

---

## 💡 Arquitectura y Flujos

### Flujo: Registrar Gasto vía Bot

```
1. Usuario en Telegram: "gasté 5000 en el super"
   ↓
2. Telegram API → POST /api/telegram/webhook
   ↓
3. Bot handler extrae mensaje y chat ID
   ↓
4. Consulta DB: obtiene cuentas, categorías, resumen del mes
   ↓
5. Gemini Flash-Lite parsea el mensaje con ese contexto
   ↓
6. Gemini responde JSON:
   {
     "action": "create_transaction",
     "transaction": {
       "type": "expense",
       "amount": 5000,
       "currency": "ARS",
       "account": "Efectivo ARS",
       "category": "Comida",
       "description": "Super"
     },
     "response": "Listo, registré $5000 en Comida"
   }
   ↓
7. transactionsService.create() inserta en DB
   ↓
8. Trigger SQL actualiza accounts.balance automáticamente
   ↓
9. Bot responde: "Listo, registré $5000 en Comida desde Efectivo ARS. Nuevo saldo: $5000"
   ↓
10. Usuario abre la app web → ve el movimiento inmediatamente
```

---

### Flujo: Dashboard Render

```
1. Usuario abre /dashboard
   ↓
2. Next.js Server Component ejecuta 4 queries en paralelo:
   - accountsService.list()
   - accountsService.getTotalBalance()
   - transactionsService.list({ limit: 5 })
   - cotizacionesService.getAllQuotes()
   ↓
3. Service layer hace queries optimizados a Supabase
   - Usa select_related para joins
   - Aplica RLS automáticamente (auth.uid())
   ↓
4. Cotizaciones usa cache en memoria (5 min TTL)
   ↓
5. Next.js cachea results (revalidate: 300s)
   ↓
6. Server-side render → envía HTML completo al cliente
   ↓
7. Cliente recibe página completa en ~200-500ms
   ↓
8. Recharts renderiza charts client-side
```

---

### Arquitectura de Capas

```
┌─────────────────────────────────────────┐
│         USUARIO FINAL                    │
│  📱 iPhone PWA  ↔  🤖 Telegram Bot      │
└─────────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────┐
│      VERCEL (Next.js Serverless)        │
│  ┌─────────────┐  ┌──────────────────┐ │
│  │  Frontend   │  │   API Routes     │ │
│  │  (React)    │  │   (Node.js)      │ │
│  └─────────────┘  └──────────────────┘ │
└─────────────────────────────────────────┘
      │                      │
      ↓                      ↓
┌──────────────┐  ┌──────────────────────┐
│   SUPABASE   │  │   EXTERNAL APIs      │
│  PostgreSQL  │  │  • CriptoYa (dólar)  │
│  Auth        │  │  • CoinGecko (crypto)│
│  Storage     │  │  • Gemini AI (NLP)   │
│  RLS         │  │  • Telegram API      │
└──────────────┘  └──────────────────────┘
```

---

## 📊 Estimación de Almacenamiento

| Tabla              | Tamaño/Row | Rows/Año | Total/Año |
| ------------------ | ---------- | -------- | --------- |
| users              | ~300 B     | 1        | 300 B     |
| accounts           | ~500 B     | 10       | 5 KB      |
| **transactions**   | ~800 B     | 600      | **480 KB**|
| categories         | ~200 B     | 30       | 6 KB      |
| budgets            | ~300 B     | 12       | 3.6 KB    |
| investments        | ~500 B     | 20       | 10 KB     |
| exchange_rates     | ~200 B     | 365      | 73 KB     |
| **TOTAL / AÑO**    |            |          | **~628 KB**|

**Proyección:**
- **5 años**: ~3 MB (99% de margen en tier free de 500MB)
- **Peor caso** (power user, 2000 txs/año): ~10 MB/año → 50 MB en 5 años (90% margen)

**Conclusión:** El tier gratuito de Supabase te alcanza para **décadas** de uso.

---

## 🔄 Deployments Automáticos

Vercel deployea automáticamente cada vez que hacés push a `main`:

```bash
# Hacer cambios
git add .
git commit -m "feat: agregar presupuestos avanzados"
git push

# Vercel detecta el push y deployea en ~2-3 min
# Te notifica por email y en el dashboard
```

**Preview Deployments:**

Si pusheas a un branch que no es `main`, Vercel crea un preview deployment con URL única para testing.

---

## 📱 Instalar PWA en iPhone (Detallado)

### Paso 1: Abrir en Safari

1. Abrí **Safari** (tiene que ser Safari, Chrome no soporta PWA en iOS)
2. Andá a: `https://zarix-tu-usuario.vercel.app`

### Paso 2: Agregar a Home Screen

1. Tocá el botón de **Compartir** (cuadrado con flecha ↑) en la barra inferior
2. Scroll hacia abajo en el menú
3. Tocá `Agregar a pantalla de inicio`
4. (Opcional) Editá el nombre: `Zarix`
5. Tocá `Agregar` arriba a la derecha

### Paso 3: Abrir la App

1. Volvé al home screen
2. Vas a ver el ícono de Zarix
3. Tocá para abrir

**Diferencia con Safari:**
- ✅ Pantalla completa (sin barra de navegación)
- ✅ Ícono en el dock
- ✅ Splash screen al abrir
- ✅ Funciona offline (cache)

---

## 💬 Ejemplos de Uso del Bot

### Caso 1: Registrar gastos del día

```
Usuario: gasté 500 en el kiosco
Bot: ✅ Registré $500 en Comida desde Efectivo ARS. Nuevo saldo: $9,500

Usuario: uber a capital, 8500
Bot: ✅ Registré $8,500 en Transporte desde Efectivo ARS. Nuevo saldo: $1,000

Usuario: cargué nafta 15 lucas con la visa
Bot: ✅ Registré $15,000 en Transporte desde Visa. Nuevo saldo: -$15,000
```

### Caso 2: Cobrar sueldo

```
Usuario: me depositaron el sueldo, 850 lucas en el banco
Bot: ✅ Registré $850,000 como Ingreso en Sueldo → BBVA. Nuevo saldo: $850,000
```

### Caso 3: Comprar dólares

```
Usuario: compré 200 verdes a 1280 con mercado pago
Bot: ✅ Transferí $256,000 ARS → $200 USD (tipo: 1280). Saldos actualizados.
```

### Caso 4: Consultar gastos

```
Usuario: cuánto gasté este mes?
Bot: 📊 RESUMEN DE MARZO
💸 Gastos: $145,300
💰 Ingresos: $850,000
📈 Balance: +$704,700

Top categorías:
1. 🍔 Comida: $45,000
2. 🚗 Transporte: $38,500
3. 🏠 Hogar: $28,000
```

### Caso 5: Análisis con IA

```
Usuario: en qué estoy gastando más?
Bot: [Usa Gemini Flash]

🧠 ANÁLISIS DE GASTOS

Este mes gastaste más en:

1. 🍔 Comida: $45,000 (31%)
   • 60% es delivery/salidas
   • Podrías ahorrar $15k cocinando más en casa

2. 🚗 Transporte: $38,500 (26.5%)
   • Uber/Cabify: $28k
   • Considerá SUBE para viajes cortos

3. 🏠 Hogar: $28,000 (19.3%)
   • $8k en limpieza
   • Normal para tu histórico

💡 Sugerencia: Reduciendo delivery y usando transporte público, podrías ahorrar ~$35k/mes.
```

---

## 📚 Base de Datos

### Tablas Principales

**users** → Perfil del usuario (extend Supabase Auth)
```sql
id, email, full_name, telegram_chat_id, preferred_currency, created_at, updated_at
```

**accounts** → Cuentas financieras
```sql
id, user_id, name, type, currency, balance, icon, color, is_active, sort_order
```
- Saldo materializado (actualizado por trigger)
- Soporte multi-moneda
- Presets: efectivo, banco, billetera digital, tarjeta, crypto, investment

**transactions** → Movimientos financieros
```sql
id, user_id, account_id, type, amount, currency, category_id, description, 
transaction_date, exchange_rate, metadata, is_recurring, installment_*
```
- Tipos: expense, income, transfer
- Trigger automático actualiza `accounts.balance`
- Soporte de cuotas y recurrentes

**categories** → Sistema + custom
```sql
id, user_id, name, icon, type, is_system
```
- Categorías del sistema (visibles para todos)
- Usuarios pueden crear custom

**budgets** → Presupuestos mensuales
```sql
id, user_id, category_id, month, limit_amount, currency, rollover_enabled
```

**investments** → Posiciones de inversión
```sql
id, user_id, account_id, type, ticker, quantity, purchase_price, current_price, 
currency, purchase_date, maturity_date
```
- Tipos: stock, crypto, fixed_deposit, mutual_fund, bond, repo
- P&L calculado en app layer

**exchange_rates** → Cache de cotizaciones
```sql
id, from_currency, to_currency, rate, source, fetched_at
```
- Tabla pública (sin RLS en lectura)
- TTL de 5 min

### Triggers y Funciones

**update_account_balance** → Mantiene saldos consistentes
```sql
-- Cada INSERT/UPDATE/DELETE en transactions → actualiza accounts.balance
```

**create_installment_transactions** → Genera cuotas automáticas
```sql
-- Input: monto total, cantidad de cuotas, fecha inicio
-- Output: N transacciones insertadas (1 por mes)
```

**link_telegram_to_user** → Vincula Telegram con usuario
```sql
-- Input: user_id, telegram_chat_id
-- Output: actualiza users.telegram_chat_id
```

**get_budget_status** → Calcula estado de presupuestos
```sql
-- Input: user_id, month
-- Output: JSON con gastos vs límite por categoría
```

---

## 🧠 Cómo Funciona la IA (Gemini)

### Dual-Tier Strategy (Optimización de Costo)

**Gemini Flash-Lite** ($0.018/1M tokens) para:
- ✅ Parseo de gastos simples: "gasté 5000"
- ✅ Comandos: /cuentas, /cotizaciones, /resumen
- ✅ ~90% de los mensajes del bot

**Gemini Flash** ($0.075/1M tokens) para:
- 🧠 Análisis profundo: "en qué estoy gastando más?"
- 🧠 Sugerencias: "cómo puedo ahorrar?"
- 📸 Vision: parseo de fotos de tickets
- 🧠 Detección de anomalías
- 🧠 ~10% de los mensajes (keywords: análisis, sugerencias, comparar, proyectar)

### Contexto Enviado al Bot (FinancialContext)

```typescript
{
  user: {
    id: "uuid",
    email: "user@example.com",
    preferredCurrency: "ARS"
  },
  accounts: [
    { id: "uuid", name: "Efectivo ARS", balance: 10000, currency: "ARS" },
    { id: "uuid", name: "BBVA", balance: 50000, currency: "ARS" }
  ],
  categories: [
    { id: "uuid", name: "Comida", icon: "🍔", type: "expense" },
    { id: "uuid", name: "Transporte", icon: "🚗", type: "expense" }
  ],
  monthSummary: {
    totalExpenses: 120000,
    totalIncome: 800000,
    topCategories: [
      { name: "Comida", amount: 45000 },
      { name: "Transporte", amount: 28000 }
    ]
  }
}
```

**Total de tokens por request:** ~1300 tokens (contexto + mensaje)

**Costo por mensaje simple:** ~$0.00002 (dos milésimas de centavo)

---

## 🚧 Limitaciones Actuales (MVP)

### Lo que FALTA implementar:

- [ ] Editar/eliminar transacciones desde app web (solo creás)
- [ ] Editar/eliminar cuentas (solo creás)
- [ ] Parseo de fotos de tickets (V2)
- [ ] Notificaciones programadas (V2)
- [ ] Cuotas automáticas (trigger mensual) (V2)
- [ ] Charts avanzados (evolución histórica) (V2)
- [ ] Export CSV/PDF (V2)
- [ ] Análisis IA mensual automático (V2)
- [ ] Tests (0% coverage actual)
- [ ] Rate limiting en APIs
- [ ] Error tracking (Sentry)

### Lo que SÍ funciona:

- ✅ Crear cuentas desde app
- ✅ Crear transacciones desde bot (lenguaje natural)
- ✅ Ver saldos (app + bot)
- ✅ Ver cotizaciones (app + bot)
- ✅ Dashboard con charts básicos
- ✅ Presupuestos básicos
- ✅ Inversiones básicas (crear, ver P&L)
- ✅ PWA instalable
- ✅ Auth con magic link
- ✅ Soporte multi-moneda
- ✅ Conversión automática de monedas

---

## 🎯 Próximos Pasos (Después del Setup)

### Paso 1: Usar la app por 1-2 semanas

**Objetivo:** Registrar suficientes transacciones para tener datos reales.

**Cómo:**
- Registrá TODOS tus gastos vía bot (aunque sean chicos)
- Usá el bot como tu "libreta mental"
- Cada vez que gastás algo, mandá mensaje inmediatamente

**Tips:**
- No te preocupes por categorizar perfecto, el bot lo hace automáticamente
- Es más rápido escribir "super 5000" que abrir la app
- Si te equivocaste, por ahora editá manual en Supabase (en V2 vas a poder editar desde app)

---

### Paso 2: Analizar y ajustar

Después de 2 semanas:

```
/resumen
```

Mirá:
- ¿En qué categorías gastás más?
- ¿Tus cuentas están bien organizadas?
- ¿Falta alguna categoría?

**Preguntas al bot:**
```
en qué estoy gastando más?
cómo puedo ahorrar?
```

---

### Paso 3: Configurar presupuestos

En la app web:
1. Andá a `Presupuestos` (en el menú, si está habilitado)
2. O editalos directo en Supabase: tabla `budgets`

**Ejemplo:**
- Comida: $80,000/mes
- Transporte: $50,000/mes
- Salidas: $40,000/mes

El bot te alerta cuando pasás el 80% y 100%.

---

### Paso 4: Agregar inversiones

Si tenés inversiones (crypto, acciones, plazos fijos):

En la app web, andá a `Inversiones` y agregá:
- Tipo (stock, crypto, fixed_deposit, etc.)
- Ticker (ej: BTC, GGAL)
- Cantidad
- Precio de compra
- Fecha de compra

El app calcula el P&L automáticamente.

---

### Paso 5: Implementar V2 features

Una vez que la app funcione bien y tengas suficientes datos, implementá:

**Prioridad 1: Parseo de fotos**
- Mandás foto del ticket → bot extrae monto y categoría
- Código: ya tenés el handler de `photo` en `lib/telegram/bot.ts`
- Solo falta refinar el prompt y testear

**Prioridad 2: Notificaciones programadas**
- Necesitás un cron job en Vercel (o usar Supabase Edge Functions)
- Código: crear `/api/cron/daily-summary` que recorra usuarios y envíe resumen

**Prioridad 3: Cuotas automáticas**
- Ya tenés la función SQL `create_installment_transactions`
- Solo falta el trigger mensual que las active

**Prioridad 4: Charts avanzados**
- Agregar más charts con Recharts en `/analysis`
- Evolución histórica (line chart)
- Flujo de caja (bar chart)

**Prioridad 5: Export CSV/PDF**
- API route `/api/export/transactions` que genere CSV
- Usar librería como `jspdf` para PDFs con charts

---

## 🧪 Testing (TODO)

### Para implementar tests:

```bash
# 1. Instalar Vitest
npm install -D vitest @vitest/ui

# 2. Instalar React Testing Library
npm install -D @testing-library/react @testing-library/jest-dom

# 3. Instalar Playwright (E2E)
npm install -D @playwright/test
npx playwright install
```

### Ejemplo de test (services)

```typescript
// lib/services/__tests__/transactions.test.ts
import { describe, it, expect } from 'vitest';
import { transactionsService } from '../transactions';

describe('TransactionsService', () => {
  it('should create expense and update account balance', async () => {
    // Mock Supabase client
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: {...}, error: null })
      })
    };

    const result = await transactionsService.create(mockSupabase, {
      account_id: 'acc-1',
      type: 'expense',
      amount: 5000,
      currency: 'ARS',
      category_id: 'cat-1'
    });

    expect(result.error).toBeNull();
    expect(result.data.amount).toBe(5000);
  });
});
```

---

## 📞 Soporte y Debug

### Ver Logs en Vercel

1. Vercel Dashboard → tu proyecto
2. `Logs` (sidebar)
3. Filtrá por:
   - `/api/telegram/webhook` (mensajes del bot)
   - `/api/transactions` (creación de transacciones)
   - `/api/cotizaciones` (errores de APIs externas)

### Ver Logs en Supabase

1. Supabase Dashboard → `Logs`
2. `API` tab → requests a la DB
3. `Database` tab → queries SQL ejecutadas

### Debugging del Bot Local

```bash
# Crear script de test
npm run test:bot

# Output:
# 🤖 Testing Gemini Bot Locally
# User: gasté 5000 en el super
# Raw AI Response: {...}
# Parsed JSON: {"action":"create_transaction",...}
```

---

## 🔒 Seguridad y Privacidad

### ✅ Implementado

- **RLS (Row Level Security)** en todas las tablas
  - Cada usuario solo ve sus propios datos
  - Validación automática en cada query
  - Imposible ver datos de otros usuarios

- **Auth seguro**
  - Magic link sin contraseña (previene phishing)
  - Token JWT en cookie httpOnly
  - Supabase maneja refresh tokens automáticamente

- **API Keys protegidas**
  - Service role key NUNCA expuesta en cliente
  - Solo se usa en API routes server-side
  - Anon key es pública pero limitada por RLS

- **Webhook validado**
  - Secret token en header
  - Solo requests desde Telegram son aceptados

### ⚠️ Importante

**NUNCA commitees:**
- ❌ `.env.local` (ya está en `.gitignore`)
- ❌ Archivos con keys en el nombre
- ❌ Dumps de la base de datos con datos reales

**NUNCA expongas:**
- ❌ `SUPABASE_SERVICE_ROLE_KEY` en cliente
- ❌ `TELEGRAM_BOT_TOKEN` en cliente
- ❌ `GEMINI_API_KEY` en cliente (aunque es menos crítica)

---

## 🎨 Personalización

### Cambiar colores del tema

Editá `app/globals.css`:

```css
@layer base {
  :root {
    --primary: 217 91% 60%;    /* Azul principal */
    --secondary: 271 91% 65%;  /* Morado secundario */
  }
}
```

### Cambiar ícono de la PWA

1. Reemplazá `public/icon-192.png` y `public/icon-512.png`
2. Hacé redeploy

### Cambiar moneda preferida

Por default es ARS. Para cambiar a USD:

1. Supabase → tabla `users`
2. Editá tu usuario: `preferred_currency = 'USD'`

Ahora el dashboard muestra totales en USD y convierte todo automáticamente.

---

## 🌟 Tips y Best Practices

### 1. Creá cuentas específicas

En lugar de:
- ❌ "Banco"

Mejor:
- ✅ "BBVA Caja Ahorro"
- ✅ "BBVA Tarjeta Crédito"
- ✅ "Mercado Pago"

Esto te permite ver flujos de plata más claros.

---

### 2. Registrá gastos inmediatamente

No esperes a "acordarte" al final del día. Registrá en el momento:

```
acabás de pagar el uber → abrir Telegram → "uber 3500"
```

Lleva 5 segundos.

---

### 3. Usá descripciones útiles

```
✅ "almuerzo en La Continental con Marta"
❌ "comida"
```

Descripciones específicas te ayudan después a recordar y analizar.

---

### 4. Revisá tu `/resumen` semanalmente

```
/resumen
```

Esto te mantiene consciente de tus gastos. La awareness es el 50% del ahorro.

---

### 5. Configurá presupuestos realistas

No pongas presupuestos aspiracionales. Mirá tus gastos de los últimos 3 meses y poné un presupuesto 10-15% más bajo.

---

## 🔄 Workflow de Deployments

### Development

```bash
# 1. Crear feature branch
git checkout -b feature/parseo-fotos

# 2. Hacer cambios
# ... editar código ...

# 3. Testear localmente
npm run dev

# 4. Commit y push
git add .
git commit -m "feat: agregar parseo de fotos con Gemini Vision"
git push origin feature/parseo-fotos
```

Vercel crea un **preview deployment** automáticamente con URL única para testear.

### Production

```bash
# 1. Mergear a main (desde GitHub)
# O hacer push directo:
git checkout main
git merge feature/parseo-fotos
git push

# 2. Vercel deployea automáticamente
# 3. En 2-3 min está en producción
```

---

## 📊 Métricas de Éxito (para evaluar después de 1 mes)

### Uso del Bot

- ¿Qué % de transacciones registrás via bot vs app web?
- ¿Cuántos mensajes mandás al día?
- ¿El bot entiende bien tu español?

### Precisión

- ¿El bot categoriza correctamente tus gastos?
- ¿Elegir la cuenta correcta automáticamente?
- ¿Cuántas veces tuviste que corregir algo?

### Value

- ¿Sabés en qué gastás más gracias a la app?
- ¿Redujiste gastos en alguna categoría?
- ¿Preferís esto vs otras apps (Gasti, Money Manager)?

### Performance

- ¿El bot responde en <2 seg?
- ¿El dashboard carga rápido?
- ¿Tuviste algún downtime?

### Costo

- ¿Cuánto gastaste en Gemini API? (mirá en AI Studio)
- ¿Seguís dentro del tier gratuito de Vercel/Supabase?

---

## 🆘 FAQ

### ¿Puedo usar esto para mi empresa?

No, está diseñado para **finanzas personales**. Para empresa necesitás:
- Multi-user con roles
- Facturación (integración con AFIP)
- Reportes contables
- Auditoría

---

### ¿Mis datos están seguros?

Sí:
- ✅ Supabase tiene SOC 2 Type II compliance
- ✅ Row Level Security (RLS) asegura aislamiento
- ✅ Backups automáticos diarios en Supabase
- ✅ No vendemos ni compartimos datos (es tu instancia privada)

---

### ¿Puedo self-hostear?

Sí, Supabase es open source. Podés:

```bash
# Correr Supabase local con Docker
supabase start

# Deployar Next.js donde quieras (VPS, Railway, Fly.io)
```

Pero perdés el tier gratuito. En un VPS pagarías ~$5-10/mes.

---

### ¿Funciona sin internet?

**PWA sí** (cache básico de assets estáticos)
**Bot no** (necesita internet para enviar/recibir)
**Cotizaciones no** (requieren APIs externas)

En V2 se puede mejorar el offline support (guardar transacciones en IndexedDB y sincronizar después).

---

### ¿Puedo importar mis datos de otra app?

En V2 sí. Por ahora podés:

1. Exportar CSV desde tu app actual
2. Editar el CSV para que matchee el schema de `transactions`
3. Importar en Supabase: `Table Editor` → `transactions` → `Insert` → `CSV`

---

### ¿El bot funciona con voz?

No actualmente. En V2 se puede agregar:
- Telegram permite mandar mensajes de voz
- Telegram auto-transcribe a texto
- Gemini parsea el texto normalmente

---

### ¿Puedo cambiar el ícono del bot?

Sí, hablá con `@BotFather`:

```
/setuserpic
→ seleccioná tu bot
→ mandá una imagen cuadrada (512x512 recomendado)
```

---

## 🤝 Contribuir

Este es un proyecto personal, pero si querés contribuir:

1. Fork el repo
2. Creá un branch: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m "feat: agregar X"`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abrí un PR

**Áreas que necesitan ayuda:**
- Tests (0% coverage)
- Documentación de código
- Mejoras de UX/UI
- Optimización de prompts
- Features de V2

---

## 📜 Licencia

**Uso personal.** No redistribuir sin permiso.

Si querés usar esto como base para tu propio proyecto, adelante, pero:
- No lo vendas
- No lo ofertés como servicio
- Dá crédito si lo compartís

---

## 🙏 Créditos

**APIs gratuitas:**
- [CriptoYa](https://criptoya.com) - Cotizaciones dólar argentino
- [CoinGecko](https://www.coingecko.com) - Cotizaciones crypto

**Stack:**
- [Next.js](https://nextjs.org) - Framework web
- [Supabase](https://supabase.com) - Backend as a Service
- [Vercel](https://vercel.com) - Hosting
- [Telegram](https://telegram.org) - Bot API
- [Google Gemini](https://ai.google.dev) - IA generativa

---

## 🚀 ¡Listo!

Si seguiste todos los pasos, ya tenés Zarix funcionando 🎉

**Próximos pasos:**
1. ✅ Usá la app por 1-2 semanas
2. ✅ Registrá todos tus gastos via bot
3. ✅ Analizá tus patrones de gasto
4. ✅ Configurá presupuestos
5. ✅ Implementá features de V2 según tus necesidades

**¿Dudas?** Revisá la sección de Troubleshooting o los logs en Vercel.

---

**Hecho con 💙 para el mercado argentino 🇦🇷**
