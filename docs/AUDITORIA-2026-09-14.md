# Auditoría integral de Zarix — 14 de septiembre de 2026

Zarix es una app de finanzas personales argentina y caso de TIF UAI. Se auditó el código local desde `d7b3219` y se implementaron correcciones en `audit/zarix-2026-09-14`. La revisión cubre arquitectura, identidad, consistencia financiera, dependencias, integración de mercados, caché/offline, interfaz y trazabilidad académica. No constituye una certificación de producción ni una prueba de ausencia de todos los defectos.

## Cambios implementados

| Área | Problema original | Resultado |
|---|---|---|
| Patrimonio | Errores de cuentas/portfolio se convertían en ceros y podían guardar snapshots parciales | Errores y cotizaciones inválidas impiden persistir un patrimonio falso; dashboard muestra indisponibilidad |
| Dashboard | Esperaba fuentes accesorias y volvía a consultar para persistir al visitar | Streaming con Suspense por sección; patrimonio puede aparecer antes de IPC/historial; captura diaria a cargo del cron |
| Proyección | Calendario del servidor, extrapolación de recurrentes y fechas de inicio ignoradas | Calendario argentino, gastos variables separados, ocurrencias según inicio/fin/frecuencia, pendientes de hoy sin doble conteo |
| Presupuestos | Sumaba remanentes ARS y USD como si fueran ARS | Totales separados por moneda, etiqueta aclara subconjunto mostrado |
| Privacidad | Ejes, posiciones y detalles seguían visibles; SSR ignoraba preferencia | SSR conservador y store compartido; importes/ejes/detalles se ocultan coherentemente |
| IPC y gráficos | Vista real podía ser nominal silenciosamente, rango Max solo365d | Referencia al último IPC publicado; vista deshabilitada sin datos; rangos1M/3M/1A sin ampliar datos arbitrariamente |
| Cotizaciones | Sin timeout en múltiples fuentes; valores/timestamps incorrectos | Timeouts, validación finita/positiva, timestamps proveedor, solicitudes compartidas |
| CoinGecko | Tres peticiones para BTC/ETH/USDT | Un lote: 3→1 llamadas en caché fría para esas tres monedas |
| Yahoo/Stooq | Hasta21 intentos ante caída total; Nasdaq sustituido por QQQ | Deadline compartido7s, concurrencia acotada; caída total1 intento; QQQ deja de sustituir otro instrumento |
| Data912 | Parser no leía pct_change; panel AR no reutilizaba integración | Parser corregido, respaldo del panel AR; caché conserva antigüedad |
| Caché de mercados | Bloques viejos aparecían frescos en siguiente lectura | stale y fechas sobreviven roundtrip DB; símbolos faltantes se conservan sin declararlos actuales |
| Cron precios | USDC/DAI se trataban como USDT; llamadas en serie | Precios por instrumento, lotes/concurrencia/deadlines y faltantes reportados |
| Offline | Snapshots y cola compartidos entre cuentas;4xx borraban borradores | Namespace por dueño, respuestas en vuelo descartadas al cambiar sesión, borradores preservados y cola no bloqueada por un400 |
| Reintento offline | Una respuesta perdida podía duplicar un gasto | UUID por solicitud y usuario, PK existente y recuperación del registro original ante concurrencia; sin migración |
| Exportación | Comillas de nombres rompían CSV; backup ocultaba errores | Encoder uniforme RFC4180 + protección de fórmulas; backup no presenta datasets fallidos como vacíos |
| Excel | Límite solo del ZIP comprimido | Preflight de bytes reales:256 entradas,8MiB por entrada,32MiB total; cuotas posteriores de filas/columnas y respuestas400/413 |
| Telegram | Bot propio sin chat podía resolver otra cuenta; código se consumía en dos pasos | Identidad ligada al dueño; canje atómico con código vigente y dueño esperado |
| Mercado Pago/IA | Identificador procesado podía diferir del firmado; cuota chat por usuario+IP | Se procesa solo ID firmado; cuota por usuario y validación runtime del mensaje |
| Dependencias/CI |18 alertas npm; Next14; audit no bloqueante | Next15.5.25,React19.3,Vitest4.1.11; npm audit0; Node22, lint/test/build y audit bloqueante |

Las cifras de llamadas se verifican con proveedores simulados y conteos; no equivalen a una medición de latencia productiva. La revisión del diseño mantuvo tokens y estructura existentes; corrigió legibilidad, privacidad, estados y controles necesarios.

## Decisión sobre APIs de mercado

Se mejoró el uso de las fuentes existentes. DolarAPI publica compra/venta y `fechaActualizacion`; CriptoYa documenta actualización por minuto y120 solicitudes/minuto; CoinGecko permite varios IDs y `include_last_updated_at`. Data912 ya estaba integrado: se reutiliza como respaldo argentino sin tratarlo como una fuente oficial con garantía de disponibilidad. Yahoo/Stooq continúan como fuentes de referencia; en Stooq la variación es apertura→cierre, distinta de cierre anterior, y la interfaz lo indica. El panel muestra «Referencia de mercado» y fecha, no promete tiempo real.

