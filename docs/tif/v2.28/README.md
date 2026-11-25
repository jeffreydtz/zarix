# Fuentes de diagramas — tesis v2.28

Las figuras impresas del documento vigente (`ZARIX-Plan-de-Desarrollo-Tecnologico-v2.28`) mandan sobre cualquier fuente anterior, salvo las Figuras 14, 41 y 49, que se alinearon después con el código de `c830f85` (apartado 3). Esta carpeta reúne las fuentes editables (`.dot`, `.mmd` y el generador de prototipos) y los SVG/PNG regenerados desde ellas.

La numeración de este README sigue la tesis v2.34+: se insertó la Figura 39 (*Diagrama de clases general: servicios, módulos y entidades de dominio por paquete*) y las que en v2.28 eran 39–57 pasaron a 40–58.

`docs/tif/v2.13/diagramas/` y `docs/tif/v2.13/figures/` se conservan como snapshot histórico. No se modificaron: las discrepancias respecto de lo impreso se resolvieron aquí, no in situ.

Criterio de inclusión: solo figuras del cuerpo de la v2.28 cuya fuente en `v2.13` no coincidía con lo impreso, o que no tenían fuente en el repositorio. Las figuras que ya coincidían quedan en `v2.13` (apartado 2).

## Cómo regenerar

Desde esta carpeta, con Graphviz (`dot`), `rsvg-convert` y `@mermaid-js/mermaid-cli`. Los `.dot` declaran `fontname=Arial`; si el sistema no la tiene, mapear Arial a Liberation Sans (o equivalente) vía fontconfig para que el PNG no sustituya glifos.

```bash
# Graphviz → SVG → PNG
for f in diagramas/*.dot; do
  base=$(basename "$f" .dot)
  dot -Tsvg -o "figures/${base}.svg" "$f"
  rsvg-convert -d 120 -p 120 --background-color=white \
    -o "figures/${base}.png" "figures/${base}.svg"
done

# Mermaid (fondo blanco; en entornos sin sandbox de Chrome, usar --no-sandbox)
for f in diagramas/*.mmd; do
  base=$(basename "$f" .mmd)
  npx --yes @mermaid-js/mermaid-cli@11 -t default -b white \
    -i "$f" -o "figures/${base}.svg"
  rsvg-convert -d 120 -p 120 --background-color=white \
    -o "figures/${base}.png" "figures/${base}.svg"
done

python3 diagramas/prototipos-pt15-pt17.py
```

El layout de Graphviz no tiene que coincidir píxel a píxel con el recorte embebido en Word; la fidelidad se mide por cajas, atributos, operaciones, multiplicidades y etiquetas.

## Mapeo figura → archivo

