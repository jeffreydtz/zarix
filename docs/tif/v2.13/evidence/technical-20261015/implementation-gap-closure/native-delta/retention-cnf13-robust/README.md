# Reapertura, conservación y parada del suplemento CNF13

La reapertura reutilizó PROOF y la DB clonada existente. No creó DB, usuarios,
roles ni claves. Se verificaron las 39 tablas originales, las dos identidades
esperadas, el esquema del delta y cero sesiones/refresh antes de iniciar las
pruebas. El dump anterior `a9f03e0b…` permaneció intacto.

El [resultado final](verification.json) acredita un nuevo respaldo Fc privado
de 554859 bytes, con TOC y payload decodificados correctamente e inventario de
65 tablas. Contiene esquema, datos y Auth del clon; no acredita otra
restauración ni cobertura adicional de objetos Storage. Su ruta es
`/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix-private-cnf13-20261015T083636Z/database.dump`,
fuera de Git, en directorio 0700 y archivo 0600. SHA-256:
`1f958b0273576ef9bd488a5ffde575f93f12f5eae3e67ce2114862a19726deaf`.

Antes y después se comprobaron los hashes de los dos respaldos anteriores y
del checkpoint privado final. Las 39 tablas originales conservaron sus
fingerprints. El clon terminó con cero sesiones y refresh grants.

Los procesos temporales fueron REST 94894:61323, Auth 94902:61327, gateway
94910:61321 y proveedor doble 94915:61329, todos en 127.0.0.1. Cada señal
SIGTERM exigió identidad, usuario, inicio, cwd y listener exactos. Después se
detuvo PROOF con la CLI oficial; sus procesos propios y puertos públicos
58321/58322 dejaron de estar activos. Se conservaron el clon y el data
directory, sin DROP, reset ni señales forzadas. Los listeners internos
históricos wildcard de PROOF están registrados en
[reopen-readiness.sanitized.json](reopen-readiness.sanitized.json); no se
atribuyen a loopback ni se afirma ausencia de housekeeping Auth al reiniciar.

Las fuentes ejecutadas están preservadas en [sources](sources). Reapertura
`f0761456…`, launcher `945cb4a1…` y retainer `6425e634…` coinciden con los SHA
completos registrados por los controladores. Las metadata contienen rutas y
referencias existentes; las credenciales sólo se leyeron a RAM/ENV efímero.
No hubo Next, navegador, proveedor real ni otro protocolo en esta reapertura.

Comandos ejecutados desde la raíz del repositorio:

```sh
ZARIX_DELTA_REOPEN_WINDOW=parent-released-cnf13-robust-only python3 docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/native-delta/reopen-existing-clone.py
ZARIX_DELTA_NATIVE_WINDOW=parent-released-frozen-delta python3 docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/native-delta/launch-services.py --private-directory /tmp/zarix-runtime-20261015/implementation-delta-a29a07a8-3b5a-4b66-a16e-bebf2f974cfe
ZARIX_DELTA_STOP_WINDOW=parent-released-after-focal-writers python3 docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/native-delta/retain-and-stop-robust.py --private-directory /tmp/zarix-runtime-20261015/implementation-delta-a29a07a8-3b5a-4b66-a16e-bebf2f974cfe
```

El worker se ejecutó entre el launcher y el retainer; su comando, fuentes y
resultado están en el [suplemento CNF13](../runnernative/cnf13-robust-only/README.md).
