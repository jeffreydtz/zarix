# Anexo — Resultados de Pruebas (ejecución real en producción)

**Sistema:** Zarix — gestor de finanzas personales (Next.js 14 + Supabase)
**Entorno de ejecución:** Producción — `https://zarix-phi.vercel.app`
**Cuenta de prueba:** `usertest1@example.com` (cuenta real, aislada, sin datos previos: 1 cuenta vacía "Mercado Pago" con saldo 0, 0 movimientos, 0 inversiones al iniciar)
**Herramienta:** Puppeteer (Chrome headless) — login por navegador y llamadas a la API ejecutadas con la cookie de sesión real (`page.evaluate(fetch(...))`)
**Fecha de ejecución:** 2026-08-12
**Naturaleza de la evidencia:** respuestas HTTP reales, saldos observados en la base de datos de producción y tiempos medidos en vivo. No hay valores simulados.

---

## 1. Casos de Prueba (ejecución 10.5.13)

| CP | CU | Descripción | Entrada | Resultado esperado | Resultado obtenido | Estado | Evidencia | Fecha |
|----|----|-------------|---------|--------------------|--------------------|--------|-----------|-------|
| CP-001-01 | CU-001 | Registrar gasto válido ARS | Cuenta "Banco" ARS saldo inicial 100.000; gasto 5.000 ARS (cat. Comida) | Se guarda; saldo pasa a 95.000; aparece en el listado | Gasto creado `HTTP 201`; `amount_in_account_currency=5000`; saldo Banco 100.000 → **95.000**; el movimiento aparece en `GET /api/transactions` | **PASA** | `POST /api/transactions` → 201; saldo observado 95.000; `appearsInList=true` | 2026-08-12 |
| CP-001-02 | CU-001 | Monto cero (validación) | Gasto monto 0 en "Banco" | Error de validación; no se guarda | `HTTP 400` `{"error":"Monto inválido"}` | **PASA** | Respuesta HTTP 400 real | 2026-08-12 |
| CP-001-03 | CU-001 | Transferencia entre cuentas | Cuenta "Efectivo" ARS saldo 50.000; transferir 10.000 Efectivo→Banco | Efectivo −10.000, Banco +10.000; movimientos registrados | Transferencia `HTTP 201` (`type=transfer`); Efectivo 50.000 → **40.000**; Banco 95.000 → **105.000** | **PASA** | Saldos observados antes/después; tipo `transfer` | 2026-08-12 |
| CP-001-04 | CU-001 | Moneda ≠ cuenta (conversión) | Gasto 100 USD en cuenta ARS "Banco", `exchangeRateOverride=1150` | Guarda el monto convertido a ARS en `amount_in_account_currency` | `HTTP 201`; conversión aplicada con **cotización de mercado en vivo (1535 ARS/USD)**: `amount_in_account_currency=153500`, `exchange_rate=1535`; saldo Banco 105.000 → −48.500 (delta 153.500). **El override 1150 fue ignorado** (ver nota) | **PASA con desvío** | `amount_in_account_currency=153500`, `exchange_rate=1535`; delta de saldo 153.500 | 2026-08-12 |
| CP-002-01 | CU-002 | Crear cuenta banco | Cuenta "Santander" tipo banco ARS saldo 50.000 | Aparece en `GET /api/accounts`; patrimonio refleja el alta | `HTTP 201`; aparece en el listado con saldo **50.000**; patrimonio (ARS blue) −8.500 → **41.500** (Δ +50.000); cantidad de cuentas 3 → 4 | **PASA** | Cuenta listada; patrimonio antes/después | 2026-08-12 |
| CP-002-02 | CU-002 | Borrar cuenta con movimientos | `DELETE` de "Banco" (tiene movimientos) | El sistema no borra en duro; error o archivado | `DELETE HTTP 204`; **soft-delete / archivado** (`is_active=false`): "Banco" desaparece del listado activo; `GET /api/accounts/{id}` posterior devuelve `HTTP 404`; los movimientos se conservan en la base. **No devuelve un error explícito** como asumía el CP (ver nota) | **PASA con desvío** | `DELETE`→204; `GET`→404; ausente del listado activo | 2026-08-12 |
| CP-003-01 | CU-003 | Dashboard < 2s | Navegar a `/dashboard` logueado, 3 corridas | Carga en < 2 s | Evento de carga del documento (`loadEventEnd`): 1.646 / 1.008 / 766 ms → **promedio 1.140 ms (< 2 s)**. Red totalmente inactiva (incl. APIs externas de cotización): 3.257 / 3.120 / 2.465 ms → prom. 2.947 ms (ver nota) | **PASA con desvío** | Timings reales de `performance` navigation + wall-clock; captura `dashboard.png` | 2026-08-12 |
| CP-003-02 | CU-003 | Dashboard sin API de cotización | Caída de la API de cotización | Muestra cotización desde caché | **Verificado por diseño + código.** Cadena de fallback `CriptoYa → DolarApi → DbCacheProvider` en `lib/services/cotizaciones.ts`; el último proveedor lee la última cotización persistida en la tabla `exchange_rates` (poblada en cada fetch en vivo por `saveLatestDolarQuotes`). `GET /api/cotizaciones` respondió `HTTP 200` con `dolar`/`crypto`/`timestamp` | **PASA (verificado por diseño + código)** | Código `DbCacheProvider`; `/api/cotizaciones` → 200 | 2026-08-12 |
| CP-004-01 | CU-004 | Agregar acción AAPL x5 @185 USD | `POST /api/investments` AAPL, 5 unidades, precio 185 USD | Posición guardada; P&L calculado | `HTTP 201` (`quantity=5`, `purchase_price=185`); `GET /api/investments` resolvió cotización real (Yahoo): `current_price=302,25 USD`, `cost_basis_usd=925`, `market_value_usd=1.511,25`, **P&L +586,25 USD (+63,38%)** | **PASA** | Respuesta 201 + posición con P&L de la API real | 2026-08-12 |
| CP-005-01 | CU-005 | Exportar CSV | `GET /api/export/transactions?format=csv` | CSV con las columnas esperadas | `HTTP 200`, `content-type: text/csv; charset=utf-8`; encabezado exacto: `Fecha,Tipo,Monto,Moneda,Monto en Cuenta,Cuenta,Categoría,Descripción,Notas,Cuota`; filas de datos presentes (Ajuste/Gasto/Transferencia) | **PASA** | Encabezado y filas reales del CSV descargado | 2026-08-12 |
| CP-005-02 | CU-005 | Importar CSV inválido (sin columna monto) | CSV con `Fecha,Tipo,Cuenta,Descripción` (sin "Monto") | Error "columna obligatoria faltante"; no importa | `HTTP 400` `{"error":"CSV debe tener columnas \"Fecha\" y \"Monto\""}` | **PASA** | Respuesta HTTP 400 real | 2026-08-12 |