| Figura | Título impreso | Fuente |
| --- | --- | --- |
| 5 | PT15 Resumen de tarjeta | `diagramas/prototipos-pt15-pt17.py` → `figures/PT15.png` |
| 6 | PT16 Rendimiento real | `diagramas/prototipos-pt15-pt17.py` → `figures/PT16.png` |
| 7 | PT17 Carga de resúmenes | `diagramas/prototipos-pt15-pt17.py` → `figures/PT17.png` |
| 9 | Dominio conceptual: cuentas, movimientos, resúmenes e ítems pendientes | `diagramas/DOM-Finanzas.dot` |
| 11 | Dominio conceptual: inversiones y rendimiento real | `diagramas/DOM-Inversiones.dot` |
| 14 | ER: movimientos y destino exacto | `diagramas/ER-CU001-Movimientos.dot` |
| 15 | ER: cuentas y categorías | `diagramas/ER-CU002-Cuentas.dot` |
| 16 | ER: identidad y estado comercial | `diagramas/ER-CU002-Usuario.dot` |
| 17 | ER: lotes y ventas | `diagramas/ER-CU004-Inversiones.dot` |
| 18 | ER: grupo y miembros | `diagramas/ER-CU001-Grupos.dot` |
| 19 | ER: bandeja de pendientes, buzón y tokens | `diagramas/ER-CU001-Bandeja.dot` |
| 20 | ER: historial de patrimonio y referencias | `diagramas/ER-CU003-Snapshots.dot` |
| 23 | ROB-CU001: Básico, A01/A08/A10/A11 | `diagramas/ROB-CU001-Registro.dot` |
| 24 | ROB-CU002: Básico, A01/A02/A03: cuentas | `diagramas/ROB-CU002-Cuentas.dot` |
| 25 | ROB-CU003: Básico/A05: saldos y composición | `diagramas/ROB-CU003-Patrimonio.dot` |
| 26 | ROB-CU004: Básico/A01–A03: lote y venta | `diagramas/ROB-CU004-Operacion.dot` |
| 27 | ROB-CU001: A14: carga de resúmenes y correo | `diagramas/ROB-CU001-IngresarResumen.dot` |
| 28 | ROB-CU003: A07: resumen proyectado de tarjeta | `diagramas/ROB-CU003-ResumenTarjeta.dot` |
| 29 | ROB-CU003: A08: rendimiento real frente a inflación | `diagramas/ROB-CU003-RendimientoReal.dot` |
| 30 | Secuencia CU001: alta de movimiento | `diagramas/SEC-CU001-Crear.mmd` |
| 31 | Secuencia CU001: edición y eliminación | `diagramas/SEC-CU001-EditarEliminar.mmd` |
| 32 | Secuencia CU003: armado del Dashboard | `diagramas/SEC-CU003-Dashboard.mmd` |
| 33 | Secuencia CU004: compra | `diagramas/SEC-CU004-Compra.mmd` |
| 34 | Secuencia CU004: venta | `diagramas/SEC-CU004-VentaRPC.mmd` |
| 35 | Secuencia CU002: alta de cuenta | `diagramas/SEC-CU002-CuentasAlta.mmd` |
| 36 | Secuencia CU001 A14: carga de resúmenes | `diagramas/SEC-CU001-IngresarResumen.mmd` |
| 37 | Secuencia CU003 A07: resumen de tarjeta | `diagramas/SEC-CU003-ResumenTarjeta.mmd` |
| 38 | Secuencia CU003 A08: rendimiento real | `diagramas/SEC-CU003-RendimientoReal.mmd` |
| 39 | Diagrama de clases general: servicios, módulos y entidades de dominio por paquete | `docs/tif/diagrams/fig08_clases.puml` |
| 40 | Clases CU001: registro y conversión | `diagramas/CLASES-CU001-Movimientos.dot` |
| 41 | Clases CU001: reglas y presupuestos | `diagramas/CLASES-CU001-Automatizacion.dot` |
| 42 | Clases CU001: gasto compartido | `diagramas/CLASES-CU001-Compartidos.dot` |
| 43 | Clases CU002: cuenta y consulta de saldos | `diagramas/CLASES-CU002-Cuentas.dot` |
| 44 | Clases CU003: análisis, resumen de tarjeta y rendimiento real | `diagramas/CLASES-CU003-Analisis.dot` |
| 45 | Clases CU004: inversión y venta | `diagramas/CLASES-CU004-Inversiones.dot` |
| 48 | Patrones: Strategy y Adapter | `diagramas/PATRONES-Cotizaciones.dot` |
| 49 | Patrón: Template Method | `diagramas/PATRONES-Cron.dot` |
| 50 | Secuencia de patrones: Strategy y Adapter | `diagramas/SEC-StrategyAdapter.mmd` |
| 51 | Secuencia de patrón: Template Method | `diagramas/SEC-TemplateMethod.mmd` |

Origen de cada fuente:

