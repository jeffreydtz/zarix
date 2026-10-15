# Cierre de nueve procesos HTTP propios

PASS: se validaron y detuvieron mediante SIGTERM las dos copias Next, tres proveedores sintéticos, gateway, GoTrue, PostgREST y SMTP propios. Se comprobaron PID, inicio, UID, cwd, listener y fuentes/build/env; la identidad se volvió a comprobar antes de cada señal. Los nueve procesos y sus listeners quedaron ausentes. PostgreSQL, los seis stacks Native, Arc y los datos no se tocaron.

El [primer intento](attempt-1.json) abortó antes de enviar señales: el proveedor original usaba un argumento Node relativo en vez del marcador absoluto. Se preservó la fuente anterior y se autorizó una equivalencia exacta sólo para PID53373/57910, resolviendo ese argumento contra su cwd confirmado y comparando el archivo y hash. La revisión independiente del delta precedió al [reintento PASS](verification.json).

Este cierre permite reinstalar dependencias sin procesos Next que las estén usando. No demuestra retención ni restauración y no detiene los seis stacks PostgreSQL; esas fases siguen separadas y requieren su liberación final. El reporte íntegro y el diagnóstico permanecen privados en el runtime.
