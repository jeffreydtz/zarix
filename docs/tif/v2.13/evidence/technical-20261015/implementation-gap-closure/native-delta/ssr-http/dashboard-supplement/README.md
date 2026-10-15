# CP3-17: ambos dashboards reales, suplemento26/26 PASS

Composición explícita con [SSR38](../attempt-1/README.md), cuyo resultado permanece
intacto. Después de terminar los escritores CNF11/CNF13, se abrieron dos sesiones
normales nuevas y cada una guardó su propia preferencia por API Next730.

Dashboard A respondió200 sin Hero, Sticky ni sentinel, con USD/oculto guardado.
Dashboard B respondió200 con Hero/Sticky visibles, baseARS, React key de su
propio usuario y patrimonio propio0 que excluye los datos de A. HTML y Flight
reales coincidieron. Ninguna página recurrió al error financiero seguro.

Los siete inventarios financieros/históricos fueron iguales antes/después.
Los logout locales del SDK no devolvieron error; SQL final confirmó cero
sesiones y cero refresh tokens. Las 514 fuentes de la copia730 permanecieron
iguales. No se guardó HTML completo, cookies, JWT ni entornos; no hubo navegador,
hidratación ni aceptación visual.

[Resultado](verification.json) y [fuente ejecutada](sources/run-dashboard-supplement.mjs).
