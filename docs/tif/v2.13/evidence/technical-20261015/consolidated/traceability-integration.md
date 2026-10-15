# Integración de trazabilidad técnica

El diseño original [casos_prueba.csv](../../../casos_prueba.csv) conserva 273 contratos y SHA256 `887adbef81be56f781133ced65bee1c92effcf9af9a3e0b1b389eed0e4e2717d`. Las matrices derivadas son archivos separados. La fase elegida actualmente es **CI6/core-closure**, producto `84df929ab2f169251a49f3e95d0e0c148dfcb87c`; su global tiene 913 pruebas Vitest, fuentes limpias/estables y comandos explícitos.

La [matriz actual](../case-traceability.csv) registra **232 PASS, un FAIL y 40 BLOCKED**. El [delta por ID](case-status-delta.json) y las [fases preservadas](phases/core-closure-reviewed-232-1-40-summary.json) permiten separar los resultados históricos. Los 168/0/105 del 09/10, 170/0/103 de GLOBAL1, 194/1/78 y 213/3/57 de fases posteriores no se presentan como el resultado actual. Los FAIL de precisión/subtotal parcial de CI5 se conservan junto con su corrección y nueva aceptación compilada de CI6; CP2-09 sigue FAIL literal por el HTTP 400 del proveedor frente a 401/403 pedidos.

La [revalidación de empaquetado posterior](../documentation-build-closure/executed/verification.json) corresponde a `d9501a795b88a0627d01426cb2c45f1cc848fd2b`: ocho comandos, seis npm requeridos PASS, 913 pruebas en 92 archivos y auditorías completa FAIL/producción PASS. La única diferencia de configuración frente al runtime 84 es excluir los snapshots documentales de tsconfig. No sustituye los informes CI6 ni reasigna los contratos runtime a d950; `--core-dir core-closure` permanece explícito para esa evidencia.

## Reconstrucción reproducible

```sh
python3 docs/tif/v2.13/evidence/technical-20261015/consolidated/reconcile-reviewed-contracts.py
python3 scripts/build-technical-traceability.py \
  --evidence-dir docs/tif/v2.13/evidence/technical-20261015 \
  --core-dir core-closure
python3 docs/tif/v2.13/evidence/technical-20261015/consolidated/build-draft.py
```

El CLI selecciona la fase mediante `--core-dir`; no elige automáticamente el informe más reciente. El valor por defecto `core/` sigue siendo la fase histórica GLOBAL1. La selección nativa prioriza `native-full/native-verification.json`, conservando el layout anterior como fallback. Si existe `environment/runtime-manifest.json`, usa esa referencia real. Las regresiones de estas reglas están preservadas por fase en [traceability-guards](traceability-guards/manifest.json) y [selección explícita de core](traceability-guards-phase2/README.md).

El adaptador fija los hashes de los dictámenes y artefactos. Sólo incorpora metadatos completos, con aserciones exactas y aceptación independiente del contrato original. Las revisiones compuestas declaran qué parte procede de servicio, SQL, Auth nativo, componente SSR o UI, con cada revisión/build separado. No se atribuye a una copia CI4 un formatter de CI5/CI6 ni se convierten componentes SSR en navegador. CP1-07, cuyo canal literal es UPDATE SQL, combina el fixture SQL de 1500→11500 con una transición nativa de 100→10100 distinta; la API inmutable no era su bloqueo.

`complete_original_contract=true` expresa cobertura completa del contrato registrado; su estado puede ser FAIL. El adaptador conserva CP2-09 como FAIL y no cambia el HTTP del proveedor para aprobarlo. Las preparaciones, lecturas parciales y fixtures no promueven casos vecinos. La interpretación de cada paquete permanece en [system-case-results.json](../system-case-results.json) y sus dictámenes enlazados.

`build-draft.py` ejecuta además [reconcile-blocker-reasons.py](reconcile-blocker-reasons.py): refina únicamente motivo y referencias de las filas que siguen BLOCKED, sin modificar su estado ni el CSV original. Produce [motivos concretos](blocked-contract-reasons.json), actualiza hashes/delta y la reconciliación actual del triage, conservando su snapshot histórico. Después genera la matriz técnica de alcances y el índice de entradas. Estos helpers sólo procesan archivos; no ejecutan SQL, Auth, API, navegador, build ni fixtures.

