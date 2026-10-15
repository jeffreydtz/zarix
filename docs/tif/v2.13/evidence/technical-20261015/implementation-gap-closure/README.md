# Continuación de implementación técnica del 15/10/2026

El checkpoint publicado `7f71f2757a4decb0e0becbafb82860008b2f9185` conserva
sus resultados y matriz 232 PASS / 1 FAIL / 40 BLOCKED. Este paquete registra
el delta posterior y mantiene exactamente CU001 movimientos, CU002 cuentas y
datos personales, CU003 análisis financiero y CU004 inversiones. No hubo fusión,
despliegue, acceso a producción, uso de Matilda PDV, cobros o mensajes reales.

## Cambios implementados

| Cambio | Comportamiento y prueba |
| --- | --- |
| Auditoría de eliminación CP1-08 | El DELETE normal revierte el saldo y retiene identidad, dueño, actor y OLD completo en una tabla append-only con lectura propia por RLS. La función definer privada no es invocable por clientes. [SQL/regresiones](../../delta-20261015-cp1-08/README.md) y [fixture nativo exacto](native-delta/runnernative/executed-attempt-1/verification.json). |
| Preferencias CP2-11/12 y CP3-17 | GET/PUT propios y estrictos guardan ARS/USD y visibilidad de Patrimonio; Settings y Dashboard leen esa preferencia por usuario. Un formulario de otra sesión recibe403 antes de escribir. Las lecturas Dashboard ya no escriben snapshots históricos; el cron existente conserva esa responsabilidad. [52 focales y límites](../continuation-preferences/README.md). |
| Lectura privada de inversión | GET individual con sesión normal, RLS y filtro de dueño; propia/archivada200, ajena404, UUID inválido400. [14 pruebas](investment-read/README.md). No ejecuta cotizaciones ni escrituras. |
| Recuperación de contraseña | Enlace y formularios de solicitud/actualización, callback permitido y comprobación del mismo usuario antes de actualizar. [30 pruebas únicas](reset/README.md) y páginas servidas por HTTP en el paquete SSR. El reset GoTrue/SMTP completo previo sigue ligado a su propia revisión. No se repitió una mutación de contraseña en este delta. |
| Correlación CNF-13 | IDs por solicitud, timestamps, canal, componente, resultado, referencia mínima y muestras del contador `zarix_operation_total`; distingue proveedor de consistencia y enlaza outbox con movimiento confirmado. Campos permitidos fijos, sin cuerpos o errores crudos. El contador mide muestras de componentes terminales, no operaciones únicas ni disponibilidad. [Regresiones](correlation/). |
| Privacidad de canales y errores | Nueve logs de Telegram y dos de venta/lectura de inversiones conservan sólo etiquetas constantes. No cambian Auth, dispatch, confirmaciones ni respuestas400/500. [Telegram26 focales/60 relacionadas](channel-secrets/README.md) y [venta/lectura3 FAIL→3 PASS](investment-sell-privacy/README.md). |

Las migraciones nuevas son `20261015072636_audit_transaction_deletions.sql`
y `20261015072807_presentation_preferences.sql`. Se aplicaron únicamente al
clon sintético nuevo; el mirror y tipos se sincronizaron. El directorio contiene
29 migraciones más el baseline de instalación nueva. Ese baseline no se aplica
a una base existente. Las cuatro migraciones señaladas al delegar conservan sus
bytes de `b40feeed`; los históricos no se recalcularon automáticamente.

## Revisiones y evidencia ejecutada