- La mayoría coincide con las fuentes usadas para imprimir la v2.28 (mismas cajas, columnas, mensajes y estereotipos que el raster del PDF).
- Figuras 41 y 44: las copias `CLASES-CU001-Automatizacion.dot` / `CLASES-CU003-Analisis.dot` de ese mismo paquete están simplificadas y **no** coinciden con lo impreso. Aquí se usaron las variantes completas (`fig40-completa.dot` y `fig43-completa.dot`), que sí coinciden.
- Figuras 40, 42, 43 y 45: no había en el repositorio ni en el paquete externo una fuente que coincidiera con lo impreso (las `CLASES-*.dot` de `v2.13` y las simplificadas del paquete omiten cajas y operaciones). Se reconstruyeron a partir del raster de la v2.28, sin agregar ni quitar cajas, atributos u operaciones.
- Figura 39: diagrama de clases general insertado en tesis v2.34+. La fuente en el repositorio es `docs/tif/diagrams/fig08_clases.puml` (servicios, módulos/paquetes y entidades de dominio).

## 1. Figuras actualizadas o agregadas

| Figura | Archivo | Motivo |
| --- | --- | --- |
| 5–7 | `prototipos-pt15-pt17.py`, `figures/PT15.png`–`PT17.png` | No estaban en `prototipos.py` (solo PT01–PT12) |
| 9 | `DOM-Finanzas.dot` | `v2.13` no dibuja bandeja, buzón, resumen importado ni resumen de tarjeta |
| 11 | `DOM-Inversiones.dot` | `v2.13` no dibuja patrimonio, referencias ni rendimiento real |
| 14 | `ER-CU001-Movimientos.dot` | Alineada a `c830f85`: `account_id FK NOT NULL`, origen `accounts 1`, columna `source` con su check |
| 15–18 | `ER-CU002-Cuentas.dot`, `ER-CU002-Usuario.dot`, `ER-CU004-Inversiones.dot`, `ER-CU001-Grupos.dot` | Columnas, nulos y asociaciones del impreso (p. ej. Fig. 18: `text`, `user_id FK NULL`, arista «cuenta vinculada») |
| 19 | `ER-CU001-Bandeja.dot` | No existía en el repositorio |
| 20 | `ER-CU003-Snapshots.dot` | `v2.13` omitía `user_benchmark_settings` y `roi_percent` |
| 23–26 | `ROB-CU001-Registro.dot`, `ROB-CU002-Cuentas.dot`, `ROB-CU003-Patrimonio.dot`, `ROB-CU004-Operacion.dot` | Nombres BCE del impreso (p. ej. `ValidarAcceso` / `GestionarMovimiento`) |
| 27–29 | `ROB-CU001-IngresarResumen.dot`, `ROB-CU003-ResumenTarjeta.dot`, `ROB-CU003-RendimientoReal.dot` | No existían en el repositorio |
| 30–35 | `SEC-CU001-Crear.mmd`, `SEC-CU001-EditarEliminar.mmd`, `SEC-CU003-Dashboard.mmd`, `SEC-CU004-Compra.mmd`, `SEC-CU004-VentaRPC.mmd`, `SEC-CU002-CuentasAlta.mmd` | Participantes y mensajes del impreso (nombres reales de ruta/servicio/RPC) |
| 36–38 | `SEC-CU001-IngresarResumen.mmd`, `SEC-CU003-ResumenTarjeta.mmd`, `SEC-CU003-RendimientoReal.mmd` | No existían en el repositorio |
| 39 | `docs/tif/diagrams/fig08_clases.puml` | Insertada en tesis v2.34+: clases general (servicios, módulos y entidades de dominio por paquete) |
| 40 | `CLASES-CU001-Movimientos.dot` | Reconstruida: 11 operaciones de `TransactionsService` y DTO del impreso |
| 41 | `CLASES-CU001-Automatizacion.dot` | Completa más `CreateBudgetInput` (atributos de `lib/services/budgets.ts`) y «use» desde `BudgetsService.create` |
| 42 | `CLASES-CU001-Compartidos.dot` | Reconstruida: 8 operaciones de `SharedExpensesService` y tipos del impreso |
| 43 | `CLASES-CU002-Cuentas.dot` | Reconstruida: 18 operaciones de `AccountsService` |
| 44 | `CLASES-CU003-Analisis.dot` | Completa: módulos de anomalías, proyección, tarjeta y rendimiento real |
| 45 | `CLASES-CU004-Inversiones.dot` | Reconstruida: 10 operaciones de `InvestmentsService` |
| 48 | `PATRONES-Cotizaciones.dot` | Firmas, estereotipos y «API HTTP externa» del impreso |
| 49 | `PATRONES-Cron.dot` | `NetWorthSnapshotJob` con `fetchItems`, `processItem` y `emptyMessage`, como en `app/api/cron/net-worth-snapshot/route.ts` |
| 50–51 | `SEC-StrategyAdapter.mmd`, `SEC-TemplateMethod.mmd` | Secuencias de patrones alineadas al impreso |

