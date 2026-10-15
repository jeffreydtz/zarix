# Next730 HTTP y SSR: 38/38 PASS

Copia exacta de `730767b1723502b495d371e69c44df31eb230b56`, 514 fuentes,
BUILD_ID `GrFyU52-vQBoa29ojnwTI`. [Resultado](verification.json),
[build](build-verification.json), [manifiesto de artefactos](manifest.json).

La sesión A normal guardó USD mediante la API Next real. Dashboard respondió
200 y su Flight del componente real NetWorthHero calculó USD200 y ARS240000
con ARS120000 + USD100 y cotización sintética1200. Después guardó oculto,
cerró la sesión y abrió otra normal: el nuevo GET retuvo USD/oculto; el
Dashboard no incluyó Hero, Sticky ni sentinel. Settings A/B devolvió los
perfiles propios USD/oculto y ARS/visible. Un owner header ajeno retornó403.
La cifra200 corresponde al agregado SSR/Flight, no a animación hidratada ni a
píxeles del navegador. El SSR inicial del contador puede mostrar0.

Los siete inventarios de cuentas, movimientos, inversiones, ventas, snapshots
patrimoniales, snapshots de cartera y auditoría DELETE permanecieron iguales.
La [lectura posterior](after-sessions-original-integrity.json) confirmó cero
sesiones y refresh tokens, las 39 tablas PROOF originales iguales y backup
histórico sin cambios. Se observaron llamadas SDK de logout sin error; no se
capturó un código HTTP separado de esas llamadas.

La superficie HTTP de recuperación respondió: forgot200 con formulario email;
update sin sesión con mensaje seguro y sin formulario de contraseña; update
con sesión normal con formulario ligado al UID actual; callback con código
inválido redirigió a una ruta fija sin reflejarlo. No se solicitó otro correo,
no se cambió contraseña y no se acredita CNF06 responsive/teclado.

Se reutilizaron siete WOFF2 existentes y el guard global fetch sólo permitió
HTTP(S) loopback. No es firewall para todos los transportes. La revisión de
139 assets de navegador encontró cero coincidencias de cuatro valores
privados seleccionados; anon sigue siendo configuración pública. Ningún HTML,
Flight completo, cookie, JWT de sesión o archivo nuevo de credenciales se
persistió. Los reportes contienen únicamente campos permitidos y hashes de
respuesta. No se abrió navegador ni se probaron integraciones externas.

Las fuentes exactas ejecutadas están en sources/. El runner importa además
el parser Flight puro existente en account-analysis-contracts/ssr-financial-read.mjs;
no ejecuta los otros oráculos históricos de ese archivo. Las fuentes son
reproducibles desde sus rutas originales, indicadas por los comandos del delta.
