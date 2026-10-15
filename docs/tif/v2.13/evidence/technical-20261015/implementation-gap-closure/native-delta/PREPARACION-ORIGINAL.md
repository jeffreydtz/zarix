# Delta focal Native posterior al checkpoint publicado

**PREPARED_NOT_EXECUTED.** No es evidencia de casos aprobados. Esta preparación
no inicia procesos, abre conexiones SQL, crea usuarios ni aplica migraciones.
La ejecución requiere el release explícito del coordinador después del freeze.

El checkpoint publicado `7f71f2757a4decb0e0becbafb82860008b2f9185` y su entrega
permanecen históricos. Los resultados nuevos tendrán revisión propia y no
reescribirán los reportes, CSV ni backups anteriores.

Destino mínimo: reabrir únicamente PROOF con CLI oficial 2.120.0 y su HOME
aislado, crear `zarix_delta_<UUID>` con TEMPLATE template0 y restaurar esquema
desde el dump PROOF conservado. Se clonan exclusivamente las dos identidades
Auth existentes, sus perfiles y el historial de migraciones Auth; las tablas
financieras nuevas empiezan vacías. No se escribe en tablas originales de PROOF.
Se aplican sólo las migraciones delta cuyo SHA quede fijado después del freeze.
Los datos históricos originales y el backup privado final no se modifican.

GoTrue y PostgREST oficiales cacheados se ejecutarán contra el nuevo nombre de
DB, con gateway Auth/REST dedicado. Se reutilizan las claves y contraseñas
sintéticas existentes. Todos los servicios temporales deben demostrar listener
loopback y PID/cwd/argv propios. El gateway no reenvía Storage ni rutas generales.
Esto acredita una réplica acotada para las pruebas, no una nueva restauración
integral de Auth/Storage ni recuperación de producción.

Rutas privadas reutilizables, nunca valores en evidencia:

- `/tmp/zarix-runtime-20261015/proof.env`
- `/tmp/zarix-runtime-20261015/proof-logins.json`
- `/tmp/zarix-runtime-20261015/home/stacks/c23a7df7600999c31f2d8435146f55289db07f9f62dfc5d6f08b2562a1529a09/state.json`
- `/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix-private-final-20261015T070553Z/stacks/proof/database.dump`

El dump tiene SHA256
`b2006c91a87a039e9cfa5d87995c622d62dd8a59596f916718f356383a350a0a`;
el checkpoint privado íntegro tiene SHA256
`f378869280ad473b096630ed45ac839fcf822a6735f9dea1598dffaf3ca41a24`.
No se copian estos archivos a Git ni a servicios externos.

Casos autorizados: CP1-08 DELETE1500 y reversión8500→10000 con OLD/actor;
CP2-11/12 y CP3-17 preferencias ARS/USD, visibilidad y persistencia entre
sesiones, aislamiento y entradas manipuladas; CNF13 nueve solicitudes con
correlaciones independientes para creación/rechazo/fallo SQL, cron válido/
Bearer inválido/fallo Telegram posterior al commit y webhook MP válido/
firma falsa/fallo HTTP del proveedor. Los dobles Telegram/MP/cotizaciones deben
declararse como tales; no equivalen a las integraciones reales bloqueadas.

No se abrirán ventanas de Arc/Chrome, no se repite carga masiva y no se afirma
UI desde pruebas API/DB. La preferencia visual requiere evidencia SSR o de
componentes reales ligada a la revisión; hidratación/interacción quedan fuera
sin navegador autorizado. Las pruebas no alteran reglas de borrado de cuentas,
tipo de cambio ni contratos originales para fabricar PASS.

Antes de operar se verifican ayuda de CLI, estado detenido e identidad exacta,
puertos libres, hashes del backup y del código congelado. Después se comparan
las tablas originales con sus fingerprints READ ONLY y se cierran únicamente
las sesiones/procesos nuevos propios. Una falla retiene diagnósticos privados;
no habilita reset, DROP, destroy ni signals contra PIDs no verificados.