## 2. Figuras que ya coincidían (no se tocaron)

Siguen en `docs/tif/v2.13/`. El raster de la v2.28 coincide con esas fuentes en cajas y texto visible.

| Figura | Fuente vigente |
| --- | --- |
| 1 PT01, 2 PT05, 3 PT07, 4 PT09 | `docs/tif/v2.13/diagramas/prototipos.py` |
| 8 Cuatro casos de uso | `docs/tif/v2.13/diagramas/UC-General.dot` |
| 10 Dominio: reglas y presupuestos | `docs/tif/v2.13/diagramas/DOM-Automatizacion.dot` |
| 12 Dominio: preferencias y plan | `docs/tif/v2.13/diagramas/DOM-Personal.dot` |
| 13 Dominio: gastos compartidos | `docs/tif/v2.13/diagramas/DOM-Compartidos.dot` |
| 21 Arquitectura: vista lógica | `docs/tif/v2.13/diagramas/ARQ-Logica-Impresa.dot` |
| 22 Arquitectura: despliegue objetivo | `docs/tif/v2.13/diagramas/ARQ-Despliegue-Impresa.dot` |
| 46 CFG 01 Guardas | `docs/tif/v2.13/diagramas/CFG-01-Guardas.dot` |
| 47 CFG 01 Frecuencia | `docs/tif/v2.13/diagramas/CFG-01-Frecuencia.dot` |
| 52–58 capturas del Anexo F | no son diagramas de diseño; no hay fuente `.dot`/`.mmd` |

Vistas **solo de anexo digital** (Anexo E) que no están impresas en el cuerpo: no se actualizaron. Siguen, cuando existían, en `v2.13` (p. ej. `ER-CU001-Recurrentes`, `ER-CU001-Presupuestos`, `ER-CU001-Reparto`, `ER-CU002-Integraciones`, `CLASES-Datos-*`, `SEC-CU001-OCR` y el resto de ROB/SEC de detalle). PT13 (bandeja) y PT14 (integraciones) siguen sin generador en el repositorio; no se reconstruyeron porque no son figuras del cuerpo.

La integración PAT/MCP/REST citada por el Anexo E para componentes sigue en `docs/tif/diagrams/fig14_integraciones.puml`.

## 3. Alineación posterior con el código (`c830f85`)

Las Figuras 14, 41 y 49 se actualizaron para coincidir con `c830f85`. Los PNG de esas tres se regeneraron a ~300 dpi.

1. **Figura 14 / `transactions`.** `uuid account_id FK NOT NULL` y origen `accounts 1`. Columna `text source NOT NULL (web|telegram|wallet|api|mcp|email|statement)` (`supabase/schema.sql` hacia 6672 y 6950; migración `20261111154733_transactions_account_id_not_null.sql`).
2. **Figura 41 / `CreateBudgetInput`.** Caja «interface» con `userId`, `categoryId`, `month`, `amount`, `currency`, `rolloverEnabled?`, `alertAtPercent?` y arista «use» desde `BudgetsService` (`lib/services/budgets.ts:7-15`).
3. **Figura 49 / `NetWorthSnapshotJob`.** Tercera operación protegida `#emptyMessage(): string` (`app/api/cron/net-worth-snapshot/route.ts:31`).

Queda como coincidencia, no como hueco: `TransactionsService.getMonthSummary` y `AccountsService.getTotalBalance` / `getTotalBalanceWithInvestments` se dibujan sin tipo de retorno porque el código tampoco anota uno.