| Fase | Revisión y alcance |
| --- | --- |
| CI45 del checkpoint | [run38698189163](ci45-checkpoint.json) pasó sobre el merge sintético `8d383a5` de head7f71/base5cbd. Es comprobación CI, no una fusión real ni ejecución del delta. |
| Gates attempt1/2 | Los fallos se conservan. Attempt1 falló antes de npm por bootstrap del arnés; sus copias antiguas no prueban cobertura/build nuevos. Attempt2 tuvo1008PASS y falló el arnés de corte histórico SQL al añadir dos migraciones posteriores. |
| Gates attempt3 | `730767b`: seis comandos requeridos PASS;1008 pruebas/102 archivos. La corrección limita el fixture histórico a las27 fuentes anteriores a la reparación; no modifica migraciones ni producto. [Dictamen](independent-required-gates-review.json). |
| Gates attempt4 | `b055ac8`: seis requeridos PASS;1034 pruebas/104 archivos;480 fuentes limpias/estables. Audit completo FAIL7altas; producciónPASS0. [Dictamen acotado](independent-final-gates-review.json). No acredita la corrección posterior `f5f362e`. |
| Gates attempt5 final | `f5f362ee9dbb81da5268049cab41b357d90eccf1`: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:coverage`, `npm run test:db` y `npm run build` PASS. **1037/1037 pruebas en105 archivos**,481 fuentes limpias/estables, build `OkON_6oTEGTzNc95kbiyx`. [Resultado](required-gates-attempt-5/verification.json) y [revisión](independent-head-gates-review.json). Auditoría completa FAIL7altas/0críticas; `--omit=dev` PASS0. |
| Native14 | Copia `730767b`, esquema `faae3a7`:14 grupos/159 aserciones. Auth/REST/PG, RLS y RPC reales; adaptador Next/cookies y transportes declarados. [Revisión](independent-native-delta-review.json) y [límites corregidos](native-delta/runnernative/LIMITS-ADDENDUM.md). No se infieren códigos HTTP de logout desde el SDK. |
| HTTP/SSR38 | Copia/build730:13 solicitudes HTTP y38 comprobaciones con cookies normales. PUT, nueva sesión posterior al guardado, Settings y páginas de recuperación. [Revisión](independent-ssr-http-review.json). Totales/base son props Flight ligados a módulos compilados; no texto animado/hidratación inspeccionada. |
| Dashboard A/B | Suplemento posterior separado:26/26, ambos Dashboard HTTP reales, preferencias discriminantes y siete inventarios intactos. Cierra el GET de B ausente en SSR38. [Dictamen](independent-dashboard-supplement-review.json), sin navegador. |
| CNF11 local y CNF10 JWT | Seis protocolos con182 aserciones; cada uno1 inicial+2replays+10concurrentes posteriores al commit. Transferencia editada/eliminada, CHECK de crédito con rollback y sobreventa de dos comandos distintos. JWT GoTrue normal frente a cron:3 comprobaciones. [Resultados y precisiones de alcance](native-delta/runnernative/cnf11-final-local/LIMITS-ADDENDUM.md). |
| CNF13 robusto | Suplemento separado de sólo nueve variantes sobre COPY730: **9/9,42 aserciones,54 observaciones**,55 llamadas de consola formateadas. Canary positiva de message/stack/cause antes de Auth/SQL;1 captura borrada antes de requests. Trece valores privados seleccionados, tres señuelos y cuatro representaciones PNG sin coincidencias. [Raw y fuentes](native-delta/runnernative/cnf13-robust-only/executed-attempt-1/README.md) y [revisión](independent-cnf13-robust-review.json). |

El nuevo defecto de logging descubierto al revisar la sobreventa se corrigió en
`f5f362ee9dbb81da5268049cab41b357d90eccf1`; su [revisión independiente](investment-sell-privacy/independent-review.json)
confirma el cambio exclusivo de dos argumentos y contratos conservados.

Los primeros nueve intentos CNF13 exactos tuvieron41 aserciones y54 observaciones,
pero su serialización JSON de consola podía omitir campos no enumerables de
Error. [El dictamen](independent-cnf-local-focal-review.json) conserva ese límite;
no se presenta esa corrida como una captura robusta posterior. Ningún conteo de
grupos, aserciones o archivos se suma como casos únicos de los273 originales.

La cobertura final instrumenta **37 archivos**: líneas1874/2549 (**73,51%**),
sentencias2082/2955 (**70,45%**), funciones306/440 (**69,54%**) y ramas1632/2541
(**64,22%**). Es el conjunto configurado, no toda la aplicación. El build/gates
final no se usa para reasignar a `f5f362e` los recorridos UI o runtime históricos.

## Proveedores, seguridad y conservación

Auth, PostgREST y PostgreSQL del clon fueron reales con sesiones ordinarias.
Telegram fue un doble de transporte que falla; cotizaciones y Mercado Pago,
fixtures HTTP locales explícitos. El recurso de pago sintético está permitido
por CNF11/13; su éxito no aprueba Mercado Pago real CP2-13/14/15/16 ni OCR/Gemini.
No se generaron credenciales externas. Los tokens y cookies nuevos se manejaron
sólo en RAM/entornos efímeros; los informes contienen hashes, referencias y
conteos, sin valores privados.

El PNG y los tres señuelos son datos sintéticos: no se publicaron archivos de
imagen o consola cruda, pero la nota del movimiento de prueba puede conservar
su base64 en el clon privado. Esa persistencia de fixture se declara; la imagen
no se describe como exclusivamente en RAM.

Automatic approval review rechazó una operación de preparación que habría
copiado claves, JWT y URL de contraseña a un nuevo archivo privado. Esa operación
no se ejecutó. Se continuó mediante metadata con referencias y valores sólo en
memoria, sin repetir el intento de copia ni ampliar permisos persistentes.

La [retención del delta](native-delta/retention/README.md) conserva un dump Fc de
553793bytes/65 tablas en un directorio privado0700/archivo0600. TOC/decodificación,
39 tablas originales, Auth0 y stop de seis actores+PROOF pasaron; [revisión](native-delta/retention/independent-public-retention-review.json).
No es otra restauración. La restauración anterior de64 tablas con Auth y objeto
Storage sigue en [Native22](../native-full/README.md), con revisión/build y límites
propios. Algunos listeners internos Native son wildcard; no se afirma firewall
universal, aislamiento LAN ni TLS por usar frontend loopback.

El reopen acotado para CNF13 se cerró de nuevo: [retención final](native-delta/retention-cnf13-robust/README.md),
dump Fc554859bytes/65 tablas, SHA
`1f958b0273576ef9bd488a5ffde575f93f12f5eae3e67ce2114862a19726deaf`.
Quedaron cero sesiones/refresh y los cuatro actores temporales+PROOF detenidos.
El dump anterior `a9f03e0...`, el checkpoint `f3788692...`, el dump PROOF
`b2006c91...` y las39 tablas originales permanecieron intactos. Directorio privado:
`/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix-private-cnf13-20261015T083636Z`.
Los dumps contienen Auth sensible; no se publican ni se confunden con archivos
de credenciales de texto. El clon y sus fixtures se conservaron, sin DROP/reset.

Las [seis consultas primarias actuales](dependencies-current/retrieval.json)
recibieronHTTP200. Braceslatest3.0.3 sigue dentro del rango<=3.0.3 y el advisory
oficial no identifica primera versión corregida; los upstreams consultados aún
conservan esa cadena. Las recomendaciones audit registradas son cambios mayores
o downgrade. No se forzó Tailwind4/ESLint14 ni se afirma ausencia de todo parche
por el informe viejo. La auditoría completa continúa FAIL y la de producción0.

## Aceptación y bloqueos

La matriz histórica y `casos_prueba.csv` permanecen intactos. Las decisiones de
aceptación nuevas se publican sólo tras revisar el contrato literal, la evidencia
exacta y su composición; no se aprueba un caso por estar implementado.

La [nueva matriz derivada](case-traceability-delta.csv) registra **238 PASS,
1 FAIL y34 BLOCKED** de273. Las seis promociones son CP1-08, CP2-11, CP2-12,
CP3-17, CNF-10 y CNF-13. [Decisiones/pins](case-decisions.json) y
[diferencia e integridad](case-status-delta.json) conservan las composiciones;
267 estados no cambian. CP2-19, CNF-06 y CNF-11 sólo actualizan sus motivos,
sin promoción. CP2-09 conserva FAIL literal: GoTrue400 por contraseña errónea
frente al401/403 del CSV, sin emitir sesión ni alterar datos.

Reproducción de la matriz, sin tocar evidencia anterior:

```sh
python3 docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/reconcile-delta.py --verify
```

El generador verifica SHA del CSV original
`887adbef81be56f781133ced65bee1c92effcf9af9a3e0b1b389eed0e4e2717d`,
el checkpoint7f71, las cuatro migraciones de b40feeed y el informe09/10. Crear
una copia nueva requiere outputs inexistentes; `--verify` compara sin escribir.
Los nueve cambios editoriales de filas no son nueve nuevos casos aprobados.

CNF11 integral conserva pendientes captura OCR/bot y las inyecciones/transportes
no ejecutados para cada canal. El descarte deliberado del acuse por el consumidor
no se llama pérdida de respuesta de red. El pago sintético local sí cumple ese
subcanal literal; no se exige un proveedor real ajeno al CSV para bloquearlo.
OCR/bot se refieren aquí a confirmación/reintento monetario con dobles permitidos,
sin exigir extracción Gemini o entrega Telegram real. No haber ensayado diez
primeros commits simultáneos es un límite de la ejecución, no un criterio nuevo.

[Decisiones y accesos pendientes](DECISIONES-PENDIENTES.md) identifica archivo,
blue, presupuesto mensual, atomicidad/outbox, DELETE de preferencias, signup
adicional, Arc y credenciales por proveedor. CNF02 conserva el período mensual
real, y carga/infraestructura/compatibilidad mantienen sus pruebas parciales y
bloqueos concretos. No se abrieron nuevos navegadores ni se repitió carga masiva.

Los controles brutos y las adjudicaciones de candidatos de publicación se
documentan por separado en [el cierre de publicación](publication/FINAL-PUBLICATION.md).
Un falso positivo revisado no se presenta como cero coincidencias del scanner.