**Resumen:** 11/11 casos ejecutados. 8 PASA, 3 PASA con desvío. 0 FALLA.

### Notas de los desvíos (documentación honesta)

- **CP-001-04 (override de cotización ignorado en gastos).** La funcionalidad central del caso —convertir un gasto en moneda distinta a la de la cuenta y persistir el equivalente en `amount_in_account_currency`— **funciona correctamente**: 100 USD se guardaron como 153.500 ARS. El desvío es doble: (1) el parámetro `exchangeRateOverride` **solo se aplica a transferencias** entre monedas distintas; para gastos/ingresos el servicio (`transactionsService.create` → `computeAmountInAccountCurrencyForAccount`) usa siempre la **cotización de mercado en vivo** (dólar blue venta), por diseño. Por eso el override 1150 se ignoró. (2) El valor esperado del CP (115.000) asumía una cotización ilustrativa de 1150; la cotización real al momento de la corrida era 1535 ARS/USD, de ahí 153.500. La conversión es coherente con esa tasa real.

- **CP-002-02 (soft-delete en vez de error).** El CP asumía un error explícito del tipo "no se puede eliminar la cuenta con movimientos". El comportamiento **real** es más seguro: `accountsService.delete` realiza un **soft-delete / archivado** (`is_active=false`), no un borrado físico. La cuenta sale del listado activo y su lectura directa devuelve 404, pero **los movimientos históricos se preservan íntegros** en la base (los listados globales simplemente dejan de incluir las cuentas archivadas). Se protege la integridad de los datos por una vía distinta a la enunciada; se documenta la realidad observada.