Fuentes primarias consultadas:
- [DolarAPI: contrato de dólares](https://dolarapi.com/docs/argentina/operations/get-dolares).
- [CriptoYa: documentación Argentina](https://docs.criptoya.com/argentina).
- [CoinGecko: precios por IDs y timestamps](https://docs.coingecko.com/reference/simple-price).
- [Data912: documentación y endpoints](https://data912.com/).
- [Next.js: guía de migración15](https://nextjs.org/docs/app/guides/upgrading/version-15) y [avisos de seguridad](https://nextjs.org/blog).
- [Mercado Pago: autenticidad de webhooks](https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/additional-content/your-integrations/notifications/webhooks).

No se contrataron proveedores nuevos. Una futura fuente bursátil contratada requiere evaluar cobertura BYMA/CEDEAR, licencia de redistribución, retraso, límites y costo; no basta comparar un precio puntual.

## Seguridad y revisión independiente

Ver [informe de seguridad](audit-2026-09-14/REPORT.md), [flujos verificados](audit-2026-09-14/FINDINGS-DETAIL.md) y [JSON validado](audit-2026-09-14/findings.json). Tres hallazgos confirmados: aislamiento custom Telegram, caché offline y expansión XLSX. Las referencias originales se verifican con `git show d7b3219:<archivo>`; el árbol actual incluye las correcciones. Dos revisores contrastaron diffs ajenos y se corrigieron sus bloqueos (offline/token expirado, cola inválida, errores400/413, recurrencia pendiente de hoy).

## Verificación

Baseline:14 archivos/132 tests, lint y tipado correctos. Estado final:29 archivos/209 tests aprobados (77 regresiones nuevas), lint y tipado aprobados; npm audit sin avisos conocidos y lockfile validado con npm ci --ignore-scripts --dry-run. Compilación de producción aprobada con Next.js 15.5.25. Se verifica sin secretos y con Supabase local de referencia ficticia, evitando escrituras reales. Navegador Chromium: demo pública crea un gasto sintético; componentes reales del dashboard se montan temporalmente con fixtures para comprobar desktop/móvil, privacidad, IPC y monedas. Esa página temporal no forma parte del producto final. Las pruebas SSR cubren máscara antes de hidratación.

## Límites y trabajo de despliegue

- No se verificaron políticas RLS/migraciones realmente aplicadas, configuración de Vercel, entrega Telegram, pagos ni recuperación de backup contra una base real. Los tests de servicios usan mocks explícitos; no se presentan como E2E productivo.
- No se afirma cumplir <2s, disponibilidad99,5% ni cobertura total. Los resultados históricos del12/08 permanecen fechados; requieren nuevas mediciones autenticadas en entorno representativo.
- Las funciones con service role siguen requiriendo scope de usuario manual. No se realizó una migración global de autorización ni cambios de esquema remoto.
- La caché por proceso y el rate limit no son distribuidos. El cron puede reportar tareas incompletas al alcanzar deadline: monitorear esas alertas y evaluar lotes durables si crece la cartera.
- Persisten precios históricos cuando se pide skipQuoteRefresh y aproximación existente de stablecoins a USD para ciertas valoraciones; referencias no son precios de ejecución garantizados.
- Backups de datasets secundarios todavía dependen de límites PostgREST; la exportación de movimientos limita10.000. Para certificar recuperación masiva hacen falta paginación completa y restore probado en una base aislada.
- La idempotencia offline usa la fila original como registro de deduplicación; si se elimina definitivamente y reaparece un borrador antiguo, puede recrearla. No se implementó una tabla de tombstones.
- Los borradores legacy sin dueño quedan conservados pero no sincronizados automáticamente. Borradores inválidos nuevos se preservan; todavía no hay editor de recuperación dedicado.
- El preflight XLSX limita memoria de expansión; límite de filas se comprueba después del parse de XML. No es un sandbox de documentos.

Revisar configuración/migraciones existentes y ejecutar pruebas con cuenta de prueba antes de publicar esta rama. El informe distingue evidencia local de operaciones todavía no verificadas.

## Evidencia visual

[Dashboard desktop (fixtures)](audit-2026-09-14/zarix-dashboard-desktop.png) · [Móvil](audit-2026-09-14/zarix-dashboard-mobile.png) · [Móvil privado](audit-2026-09-14/zarix-dashboard-mobile-private.png). Capturas de componentes reales con datos sintéticos, no de una cuenta productiva.

## Tamaño de JavaScript informado por Next build

| Ruta / métrica | Baseline Next14 | Build Next15 revisado | Interpretación |
|---|---:|---:|---|
| Dashboard: First Load JS |287kB|277kB|10kB menos de carga inicial estimada|
| Inversiones: First Load JS |168kB|166kB|2kB menos|
| Demo: First Load JS |99,5kB|109kB|9,5kB más tras actualización del runtime|
| Compartido global |87,7kB|103kB|Mayor runtime base; no afirmar reducción global en todas las rutas|

Son estimaciones del bundler sobre builds con configuración local equivalente, no mediciones de descarga móvil, memoria ni latencia productiva. La mejora principal verificable de eficiencia está en consultas evitadas, batching y límites de espera, no en prometer porcentajes de velocidad sin un backend representativo.
