# Plan
1. Levantar arquitectura, superficie y métricas base; revisar documentación oficial de dependencias/proveedores.
2. Validar hallazgos por revisión independiente y reproducciones locales.
3. Implementar: seguridad confirmada; calidad/caché de cotizaciones; patrimonio sin ceros falsos ni lecturas duplicadas; privacidad/accesibilidad y estados de error; dependencias mantenidas.
4. Agregar pruebas sobre fallos reales, verificar navegador desktop/móvil y producción compilada.
5. Sincronizar informe y documentación académica con cambios reales y límites de verificación.
La instrucción del usuario autoriza mejoras locales; no se requiere otra aprobación para concretar arreglos revisables (instrucción de sesión prevalece sobre gates genéricos del workspace).

6. Cerrar exportaciones: helper keyset compartido, scope usuario en cada página, presupuesto100.000 filas/32MiB de datos serializados/45s por solicitud; migrar cinco datasets y movimientos; probar páginas cortas, >10.000, error intermedio y CSV. Revisión independiente antes de commit.
