RF11: cuatro contratos originales ejecutados en serie

ProductoGit836fd18/buildaqWYS3F5R_VxiHxD3LpJV, Next1822, perfil `intermediate-core-reliability-clock-retry`. El runtime de reloj anterior fallido se conserva por separado; esta fase usa el state/observationretry reales y proof/envoriginales de ese mismo build. No modifica proceso, preload, proveedor, esquema ni planes.

- CP3-13:12asercionesPASS; media1000 deJul/Ago/Sep,1999sin alerta, variante independiente2000→ratio2/exceso1000. Se borra sólo la nueva fila1999 por API y se cotejan historia/saldo baseline antes de la segunda variante.
- CP3-14:12asercionesPASS; nueva categoría5000sin alerta y5000.01con alerta/ratio null. Tras quitar sólo las filas nuevas por API, cero movimientos elegibles→cero alertas y hasDatafalse.
- CP3-15:11asercionesPASS; ingresos medios33000, egresos12000, ahorro21000/cash50000→113000/176000/302000, tres meses completos.
- CP3-16:21asercionesPASS; transferencias, otro dueño, mes actual y futuro no alteran esos mismos números. CredencialGemini del usuario ausente por booleano SQL; journal1→1, cero intentos adicionales y hash idéntico antes/después del GETnormal exitoso. El guard rechaza un canary sin credenciales antes del despacho nativo; no acredita caída realGoogle.

Las cuatro corridas conservan todas las columnas originales en doce tablas, archivan únicamente sus cuentas nuevas, no presentan cleanup failures y verifican fuente/compilación física estables. Los números esperados/observados y tolerancia1e-8 se registran sin aflojarlos. La observación de instalación del reloj06Oct12Z se liga porPID/build/preload y su archivo se verifica idéntico antes/después; no se inventa una lectura nueva del reloj al cerrar.

`profile-binding.mjs` verifica477fuentes físicas/476Git, todos los hashes del coreCI4, origen nativo/proyecto/data_directory, entorno privado, BUILD_ID, PID/cwd/listener y clocks/Gemini. Los cambios actuales del checkout sin compilar están enumerados como no ejecutados. Este guard es nuevo y no se atribuye a corridas anteriores. Las fuentes exactas de cada ejecución se guardan porSHA, incluida la política/preloads propios del runtime.

Comando por caso: `ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only ZARIX_ACCOUNT_ANALYSIS_WINDOW=after-load-quotes-focal-finance node docs/tif/v2.13/evidence/technical-20261015/account-analysis-contracts/run.mjs --case CP3-13 --owner A --api-only --profile intermediate-core-reliability-clock-retry` (casos separados313/314/315/316). No se ejecutan implícitamente otras filas ni se altera CSV/matriz principal.
