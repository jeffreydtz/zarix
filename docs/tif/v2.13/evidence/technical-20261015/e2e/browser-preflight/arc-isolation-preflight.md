# Arc: preflight de aislamiento

Arc instalado: **1.168.0 (88413)**. ArcCore declara **155.0.8059.40** en sus metadatos; no se observó un agente de usuario durante ejecución.

**BLOCKED:** no se verificó un contrato de lanzamiento del wrapper Arc que garantice perfil temporal y canal pipe independientes. No se lanzó ni se adjuntó Arc; no se enumeraron pestañas, perfiles o sesiones, ni se alteraron permisos. La presencia de cadenas de flags en un binario no prueba su comportamiento. El padre aceptó este bloqueo y ordenó conservar la instancia personal.

[Playwright](https://playwright.dev/docs/api/class-browsertype) documenta el perfil separado para navegadores compatibles y advierte sobre ejecutables personalizados. [Chromium](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md) sitúa la implementación del override en ChromeMainDelegate y advierte que otras plataformas pueden no implementarlo. La [FAQ de Arc](https://arc.net/faq) sólo establece que usa Chromium; la [página de desarrolladores](https://arc.net/developers) consultada no aporta garantía de aislamiento del wrapper. Fuentes consultadas el 15 de octubre de 2026; detalle y metadatos reproducibles en [JSON](arc-isolation-preflight.json).

Las cuatro regresiones visuales posteriores a la corrección del gráfico siguen **BLOCKED**. La corrección implementada y los controles de CI no equivalen a una prueba UI. No se sustituyó Arc por Chrome o ArcCore. Firefox y Edge no se instalaron por decisión humana; Safari mantiene Remote Automation desactivada.

La aclaración humana posterior permite una ruta UI soportada limitada a una pestaña local nueva, sin exigir perfil separado. El diccionario instalado `Arc.sdef` sí declara una ventana incógnita y referencias devueltas. La preflight nativa posterior devuelve **-1744, errAEEventWouldRequireUserConsent** para Codex→Arc; no se pidió consentimiento todavía. Accesibilidad y grabación de pantalla tampoco están previamente autorizadas.

Se prepararon [AppleScript](run-arc-newtab.applescript) y [driver](run-arc-newtab.py) para revisión concreta antes de solicitar ese permiso específico. Sólo crean su propia ventana incógnita/pestaña login local 3002, leen contadores DOM y cierran la referencia creada. No ejecutados. Si JavaScript por AppleEvents está deshabilitado, el ensayo queda bloqueado; el script nunca habilita esa opción. El timeout o un cierre no confirmado se reportan sin cerrar ventanas ajenas.
