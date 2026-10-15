# Auditoría de dependencias — 13/10/2026

**FAIL: auditoría completa con siete entradas altas y cero críticas. PASS acotado: auditoría `--omit=dev` con cero hallazgos.** Las siete entradas propagan un solo aviso de `braces`, no siete vulnerabilidades independientes. No se cambió `package.json`, `package-lock.json` ni `node_modules` durante esta revisión.

La consulta actual del [aviso oficial GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) registra `<=3.0.3` afectado y ninguna versión corregida. Esto se verificó el 13/10/2026; no se infiere del informe anterior. La [respuesta actual del registro](registry-braces.json) conserva `3.0.3` como `latest` y última versión publicada.

## Identidad y alcance

- Revisión fuente: `b40feeed28d6e9ea6e8b0b2f112119e2435de1df`.
- Runtime real: Node `v22.17.0`, npm `11.4.2`, Darwin `27.0.0`, arm64.
- SHA256 `package.json`: `11d77bdca6d4e395fb24d019d658499d3ad9e9a27ea03eeb6fdbc9f0a4966648`.
- SHA256 `package-lock.json`: `55c20451ab9746815183814324501c39f26ea01e1a3d1618b37e3f093ee6f257`.
- [Metadatos y comandos exactos](metadata.json) identifican runtime, revisión, hashes, salidas y códigos observados. `evidenceCollectedAt` es el momento de consolidación, no una hora de inicio inventada para cada comando.

Se auditó contra el registro npm actual en la copia aislada de ZARIX. No hubo acceso a producción, instalación de paquetes por esta revisión, migración del framework ni ejecución de scripts de terceros. La instalación limpia y las comprobaciones generales del producto pertenecen a la corrida técnica principal.

## Resultados ejecutados

| Comprobación | Resultado | Evidencia y límite |
| --- | --- | --- |
| Auditoría completa actual | FAIL | [audit-before.json](audit-before.json): siete altas, cero críticas, código 1. |
| Auditoría actual filtrada de producción | PASS | [audit-production.json](audit-production.json): cero hallazgos, código 0. No reemplaza la auditoría completa. |
| Rutas y versiones instaladas | PASS | [installed-tree.json](installed-tree.json), [lockfile-affected-packages.json](lockfile-affected-packages.json). Todos los nodos señalados tienen `dev: true`. |
| Ausencia de estos paquetes en árbol `--omit=dev` | PASS | [production-tree.json](production-tree.json) vacío; código 1 de `npm ls` indica que no hay coincidencias. |
| Simulación compatible de npm | FAIL | [remediation-dry-run.json](remediation-dry-run.json): cero versiones cambiadas y siete altas persistentes. |
| Corrección compatible completa | BLOCKED | Las consultas actuales no identifican una versión corregida publicable dentro del conjunto de herramientas existente. |

`npm audit fix --dry-run --ignore-scripts --json` no instaló ni alteró el lockfile. Su [salida cruda](remediation-dry-run.stdout.log) incluye 105 agregados simulados de dependencias opcionales/plataformas y luego JSON; se conserva la salida completa y el JSON extraído por separado. Ese conteo no se presenta como corrección ni como instalación realizada.

Las rutas actuales son:

1. `tailwindcss@3.4.19 → chokidar@3.6.0 → braces@3.0.3`.
2. `tailwindcss@3.4.19 → micromatch@4.0.8 → braces@3.0.3`.
3. `tailwindcss@3.4.19 → fast-glob@3.3.3 → micromatch@4.0.8 → braces@3.0.3`.
4. `eslint-config-next@15.5.27 → @next/eslint-plugin-next@15.5.27 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`.

## Alternativas verificadas hoy

- [Tailwind 3](registry-tailwindcss-3-versions.json) termina en `3.4.19`; su [manifiesto](registry-tailwindcss-3.json) conserva las tres rutas señaladas.
- [micromatch latest](registry-micromatch.json) es `4.0.8` con `braces ^3.0.3`; [fast-glob latest](registry-fast-glob.json) es `3.3.3` con `micromatch ^4.0.8`. Actualizarlos dentro de sus líneas no elimina el aviso observado.
- [El plugin ESLint de Next latest](registry-next-eslint-latest.json), `16.4.0`, conserva `fast-glob 3.3.1`. Una actualización simple del plugin tampoco retira la ruta.
- npm propone Tailwind `4.3.3` y bajar `eslint-config-next` a `14.2.35`, ambos marcados como cambios mayores. No son correcciones compatibles demostradas para este proyecto. Migrar Tailwind requiere el [procedimiento oficial de actualización](https://tailwindcss.com/docs/upgrade-guide), cambios de PostCSS/CSS y comprobaciones visuales; además no resuelve por sí solo la ruta de ESLint. No se aplicaron estas migraciones ni `npm audit fix --force`.

## Exposición y límites

La revisión actual de `app`, `lib`, `components`, `middleware.ts` y `types` no encontró importaciones de los paquetes afectados ni llamadas de subprocess que ejecuten las herramientas. `postcss.config.js` carga Tailwind; `tailwind.config.ts` usa tres patrones constantes simples. `.eslintrc.json` sólo extiende `next/core-web-vitals`, sin `settings.next.rootDir`. CI mantiene la auditoría explícitamente no bloqueante; un CI verde no cierra el FAIL de auditoría.

La clasificación como dependencias de desarrollo y el árbol filtrado reducen la exposición observada, pero no prueban seguridad total del runtime, del build o de contribuciones no confiables. No se ejecutó una explotación HTTP ni se inspeccionó un despliegue. Las trazas `.nft.json` nuevas deben medirse tras el build final de la corrida principal, sin reutilizar el resultado de 2026-10-09.

## Reproducción

Desde la raíz del repositorio con Node 22–24 y la instalación limpia de la corrida principal:

```sh
sh docs/tif/v2.13/evidence/technical-20261013/dependencies/reproduce.sh /tmp/zarix-dependency-recheck
```

El script sólo consulta metadata y simula el ajuste; guarda stdout, stderr y códigos de salida, sin reemplazar esta evidencia ni ejecutar instalaciones. Tras un build nuevo aprobado:

```sh
node docs/tif/v2.13/evidence/technical-20261013/dependencies/inspect-build-trace.mjs .next > /tmp/zarix-build-trace.json
```

El inspector guarda ID de build, hashes de trazas y coincidencias de paquetes afectados. Su sintaxis y la del script de reproducción se verificaron. Ausencia en trazas sigue siendo evidencia estática acotada, no prueba de ausencia de imports dinámicos, código vendorizado u otras vulnerabilidades.

La remediación permanece pendiente de una versión corregida revisada o una migración explícita que retire todas las rutas y apruebe instalación, auditoría, tipos, lint, pruebas, build y regresión visual. La revisión no acepta silenciosamente el riesgo ni declara el repositorio libre de vulnerabilidades.
