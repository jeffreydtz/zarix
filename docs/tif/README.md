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

- `diagrams/*.puml` — código fuente PlantUML (editable).
- `png/*.png` — versiones renderizadas (las que van incrustadas en el `.docx`).

## Regenerar

No hay un runtime de Java local. Los diagramas se renderizan contra el
servidor público de PlantUML:

```bash
pip3 install plantuml requests six httplib2
python3 - <<'PY'
import plantuml, requests, glob, os
s = plantuml.PlantUML(url='http://www.plantuml.com/plantuml/png/')
for f in glob.glob('docs/tif/diagrams/*.puml'):
    url = s.get_url(open(f, encoding='utf-8').read())
    out = f'docs/tif/png/{os.path.splitext(os.path.basename(f))[0]}.png'
    open(out, 'wb').write(requests.get(url, timeout=60).content)
    print('rendered', out)
PY
```

(El header `X-PlantUML-Diagram-Error` en la respuesta indica errores de sintaxis.)

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
