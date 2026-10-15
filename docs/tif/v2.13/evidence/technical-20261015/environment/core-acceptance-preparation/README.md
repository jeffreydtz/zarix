# Preparación CI5, sin ejecutar los gates

El wrapper privado nuevo usa revisión40hex explícita y `ZARIX_CI5_WINDOW_CONFIRM=parent-released-core-acceptance`. Reutiliza el env local58321, CRON existente, siete InterWOFF2 y globalfetchguard antes de Node/workers, Node22, heap2048MiB por proceso y pool2; reloj real. Prepara salida `core-acceptance` nueva y compara exactamente service-role/CRON_SECRET con assets de navegador después del build. El wrapperCI4 no cambia. Estos archivos no demuestran que CI5 haya corrido.

El [stop propio](owned-app-stop.json) sí fue ejecutado al liberar ambos runners: sólo Next1822/3002 y56597/3003, con PID/hora/cwd/BUILD_ID/listener y477fuentes cada uno verificados. Ambos procesos y listeners cerraron medianteSIGTERM; seis stacks y proveedores permanecieron. No se usó stackstop/reset/destroy ni se borraron estados/env/builds.

El padre es dueño de ejecutar CI5 tras congelar el producto y liberar cualquier otro consumidor de rootnode_modules. No volver a ejecutar el stop histórico ni sobrescribir sus checkpoints; no usarlo contra PID por orden o por puerto. La retención y parada final de seis stacks continúa preparada aparte, todavía sin ejecutar.

La ejecución global posterior ya está en [core-acceptance](../../core-acceptance/verification.json):7c3e872 limpio/estable,891/891 en89archivos,16PASS yFAIL de la consulta audit original. La reconsulta válida vive separada en dependencies/ci5-current; estos preflightJSON conservan su fecha y no sustituyen los17registros.
