# Valoración parcial explícita y centavos USD

Verificación focal local: **51/51 PASS en seis archivos**, TypeScript PASS, lint PASS sin advertencias/errores y `git diff --check` PASS. El [informe](verification.json) registra comandos y límites; el [manifiesto](manifest.json) identifica doce fuentes de producto y seis archivos de pruebas. Se capturó después de la ejecución focal, antes del commit: no se presenta como un nuevo freeze global medido antes/después.

El [focal inicial](focused-initial.json) y el [final](focused-final.json) se solapan y no se suman como102 pruebas únicas. Entre ambos sólo se precisó el texto del Hero para incluir cartera y se corrigió la metadata bimoneda que podía etiquetar el saldo almacenado como primario cuando el RPC lo desglosa de otro modo. La fila almacenada permanece intacta; la alerta usa los saldos por moneda del desglose. El fixture conserva explícitamente `balance=-10010`, primarioRPC`-10000ARS` y secundarioRPC`-10ZZZ`.

## Alcance implementado

CP3-18 pide ARS120000 conocido, ZZZ10 excluido con causa y patrimonio parcial. El modo de lectura `allowPartialValuation` excluye únicamente monedas históricas fuera del catálogo ya admitido. Conserva saldo/moneda originales y omite equivalentes que no puede calcular. El agregado incorpora sólo cuentas valoradas e informa exclusiones; evalúa primero `include_in_total=false`, de modo que una exclusión elegida por el usuario no convierte su patrimonio en parcial.

Una cuenta bimoneda con secundaria desconocida se excluye íntegramente: no se inventa una valoración0 de esa pata ni se suma su tramo conocido silenciosamente. La UI conserva ambos saldos y explica la moneda afectada. El Hero rotula el subtotal, conserva el historial previo y suprime la comparación entre un subtotal parcial y puntos históricos completos. La serie usa exclusivamente los puntos históricos recibidos, sin insertar un punto completo de hoy a partir del subtotal. El dashboard no invoca snapshot parcial; el grabador también lo rechaza antes de upsert. La barra fija se omite durante el parcial para conservar siempre la explicación junto al subtotal visible.

El opt-in está limitado a GET de cuentas, dashboard, listado/detalle de cuentas y `computeNetWorth`. Bot, IA, helpers de total y referencias de Gastos conservan el modo estricto. Las altas, el catálogo de monedas, la base, sus políticas y los saldos históricos no se modificaron.

Los errores de DB/RPC/Auth y de blue/EUR u otras monedas soportadas siguen siendo errores de disponibilidad. No se añadió un catch que convierta errores generales en subtotales. Las páginas de Cuentas ya contenían `.catch(() => [])`; esas líneas mantienen su comportamiento previo y este cambio no acredita manejo universal de errores en todas las páginas.

CP3-06 conserva centavos USD en Hero principal, equivalente secundario, delta, tooltip y barra fija: USD fraccionario usa dos decimales, USD entero conserva cero. ARS y ticks compactos mantienen su presentación. Las seis aserciones SSR de E2E están incluidas en las51 y no se repitieron por separado. Las correcciones no cambian el count-up ni amplían monedas de `Amount`.

## Evidencia y aceptación pendiente

- `blue-fx-metadata.test.ts`:21 PASS, incluidos fixture literal, modo estricto, exclusión elegida fuera del total, bimoneda divergente y errores EUR/blue conservados.
- `financial-read-errors.test.ts`:5 PASS, incluida la denegación de snapshot parcial sin upsert.
- `dashboard-read-failures.test.ts`:12 PASS, incluidos metadatos/snapshot y los siete fallos previos de datos que deben mostrar indisponibilidad.
- `cp318-account-equivalents.test.ts`:4 PASS con componente SSR real y sin equivalentes0 inventados.
- `cp318-net-worth-hero.test.ts`:3 PASS con Hero/Amount/privacidad reales; sólo se fija la medición de ResponsiveContainer. Historial13/14 conserva200000, sin punto15/subtotal120000 inventado. El control completo conserva el delta real de80000.
- `net-worth-usd-formatting.test.ts`:6 PASS del archivo de E2E, con fraccionarios, enteros y ARS. Sticky SSR oculta no demuestra su activación por scroll en navegador.

Los FAIL reales anteriores de API500 para CP3-18, la visualización182 de181.67USD y las regresiones SSR de precisión se conservan en sus fases originales. Estas pruebas usan dobles de servicios/SDK/proveedores y SSR real; **no son aceptación API/UI autenticada del contrato original**, no ejecutaron DB/API/navegador/build y no sustituyen CI6. El retest real del caso y el gate global necesitan sus propios informes vinculados al código final. No se cambió el estado de las273 filas originales desde esta fase.
