# CNF-01: carga local en Chrome con oráculo SQL

`scripts/test-isolated-browser-load.mjs` mide **100 navegaciones completas por perfil** del dashboard, en cinco tandas de 20 contextos autenticados concurrentes. Warm usa primero 20 cargas de calentamiento. Con el controlador opcional se ejecutan también proceso Next nuevo y proveedor caído, cada uno con su propio denominador de 100. Usa Google Chrome instalado y el módulo Playwright externo; no instala navegadores ni dependencias del producto. Cada contexto inicia sesión por la UI con contraseña normal. Las dos identidades sintéticas se distribuyen en diez contextos cada una; son 20 sesiones/contextos independientes, no 20 usuarios distintos.

El ensayo rechaza destinos distintos de loopback y exige una **réplica local separada** con fixture canónico ya preparado. No siembra, borra, reemplaza ni resetea filas. Las consultas del harness usan `default_transaction_read_only=on`; el dashboard conserva su funcionamiento normal y puede generar snapshots derivados de patrimonio. Las huellas antes/después cubren cuentas, campos monetarios de movimientos y posiciones. No se usa una sesión `service_role` en el navegador.

## Fixture previo

`scripts/setup-isolated-load.mjs` prepara una réplica nueva y vacía en API 56321 / PostgreSQL 56322 con `ZARIX_LOAD_SETUP_CONFIRM=empty-replica`. Rechaza otros puertos, Auth existente y tablas `public` existentes; aplica baseline/migraciones, crea dos usuarios normales y siembra el fixture completo. Conserva la conciliación de los diez saldos por usuario y un reporte sin credenciales. El archivo privado `/tmp/zarix-runtime/load.env` usa variables `ZARIX_LOAD_*`: mapearlas a `ZARIX_LOCAL_*` en memoria al invocar el harness. La preparación no vuelve a ejecutarse sobre una réplica ya poblada; sólo refrescar las muestras FX sintéticas si el build tarda más de cinco minutos.

Por **cada** identidad: exactamente diez cuentas, 5000 movimientos y 100 posiciones; la consulta SQL incluye todas las filas, por lo que tampoco admite datos adicionales archivados. La fixture intencionalmente simple facilita un oráculo independiente:

- Cuentas activas ARS o USD, incluidas en patrimonio, sin deuda, tarjeta de crédito ni multimoneda. Nombres con prefijo `ZARIX LOAD `.
- Movimientos propios en ARS o USD: diez ajustes de apertura y 4990 ingresos/gastos, incluidos dentro de las 5000 filas. Descripciones con ese prefijo y mes UTC vigente, con fecha anterior al inicio del ensayo; los triggers siembran el saldo desde el ledger completo. Cada saldo debe conciliar con el ledger, incluidos los ajustes de apertura. El oráculo de flujo mensual excluye ajustes.
- Posiciones activas con referencia manual positiva en USD, `purchase_currency=USD`, `market_currency=USD` o `NULL`, y nombres con el mismo prefijo. No se usa un ticker de proveedor para aprobar la carga.
- Usuarios con onboarding completo y Premium sintético vigente. Credenciales normales de GoTrue local, ya creadas; el script no crea identidades ni accesos.
- Cotizaciones sintéticas persistidas para `blue`, `oficial`, `mep`, `ccl` y los correspondientes `*_buy`, con el mismo timestamp compra/venta. Las cuatro muestras deben ser positivas y tener como máximo cinco minutos de antigüedad al empezar. Configurar el servidor local para mantener esta referencia durante el ensayo; cambios de referencia no deben confundirse con errores de UI. Esto prueba cache local sintética, no cotizaciones reales.

El archivo privado indicado por `ZARIX_LOAD_FIXTURE_FILE` debe tener permisos 0600. Estructura (valores de ejemplo, nunca usar credenciales reales):

```json
{
  "purpose": "isolated-load-replica",
  "databaseName": "zarix_load",
  "serverTimeZone": "Etc/UTC",
  "applicationMode": "next start after production build; isolated local machine",
  "accountNamePrefix": "ZARIX LOAD ",
  "users": [
    { "id": "00000000-0000-4000-8000-000000000001", "email": "zarix-load-a@example.invalid", "password": "synthetic-placeholder-a" },
    { "id": "00000000-0000-4000-8000-000000000002", "email": "zarix-load-b@example.invalid", "password": "synthetic-placeholder-b" }
  ]
}
```

