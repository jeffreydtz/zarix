# Decisiones y accesos pendientes

Estas preguntas no autorizan cambios funcionales por sí mismas. La consulta al
usuario se presentó el 15/10/2026 durante el cierre del delta; mientras no haya
respuesta, los contratos afectados conservan BLOCKED. Las pruebas independientes
y las correcciones ya autorizadas continúan.

| Caso | Estado comprobado y decisión concreta pendiente |
| --- | --- |
| CP2-04 | RF04/CU002 A02 y el servicio archivan/restauran cuentas para conservar historia; el CSV pide borrado físico de una cuenta vacía. Confirmar reconciliación con archivo/restauración. No se implementó hard-delete. |
| CP3-19 | RN08 y el producto usan blue.sell; el CSV pide MEP1250 y total125000. Confirmar reconciliación con blue. La preferencia ARS/USD no incorpora otro proveedor. |
| CP1-32 | RF12 y la API/modelo usan mes; el caso incluye fin anterior a inicio, campos que no existen. Confirmar que se conserva el presupuesto mensual y se revisa esa variante. |
| CP1-25/26 | Movimiento/marca/outbox son atómicos; el interleaving de INSERT confirmado/marca fallida no está disponible. Ya existe outbox durable, contrario a la afirmación literal de CP1-26. Confirmar reconciliación con la arquitectura actual, manteniendo los literales históricos. No se desactivaron triggers ni se fabricó estado. |
| CP2-19 | Ya se implementaron GET individual de inversión y preferencias propias. El DELETE de preferencias por API no existe; HTTP405 sólo demuestra una ruta no soportada. Acordar si corresponde restablecer ARS/widget visible o declarar esa operación fuera del producto. No se agregó DELETE de `users`. |
| CP2-08 | Signup existe, pero las dos identidades sintéticas clonadas no prueban registro nuevo/confirmación/login/logout. Se solicitó autorización específica para una identidad sintética adicional y signup sólo en una réplica Auth/SMTP local, sin envío externo. No se creó esa identidad. |

El último steering de navegador requiere Arc. La ventana de prueba anterior tiene
cierre UNKNOWN; se pidió confirmación de cierre y permiso para una nueva ventana
identificada. No se abrieron nuevos Chrome/Arc ni se tocaron pestañas, perfiles o
sesiones personales. Las tareas visuales de CP2-21 y CNF-05/06/07/08/09 conservan
sus límites particulares; SSR y props Flight no equivalen a hidratación o pruebas
de teclado/zoom.

Las integraciones reales siguen requiriendo credenciales existentes y recursos de
prueba autorizados: Gemini/OCR (`GEMINI_API_KEY` o
`GOOGLE_GENERATIVE_AI_API_KEY`), Telegram (`TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`, bot/chat y HTTPS), y Mercado Pago (`MP_ACCESS_TOKEN`
o `MERCADOPAGO_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y recursos sandbox). Los nombres
son identificadores de configuración, no valores. No se usó Matilda PDV, no se
crearon credenciales externas ni se enviaron mensajes o cobros reales.

CNF-11 y CNF-13 permiten explícitamente recursos de pago sintéticos en su CSV;
la falta de Mercado Pago real no se usa para bloquear esos subcontratos locales.
CP2-13/14/15/16 sí conservan sus requisitos de integración real separados.

CNF-02 exige observación mensual real; no se sustituye por segundos de ejecución.
CNF-01 conserva el incumplimiento local observado y sus muestras ausentes, sin
repetir carga masiva. TLS, cifrado del proveedor y respaldo del plan contratado
mantienen sus bloqueos de acceso/evidencia propios. La restauración anterior
Auth/Storage y las nuevas retenciones privadas son alcances distintos.
