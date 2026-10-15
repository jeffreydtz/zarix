# Copia CI6 y readiness del reloj controlado

El build aislado usa Git `84df929ab2f169251a49f3e95d0e0c148dfcb87c` y `core-closure`, con 483 fuentes físicas verificadas. Copia `/tmp/zarix-app-closure-final-20261015`, build `aIWVMIWgvq5sbeEtZAZEh`, Next propio PID 39320 en `127.0.0.1:3002` y backend de la quinta réplica `127.0.0.1:58321`. Los artefactos CI5 se conservaron con sus propios nombres.

El controlador verificó el puerto libre antes de iniciar y luego el listener del PID hijo, cwd, build, manifiesto, entorno y preloads. El proveedor HTTP sintético ya existente en 57912 fue cotejado por PID/cwd/hash/listener; no se creó otro. Las siete WOFF2 Inter se copiaron de una compilación local previa y el guard estuvo instalado antes de Next y sus workers. No hubo descarga de fuentes, cambio de código de producto ni seed financiero/FX en esta preparación.

Se iniciaron dos sesiones temporales normales A/B mediante `createServerClient` y cookies, con login/getUser y GET `/api/user/notification-preferences` HTTP 200. Los JWT fueron emitidos por GoTrue con 60 segundos y reloj real; sólo se cerraron localmente esas nuevas sesiones. Date de Next quedó en `2026-10-06T12:00:00.000Z`; el sistema, GoTrue y el runner mantuvieron la hora real.

El canary Gemini sin credencial fue rechazado por el guard antes del fetch nativo; el reporte no acredita una caída ni integración real de Google. Los 135 assets de navegador tuvieron cero coincidencias exactas de la clave service-role y `CRON_SECRET`. La anon key se excluyó por ser configuración pública. Se compararon valores completos, no todas sus posibles transformaciones. Ningún valor secreto ni bundle se publica.

Estos controles son readiness acotado. No aprueban los seis contratos SSR posteriores, hidratación, navegador, visualización ni proveedores reales. Sus reportes y revisiones se conservan aparte.
