# Auditoría integral de Zarix
Solicitud: auditar y mejorar seguridad, eficiencia, diseño, APIs de mercado y coherencia del TIF.
Criterios: ningún error financiero se presenta/persiste como cero válido; datos de mercado validados con tiempo de espera acotado y frescura honesta; aislamiento de usuarios; privacidad monetaria consistente; pruebas de regresión, lint, tipado, build y navegador reproducibles. Conservar es-AR, tokens DESIGN y patrones Strategy/Template Method.
Alcance autorizado: revisión y mejoras locales reversibles. Acciones productivas o migraciones remotas se evalúan al presentar resultado concreto. No contratar proveedores ni publicar transacciones/mensajes.

## Cierre de exportaciones autorizado
Descargar todos los registros propios de los cinco datasets del backup1.0 y todos los movimientos filtrados (incluidos los de cuentas archivadas), sin truncamiento silencioso por PostgREST ni por el antiguo límite10.000. Paginación determinista por id hasta vacío; fallar sin attachment ante error o presupuesto excedido. No prometer snapshot transaccional ni restauración certificada.
