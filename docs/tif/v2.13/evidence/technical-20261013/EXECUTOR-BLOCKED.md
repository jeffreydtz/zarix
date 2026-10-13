# Retoma técnica ZARIX — 13/10/2026 — ejecución interrumpida

**Entrega parcial. No constituye aceptación integral, despliegue ni autorización de fusión.**
Se conserva exactamente CU001–CU004. No se usaron producción, datos reales, cobros reales, Matilda PDV ni recursos externos nuevos.

## Identidad y conservación

- Head remoto inspeccionado al comenzar y nuevamente antes de este registro: `b40feeed28d6e9ea6e8b0b2f112119e2435de1df`, PR #12 abierto, borrador y sin fusionar.
- Checkout aislado en la Mac: `Documents/Codex/2026-10-13/task/zarix`, rama `codex/tfi-v2-13-consistencia`.
- Commit **local, todavía no publicado**: `856fdf52f25604eeb741ad19ecea7455daa68557`, simulación de inversiones ya especificada por RF05/CU004. Otros cambios y evidencia quedaron en el árbol de trabajo sin consolidar.
- Se leyeron la entrega, la verificación 09/10, evidencia y matriz originales. No se modificaron documentos binarios académicos ni migraciones originales.
- Este commit remoto contiene solamente este registro. No publica ni acredita los cambios locales anteriores. Al recuperar el checkout habrá que integrar este commit documental conservando el commit local y todos los cambios; no usar reset destructivo ni force-push.

## Entorno efectivamente preparado

Mac arm64, macOS 27.0.1, Node 22.17.0 y npm 11.4.2. `npm ci` terminó correctamente (756 paquetes).
Git funciona seleccionando las Command Line Tools ya instaladas con `DEVELOPER_DIR=/Library/Developer/CommandLineTools`; no se aceptó la licencia pendiente de Xcode.

Supabase CLI oficial 2.120.0, artefacto darwin-arm64 verificado con checksums oficiales:
`3b8546cc61aeabab6fd1f68edc7f664ebdfa96bdd6a9b18d8d612708f430ae28`.

Se iniciaron dos stacks nativos temporales con `SUPABASE_HOME=/tmp/zarix-runtime/home`:
fuente API 127.0.0.1:54321/PG54322; destino API 127.0.0.1:55321/PG55322.
PostgreSQL/psql/pg_dump/pg_restore 17.11; Auth v2.197.0; PostgREST v16.4; Storage v1.79.36.
Ambos se comprobaron inicialmente sin tablas de aplicación, usuarios Auth ni objetos Storage.
Los sockets fallaron con EPERM en sandbox normal y funcionaron con el permiso de ejecución revisado.
No se instaló software global ni se creó acceso externo persistente.

Manifest y procedimiento saneados locales: `/tmp/zarix-runtime/runtime-manifest.json` y `README-runtime.md`.
Los status y env del stack son privados, modo 0600, y **no deben copiarse a Git, informes ni chat**.
Último estado observado: los stacks y Next local habían iniciado; la fuente tenía el bootstrap y datos sintéticos del segundo intento. Su estado actual requiere comprobación al reconectar.

## Resultados confirmados, sin sumar corridas solapadas

| Comprobación | Resultado y alcance |
| --- | --- |
| Instalación limpia | PASS, npm ci, Node compatible |
| Cola offline | Fix local de selección/alta del borrador en una transacción IndexedDB; dos regresiones concurrentes fallaban antes del fix |
| Durabilidad focalizada | 64/64 PASS; incluye RTV-034/RTV-038 reconciliadas explícitamente con outbox y cierre/reapertura de PostgreSQL WASM persistente. IndexedDB, transporte API y Telegram usan dobles explícitos |
| Simulación CU004 | 27/27 PASS; +10% sobre USD660 da726; −100% da0; valores inferiores/no finitos/desbordes rechazados; bonos VN100; sin escrituras. Aceptación E2E aún pendiente |
| Metadata FX | 116/116 pruebas focalizadas PASS y typecheck/lint PASS en la versión comprobada; fecha/proveedor ausentes no se fabrican, referencias de cuentas/portfolio separadas |
| Guardas de target nativo | 14/14 PASS, destinos loopback; pruebas no equivalen a aceptación de la app |
| Auth/DB nativos | Dos intentos con **13 grupos únicos PASS**, no26: dos registros/sign-ins normales, JWT alterados, grants/RLS, aislamiento, CRUD y transferencias con importes distintos/edición/borrado, token invitado inválido/revocado/replay y rollback compartido |
| Harness nativo íntegro | FAIL de ejecución: ambos intentos se interrumpieron en rollback de venta por ECONNRESET/status0; reproducción separada obtuvo SQL23514 esperado. No se afirma defecto SQL ni corrida íntegra aprobada |
| Advisors locales | Security, nivel error: sin hallazgos en la consulta ejecutada; no equivale a auditoría completa |
| Cotizaciones públicas | Cuatro GET efectivos CriptoYa/DolarApi/CoinGecko/Yahoo HTTP200 y JSON observado. Es lectura pública, no integración UI/API de la aplicación |
| Auditoría fresca | FAIL completo:7 altas,0 críticas, único aviso transitivo braces. PASS filtrado omit=dev:0 hallazgos. Registro/advisory actuales sin versión corregida compatible; simulación de fix compatible cambió0 versiones |
| Cobertura/suite completa final | BLOCKED por corte del executor; no se atribuyen las668 pruebas o220 SQL históricas al código nuevo |

