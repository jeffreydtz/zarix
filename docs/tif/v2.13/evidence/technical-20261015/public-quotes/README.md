# Cotizaciones públicas — dos perfiles ejecutados

El 15/10/2026 se ejecutó el runner con una sesión Auth normal existente en cada perfil. **Dos respuestas200**, cada una con ocho filas FX nuevas concordantes en PostgreSQL (dieciséis en total), conservación byte-equivalente de todas las FX previas y hash exacto de las25 tablas públicas canónicas sin cambios. El caché de mercado quedó sin cambios en ambas ventanas exclusivas. La carga masiva anterior ya estaba detenida; no se superponen sus medidas con estas solicitudes.

- [Perfil real](real/public-quotes.json): CriptoYa, DolarAPI y CoinGecko configurados con sus URLs oficiales. Datos normalizados/frescura/procedencia y persistencia concordaron.
- [Fallback real](fallback-real/public-quotes.json): se observó [una respuesta503 local](fallback-real/e2e-fault-count.json) del doble de CriptoYa; la aplicación seleccionó DolarAPI real y persistió sus ocho tasas con fechas propias. CoinGecko conserva URL real.

Ambos usaron producto `bb2e8a6aa5de7f7f26ba745da67257b0f1f25e81`, BUILD_ID `QcXclgO6C0_ktQ5ac8YWh`, PIDs35669/36287 y la réplica E2E57321. Cada carpeta contiene el estado de propiedad del listener, perfil saneado y supervisor ejecutado; las claves quedan en archivos privados0600. Las paradas propias fueron confirmadas y se volvió al perfil original503 en otro Next. El Next anterior a estas pruebas ya estaba ausente tras la interrupción del canal; [recuperación observada](root-app-after-channel-recovery.json) distingue ausencia comprobada de una parada enviada.

**Alcance de transporte:** URL real configurada y procedencia declarada no acreditan un socket externo nuevo para cada respuesta. Next Data Cache puede persistir entre procesos, especialmente crypto en la segunda ventana. El endpoint no devuelve proveedor/origen para crypto; no se inventan. Estos PASS son de la ruta normal API→servicios→persistencia con URLs reales y fallback observado; no prueban todas las integraciones de mercado, cotizaciones de bolsa/EUR ni disponibilidad sostenida. No se usaron credenciales externas ni operaciones financieras.

La prueba usa la identidad A normal ya existente y una única petición `GET /api/cotizaciones` por perfil. No crea usuarios, credenciales, recursos externos ni operaciones financieras. Rechaza otros destinos que API/DB E2E `127.0.0.1:57321/57322` y aplicación `127.0.0.1:3000`. El conector Supabase ajeno no se usa.

El proceso Next debe coincidir con el PID y build del archivo privado de supervisor. Root utilizó un JSON `0600` con este formato, sin secretos:

```json
{
  "purpose": "isolated-public-quote-profile",
  "profile": "real",
  "providers": {
    "criptoya": "https://criptoya.com/api",
    "dolarapi": "https://dolarapi.com/v1",
    "coingecko": "https://api.coingecko.com/api/v3"
  },
  "buildId": "identificador-de-la-build",
  "nextPid": 12345,
  "maxRateAgeSeconds": 86400,
  "marketTimeoutMs": 8000
}
```

Para `fallback-real`, sólo la URL de CriptoYa cambia a un servidor loopback de fallo HTTP 503 explícito; DolarAPI y CoinGecko siguen con sus URLs reales. Ese 503 es un doble de prueba, nunca un fallo atribuido a CriptoYa real. El número y estado de llamadas al doble constan en los contadores publicados de cada perfil.

La [atestación independiente](review-attestation.json) contrasta sin conexiones los informes, fuentes, metadatos de proceso y ocho filas concordantes por perfil. No encontró defectos materiales; conserva los límites de caché y transporte descritos arriba.

```sh
node --check docs/tif/v2.13/evidence/technical-20261015/public-quotes/verify-public-quotes.mjs
# Sólo tras la liberación explícita de la ventana/perfil:
ZARIX_QUOTES_WINDOW_CONFIRM=post-load-exclusive \
ZARIX_QUOTE_PROFILE_FILE=/tmp/zarix-runtime-20261015/quote-profile.json \
ZARIX_PUBLIC_QUOTE_OUTPUT=/tmp/zarix-runtime-20261015/public-quotes-real \
node docs/tif/v2.13/evidence/technical-20261015/public-quotes/verify-public-quotes.mjs
```

## Oráculos derivados del código

- Auth verifica A con contraseña y `getUser`, con JWT `authenticated`. Se mantienen las credenciales en el archivo privado existente.
- Dólar: blue/oficial/mep/ccl, compra y venta finitas positivas, fechas propias de proveedor dentro del límite existente de 86400 segundos y hasta cinco minutos futuros. La ventana de observación usa inicio/fin de la solicitud. No se agrega una regla nueva de spread.
- Crypto: BTC/ETH/USDT, precios USD/ARS positivos y frescura equivalente. El timestamp superior corresponde a blue. No se afirma cobertura de Yahoo, EUR ni persistencia SQL de crypto por este endpoint.
- Proveniencia: `origin=provider` y proveedor CriptoYa/DolarAPI, o `origin=persisted` y proveedor nulo. Los nombres SQL `blue`/`mep` no identifican un proveedor externo.
- Persistencia: ocho pares venta/compra USD→ARS, con `source`, tasa convertida por PostgreSQL a escala 8 y la fecha propia de cada mercado. Se compara cada fila esperada con DB. Los IDs se leen sólo en memoria para distinguir ocho inserciones nuevas de cotizaciones ya presentes; el informe publica únicamente tasas normalizadas, fechas, cantidades y hashes.
- Integridad: todas las columnas de las 25 tablas públicas canónicas se leen sólo para sus hashes y cantidades antes/después; se calcula el hash sobre texto JSONB canónico de PostgreSQL antes de convertir números a JavaScript, preservando todos los dígitos NUMERIC. `exchange_rates` y `market_data_cache` se observan por separado. Las filas FX previas deben conservarse exactamente por ID y sólo ocho IDs nuevos concordantes prueban la inserción esperada. Los datos originales no se imprimen ni se guardan. La sesión Auth normal tiene efectos esperados en `auth.sessions`, fuera del hash público canónico. El caché de mercado debe permanecer igual en esta ventana exclusiva.

`getAllQuotes` combina dólar y tres crypto mediante `Promise.all`: puede persistir ocho filas de dólar y después devolver HTTP 500 si falla una crypto. Además, el servicio captura errores del INSERT. Por eso HTTP 200 y `origin=provider` no prueban por sí mismos una nueva escritura. Si las muestras ya existen, se conserva el historial y se informa `LIMITED`, sin borrar caché ni cambiar fechas para forzar una inserción.

Reiniciar Next vacía la caché en memoria; el Data Cache de Next puede persistir. Sin observación de transporte upstream, la prueba queda acotada a URLs reales configuradas y procedencia declarada de datos válidos, con posible caché. Crypto no devuelve campos de proveedor/origen; no se inventan. Las llamadas incidentales a proveedores de `/api/market-data` durante UI son evidencia separada y no sustituyen esta aceptación.