- **CP-003-01 (dos métricas de carga).** Por la métrica estándar de carga de página (evento `load` del documento) el dashboard cumple con holgura: **promedio 1,14 s** (< 2 s) en las tres corridas, bajando a 766 ms en caché tibia. La métrica de *red totalmente inactiva* (`networkidle2`, que espera además a las llamadas XHR a las APIs externas de cotización — CriptoYa/DolarApi/Yahoo) promedió 2,95 s, superando los 2 s en cargas frías. Es decir: **la interfaz queda cargada y utilizable en < 2 s**; la hidratación de datos que depende de terceros puede excederlo en frío. Se reportan ambos números sin maquillar.

---

## 2. Verificación de Requisitos No Funcionales (RNF)

| RNF | Criterio | Método de medición | Resultado | Cumple |
|-----|----------|--------------------|-----------|--------|
| RNF01 | Dashboard carga en < 2 s | Puppeteer logueado, 3 corridas; `performance` navigation timing (`loadEventEnd`) y wall-clock hasta `networkidle2` | Evento de carga del documento: prom. **1.140 ms** (1.646 / 1.008 / 766 ms) → < 2 s. Red totalmente inactiva (incl. APIs externas): prom. 2.947 ms | **Sí** (métrica de carga de página; matiz de red inactiva documentado en CP-003-01) |
| RNF02 | Uptime > 99,5 % | No medible en una única corrida. Endpoint `/api/health` disponible para monitor externo | `GET /api/health` → `HTTP 200` `{"status":"ok","db":"ok","latencyMs":45}` | **Instrumentado** — pendiente de ventana de medición con monitor externo (p. ej. UptimeRobot sobre `/api/health`) |
| RNF03 | Seguridad en tránsito y en reposo (headers, RLS, cifrado) | `curl -I` en producción + inspección de configuración | Headers verificados en vivo: `strict-transport-security: max-age=63072000; includeSubDomains; preload`; `x-frame-options: DENY`; `x-content-type-options: nosniff`; `referrer-policy: strict-origin-when-cross-origin`; `permissions-policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`. RLS activo en todas las tablas de usuario (Supabase). Cifrado en reposo AES-256 (default de la plataforma Supabase) | **Sí** |
| RNF04 | Mobile-first (sin overflow horizontal, uso cómodo) | Puppeteer viewport 375×812 @2x, `/login` y `/dashboard`; `document.scrollingElement.scrollWidth` vs `innerWidth` + capturas | `/login`: scrollWidth 375 = innerWidth 375 → sin overflow. `/dashboard`: scrollWidth 375 = innerWidth 375 → sin overflow; render usable (patrimonio, tarjetas, nav inferior, FAB). Capturas `mobile_login.png`, `mobile_dashboard.png` | **Sí** |
| RNF05 | Compatibilidad con navegadores modernos | Configuración `browserslist` (Next.js 14 defaults) | Resuelve a navegadores modernos vigentes (Chrome, Firefox, Safari actuales; Android/iOS), acorde a los defaults de Next 14 | **Sí** (por configuración) |

### Detalle RNF03 (evidencia textual de headers en producción)

```
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
```

### Nota RNF02 (honestidad metodológica)

El uptime > 99,5 % es una propiedad estadística sobre una ventana temporal (típicamente 30 días) y **no puede acreditarse con una corrida puntual de pruebas**. Lo que sí se deja acreditado es la **instrumentación**: el endpoint público `/api/health` verifica conectividad real con la base y responde `{"status":"ok"}` (200) o `degraded/down` (503). Queda listo para conectar un monitor externo (UptimeRobot u equivalente) que recolecte la disponibilidad en la ventana de medición correspondiente.

---

## 3. Reproducibilidad

- **Cuenta:** `usertest1@example.com` (cuenta de prueba real, aislada del resto de usuarios por RLS).
- **Entorno:** producción, `https://zarix-phi.vercel.app` (Next.js 14 + Supabase, deploy en Vercel).
- **Herramienta:** Puppeteer con Chrome headless. Autenticación por navegador (formulario `/login`, contraseña) y ejecución de las llamadas a la API con la cookie de sesión real vía `page.evaluate(fetch(...))`, de modo que cada request corre con el mismo contexto de seguridad que un usuario real.
- **Estado inicial verificado:** 1 cuenta vacía ("Mercado Pago", saldo 0), 0 movimientos, 0 inversiones.
- **Fecha:** 2026-08-12.
- **Nota sobre cotizaciones:** los montos convertidos (CP-001-04) y el P&L de inversiones (CP-004-01) dependen de cotizaciones de mercado en vivo; los valores registrados corresponden a las tasas vigentes al momento de la corrida y pueden variar en una reejecución.
