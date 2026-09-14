# Auditoría de seguridad de Zarix — 2026-09-14

Revisión local del commit d7b3219 con correcciones en curso. Se revisaron límites de identidad, importación, exportación, datos locales y dependencias. Tres hallazgos confirmados por lectura independiente; la evaluación no certifica la configuración productiva de Supabase/Vercel ni ausencia de otras fallas.

- **high — Bot Telegram propio sin vínculo puede resolver otra cuenta**: Rechazar resolución por chat para todo contexto ownerUserId sin forcedUserId. Mantener canje condicionado al dueño y consumir código mediante UPDATE condicional atómico. Pruebas telegram-owner-isolation y telegram-link-code.
- **medium — Caché offline compartida entre usuarios del navegador**: Claves y singleflight por userId obtenido de la sesión local; descartar respuestas en vuelo tras cambio de sesión; limpiar snapshots al salir. Cola separada por propietario y validación del propietario esperado en API. Pruebas offline-reference-cache/offline-queue.
- **medium — Importación XLSX sin límite de expansión**: Preflight yauzl de entradas y bytes realmente descomprimidos (256 entradas, 8 MiB por entrada, 32 MiB total), cuotas de filas/columnas y archivo. Test con planilla normal y expansión rechazada.

## Hallazgos funcionales y endurecimiento (no vulnerabilidades confirmadas adicionales)
- CSV: comillas en cuenta/categoría rompen columnas y pueden introducir celdas de fórmula; la siembra entre cuentas no fue demostrada. Se corrige todo campo con un único encoder.
- Mercado Pago: mantener identificador firmado como único recurso procesado; la consulta posterior al proveedor mitigaba falsificación de estados, por lo que no se reporta acceso pago falsificado.
- Vinculación Telegram: consumo atómico evita dos ganadores con el mismo código vigente.
- Cuotas IA por usuario, validación runtime del mensaje. Rate limiter sigue siendo por instancia, no cuota distribuida de gastos.
- Dependencias: npm audit 18→0 tras migración; avisos de librería no implican que cada vector fuera explotable en Zarix.
- Backups: fallos en datasets ya no se convierten silenciosamente en listas vacías.

## Controles positivos y limitaciones
Auth.getUser en API, scope explícito por propietario, consultas parametrizadas PostgREST, HMAC y bearer fail-closed, comparación timing-safe y tokens compartidos aleatorios. Invitados por capability son diseño, no ausencia accidental de sesión. El cron de recurrentes vuelve a validar ownership: no se confirmó escritura cruzada por una FK ajena. Sin lectura de secretos ni revisión de políticas reales: contrastar migraciones aplicadas sigue siendo una verificación de despliegue pendiente. Una primera corrida no prueba cobertura absoluta; revisiones posteriores deben cubrir huecos y configuración real.

Ver findings.json y FINDINGS-DETAIL.md. Pruebas unitarias y mocks validan regresiones locales, no entregas Telegram ni transacciones de proveedores reales.
