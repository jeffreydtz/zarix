# Estado de compatibilidad de navegadores,15/10/2026

**CNF-09 sigue BLOCKED.** [current-status.json](current-status.json) reconcilia las decisiones humanas y una lectura actual de las aplicaciones instaladas. No ejecutó navegador, descargó software ni modificó permisos.

| Navegador | Versión instalada observada | Resultado actual |
| --- | --- | --- |
| Chrome | 146.0.7680.165 | Evidencia histórica real de cuatro CU y matriz visual, con alcance parcial; no sustituye otros navegadores. |
| Safari | 27.0.1 | WebDriver bloqueado; Remote Automation permanece disabled. |
| Arc | 1.168.0 | Automation Codex→Arc autorizada y concedida; el primer intento falló al resolver su ventana propia. Cierre sin confirmar, a la espera de reconciliación humana. |
| Firefox | Ausente | El usuario rechazó instalarlo; no ejecutado. |
| Edge | Ausente | El usuario rechazó instalarlo; no ejecutado. |

Arc no volvió a crear ventanas o pestañas. La regresión visual del gráfico en cuatro configuraciones sigue bloqueada; la revisión estática y un motor Chromium incorporado no constituyen una prueba de Arc. El estado detallado, la autorización nativa y el intento fallido están en [user-browser-scope.json](../e2e/browser-preflight/user-browser-scope.json), [arc-launch-permission-preflight.json](../e2e/browser-preflight/arc-launch-permission-preflight.json) y [arc-newtab-execution.json](../e2e/browser-preflight/arc-newtab-execution.json). La alternativa LittleArc fue preparada y revisada, sin ejecución.

El [preflight original](preflight.json), su [documento preparado](README-prepared-20261015T0051.md) y el [manifiesto histórico](manifest-prepared-20261015T0051.json) se conservan con sus fechas. La propuesta anterior de descargar Firefox/Edge quedó superada por el rechazo del usuario. No es una solicitud de autorización actual. El runner W3C permanece preparado, sin resultados de compatibilidad; su guard sin ventana sólo acredita que se niega a ejecutar.

La matriz original de navegadores y versiones actual/anterior no se completó. Ningún subcaso de lectura parcial promueve automáticamente los CP completos; CNF-02 mensual requiere su período real de observación.