La identidad/nombre de base debe coincidir con la conexión loopback. `serverTimeZone` declara la configuración efectiva del proceso Next, que debe arrancarse con `TZ=Etc/UTC`: el oráculo usa el mes UTC para concordar con `getMonthFlow`. `applicationMode` es una declaración de preparación, no una certificación de equivalencia con un despliegue. El archivo no se copia, publica ni hashea en la evidencia.

## Ejecución

Usar Node 22–24, `psql`, el stack aislado listo y Next construido/arrancado contra **la misma réplica**. Inyectar en privado `ZARIX_ISOLATED_DATABASE_CONFIRM=synthetic-only`, `ZARIX_LOCAL_SUPABASE_URL`, `ZARIX_LOCAL_DATABASE_URL`, `ZARIX_LOCAL_ANON_KEY`, `ZARIX_PG_BIN` desde la configuración privada de carga `/tmp/zarix-runtime/load.env`. No ejecutar contra la base source/restauración utilizada por otros ensayos ni copiar sus datos para ajustar conteos. No escribir los valores de claves/URLs con contraseña en logs.

```sh
export ZARIX_E2E_APP_URL=http://127.0.0.1:3100
export ZARIX_PLAYWRIGHT_MODULE=/tmp/zarix-e2e/node_modules/playwright/index.mjs
export ZARIX_LOAD_FIXTURE_FILE=/tmp/zarix-runtime/load-fixture.json
export ZARIX_LOAD_OUTPUT=/tmp/zarix-isolated-browser-load
node scripts/test-isolated-browser-load.mjs
```

Para los tres perfiles, usar una copia física construida contra la réplica de carga, fuera del repositorio, y un archivo de entorno privado 0600. El controlador rechaza otros directorios, puertos e instancias. Sólo gestiona sus propios procesos Next en 3101 y un doble HTTP de cotizaciones en 3311; termina esos procesos al finalizar. No reinicia PostgreSQL ni detiene el servidor E2E3000. Ejemplo de rutas de la retoma del 15/10:

```sh
export ZARIX_E2E_APP_URL=http://127.0.0.1:3101
export ZARIX_LOAD_MANAGED_APP=/tmp/zarix-app-load-20261015
export ZARIX_LOAD_APP_ENV=/tmp/zarix-runtime-20261015/load-app.env
export ZARIX_LOAD_FIXTURE_FILE=/tmp/zarix-runtime-20261015/load-fixture.json
export ZARIX_PLAYWRIGHT_MODULE=/tmp/zarix-e2e-20261015/node_modules/playwright/index.mjs
node scripts/test-isolated-browser-load.mjs
```