## Contratos de durabilidad y conciliación

[reconciled-contracts.json](reconciled-contracts.json) conserva los contratos inline anteriores RTV-034/038 y sus aserciones sustitutas de equivalencia de outbox. El CLI sólo acepta el mapeo si el nombre completo existe y pasó en `final-vitest.json` de la fase seleccionada. No son prueba de entrega Telegram real ni del mecanismo inline antiguo. Las tres aserciones de conciliación paginada anteriores son complementarias sin IDs en los 273 casos: [su reemplazo](recompute-contract-reconciliation.json) no crea tres aprobaciones originales.

## Bloqueos originales y evidencia parcial

CP2-19 conserva su matriz exacta de 42 PASS/seis BLOCKED por operaciones no soportadas; faltan GET individual de inversión y CRUD privado de perfil. SELECT/INSERT como U2/UPDATE/DELETE mediante API y JWT DB sobre seis familias no se infieren desde las operaciones vecinas. FileVault local observado es evidencia de volumen separada del cifrado del proveedor y de RLS.

CNF-01 conserva carga local fallida/incompleta y falta de equivalencia del despliegue; CNF-02 exige la serie mensual real. CNF-03 no tiene aceptación HTTPS/certificado/redirect financiero. CNF-09 pide la suite crítica en Chrome/Firefox/Safari/Edge con versiones estables exactas y perfiles frescos; **el CSV no exige una versión anterior adicional**. Sólo Chrome histórico tiene UI ejecutada. Firefox/Edge no se instalaron por decisión humana; Safari WebDriver está disabled. Arc Automation fue autorizada y habilitada, pero la ventana creada mantiene cierre UNKNOWN. El nuevo steering «usa Arc» no autoriza suplir sus pendientes con más Chrome ni tocar perfiles, pestañas o sesiones personales. Los criterios de versión de otros documentos no se agregan al literal de esta fila.

CNF-05 a 08 requieren tareas, estados, teclado/scroll/modal y legibilidad a 320×568,375×812,768×1024 y 1440×900 con zoom 200%. Las capturas anteriores son lecturas acotadas. CNF-08 es responsive de inversiones; no se le atribuye el requisito ajeno de un estudio con cinco participantes. CNF-06 además carece del flujo UI de reset: un reset por API/SMTP local no crea esa pantalla.

[CNF-12 nominal](../cnf12-nominal/README.md) ya ejecutó las dos DB UUID nuevas, fixture 2 cuentas/20 movimientos/3 lotes/1 regla/1 grupo, snapshot 05→06 Oct, gasto posterior 1500 ausente, restore SQL real 0,469 s y Storage 34 B, con dos checkpoints de las 64 tablas originales/catálogo/roles/bindings iguales. Las fronteras RPO/RTO son modelos de timestamps. Siguen sin demostrarse el plan real contratado, las cuatro UI del fixture nominal y un RTO observado 3 h 30; las cuatro lecturas UI RESTORE anteriores tienen otra fixture y FX auxiliares posteriores declaradas. No se marca la parte nominal ya ejecutada como falta de acceso.

Los [motivos por ID](blocked-contract-reasons.json) separan superficies/implementaciones ausentes, contradicciones del contrato, ensayos locales pendientes, permisos y proveedores. Un BLOCKED no significa automáticamente que falte una credencial. Las filas técnicas representan alcances que pueden solaparse; no son casos originales únicos ni se suman a las 913 pruebas globales.

El [steering vigente de navegador](../e2e/browser-preflight/current-user-browser-steering.json) registra la última instrucción humana «usa Arc». La autorización Chrome anterior se conserva histórica; no habilita nuevas pruebas Chrome para sustituir Arc. La preparación de CP2-21/CNF-06/CNF-08 quedó cancelada sin ejecución, perfiles ni cambios de datos; Arc mantiene Automation concedida y cierre de ventana UNKNOWN.
