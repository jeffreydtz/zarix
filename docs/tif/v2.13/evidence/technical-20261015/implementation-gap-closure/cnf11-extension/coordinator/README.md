# Coordinación, conservación y cierre

El [bootstrap](build-only/prepare-source.sanitized.json) creó exclusivamente
una copia f5 nueva de 517 archivos y metadata con referencias existentes,
sin SQL, Auth ni servicios. Sus fuentes ejecutadas están preservadas. Los
[seis controladores](source-manifest.json) se congelaron antes de reabrir;
[executed-attempt-1/sources](executed-attempt-1/sources) conserva sus bytes.

La [apertura](executed-attempt-1/reopen-readiness.sanitized.json) verificó 39
tablas originales, dos identidades existentes y Auth0. A tenía 18 cuentas
activas habilitadas para movimientos, con dos lugares disponibles dentro del
límite Premium de 20. No hubo creación de DB, identidad, rol o acceso externo.

REST 4863:61323, Auth 4872:61327, gateway 4881:61321 y doble HTTP 4886:61329
escucharon sólo en 127.0.0.1. PROOF se reabrió conservando sus cuatro servicios
y configuración; sus dos listeners internos wildcard están registrados, sin
atribuirles loopback ni ausencia de housekeeping Auth. Cada actor temporal
se reservó en un journal antes de Popen y se registró por PID/inicio/cwd/puerto.
No se guardaron sus env ni stdout/stderr crudos.

La [parada](executed-attempt-1/retention-stop.sanitized.json), SHA
`02aed8138224ee2ddc42acfef219ad79bb89e50d4fabb625718914cc70ccc868`,
confirmó cero sesiones/refresh, originales intactos, TOC y payload del Fc
válidos, y después detuvo exactamente los cuatro actores con SIGTERM. Verificó
identidad, inicio, cwd y listener antes de señalar. PROOF terminó mediante CLI
oficial con exit0; sus procesos propios y puertos públicos dejaron de estar
activos. No hubo DROP, reset ni señales forzadas del coordinador.

Respaldo sensible autorizado, fuera de Git: directorio 0700 y archivo 0600
`/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix-private-cnf11-extension-20261015T095427Z/database.dump`.
Tamaño 564353 bytes; SHA
`f0c4bdedbc47c0c3e2dcf6468e902849e3821bc3d1489803987d6da285f322ea`.
Incluye 65 tablas de esquema/datos/Auth. No acredita nueva restauración ni
backup adicional de objetos Storage. Los Fc anteriores y el checkpoint
privado final conservaron sus hashes, incluido el Fc `1f958b…` precedente.

Los comandos históricos fueron ejecutados desde la raíz del repositorio,
con `ZARIX_CNF11_EXTENSION_WINDOW=parent-released-cnf11-extension`:

```sh
python3 docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/cnf11-extension/coordinator/reopen.py --targets /tmp/zarix-runtime-20261015/cnf11-extension-27e6af51-dcbd-4498-99ef-aec049bb9cc0/targets.metadata.json
python3 docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/cnf11-extension/coordinator/launch-services.py --private-directory /tmp/zarix-runtime-20261015/cnf11-extension-27e6af51-dcbd-4498-99ef-aec049bb9cc0
# Workers nominal y bot secuenciales; comandos y fuentes en sus paquetes.
ZARIX_CNF11_EXTENSION_STOP=parent-released-after-both-workers-and-auth-zero python3 docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/cnf11-extension/coordinator/retain-and-stop.py --private-directory /tmp/zarix-runtime-20261015/cnf11-extension-27e6af51-dcbd-4498-99ef-aec049bb9cc0
```

No se reejecutan estos comandos sobre el paquete sellado ni se sobrescriben
intentos. Las fuentes exigen sus ventanas y referencias; no contienen nuevas
copias de credenciales. Los tokens/cookies permanecieron en RAM y los
checkpoints de restauración del plan quedaron privados. Este coordinador no
implementa recuperación automática de perfiles o sesiones tras un hard kill:
un fallo habría dejado owner/journal y BLOCKED para inspección explícita.
