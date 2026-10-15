# Auditoría actual de dependencias — 15/10/2026

La auditoría global de `b456c4220ee524406670f65837fcd4fd6c4b8275` sigue **FAIL: 7 high, 0 critical**. Los siete paquetes afectados pertenecen a una sola cadena/advisory de `braces`; no son siete avisos independientes. [Audit actual del core](../core/dependency-audit.json) y [metadata de esta verificación](metadata.json) conservan el alcance. No se reutilizó la conclusión del informe del 13/10 como prueba del estado actual.

Se volvió a abrir la [ficha oficial GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): afecta `braces <=3.0.3` y publica `Patched versions: None` (página actualizada el 02/10, observada otra vez el 15/10). La consulta actual al registro npm devuelve `braces latest=3.0.3`. `micromatch latest=4.0.8` conserva `braces ^3.0.3`; `fast-glob latest=3.3.3` conserva `micromatch ^4.0.8`. El plugin Next instalado `15.5.27` pide `fast-glob 3.3.1`; Tailwind 3 publicado más reciente sigue `3.4.19`. Los JSON `registry-*.json` corresponden a esas consultas reales de lectura, sin instalación.

No se encontró una corrección publicada compatible para eliminar este aviso. npm ofrece Tailwind `4.3.3` y un cambio de versión mayor de `eslint-config-next` a `14.2.35`; no equivalen a un parche compatible verificado del stack actual. No se aplicó `audit fix --force`, un override sin parche demostrado ni una migración de herramientas/estilos. `package.json` y lock siguen idénticos a sus hashes del core congelado; no se cambió node_modules durante esta fase.

El [audit actual de producción](audit-production.json), ejecutado con `npm audit --omit=dev --json`, terminó con salida 0 y **0 hallazgos**. Los siete paquetes figuran `dev:true` en el lock. Esto delimita el árbol auditado; no acredita ausencia de toda vulnerabilidad posible.

La [inspección estática del build](build-trace-inspection.json) identifica BUILD_ID `zJ3D7exVtqZ7JLNFuTSZ1`, **85 trazas `.nft.json` y cero rutas de esos siete paquetes**. Cada traza tiene hash. El script usado, [inspect-build-trace.mjs](../../technical-20261013/dependencies/inspect-build-trace.mjs), lee metadatos/rutas del build recién terminado; no copia claves ni contenido de bundles. La fecha del script no convierte la observación en histórica. No se infiere ausencia de código dinámico, vendorizado o de rutas de explotación sólo por ese resultado.

Comandos de lectura ejecutados después del core, Node 22.17.0/npm 11.4.2:

```sh
npm view braces version --json --registry=https://registry.npmjs.org
npm view 'tailwindcss@3' version --json --registry=https://registry.npmjs.org
npm view micromatch version dependencies --json --registry=https://registry.npmjs.org
npm view fast-glob version dependencies --json --registry=https://registry.npmjs.org
npm view '@next/eslint-plugin-next@15.5.27' dependencies --json --registry=https://registry.npmjs.org
npm audit --omit=dev --json --registry=https://registry.npmjs.org
node docs/tif/v2.13/evidence/technical-20261013/dependencies/inspect-build-trace.mjs .next
```

Todos esos comandos terminaron con salida 0. El audit completo separado del core conserva su salida 1; no se presenta la auditoría completa como PASS por el resultado reducido de producción.
