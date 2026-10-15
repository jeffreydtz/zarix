# Transporte SMTP local de pruebas

Este paquete prepara un receptor SMTP temporal con Node ya instalado. Escucha sólo en `127.0.0.1:60325`, acepta únicamente las dos direcciones sintéticas declaradas en su configuración privada y no reenvía mensajes. No instala software ni acredita un proveedor de correo externo. La solicitud y recuperación Auth real se documentan por separado en [auth-recovery-valid](../auth-recovery-valid/README.md).

El [segundo intento de protocolo](smtp-protocol-verification-attempt-2.json) registró **16/16 comprobaciones PASS**: saludo SMTP, destinatario ajeno rechazado, DATA sin destinatario rechazado, un mensaje permitido, recibo y contenido coherentes, dot-stuffing, permisos, estado final y parada normal del proceso hijo propio. La prueba envió al primer destinatario; el segundo queda cubierto por inspección de la lista, sin atribuirle una segunda entrega. No intervino Auth ni se generaron contraseñas o tokens.

El [primer intento](smtp-protocol-verification.json) terminó FAIL antes de cualquier comprobación. Conserva `JSONDecodeError`, cero controles y la salida genérica privada de listener no disponible en el contexto inicial de la herramienta. El intento posterior usó la ejecución local autorizada fuera de ese contexto. No se registró un código de error de socket y no se atribuye una causa más precisa. [protocol-attempt-1](protocol-attempt-1/) conserva los bytes exactos del código y resultado anteriores; cambió únicamente el nombre del informe del comprobador para el segundo intento. El código del receptor fue idéntico en ambos.

El receptor escribe cada mensaje MIME reconstruido con UTF-8, CRLF y desescape de puntos, además de su recibo, en archivos privados `0600` dentro de un intento nuevo `0700`. No es una captura exacta de tráfico TCP arbitrario. El código espera sincronizar archivos y directorio antes del `250`; las comprobaciones observaron los archivos y hashes tras el acuse. No se simuló un corte de energía.

La [revisión independiente](independent-smtp-protocol-review.json) fija las fuentes y ambos informes, distingue los controles ejecutados de la inspección y no promueve CP2-10, UI ni integración de correo. Mensajes, destinatarios, configuración, cuerpos y enlaces de recuperación permanecen fuera de Git. La salida pública del proceso contiene sólo estado, PID, host y puerto.

Comandos ejecutados desde la raíz del repositorio:

```sh
node --check docs/tif/v2.13/evidence/technical-20261015/auth-reset-contract/smtp-sink.mjs
python3 docs/tif/v2.13/evidence/technical-20261015/auth-reset-contract/check-smtp-protocol.py
```

El comprobador rechaza sobrescribir su informe y crea configuración e intento privados nuevos. Para repetirlo se requiere una fase con otro nombre de salida, puerto libre y permiso para escuchar sólo en loopback. El proceso hijo se cierra al terminar; sus artefactos se conservan.
