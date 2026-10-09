# Evidencia de verificación técnica aislada

- [Informe técnico y bloqueos](../../VERIFICACION-TECNICA-20261009.md)
- [Commit de código y manifiesto verificado](publication.json)
- [Comandos, fechas, códigos de salida y hashes de fuentes](verification.json)
- [Resultados Vitest completos](final-vitest.json) y [cobertura de alcance limitado](coverage-summary.json)
- [Matriz de 273 casos](case-traceability.csv) y [resumen](traceability-summary.json)
- [SQL completo y restauración sintética](database-verification.json)
- [Microbenchmark SQL, no carga de navegador](performance.json)
- [Lecturas públicas de proveedores](public-quote-providers.json)
- [Bloqueos reales de entorno](environment-and-blockers.json)
- [Revisión independiente](independent-review.md)
- [Auditoría fresca](dependency-audit.json) y [análisis de remediación](dependency-remediation.md)

Los archivos `.log` y `.stderr.log` conservan las salidas de cada comando. El código de salida cero del orquestador permite recoger una auditoría fallida; `verification.json` la mantiene como FAIL. No debe confundirse con un resultado de seguridad aprobado.

PASS cubre solamente el alcance descrito por cada prueba. Los dobles de proveedor/navegador y el fixture SQL de Auth no equivalen a integración autenticada. La entrega sigue parcial, en borrador, sin migraciones remotas ni despliegue.
