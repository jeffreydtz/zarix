# Verificación técnica aislada del 9 de octubre de 2026

## Estado de entrega

**Entrega técnica parcial, PR en borrador. No constituye aceptación integral ni autorización de despliegue.** El alcance conserva exactamente CU001–CU004. Las pruebas de SQL y los dobles explícitos no sustituyen los recorridos autenticados UI→API→DB, proveedores de prueba reales ni una recuperación completa de Supabase Auth/Storage.

El punto de partida remoto es `ed894431968775dba1d9ba01df99d9a442407865`. Los documentos académicos anteriores y sus resultados históricos se preservan. La evidencia nueva está en [evidence/technical-20261009](evidence/technical-20261009/). `verification.json` identifica los hashes de todos los archivos ejecutables comprobados, comandos exactos, entorno, fechas, códigos de salida y estabilidad del código durante la corrida. La revisión publicada se identifica en `publication.json`, agregado tras crear el commit de código.

## Resultado agregado de la revisión publicada

Corrida final 04:41–04:43 UTC, con fuentes estables (SHA256 del manifiesto `060b8b3ef1570b179c42c6e28a87cde54cb20ca8b5bf850c85468f547aabdb44`):

- PASS: instalación limpia, TypeScript, lint, build y 668/668 pruebas Vitest en 67 archivos.
- PASS: 220 comprobaciones SQL/recuperación: 28 saldos, 11 gastos compartidos, 18 límites, 25 operaciones durables, 10 importación y 128 esquema completo/restore. Los comandos duplicados del agregado no se cuentan dos veces.
- PASS: replay de 26 migraciones después del baseline vacío; comparación de 28 tablas pobladas tras restauración en otra instancia sintética. No incluye Auth/Storage reales.
- Cobertura de 33 archivos instrumentados: líneas 61,59%; sentencias 59,12%; funciones 55,52%; ramas 57,50%. No es cobertura total de la aplicación.
- Microbenchmark SQL: 100/100 observaciones sin error, p50 4,47 ms y p95 5,56 ms. No es latencia de navegador ni prueba de carga concurrente.
- FAIL pendiente: auditoría fresca con 7 entradas altas, 0 críticas, asociadas al aviso transitivo de braces.
- Matriz original de 273 casos: 168 PASS, 0 FAIL y 105 BLOCKED. Incluye 103 recorridos completos/integraciones no ejecutados y dos regresiones históricas (`RTV-034`, `RTV-038`) cuyo envío Telegram inline fue sustituido por outbox. Sus nombres originales ya no tienen una aserción exacta; las nuevas pruebas de outbox están aprobadas por separado y no se convierten silenciosamente en aceptación de esos casos antiguos.

La revisión independiente ejecutó 264 pruebas focalizadas adicionales al proceso de implementación y revisó las últimas correcciones de fuente. Ver [alcance de revisión](evidence/technical-20261009/independent-review.md). No deben sumarse esas pruebas al total final de 668 como si fueran casos únicos nuevos.

## Correcciones incluidas

- Recibos transaccionales persistentes con clave y huella de la solicitud para reintentos financieros; cuotas, transferencias, altas de inversiones, ventas y gastos compartidos atómicos. Repetir la misma clave recupera el resultado; reutilizarla con otro contenido se rechaza. Operaciones legítimas iguales conservan claves distintas. Las ventas verifican bajo lock que precio, moneda y tipo de costo no cambiaron desde el cálculo; una base desactualizada se rechaza sin escribir.
- Cola IndexedDB vinculada al propietario, borradores recuperables, resultado confirmado conservado hasta que la interfaz lo observe, revisión explícita de errores y protección ante cambio de sesión. La pérdida de respuesta no se presenta como éxito ni provoca una nueva operación silenciosa.
- Importación con lote persistente, contexto congelado y recibos por fila. Conserva éxito parcial verificable y diferencia reintentar un lote de iniciar uno nuevo. Las transferencias reutilizan las reglas de precisión monetaria.
- Outbox durable creado junto con el movimiento recurrente, con leases, reintentos y confirmación. Un endpoint cron independiente evita retrasar las operaciones financieras. La entrega de avisos es al menos una vez: un proveedor puede recibir un aviso duplicado tras una respuesta perdida.
- Límites propuestos Free de 3 cuentas habilitadas para nuevos movimientos y Premium de 20 cuentas habilitadas, 20 OCR y 40 IA por ciclo pago, aplicados en servidor. Historial y exportación se conservan al bajar de plan. Reserva/consumo se serializan; una escritura financiera de resultado incierto interrumpe el ciclo de herramientas IA y conserva la reserva bloqueada pendiente de conciliación; un reintento ordinario no la libera.
- Suscripción pagada acreditada mediante factura autorizada consultada y conciliada con usuario, preaprobación, importe, moneda y frecuencia. Una preaprobación sola no acredita pago. Cancelar conserva el período ya pagado; replays no extienden el ciclo.
- Grants y RPC explícitos, referencias entre tenants, campos protegidos y rechazo de NaN/infinitos. Las constraints nuevas no validan ni reparan automáticamente datos históricos de una base existente.
- Las cotizaciones para conversiones conservan la fecha de la fuente y vencen por antigüedad; los cachés derivados no renuevan artificialmente esa fecha. El portafolio conserva la hora de fuente disponible y declara edad desconocida (null) si el adaptador no la entrega; no se afirma que todas las cotizaciones de mercado tengan un vencimiento comprobado. Timeouts de proveedores son acotados. El umbral de antigüedad puede rechazar datos de mercados cerrados; no se inventa un precio reciente.
- Exportación paginada de cinco tablas, con errores visibles y alcance declarado. Es una exportación personal sin snapshot transaccional, no un respaldo completo de esquema, Auth o Storage.

