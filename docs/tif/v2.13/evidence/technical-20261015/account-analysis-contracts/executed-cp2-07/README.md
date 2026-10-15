# CP2-07: export JSON y reimportación real

**PASS del contrato original en alcance API→DB**, con la misma identidad normal A en dos réplicas independientes. La exportación fuente en la quinta produjo3filas propias (gasto500, ingreso700 y transferencia100) y quedó PARTIAL hasta ejecutar la importación; no se aprobó por exportar solamente. La sexta se comprobó literalmente vacía para A y recibió cuentas nuevas con los mismos nombres y un mapa de IDs distinto. El endpoint JSON existente realizó preview e import,3importadas/0omitidas/0pendientes; la reexportación normalizada coincide y los vínculos no tienen huérfanos. No se convirtió JSON a CSV.

La fuente conserva9aserciones PASS y la importación12PASS. El build servido fue la revisión836fd18; en la sexta, BUILD_ID `-zDTe86_KX6NVCcsRaWOj`, PID56597 y puerto3003 se vincularon a la copia física y al manifiesto nativo. `sourceStable:true`, doce tablas originales intactas y cleanup correcto. Sólo se archivaron las cuentas nuevas de esta importación mediante API normal; no se borraron originales ni se reutilizó B como sustituto de A.

El primer intento de importación no hizo requests ni DML: un guard demasiado amplio comparó una edición UI de BlueFxReferenceDetails todavía no construida con el build congelado. Se preserva como fallo técnico del arnés, no como fallo de CP2-07 del producto. El guard corregido verifica la copia física y los bytes Git836, y exige coincidencia de las fuentes API/SQL responsables; el delta UI ajeno se declara por separado.

Los JSON son copias exactas de reportes/fixtures exclusivamente sintéticos, con hashes en `manifest.json`. Los `.txt` preservan los runners ejecutados; la reconstrucción del runner fuente fue aceptada únicamente porque su SHA256 coincide exactamente con el hash registrado durante esa exportación. Son snapshots de código para reproducibilidad, no nuevos entrypoints. No contienen contraseñas, cookies, JWT, claves ni recibos de proveedores.

Este resultado no acredita UI, cotizaciones reales, billing, ni el arreglo posterior de metadata de exportación. Ese cambio tiene sus pruebas y build separados.