`ZARIX_CHROME_EXECUTABLE` permite elegir otra instalación real de Chrome; por defecto `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. `ZARIX_E2E_HEADED=1` permite observarlo. No se puede atribuir esta corrida a Safari ni a otros navegadores.

La red se configura por target de Chrome mediante CDP `Network.emulateNetworkConditions`: descarga/subida **20.000.000 bits/s = 2.500.000 bytes/s**, latencia 50 ms. Es un límite por contexto/target, no un enlace agregado compartido entre los veinte participantes; no controla el tráfico del servidor hacia proveedores. El guard de loopback usa routing de Playwright, que deshabilita implícitamente la cache HTTP del navegador; el calentamiento corresponde al proceso/caches de aplicación y a cotizaciones persistidas, y esa diferencia figura en el reporte. [Referencia oficial de Playwright](https://playwright.dev/docs/api/class-browsercontext#browser-context-route). El login ocurre antes de medir. Toda carga medida usa `page.goto`, no un cambio de ruta que pueda aprovechar un prefetch sin declararlo.

## Oráculo y evidencia

Antes de medir, cada contexto consulta la API de cuentas con sus propias cookies normales y compara exactamente los diez IDs con las cuentas del propietario en SQL. No depende de que la respuesta `lite` incluya `user_id`. El cronómetro empieza inmediatamente antes de navegar y acaba cuando los widgets propios están renderizados, sin ocultación CSS, y sus valores concuerdan con SQL completo: patrimonio ARS y USD, ingresos/gastos/balance del mes, los diez enlaces de cuenta y las cinco descripciones de movimientos más recientes. Que un elemento esté renderizado no exige que todo el dashboard quepa en el viewport; la compatibilidad visual/scroll se ensaya por separado. Las magnitudes se contrastan en atributos `<data value>` y texto no vacío; un encabezado sin cifras no aprueba la navegación. Las consultas SQL, login y capturas finales quedan fuera del tiempo medido. Las sumas SQL completas detectan truncamiento de listados por límites PostgREST.

`browser-load.json` registra comando, commit exacto, archivos modificados, SHA-256 de fuentes, estabilidad de esas fuentes durante la corrida, versión de PostgreSQL/Node/Chrome, cache sintética, oráculos/huellas de fixture, cada muestra con fecha/duración/estado, fallas de JavaScript y API financiera, y p50/p95/máximo. Después de parar cada cronómetro se leen únicamente los cinco valores numéricos propios; el reporte conserva esperado/observado de cada discrepancia sin copiar cuerpos de página, sesiones ni errores crudos. Los CSV `warm-observations`, `coldStart-observations` y `providerOutage-observations` conservan los denominadores separados; errores y timeouts conservan su duración y permanecen en su denominador. El percentil usa rango más próximo: posición `ceil(p × N)` del conjunto completo ordenado. Para N=100, p50 y p95 son las posiciones 50 y 95. Se conserva el número de fallas en calentamiento.

El umbral local requiere p95 **estrictamente menor** que 2000 ms y cero muestras fallidas; warm también exige calentamiento válido. `2000 ms` exactos falla. `PASS` de un subperfil sólo indica esas condiciones locales. El resultado general será `PARTIAL` si todos los perfiles ejecutados pasan; **CNF-01 integral permanece BLOCKED** por equivalencia de despliegue, incluso con los tres perfiles locales. Si hay valores incompletos, fallas, cambios de fuente/fixture o p95 fuera del límite, el resultado es `FAIL`. Una precondición faltante es `BLOCKED`, con salida 2; `FAIL` usa salida 1.

La captura posterior al login contiene exclusivamente datos sintéticos y lleva hash. No se guardan HAR/trazas crudas, cuerpos/headers de autenticación, JWT, cookies, passwords, claves ni excepciones sin sanitizar. Los mensajes de fallo públicos son clases de error; el stderr SQL privado no se copia. El reporte no representa una aprobación de RLS integral ni del resto de CNF.

## Proceso nuevo y caída de proveedores

Sin controlador, los perfiles adicionales quedan `BLOCKED` con cero observaciones. El login ya precalienta dashboard; su primera carga no se llama arranque frío. Con controlador, cada tanda reinicia un proceso Next propio y reutiliza las veinte sesiones normales preexistentes. La espera de `/api/health` y el tiempo de inicio se registran aparte; el dashboard no se visita durante readiness. El alcance frío es proceso Node/JavaScript nuevo. PostgreSQL, cotizaciones SQL persistidas, sistema operativo, disco y sesiones de navegador permanecen disponibles; no se atribuye frío de esas capas.

En caída de proveedor, el proceso nuevo usa las variables existentes `CRIPTOYA_API_URL`, `DOLARAPI_URL` y `COINGECKO_API_URL` dirigidas al doble loopback que devuelve HTTP503. Los endpoints de normal y caída tienen prefijos distintos declarados, para que una respuesta HTTP200 anterior en la cache de fetch Next no oculte la inyección503; no se vacía la cache SQL ni se cambia el oráculo financiero. Una solicitud autenticada a `/api/cotizaciones`, fuera del cronómetro del dashboard, exige respuesta500 por criptomonedas frescas no disponibles y contadores de peticiones HTTP503 reales al doble. La evidencia exige invocaciones a las rutas de dólar CriptoYa y DolarAPI; leer sólo cotizaciones SQL con `preferCache` no prueba fallback después de un fallo. Después se miden las veinte navegaciones financieras y sus valores frente al oráculo completo. El resultado registra rutas, estado y tiempo del doble, sin headers ni cuerpos privados. Es una prueba declarada de fallo/control local; no valida integraciones reales ni caídas reales de proveedores.

CNF-02 requiere un mes de observación autenticada real con la cadencia documentada. Cien navegaciones locales no prueban disponibilidad mensual. CNF-03/04 requieren evidencia específica de HTTPS/cifrado de la instancia; CNF-05–09 requieren su propia matriz visual y navegadores reales. Este harness tampoco certifica proveedores, pagos ni un despliegue productivo.
