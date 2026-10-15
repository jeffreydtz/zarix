# CNF13: nueve escenarios con captura robusta

**PASS: 9 escenarios, 42 aserciones y 54 observaciones.** Se ejecutó una sola
corrida contra la copia `730767b1723502b495d371e69c44df31eb230b56`, con sus
**514 archivos** contrastados con Git antes de empezar y estables al terminar.
Las tres fuentes del worker también permanecieron estables. No se ejecutaron
las ediciones posteriores del checkout, CNF11, ventas, Dashboard ni navegador.

[El resultado](cnf13-nine-robust.json) conserva las aserciones por escenario y
las observaciones permitidas. [La ejecución](execution.json) registra comando,
revisión, exit0 y hashes. Las [fuentes exactas](sources/manifest.json) se copiaron
antes de correr; los paquetes anteriores y sus salvedades permanecen intactos.

La captura usó `node:util.formatWithOptions` con `showHidden:true`, `depth:null`,
`maxStringLength:Infinity`, `maxArrayLength:Infinity` y `customInspect:false` en
las 19 funciones públicas de consola disponibles y seleccionadas en este
proceso. No se usó JSON.stringify para convertir los argumentos capturados.

Antes de Auth o SQL, [la calibración positiva](canary-calibration.json) comprobó
`Error.message`, `stack`, `cause.message` y `cause.stack` no enumerables, los
tres señuelos requeridos y cuatro categorías de representación de imagen.
La colección pasó de una llamada canary a cero, antes de observar las nueve
solicitudes reales. La calibración no se mezcló con el escaneo posterior.

Los escenarios reales fueron gasto1500→saldo8500, monto−1 y rechazo SQL sin
fila/recibo; cron válido, Bearer inválido y fallo Telegram posterior al commit;
webhook MP firmado válido, firma falsa y proveedor HTTP503. El gasto válido
conservó el base64 de la imagen como nota sintética en una única fila privada
del clon: se verificó sólo el conteo, sin exportar el valor. No se creó un
archivo de imagen. Esos señuelos pueden quedar en los fixtures y su respaldo
privado; no son datos de una persona real ni una prueba OCR.

[El escaneo de la captura real](privacy-and-cleanup.json) examinó las 55 llamadas
formateadas de consola y sus 54 observaciones: **cero coincidencias** contra
13 valores privados seleccionados, tres señuelos y cuatro representaciones
de la imagen. Tampoco aparecieron nombres de campos Auth sensibles. El alcance
es esas llamadas, campos y representaciones concretas. Se publican únicamente
conteos, aserciones y observaciones con campos permitidos; no se guardaron
argumentos, Error, consola cruda, archivos de imagen, claves, cookies ni tokens
del cliente en archivos nuevos.

GoTrue, PostgREST, PostgreSQL, grants, RLS, RPC y triggers fueron reales del
clon existente. El adaptador cookies retornó clientes normales reales de las
dos identidades autorizadas. Telegram fue un doble de transporte que rechaza;
MP y cotizaciones, fixtures HTTP locales. No se probaron proveedores externos
ni se crearon identidades, nuevas bases o credenciales externas.

La lectura SQL final comprobó perfil y fechas `available_at` restaurados,
preferencias de ambos usuarios e historial sin cambios, además de fingerprints
intactos de las filas financieras preexistentes en nueve tablas. Se retiró la
restricción temporal. Quedaron **cero sesiones y cero refresh grants**; dos
logout SDK finalizaron sin error, sin inferir códigos HTTP no capturados.
El coordinador recibió el cierre antes de iniciar su retención y parada.

[El control de publicación](publication-check.json) comparó ocho valores
privados seleccionados con ocho archivos candidatos, sin coincidencias,
señuelos literales ni patrones JWT. El escaneo de consola en RAM, que también
incluyó sesiones recién emitidas e imagen, tiene su alcance propio arriba.
