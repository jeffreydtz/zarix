# Suplemento CNF13 de captura robusta

**Preparado, sin ejecutar al escribir este documento.** No reescribe las
corridas anteriores ni convierte su escaneo con JSON.stringify en captura
completa de Error. Este suplemento invoca únicamente las nueve variantes de
CNF13; no repite CNF11, ventas, preferencias, Dashboard ni UI.

La fuente de aplicación es la copia730 y su manifiesto de514 archivos. El
launcher contrasta todos sus bytes con Git730 y nuevamente al terminar;
registra por separado el HEAD posterior del checkout, que no ejecuta.
`@` resuelve exclusivamente a esa copia. Se reutiliza la base clonada existente
`zarix_delta_e4bd026f703549bfa24de940134184b8`, sin recrearla ni sembrar usuarios.

Se captura cada método disponible de consola seleccionado en memoria con:

```ts
formatWithOptions({
  showHidden: true,
  depth: null,
  maxStringLength: Infinity,
  maxArrayLength: Infinity,
  customInspect: false,
}, ...args)
```

Antes de cualquier Auth/SQL, un Error con message, stack y cause no
enumerables comprueba positivamente el capturador. Contiene los tres señuelos
literales requeridos y un PNG1×1 generado en RAM. Se comprueba cada campo
del Error y cuatro categorías de representación de imagen, luego se vacía
la colección y se exige tamaño cero antes de las solicitudes reales.

Los nueve caminos posteriores son gasto1500→saldo8500; rechazo−1 y fallo SQL
sin filas/recibos; cron válido, Bearer inválido y fallo de transporte Telegram
posterior al commit; webhook MP firmado, firma falsa y HTTP503 del fixture.
Son handlers y servicios reales con GoTrue/PostgREST/PostgreSQL del clon.
El adaptador cookies retorna clientes reales normales; Telegram es un doble
de transporte que rechaza con un Error que contiene los señuelos. MP y
cotizaciones usan el fixture HTTP local61329, sin integración externa real.

Después de limpiar el canary, todas las llamadas capturadas se comparan en
memoria contra credenciales existentes seleccionadas, ambas contraseñas,
sesiones recién emitidas, cookie sintética, tres señuelos e imagen en base64,
hex, latin1 inspeccionado y representación de bytes. No se guardan textos
de consola, Error, archivos de imagen, cookie, JWT, claves ni archivos env nuevos. Sólo
conteos, aserciones y observaciones con campos permitidos salen del worker.
El POST válido conserva `notes=imageBase64` como dato sintético en la nueva
fila privada del clon; se comprueba sólo su presencia, sin mostrar el valor.
Los señuelos pueden residir en esos fixtures DB y su respaldo privado.

Se conservan preferencias e historial preexistentes. Los pendientes previos
del outbox sólo se aplazan temporalmente; sus fechas originales se restauran
y verifican por lectura SQL. Las columnas de perfil usadas por el fixture se
restauran y leen nuevamente. Se comprueban fingerprints de las filas
financieras preexistentes, las preferencias de ambos usuarios y ambos
historiales. La limpieza cierra las dos sesiones normales y comprueba cero
sesiones/refresh grants; los resultados SDK no se convierten en HTTP inferidos.

La ejecución necesita los dos releases habituales y `run-robust.py --targets`
apuntando al nuevo `targets.metadata.json` del coordinador. El launcher guarda
copias exactas de estas tres fuentes antes de invocar Vitest y rehúsa
sobrescribir un intento. No inicia servicios ni Next ni navegador; el
coordinador controla reapertura, servicios y retención separadas.
