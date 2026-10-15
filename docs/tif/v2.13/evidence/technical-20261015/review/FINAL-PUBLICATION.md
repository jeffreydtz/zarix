# Control de publicación final

La revisión global más reciente es `d9501a795b88a0627d01426cb2c45f1cc848fd2b`: seis comandos npm requeridos PASS, 913/913 pruebas en 92 archivos y auditorías actuales conservadas (siete entradas altas de desarrollo; cero con `--omit=dev`). El código funcional sigue en `84df929ab2f169251a49f3e95d0e0c148dfcb87c`; la única diferencia de configuración excluye evidencia archivada del compilador. Las pruebas API/SSR/Auth/SQL/navegador conservan su revisión original y no se reasignan a otro build.

El [control de fuentes](final-source-and-case-integrity.json) cotejó 458 archivos físicos, 457 de Git, el CSV original de 273 casos y las cuatro migraciones solicitadas. El informe histórico del 09/10 también conserva sus bytes originales. La matriz derivada final es **232 PASS / 1 FAIL / 40 BLOCKED**, con motivos por ID; no significa aceptación de toda la entrega.

La primera revisión de publicación se ejecutó sobre el checkout `5e8f10f4eff58de676848cf90cf3d1588b669303`. Tras la retención y el cierre, el segundo corte fue `f4c9914829975ffc5f2333371487f492ef305e71`, el 15/10 a las 07:14 UTC. En ambos cortes se ejecutó primero el escáner heurístico y después la comparación exacta. Las salidas tienen nombres distintos y los programas rechazan sobrescribirlas.

- Heurística final: [1583 archivos UTF-8, 128 binarios no inspeccionados y dos candidatos](evidence-secret-scan-final-publication.json).
- Comparación exacta final: [53 valores privados seleccionados, 2564 archivos de repositorio y cinco coincidencias](exact-private-value-scan-final-publication.json). La salida bruta conserva `FAIL`; no publica valores ni hashes individuales de secretos.
- Los dictámenes [anterior](publication-privacy-before-retention-review.json) y [final](publication-privacy-final-publication-review.json) clasifican cada path/campo por sus bytes y alcance. Los cinco archivos coincidentes son copias idénticas del helper público congelado, SHA256 `1502eba6281f098c2d7cff8c6cbeb60a795dc0ef16b11239c8b6132af0ee7362`; no se establece una excepción general para archivos futuros.

Estos controles no inspeccionan visualmente los 128 binarios ni demuestran ausencia universal de secretos. La comparación exacta cubre los valores de los archivos privados explícitos del ejecutor, incluidos JWT/JWK, cookies seleccionadas y los checkpoints de recuperación; no recorre cuentas o archivos ajenos. Los informes de cierre añadidos después del corte contienen sólo resultados, referencias y hashes públicos.

La [retención privada revisada](../environment/final-native-retention/README.md) conserva nueve dumps completos, globals/Auth/Storage, tres copias de fuentes y el dump histórico Native22. Su checkpoint es `f378869280ad473b096630ed45ac839fcf822a6735f9dea1598dffaf3ca41a24`. Los nueve HTTP propios y seis stacks nativos quedaron detenidos, con originales y archivos temporales preservados. Esto no constituye otra restauración ni el cumplimiento integral de CNF-12.

La instrucción vigente exige Arc: la preparación nueva de Chrome se canceló antes de ejecutarse. El cierre de la ventana Arc anterior continúa UNKNOWN y Automation permanece habilitado. No se fusiona el PR ni se despliega. La [verificación técnica](../../../VERIFICACION-TECNICA-20261015.md) reúne resultados y bloqueos restantes.
