# Evaluación de la vulnerabilidad transitiva de braces

## Conclusión al 9 de octubre de 2026

**La auditoría completa conserva 7 entradas de severidad alta y 0 críticas. No se identificó un parche publicado compatible que cierre todas las rutas sin modificar el conjunto de herramientas.** Las siete entradas derivan de un único aviso, [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), sobre `braces`. No representan siete vulnerabilidades independientes.

El aviso oficial, consultado el 09/10/2026, incluye versiones `<=3.0.3` y declara que no hay versión corregida. Describe agotamiento de pila por patrones de llaves profundamente anidados, incluso dentro del límite de caracteres. La consulta de npm al registro oficial devolvió `braces@3.0.3` como `latest`. La auditoría guardada usa CVSS 3.1 de 7,5; la página actual muestra CVSS 4.0 de 8,7. Ambas clasificaciones son altas y usan escalas distintas.

La evidencia local reduce la probabilidad de una ruta desde solicitudes HTTP normales al paquete afectado: todos los nodos señalados son de desarrollo, la auditoría con `--omit=dev` devuelve cero hallazgos y los archivos de trazado del build no incluyen esos paquetes. **Esto no equivale a seguridad demostrada del runtime ni elimina el riesgo del build, lint o desarrollo.** No se modificaron dependencias, lockfile, código, configuración, auditoría original ni servicios externos.

## Identidad y evidencia de la revisión

- Revisión de solo lectura: 09/10/2026, 04:48–04:52 UTC; resultados reproducibles en [dependency-remediation-readonly.log](dependency-remediation-readonly.log).
- Auditoría completa de referencia: [dependency-audit.json](dependency-audit.json), producida por la corrida final y conservada sin cambios.
- Corrida final: [verification.json](verification.json), `runAt: 2026-10-09T04:43:49.872Z`; manifiesto fuente `060b8b3ef1570b179c42c6e28a87cde54cb20ca8b5bf850c85468f547aabdb44`.
- SHA256 de `package.json`: `11d77bdca6d4e395fb24d019d658499d3ad9e9a27ea03eeb6fdbc9f0a4966648`.
- SHA256 de `package-lock.json`: `55c20451ab9746815183814324501c39f26ea01e1a3d1618b37e3f093ee6f257`.
- Se compararon los 402 archivos del manifiesto fuente final con sus hashes: ninguno cambió durante esta revisión.
- Entorno: Node `v24.19.0`, npm `11.9.0`, lockfile v3. Las consultas npm utilizaron caché temporal; no instalaron paquetes ni ejecutaron correcciones.

## Cadenas exactas instaladas

`npm ls --all` y los manifiestos instalados identifican cuatro rutas desde dos dependencias directas de desarrollo:

1. `zarix → tailwindcss@3.4.19 → chokidar@3.6.0 → braces@3.0.3`.
2. `zarix → tailwindcss@3.4.19 → micromatch@4.0.8 → braces@3.0.3`.
3. `zarix → tailwindcss@3.4.19 → fast-glob@3.3.3 → micromatch@4.0.8 → braces@3.0.3`.
4. `zarix → eslint-config-next@15.5.27 → @next/eslint-plugin-next@15.5.27 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`.

Hay una sola instalación compartida de `braces`. `fast-glob@3.3.1` está en `node_modules/fast-glob` y `3.3.3` en `node_modules/tailwindcss/node_modules/fast-glob`. Todos estos nodos tienen `dev: true` en el lockfile. `micromatch@4.0.8` pide `braces ^3.0.3`; `chokidar@3.6.0` pide `braces ~3.0.2`, resuelto también a `3.0.3`.

La siguiente tabla conserva los rangos de propagación reportados por npm. Los rangos de los dependientes no son avisos independientes:

