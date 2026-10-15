# Cierre final de los tres procesos propios — preparado

**Preparación histórica sustituida, no ejecutada.** El cierre final usa [el controlador de nueve procesos](../../environment/stop-owned-final-http-services.py), que incluye estos tres destinos y los seis servicios nuevos de la réplica vacía. No ejecutar ambos controladores. Este directorio conserva la fuente y el estado de preparación anteriores; no acredita señales ni procesos detenidos.

El texto siguiente describe aquel plan anterior.

No ejecutado. Tras la liberación explícita de todos los últimos casos y antes de la retención, este controlador validará por completo las identidades de Next CI6 PID39320/3002 y los dos proveedores sintéticos PID53373/57910 y PID443/57912. Compara estado privado, PID/hora/UID/cwd/listener y fuentes; Next además debe conservar revisión84df929, buildaIWVMIWgvq5sbeEtZAZEh, manifiesto y entorno.

Sólo después de validar los tres destinos enviará SIGTERM a esos PIDs exactos y comprobará su salida y los puertos libres. No usa señales de grupo, fuerza ni descubrimiento para adoptar procesos. Si alguno falla la identidad o no termina, conserva checkpoint y se detiene sin ampliar el alcance.

La confirmación `ZARIX_FINAL_FRONTENDS_STOP_CONFIRM=parent-released-all-final-writers` corresponde a una ventana operativa específica del padre. Los estados antiguos, la copia/build CI5 y los datos se preservan. La retención y parada oficial de los seis stacks Native son fases posteriores distintas; Arc y procesos personales quedan fuera.
