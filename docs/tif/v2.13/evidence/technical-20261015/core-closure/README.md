# CI6: cierre técnico local

Producto congelado en `84df929ab2f169251a49f3e95d0e0c148dfcb87c`, Node 22.17.0, macOS arm64. [verification.json](verification.json) registra fuentes limpias/estables y manifiesto SHA256 `3ab8395f04e43db22c6909b3c01e08783801c753d4930edb4375d1e1ff51522f`: 458 entradas,457 blobs Git y un marcador CLI ignorado declarado. CI5 y sus fallos anteriores permanecen en directorios separados.

**913/913 pruebas Vitest PASS en 92 archivos**. Los 17 controles terminaron: **16 PASS y 1 FAIL de consulta de auditoría**. Pasaron instalación limpia (`npm ci`), TypeScript, lint, cobertura, `test:db`, build, sintaxis del arnés, trazabilidad, regresiones SQL, reproducción del esquema y microbenchmark. Los comandos exactos, tiempos, códigos y logs originales están en el informe.

La [cobertura V8](coverage-summary.json) comprende 37 archivos instrumentados: líneas 1824/2501=72,93%; sentencias 2029/2904=69,86%; funciones 283/416=68,02%; ramas 1617/2531=63,88%. No es cobertura de toda la aplicación ni aceptación de los 273 casos.

La [consulta original de auditoría](dependency-audit.json) falló y no contiene un conteo de vulnerabilidades. La reconsulta válida y su análisis se conservan aparte en `../dependencies/ci6-current/`; el resultado de una fase anterior no se reasigna a esta consulta fallida. No se modificaron dependencias para ocultar hallazgos.

Los siete informes SQL contienen 238 comprobaciones físicas: saldos 28, compartidos 11, planes 18, durabilidad 25, importación 10, conciliación 18, esquema/restauración 128. El agregado `test:db` repite parte del alcance; no se suma como otros casos únicos. PGlite no sustituye Auth/PostgREST/RLS nativos. La [recuperación integral y sesiones reales](../native-full/README.md) tienen evidencia separada con sus revisiones.

El microbenchmark PASS corresponde a una conexión PGlite con 10 cuentas, 5000 movimientos y 100 posiciones; no acredita CNF-01 HTTP/browser, sesiones paralelas ni disponibilidad mensual. El [ensayo de carga real con fallos](../load/browser-diagnostics/README.md) sigue conservado.

El build raíz `BAR1dYoRts_6TgTNSboep` usa Supabase aislado 58321. El [escaneo de 135 assets](browser-secret-scan.json) encontró cero coincidencias exactas de service-role/CRON locales, sin publicar valores. La copia servida para los reintentos nativos tiene otro BUILD_ID y manifiesto propio en [closure-final-preparation](../closure-final-preparation/README.md); este agregado no es una prueba de UI ni proveedores externos.

El [parche y sus 51 pruebas focales](../partial-account-valuation/README.md) añade exclusión explícita de monedas heredadas desconocidas sólo en lecturas que optan por ella; mantiene errores generales como indisponibilidad y no guarda subtotales como historia completa. Conserva centavos USD y el formato previo de enteros/ARS. Sus fallos API/SSR anteriores no se borran y los reintentos compilados posteriores se documentan por separado.

Reproducción en esta Mac: [wrapper versionado](../closure-final-preparation/run-core-closure.py), ejecutado con `ZARIX_CI6_WINDOW_CONFIRM=parent-released-core-closure python3 /tmp/zarix-runtime-20261015/run-core-closure.py --revision 84df929ab2f169251a49f3e95d0e0c148dfcb87c`. Reutiliza el entorno sintético privado, fuentes Inter locales y guard de fetch; CI6 usa reloj real. Rechaza sobrescribir esta fase; una nueva ejecución requiere un directorio nuevo. Ninguna credencial o dump privado forma parte del repositorio.