## Evidencia y reproducción

Desde una copia del commit publicado, Node 22–24 y npm:

```sh
npm ci
npm run test:technical
python3 scripts/build-technical-traceability.py
```

`test:technical` ejecuta instalación limpia, TypeScript, lint, cobertura, agregado SQL, build, auditoría fresca, regresiones SQL separadas, restauración aislada y microbenchmark. La auditoría se conserva como FAIL si encuentra vulnerabilidades, aunque no impide capturar el resto de la evidencia. Los logs y JSON se guardan en el directorio de evidencia. No ejecuta migraciones remotas, reset remoto, pagos ni despliegues.

La cobertura incluye módulos de riesgo seleccionados en `vitest.config.ts`; **no mide toda la aplicación**. Los resultados de componentes usan dobles de navegador/SDK cuando así lo indica la prueba. Los casos originales se relacionan por aserción exacta en `case-traceability.csv`; un caso completo de UI/API permanece BLOCKED aunque existan regresiones parciales aprobadas.

El [procedimiento SQL y recuperación](../../testing/isolated-database-recovery.md) describe el baseline vacío reconstruido, todas las migraciones en orden, usuarios A/B y el invitado, ambos perfiles de grants y una restauración física en otra instancia vacía. PGlite ejecuta PostgreSQL real, pero su esquema Auth es un fixture y no verifica JWT ni GoTrue. No se afirma compatibilidad probada del runtime nativo PostgreSQL 17 a partir de la corrida WASM PostgreSQL 18.

El microbenchmark mide consultas SQL seriadas con datos sintéticos y 100 observaciones. No demuestra 20 sesiones de navegador concurrentes, perfil de red canónico, SLA mensual ni latencia de dashboard.

## Proveedores reales y dobles

`public-quote-providers.json` registra lecturas HTTP públicas efectivas de CriptoYa, DolarApi y CoinGecko, con hash de respuesta y esquema observado. Yahoo respondió HTTP 429. Estas lecturas no completan la integración de la aplicación. MercadoPago, Gemini y Telegram se probaron con dobles explícitos; no había credenciales sandbox autorizadas disponibles. No se realizaron cargos, mensajes externos ni llamadas pagas.

## Bloqueos y siguiente ejecución necesaria

1. **Runtime aislado con sockets:** Supabase CLI oficial y binarios nativos verificados alcanzaron el inicio de PostgreSQL, pero el sistema negó crear sockets con EPERM, también tras la revisión de permisos. Se necesita un executor autorizado con Docker o runtime nativo compatible, o un proyecto Supabase exclusivamente de prueba ya autorizado. El harness `test:db:native` está preparado y validado sintácticamente; no está aprobado por ejecución.
2. **UI/API/Auth:** ejecutar los cuatro recorridos completos con dos usuarios normales y un invitado, incluyendo recarga, doble clic, sesión cambiada, reintento y rollback. Guardar evidencia exacta de navegador/API/DB y perfil de viewport/red.
3. **Proveedores sandbox:** aportar mediante el mecanismo seguro del executor la configuración de prueba de MercadoPago, Gemini y Telegram; verificar flujos reales sin dinero real. No colocar secretos en el repositorio, chat o reportes.
4. **Recuperación completa:** ensayar esquema/datos/roles/Auth y archivos de Storage en otro entorno vacío, con login y lectura de archivos posteriores. El dump sintético SQL no demuestra cobertura de archivos de Storage.
5. **Concurrencia y rendimiento:** ejecutar conexiones PostgreSQL independientes y carga autenticada canónica. La serialización en una instancia WASM no prueba carreras de múltiples sesiones.
6. **Operación:** el cron de outbox se conserva diario para no introducir un requisito de plan pago. Si se requiere menor latencia o más capacidad de entrega, definir un scheduler autorizado y medir su comportamiento antes del despliegue. El estado de conversaciones IA no garantiza orden total de turnos simultáneos.
7. **Dependencias:** conservar el resultado fresco de `dependency-audit.json`. La revisión encontró siete entradas altas derivadas de un aviso de braces, sin parche compatible publicado en ese momento. No se ejecutó `npm audit fix --force` ni se declara el repositorio libre de vulnerabilidades.

Las reglas comerciales son la implementación de la propuesta solicitada, no validación de mercado ni decisión de precio nueva. No se fabrican entrevistas, aceptación académica, firmas, aprobación humana ni evidencia de producción.

## Referencias técnicas

- [Supabase: runtimes Docker y nativo](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes)
- [Supabase: RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: backups y cobertura](https://supabase.com/docs/guides/platform/backups)
- [MercadoPago: authorized payments](https://www.mercadopago.com.ar/developers/en/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments)
- [Aviso transitivo braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
