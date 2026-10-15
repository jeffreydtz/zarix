# Preferencias RF14 — continuación de CP2-11, CP2-12 y CP3-17

Delta sobre el checkpoint `7f71f2757a4decb0e0becbafb82860008b2f9185`. No modifica el CSV original, la matriz anterior ni los paquetes de evidencia congelados. Resultado de implementación focal: **52 pruebas PASS, 0 FAIL**, typecheck y lint PASS. La revisión independiente de fuentes no deja hallazgos materiales.

## Contrato y cambio

El CSV original exige guardar moneda base ARS/USD y visibilidad del panel Patrimonio por propietario, recuperarlas al volver a ingresar, rechazar moneda inválida o configuración ajena y conservar saldos/historia. Los saldos de la fixture siguen siendo 120.000 ARS y 100 USD; su referencia independiente a 1200 ARS/USD equivale a 200 USD. El cambio de preferencias no transforma ni vuelve a persistir esos importes.

Se reutiliza `users.default_currency` y se agrega únicamente `users.net_worth_widget_visible`, booleano con valor inicial `true`. La migración `20261015072807_presentation_preferences.sql` se creó mediante el CLI local, después de leer `migration new --help`; no se aplicó a ninguna base nativa. Mantiene las políticas de propietario existentes y concede SELECT/UPDATE sólo sobre la nueva columna. Un trigger invoker rechaza nuevas escrituras de moneda base fuera de ARS/USD sin reescribir valores legacy ni impedir actualizaciones de otras columnas.

`GET /api/user/preferences` devuelve únicamente esas dos columnas propias. `PUT` valida el estado completo antes de escribir: rechaza valores inválidos, campos ajenos, widgets desconocidos y selectores de identidad. La identidad siempre viene de la sesión verificada. El header opcional `X-Preferences-Owner` rechaza con 403 un formulario de A que quedó abierto cuando la sesión cambió a B; nunca selecciona el usuario que se actualiza. Los clientes autenticados sin ese header conservan el acceso normal a sus propias preferencias.

Configuración permite elegir ARS/USD, mostrar u ocultar Patrimonio y confirmar el guardado. Dashboard lee las preferencias propias; Hero y Sticky reciben la base persistida y se ocultan juntos. Los componentes se montan por ID de usuario; Hero deja de recuperar la moneda desde el `localStorage` global. Sus botones de vista siguen siendo cambios locales de presentación; el guardado permanente se confirma en Configuración.

Dashboard deja de escribir snapshots al leer o recargar. El cron de snapshots existente y el cálculo de patrimonio no se modifican. Una configuración legacy con moneda base no soportada no se normaliza silenciosamente: la lectura estricta queda indisponible hasta que su propietario guarda explícitamente ambas preferencias válidas.

## Pruebas y límites

`verification.json` registra comandos, salidas y alcance por archivo; `focused-final.json` conserva las 52 pruebas finales. El PostgreSQL WASM ejecuta el baseline y las migraciones reales con RLS, dos identidades sintéticas, reinicio del almacenamiento y comparación de cuentas, movimientos, inversiones e historial. Los handlers de API son los reales; Auth y el adaptador que sustituye PostgREST están declarados como dobles.

Las pruebas de Configuración usan dobles de hooks, router y fetch. Las de Hero renderizan React y componentes reales en SSR, con un tamaño fijo únicamente para ResponsiveContainer. Las de Dashboard verifican wiring y errores mediante servicios/widgets sustituidos. Se conservan las regresiones existentes de patrimonio parcial, precisión USD y cancelación del plan.

No hubo navegador, aplicación servida, PostgreSQL/GoTrue/PostgREST nativos, carga ni proveedores de cotización. Este resultado no se presenta como una nueva aceptación completa de los tres casos de sistema ni promueve la matriz congelada. Tipos y espejo de esquema recibieron cambios aditivos compartidos; no se afirma una regeneración mediante CLI contra PostgreSQL nativo.

## Intentos conservados y revisión

Se retienen `focused-attempt-1.json` (46 PASS) y `focused-before-owner-guard.json` (50 PASS), además del informe final. El primer typecheck detectó cinco accesos `row.value` sin genérico en el nuevo test de PGlite; sólo se corrigieron sus tipos. La revisión encontró y cerró un P2: un PUT parcial sobre una moneda base legacy podía escribir y después fallar al serializar. El PUT completo y una regresión específica evitan ese resultado.

`independent-source-review.json` fija 19 fuentes y declara expresamente su revisión estática, sin ejecutar pruebas ni certificar informes. El manifiesto fija esas fuentes y los artefactos de este delta; las fuentes compartidas se identifican por sus bytes al cierre de la revisión.
