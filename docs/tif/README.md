# TIF UAI 2026 — Diagramas ICONIX de Zarix

Fuentes editables de los diagramas de la sección técnica del **Trabajo Integrador
Final** (`Zarix TIF v2.docx`, sección 10 "Aspectos Descriptivos de la Solución
Tecnológica" + Anexo D). Siguen la metodología **ICONIX** y las convenciones del
material de cátedra (PlantUML, leyenda, checklists por tipo de diagrama).

> Todos los diagramas se derivan por ingeniería del **código real** del repo
> (Next.js 14 + Supabase), no de un diseño teórico. Cada uno fue verificado de
> forma adversarial contra el código fuente.

## Catálogo

| Figura | Archivo | Tipo | CU / Referencia |
|---|---|---|---|
| 1 | `fig01_casos_uso` | Casos de Uso (include/extend) | CU-001…CU-006 |
| 2 | `fig02_modelo_dominio` | Modelo de Dominio Conceptual | 8 entidades |
| 3 | `fig03_robustez_mov` | Robustez | CU-001 Registrar Movimiento |
| 4 | `fig04_robustez_dashboard` | Robustez | CU-003 Visualizar Dashboard |
| 5 | `fig05_secuencia_mov` | Secuencia | CU-001 Registrar Movimiento |
| 6 | `fig06_paquetes` | Paquetes / Capas | arquitectura |
| 7 | `fig07_componentes` | Componentes | Vercel/Supabase/Bot/APIs |
| 8 | `fig08_clases` | Clases Técnico | Servicios + Entidades |
| 9 | `fig09_er` | Entidad-Relación | 8 tablas + RLS |
| 10 | `fig10_despliegue` | Despliegue | serverless cloud-native |
| 11 | `fig11_patron_strategy` | Patrón GoF | Strategy en `cotizaciones.ts` |
| 12 | `fig12_estilos` | Estilos Arquitectónicos | 8 estilos |
| 13 | `fig13_patron_template_method` | Patrón GoF | Template Method en `lib/cron/cron-job.ts` |

- `diagrams/*.puml` — código fuente PlantUML (editable).
- `png/*.png` — versiones renderizadas (las que van incrustadas en el `.docx`).

## Regenerar

Render **local** (preferido: los diagramas derivan del código privado, no
subirlos a servidores externos). No hace falta Java instalado: se usa un JRE
portable + `plantuml.jar` con el layout Smetana (sin Graphviz):

```bash
# una sola vez, en un dir temporal:
curl -sL -o jre.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jre/hotspot/normal/eclipse"
tar xzf jre.tar.gz
curl -sL -o plantuml.jar "https://github.com/plantuml/plantuml/releases/download/v1.2025.2/plantuml-1.2025.2.jar"

# render (el JAVA es el bin dentro del JRE extraído):
$JAVA -Djava.awt.headless=true -jar plantuml.jar -Playout=smetana -tpng \
  -o docs/tif/png docs/tif/diagrams/*.puml
```

Ojo: PlantUML nombra el PNG según el nombre del `@startuml` (`D-XXX-...`);
renombrar a `figNN_*.png` después de renderizar. Alternativa histórica: el
servidor público de PlantUML (`www.plantuml.com`) — evitarlo para no exponer
la arquitectura interna.

## Convenciones (cátedra)

- Título `ZARIX — <descripción> (<CU>)`; leyenda abajo a la derecha.
- `skinparam linetype ortho`, fondo blanco, fuente Arial.
- Robustez: solo boundary/control/entity; mensajes en voz activa; alt/opt.
- Secuencia: actor + boundary + control + `database PostgreSQL`; SQL explícito;
  activate/deactivate; alt/opt.
- Modelo de dominio: conceptos en español, atributos en lenguaje natural (sin
  campos técnicos), relaciones con cardinalidad.

## Material de referencia del profesor

Repo de cátedra (ICONIX aplicado a Odoo, plantillas y checklists):
`https://github.com/cursos-uai/sap_tfi_2026`
