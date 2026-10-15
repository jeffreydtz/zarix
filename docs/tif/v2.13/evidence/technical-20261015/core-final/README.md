# Corrida global posterior a los errores HTTP observados

Revisión `0169860016125480c19f1284890e2b578f3236af`, Node22.17.0, macOS arm64. [Informe ejecutado](verification.json): fuentes limpias y manifiesto estable durante la corrida. Se repitieron los gates después de corregir rechazos HTTP reales; la [corrida anterior](../core/README.md), su revisión y sus796 pruebas permanecen intactas.

**819/819 pruebas Vitest PASS en82 archivos**, cero fallas o pendientes. `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:coverage`, `npm run test:db` y `npm run build` pasaron. Los17 registros del runner tienen16PASS y unFAIL conservado: `npm audit` informa siete hallazgos altos y cero críticos. La auditoría de producción y el contraste vigente de registro/advisory tienen [evidencia separada](../dependencies/README.md); no se fuerza una actualización mayor para esconder ese resultado.

Cobertura V8 de los37 archivos seleccionados en `vitest.config.ts`: líneas1783/2480=71,89%; sentencias1988/2881=69,00%; funciones279/414=67,39%; ramas1556/2485=62,61%. Es instrumentación de riesgo explícita, no cobertura completa de la aplicación. [Resultados individuales](final-vitest.json) · [Cobertura y numeradores](coverage-summary.json).

Los siete informes SQL vuelven a contener28+11+18+25+10+18+128 comprobaciones físicas. Sus repeticiones dentro/fuera de `test:db` no se suman dos veces ni se confunden con casos originales únicos. `performance.json` sigue siendo una medición de una conexión PGlite: no acredita navegación autenticada de20 sesiones, red ni CNF-01. La corrida nativa22/22 tiene su propio manifiesto SQL/harness, sin cambios en SQL o grants por estas correcciones HTTP.

El build E2E apunta explícitamente a57321 y tiene BUILD_ID `kxdFHyjeNiKh0b2feujgO`. La nueva copia LOAD compila para56321 y tiene BUILD_ID `7_4WZCbHw3WoVOE5HzcG4`; se conserva también la copia anterior. [Manifiestos, código y reinicio real](../environment/app-build-final/README.md). Los cambios posteriores de selectores/esperas de captura o medición pertenecen a los harnesses y se identifican por separado; no se les atribuyen estos gates. La aplicación y SQL de este build conservan su revisión exacta.

Reproducción sin sobrescribir la evidencia anterior:

```sh
ZARIX_EVIDENCE_DIR=/ruta/nueva/de/evidencia python3 /tmp/zarix-runtime-20261015/run-core.py
```

El [wrapper ejecutado](../environment/app-build-final/run-core.py) lee claves locales desde un archivo0600 y no las imprime; el destino debe ser nuevo. Requiere el runtime y fixtures preparados. No ejecutar instalaciones/builds durante recorridos o mediciones. El runner registra comandos, tiempos y exit codes; no despliega, resetea bases ni opera pagos.
