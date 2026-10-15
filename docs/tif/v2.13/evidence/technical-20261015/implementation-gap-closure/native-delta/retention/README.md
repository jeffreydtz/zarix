# Conservación del delta y cierre: PASS

El [reporte ejecutado](verification.json) conserva el dump custom del nuevo clon
fuera de Git, en un directorio0700 y archivo0600. Incluye esquema y datos Auth/
aplicación; sus TOC y decodificación pasaron. No se afirma otra restauración
ejecutada ni recuperación de un proyecto o proveedor externo. No se introdujeron
objetos Storage durante estos focales; el respaldo Auth/Storage anterior sigue
siendo evidencia separada.

Se verificaron cero sesiones y refresh tokens, las 39 tablas originales intactas
y los hashes del checkpoint/dump PROOF originales. Después del respaldo se
detuvieron seis procesos temporales de identidades exactas mediante SIGTERM y
PROOF completo mediante su CLI oficial. Se conservaron datos originales, DB
clon y data directory. No hubo DROP/reset/destroy ni señales de fuerza.

Destino privado del delta:
`/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix-private-delta-20261015T081955Z`.
SHA256 del dump:
`a9f03e0b2c4e91b30212fe8acda7267c64483d982b0b9971b3bf6317ef440bd1`.
Los archivos de ese directorio nunca se publican.

La [fuente exacta de conservación/parada](sources/retain-and-stop.py) está fijada
por su SHA en el reporte. La comprobación de integridad original empieza después
del arranque de PROOF; no se afirma ausencia de limpieza interna Auth al arrancar.