| Entrada de auditoría | Versión instalada | Rango reportado por npm |
| --- | --- | --- |
| `braces` | 3.0.3 | `*` en la entrada agregada; aviso concreto `<=3.0.3` |
| `chokidar` | 3.6.0 | `2.0.0 - 3.6.0` |
| `micromatch` | 4.0.8 | `>=0.2.0` |
| `fast-glob` | 3.3.1 y 3.3.3 | `*` |
| `@next/eslint-plugin-next` | 15.5.27 | `>=14.3.0-canary.0` |
| `eslint-config-next` | 15.5.27 | `>=14.3.0-canary.0` |
| `tailwindcss` | 3.4.19 | `<=0.0.0-oxide-insiders.ff2c25f` o `2.1.0-canary.1 - 3.4.19` |

## Exposición de producción y herramientas

### Solicitudes y artefacto de producción

- `npm ls --omit=dev braces micromatch fast-glob chokidar tailwindcss eslint-config-next --all` no encuentra paquetes en ese árbol. Su salida vacía usa código 1 de npm; no se presenta como fallo de instalación.
- Una consulta fresca `npm audit --omit=dev --json` finaliza con código 0 y cero vulnerabilidades reportadas. Es el alcance filtrado de producción; no reemplaza ni convierte en PASS la auditoría completa.
- Se inspeccionaron los **85 archivos `.nft.json`** del build final, identificador `U889GEhD8qn-Y6EovGBJQ`, escrito a las `2026-10-09T04:43:03.713Z`. Ninguno referencia rutas de `braces`, `micromatch`, `fast-glob`, `chokidar`, `tailwindcss` o `eslint-plugin-next`. El trazado de Next incluye `picomatch`, que es otro paquete.
- La búsqueda en `app`, `lib`, `components`, `middleware.ts` y `types` no halló importaciones o referencias a los paquetes afectados, ni llamadas de subprocess para ejecutar el build. La importación XLSX usa `ExcelJS.Workbook().xlsx.load(buffer)`; JSON y CSV se procesan en memoria. El nombre del archivo se usa para seleccionar formato y construir la huella del lote, sin pasarlo a esos motores de glob (`app/api/import/transactions/route.ts`, líneas 658–670, 854–901 y 1006–1035).

Estas comprobaciones son análisis estático y de metadatos del artefacto local. No se inspeccionó un despliegue real, no se ejecutó una prueba dinámica de explotación sobre HTTP y el trazado no prueba ausencia de código vendorizado, imports dinámicos no detectados u otras vulnerabilidades. La clasificación `devDependency` por sí sola nunca prueba ausencia de exposición.

### Build y desarrollo

El proyecto sí carga Tailwind al compilar CSS mediante `postcss.config.js`. `tailwind.config.ts:5–8` tiene tres globs constantes de profundidad de llaves simple para `pages`, `components` y `app`. Los call sites instalados confirman expansión de patrones en `fast-glob/out/utils/pattern.js:137` y `chokidar/index.js:258`; `micromatch.parse`, `.braces` y `.braceExpand` llaman a `braces`.

El patrón peligroso debe llegar a esas APIs. No se encontró una conexión desde datos de usuarios de la aplicación hacia los globs configurados. Aun así, configuraciones aportadas por terceros, rutas/patrones generados con entradas no confiables o un servicio futuro que compile contenido de usuarios pueden volver alcanzable el fallo. Procesar texto o nombres que contienen llaves no demuestra por sí solo que se ejecute la API vulnerable.

### Lint y pruebas

El plugin ESLint de Next importa `fast-glob` en `dist/utils/get-root-dirs.js` y lo usa cuando `settings.next.rootDir` contiene cadenas de patrones. La `.eslintrc.json` actual solo extiende `next/core-web-vitals`; no configura `rootDir`. La dependencia sigue presente aunque esa rama específica no se active con la configuración actual.

No apareció una ruta de `vitest@5.0.3` a `braces` en el árbol instalado. Esto no declara que cualquier prueba sea segura: CI instala las herramientas completas, ejecuta lint y compila el proyecto; una contribución no confiable podría modificar entradas o configuración. `.github/workflows/ci.yml:48–49` mantiene la auditoría como no bloqueante. Un CI verde no acredita una auditoría completa sin hallazgos.

## Evaluación de remediaciones

