# CNF-12: fixture nominal adicional de restauración SQL

**Parte nominal SQL ejecutada; CNF-12 integral sigue BLOCKED.** El [resumen](summary.json) conserva las dos fases y sus límites. El [plan](plan.json) reproduce la parte nominal autorizada en dos bases nuevas dentro del stack RESTORE ya existente. No modifica `postgres`, los demás stacks, usuarios, roles, servicios HTTP ni credenciales. Native controla el lifecycle y las huellas originales; E2E controla el fixture, dump/restauración y oráculos.

La [primera corrida](attempt-1-parser-failure/verification.json) logró20aserciones PASS: fixture exacto, backup real, restauración real, las64tablas y catálogo iguales, pérdida1500 ausente y RLS SQL A/B. Después falló el **arnés** al intentar interpretar `t` de PostgreSQL como JSON. El reporte FAIL, la fuente ejecutada SHA309e06c y el plan se preservan completos; no se convierten retrospectivamente en PASS. La [corrección](parser-correction.json) envuelve la consulta booleana con `to_jsonb` en el runner futuro; ese runner completo corregido **no se volvió a ejecutar**.

La [continuación acotada](resume-verification.json) logró19/19aserciones PASS tras comparar el snapshot y el estado fuente con el gasto perdido exacto. No volvió a sembrar, crear backup ni restaurar la DB. Validó permisos y tres probes con rollback: edición de transferencia150, eliminación de la transferencia100 y venta1×120 con costo100/P&L20USD suministrado independientemente. Todas las tablas y el catálogo/secuencias quedaron idénticos después. Estos son conteos por fase con guardas repetidas, no39 casos originales distintos. Las fuentes del resume permanecieron estables.

El dump custom privado tiene550220bytes y SHA256`0144c592aa25d1035840313a6ecc38cd9db5d610ebd2bdbcbf4845d83745d52e`. `pg_dump` tardó0,173s y `pg_restore`0,469s, este último05:45:04.802–05:45:05.271UTC del15/10. La validación continuó05:53:56–05:54:16UTC durante20,570s después del diagnóstico/revisión. **No se unen esas fases como una observación continua de RTO de servicio.** [actualTiming](resume-verification.json) mantiene los tiempos originales sin sobrescribirlos.

Se reutilizan las dos identidades Auth sintéticas, sus perfiles y un grupo con miembros/invitado existentes. Ambas cuentas del fixture pertenecen a A; B sirve como dueño ajeno. Las cuentas parten de cero:20 movimientos económicos exactos dejan A10000 y B2000ARS, incluidos dos ingresos iniciales, ocho pares ±100 y dos transferencias100 de ida/vuelta. No se excluyen ajustes ocultos para cuadrar el conteo. Tres lotes manuales distintos tienen costo300, valor330 y P&L30USD; no debitan efectivo. Hay una regla inactiva y un grupo.

Después del dump privado, sólo la fuente nominal recibe el gasto1500; queda con21 movimientos y A8500. La base destino inicialmente vacía debe recuperar20 movimientos, A10000/B2000 y ningún registro del UUID perdido. Se comparan todas las tablas de public/Auth/Storage y funciones, permisos, RLS, índices, columnas y triggers. Roles SQL reales con claims de A/B verifican aislamiento, y probes de transferencia/venta se revierten completos antes de volver a comparar hashes. **SET LOCAL ROLE no se presenta como sesión normal HTTP Auth.**

El modelo temporal original calcula T0=06/10/12Z, último movimiento05/10/13Z y servicio06/10/15:30Z:23h y3h30. Los límites24h/4h son inclusivos; +1s incumple. Son cálculos explícitos del contrato. Los tiempos reales UTC/monotónicos de pg_dump, pg_restore y validación se registran por separado; una restauración breve no se hace pasar por3h30 de observación ni por un backup operativo de23horas de antigüedad.

No hay GoTrue/PostgREST/Storage HTTP sobre estas nuevas bases, y no se reconfiguran para añadirlos. La prueba completa de Auth/Storage y las cuatro lecturas UI previamente restauradas permanecen en [native-full](../native-full/README.md) y [restored-ui](../restored-ui/README.md), con sus propios fixtures. Esa evidencia no acredita UI sobre el nuevo fixture nominal. Además del catálogo y metadatos Storage recuperados por el dump, se restauró una copia privada separada del único objeto sintético de34bytes a un árbol nuevo0700/0600:SHA256`dc9d3fda345877c072f06e2a8ab51ca11fc3d859fa14665ecef840206d1528b2`. Se verificó igualdad con el respaldo y conservación de la fuente; esto es recuperación de archivo, **no aceptación de Storage API**.

El [checkpoint Native de originales](original-preservation.json) verificó64tablas, catálogo/roles, Storage, estado y bindings originales intactos, sin Auth HTTP. El [checkpoint posterior al resume](original-preservation-final.json),05:57:06UTC y SHA256`74c62aa458939626b41e9f52e1121f8583e2deb284d25ac81b98fd75fb02ebda`, volvió a verificar íntegramente esas64tablas, catálogo/roles, Storage, estado y bindings, con0AuthHTTP y ninguna escritura original. Ambas bases nuevas, el dump y los archivos privados permanecen retenidos para el lifecycle final; no se ejecutó DROP ni reset.

El mecanismo observado del backup del plan realmente contratado, el RPO/RTO integral observado y las cuatro lecturas UI nominales siguen pendientes. No se aprueba el caso original completo ni se reescribe la matriz.

Comando original ejecutado una vez, después del preflight coordinado:

```sh
ZARIX_CNF12_EXECUTE=nominal-synthetic-only python3 docs/tif/v2.13/evidence/technical-20261015/cnf12-nominal/run-nominal.py
```

Sin ese gate el programa sale antes de leer credenciales o abrir una conexión. Las URLs, credenciales clonadas, dumps, TOC y errores de herramienta quedan bajo `/tmp/zarix-runtime-20261015/cnf12-private`,0700/0600. No se sobrescribe un reporte o backup anterior, ni se elimina ninguna de las bases nuevas al finalizar.

La continuación revisada, con pin del reporte fallido/dump/targets/snapshot y checkpoint original, se ejecutó una sola vez:

```sh
ZARIX_CNF12_RESUME=remaining-probes-only python3 docs/tif/v2.13/evidence/technical-20261015/cnf12-nominal/resume-nominal.py
```

Referencias primarias consultadas el15/10/2026: [pg_dump17](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore17](https://www.postgresql.org/docs/17/app-pgrestore.html) y [backups de Supabase](https://supabase.com/docs/guides/platform/backups). Estas referencias describen capacidades; no identifican el plan contratado por ZARIX. El índice público `changelog.md` no pudo obtenerse en esta sesión (contenido Markdown no admitido por el lector; fallback HTTPS produjo URLError).
