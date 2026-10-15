# Reinicio preservado de la quinta réplica

PASS de alcance: un reinicio oficial de Supabase CLI2.120.0 únicamente en PROOF58321/58322, preservando datos/configuración y levantando la misma copiaCI4 `836fd18`/BUILD_ID `a2WBtszbvrpoT9GHwToED`. Next52579 se detuvo tras verificarPID, hora, cwd y listener propio; Next99286 devuelve login200 y Authhealth200. PostgreSQL48287→98670 y su hora de inicio cambió de03:11:55.958009 a04:24:54.608301UTC.

Las11comparaciones de [evidencia](proof-stack-restart.json) son verdaderas:64tablas (27public/27auth/10storage), esquema/ACL de pg_dump, claves/configuración/env/logins, identidad de servicios y cambios de PID/horaPG. Auth conserva las dos identidades sintéticas y Storage0objetos. Se guardó primero un dumpFc privado0600 y se leyó su TOC; este paso no vuelve a demostrar restauración.

Los cinco statefiles restantes coinciden. No se conectó a sus bases ni se afirma igualdad de sus filas. La captura posterior precede al replay del auditor y a sus sesiones normales. El replay durable queda en un informe separado; no se suma este control a los22grupos nativos ni se convierte en aceptaciónCNF12. El gateway público y PG preservan sus puertos; aquí no se mide binding/LAN/TLS del REST interno.

Fuentes exactas: [captura](proof-restart/capture.py), [reinicio guardado](proof-restart/restart.py) y [arranque de la misma copia](proof-restart/start-same-build.py). SusSHA están enJSON. Env, dump y logs con credenciales se conservan sólo en `/tmp/zarix-runtime-20261015/proof-restart-private` con acceso privado; no se versionan. El state original no se sobrescribió: el nuevo es `proof-restart-app-state.json`.