1. **Actualización compatible de braces:** no disponible en el registro consultado. Fijar o sobreescribir a `3.0.3` no corrige este aviso, y bajar de versión tampoco queda fuera de `<=3.0.3`. El límite de caracteres existente no sustituye un límite de profundidad. No se evaluó ni aplicó un fork o parche propio.
2. **Actualizar micromatch o fast-glob dentro de su línea:** el registro devuelve `micromatch@4.0.8` como latest, todavía con `braces ^3.0.3`; `fast-glob@3.3.3` todavía depende de micromatch. Pasar únicamente el fast-glob de ESLint de 3.3.1 a 3.3.3 no elimina la ruta. Tailwind 3 termina en la versión instalada 3.4.19 en el listado de versiones consultado.
3. **Migrar Tailwind a 4.3.3:** npm lo propone como cambio mayor. Es un candidato para retirar las rutas de Tailwind 3, pero requiere migrar el plugin PostCSS, directivas CSS, configuración y posibles diferencias visuales y de navegadores. La [guía oficial](https://tailwindcss.com/docs/upgrade-guide) confirma cambios incompatibles y un paquete PostCSS separado. El paquete `tailwindcss@4.3.3` no declara las antiguas dependencias; la integración añade otros paquetes y su árbol completo debe auditarse tras una migración aislada. **No cierra por sí sola la ruta de ESLint.** No se instaló ni se verificó esta migración.
4. **Cambiar ESLint de Next:** npm propone bajar `eslint-config-next` a 14.2.35, marcado como cambio mayor. Su plugin usa `glob@10.3.10` en vez de fast-glob, pero mezclarlo con Next 15.5.27 puede cambiar las reglas y cobertura; no se validó compatibilidad ni un árbol resultante libre de otros avisos. La versión más nueva consultada, `@next/eslint-plugin-next@16.4.0`, todavía pide `fast-glob@3.3.1`, de modo que actualizar sin más tampoco elimina esta ruta.
5. **Forzar chokidar a una versión mayor:** no es una corrección compatible demostrada. La familia moderna elimina la API de globs usada por consumidores anteriores; el [README oficial](https://github.com/paulmillr/chokidar) documenta rutas exactas en su lugar. Además persistirían las rutas de micromatch y ESLint. No se aplicó un override.

**Decisión recomendada:** conservar el fallo visible y gestionar el riesgo residual de las herramientas hasta disponer de un parche revisado, o abrir una migración explícita que retire las dos familias de rutas. No ejecutar `npm audit fix --force` sobre la entrega congelada. Ninguna alternativa anterior fue validada como corrección completa y compatible en esta revisión.

## Medidas y criterio de cierre propuestos

Estas medidas son recomendaciones; esta revisión no cambió configuración ni infraestructura:

- Construir únicamente con configuración revisada y no convertir entradas de usuarios en globs; si se incorpora esa función, aplicar validación de estructura/profundidad antes del parser y pruebas específicas.
- Ejecutar builds y lint de contribuciones no confiables en workers desechables, sin secretos de producción y con límites de recursos y tiempo. No exponer `next dev` como servidor público de producción.
- Separar la fase de construcción del runtime y verificar que el artefacto desplegado no requiere las herramientas afectadas. Omitir dependencias de desarrollo durante el build actual puede romper la compilación; hacerlo no es una corrección general.
- Para cerrar: actualizar a una versión oficialmente corregida o retirar todas las rutas; regenerar lockfile en una revisión separada; ejecutar instalación limpia, auditoría completa, lint, tipos, pruebas, build y regresión visual. Repetir el análisis de alcanzabilidad y el trazado del artefacto. Si hay parche propio, revisar sus límites de profundidad y compatibilidad antes de aceptarlo.

Hasta entonces el resultado permanece **FAIL en auditoría completa**, con exposición observada principalmente en herramientas de build/lint y sin una ruta de solicitud HTTP demostrada en esta revisión. La decisión de aceptar temporalmente ese riesgo requiere una revisión explícita; no se infiere de que el resto de las pruebas haya pasado.