Las corridas focalizadas se solapan; no deben sumarse como nuevos casos únicos.
No hay resultado confirmado de una corrida143, manifest final estable, matriz nueva ni revisión independiente completa.

Evidencia local ya guardada: `docs/tif/v2.13/evidence/technical-20261013/dependencies/`, `durability/`, `documented-gaps/` y `public-quote-providers.json`.
Esos archivos **todavía no están publicados en esta rama remota**.
Intentos nativos: `/tmp/zarix-runtime/native-evidence/native-verification-attempt-1.json` e `native-verification.json` (intento2).
No se generó el archivo privado de logins para E2E antes del corte.

## Cambios locales y pendientes precisos

1. Cola: `lib/offline-transaction-store.ts`, regresiones y equivalencias outbox.
2. Simulación: helper, panel y conexión al workspace/página inversiones, ya en el commit local indicado.
3. FX: metadata real de muestra blue, provider conocido o null para respaldo antiguo, DTOs de cuentas/portfolio/patrimonio y renderizado. Última llamada de ajustes finales quedó sin resultado; comprobar disco antes de afirmar guardado. Aclarar que históricos no conservan provider/fecha FX.
4. Harness nativo ampliado: concurrencia con observación de locks, revocación Auth y restore esquema/datos/Auth/Storage preparados pero **no ejecutados hasta aprobación**. Pendiente probar transporte `Connection: close` para evitar reutilización de conexión cerrada, sin reintentar automáticamente escrituras financieras.
5. Tipos exhaustivos del catálogo nativo: pendientes de generar; modelos actuales manuscritos no equivalen a un espejo completo.
6. E2E de cuatro CU y runner API: preparación local parcial; no navegador real, capturas ni carga canónica ejecutados.
7. Orquestador/manifiesto y script de trazabilidad: cambios locales para separar evidencia nueva, incluir middleware/configuración y reconciliar contratos de outbox; todavía sin corrida consolidada.
8. Salud: se observó GET anónimo de categories404PGRST205 y HEAD204 sin error SDK, con /api/health200. La404 puede ocultar falta de grants y no demuestra esquema vacío. Pendiente una lectura mínima GET backend para comprobar el query real sin reabrir grants anon; el patch **no se guardó**, por desconexión.

CP3-19 original exige MEP seleccionable, mientras RN08 y contrato implementado fijan blue venta. Se conserva BLOCKED por contradicción documental; pruebas derivadas blue no aprueban silenciosamente el fixture MEP.

La matriz original sigue siendo evidencia histórica:273 casos,168PASS/0FAIL/105BLOCKED.
Las equivalencias RTV-034/038 están ejecutadas con alcance acotado, pero la matriz nueva necesita generación sobre los resultados finales y revisión explícita.

## Bloqueos de acceso y aceptación

- **Executor:** `exec-server transport closed`; luego `exec-server transport disconnected; recovery timed out after 25s`, incluso para pwd. CUA para Chrome también terminó con Transport closed. No es rechazo de autorización. Impide lecturas/escrituras locales, verificaciones, consolidación y push del código local.
- **Gemini/OCR/IA reales:** GEMINI_API_KEY de pruebas no disponible en el entorno accesible.
- **Telegram real:** faltan TELEGRAM_BOT_TOKEN/TELEGRAM_WEBHOOK_SECRET de bot de pruebas, chat controlado y endpoint HTTPS autorizado; CP2-17/18 y CP3-09 también requieren proveedor.
- **Mercado Pago sandbox:** faltan MP_ACCESS_TOKEN de pruebas, MP_WEBHOOK_SECRET y recursos sandbox con importe/moneda/período definidos.
- **CNF-02:** observación real de un mes, sonda autenticada cada5min, no disponible; ninguna prueba breve se marca PASS.
- **CNF-03:** stack HTTP loopback; HTTPS/certificado/redirect requieren entorno de pruebas identificado. No se instaló confianza de certificado persistente.
- **CNF-04:** cifrado en reposo de esta instancia concreta aún sin evidencia; RLS no lo demuestra.
- **CNF-09:** Chrome/Safari instalados, Firefox/Edge no observados; no matriz versionada ejecutada y WebKit no se llama Safari.
- **CNF-01/11/12/13:** carga canónica, carreras completas/idempotencia multicanal, recuperación íntegra y observabilidad no aprobadas por preparación de scripts o por microbenchmark.

No se piden secretos por chat. Cualquier alta/ampliación de acceso externo persistente requiere autorización específica.

## Orden de recuperación

1. Restablecer executor Mac y comprobar disco/procesos; preservar ambos intentos y cambios del checkout.
2. Integrar este commit documental con el trabajo local conservándolo íntegro; no force-push.
3. Resolver el transporte nativo y completar desde los stacks descartables la corrida, con dos usuarios normales y un invitado; recrear sólo datos sintéticos autorizados.
4. Generar tipos, finalizar revisión de fuente y commit de código.
5. Ejecutar npm ci, npm run typecheck, npm run lint, npm run test:coverage, npm run test:db y npm run build, más native/integración/E2E/restore y carga permitidos. Conservar comandos, revisión, manifest estable, scope y fallos.
6. Publicar evidencia nueva y matriz PASS/FAIL/BLOCKED sobre assertions exactas, conservando bloqueos reales. No mezclar preparación con ejecución ni evidencia histórica con código nuevo.
