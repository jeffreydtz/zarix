# Cierre del Next CI5 antes de CI6

El 15/10 se cerró únicamente el proceso Next propio PID 17292, que escuchaba en `127.0.0.1:3002`, tras la liberación de la ventana financiera. Se verificaron la hora de inicio, la carpeta de la copia, el build `vPLjt1QViugJhUWR62DPp`, la revisión `7c3e8722d8fcdc5d95d205e9a12eb856647e0e06`, el hash del entorno privado y las 480 fuentes de la copia antes de enviar SIGTERM. El proceso terminó y el puerto quedó libre.

[verification.json](verification.json) conserva el checkpoint y [stop-owned-next.py](stop-owned-next.py) el controlador exacto. Los archivos originales de estado, entorno y build CI5 se preservaron. La operación no detuvo los seis stacks Native, los dos proveedores sintéticos ni procesos de Arc o personales. No prueba todavía una compilación, arranque o aceptación de CI6.

El controlador exige una confirmación operativa específica y crea un checkpoint nuevo con exclusión; no debe repetirse sobre nuevos procesos.
