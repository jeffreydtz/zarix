# TIF UAI 2026 — Diagramas ICONIX de Zarix

Fuentes editables de los diagramas de la sección técnica del **Trabajo Integrador
Final** (`Zarix_TIF_Jeffrey_Dietz.docx`, sección 10 "Aspectos Descriptivos de la Solución
Tecnológica" + Anexo D). Siguen la metodología **ICONIX** y las convenciones del
material de cátedra (PlantUML, leyenda, checklists por tipo de diagrama).

> Todos los diagramas se derivan por ingeniería del **código real** del repo
> (Next.js 15.5.25 + Supabase), no de un diseño teórico. Cada uno fue verificado de
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
| 12 | `fig12_patron_template_method` | Patrón GoF | Template Method en `lib/cron/cron-job.ts` |
| 13 | `fig13_estilos` | Estilos Arquitectónicos | 8 estilos |

- `diagrams/*.puml` — código fuente PlantUML (editable).
- `png/*.png` — versiones renderizadas (las que van incrustadas en el `.docx`).

## Regenerar

Render **local**: no subir los diagramas a servicios externos. En Linux con Java y PlantUML instalados, usar `-pipe` conserva el nombre del archivo fuente aunque el título `@startuml` sea distinto:

```bash
mkdir -p docs/tif/png
for source in docs/tif/diagrams/*.puml; do
  name="${source##*/}"
  java -Djava.awt.headless=true -jar /usr/share/plantuml/plantuml.jar -Sdpi=150 -tpng -pipe \
    < "$source" > "docs/tif/png/${name%.puml}.png"
done
```

Revisar errores de PlantUML y abrir los PNG antes de incrustarlos. Reemplazar las imágenes existentes en el DOCX conservando su tamaño y relación de aspecto; la portada no es un diagrama. Actualizar los textos y tablas que describen las figuras junto con las fuentes.

## Auditoría de septiembre de 2026

La [adenda académica](ADENDA-AUDITORIA-2026-09-14.md) y el [informe de auditoría](../AUDITORIA-2026-09-14.md) documentan el estado vigente. `RESULTADOS-PRUEBAS.md` conserva las mediciones históricas. El dashboard ya no registra snapshots al visitar; el cron diario realiza esa escritura. Las figuras 4, 7, 10, 11 y 12 reflejan los cambios de flujo, fuentes y automatización; las leyendas técnicas reflejan Next.js 15.

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
