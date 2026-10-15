# Delta Native y HTTP/SSR posterior al checkpoint publicado

El checkpoint publicado `7f71f2757a4decb0e0becbafb82860008b2f9185` permanece intacto.
El esquema nuevo corresponde a `faae3a7858a6d4349e24880fc4858b826b9463bd`;
los workers y la copia Next ejecutados corresponden a
`730767b1723502b495d371e69c44df31eb230b56`. Su diferencia es un ajuste de
selección histórica del arnés SQL, sin cambios de aplicación o migraciones.

- [Native14](runnernative/executed-attempt-1/README.md): 14 grupos, 159 aserciones
  y 60 observaciones. [Salvedades posteriores](runnernative/LIMITS-ADDENDUM.md):
  variante anterior de CNF13 y logout SDK sin HTTP capturado.
- [Next HTTP/SSR38](ssr-http/attempt-1/README.md): API real con cookies normales,
  Dashboard y Settings reales para A/B, persistencia tras un nuevo login A,
  siete inventarios financieros/históricos conservados y cuatro controles
  acotados de la superficie de recuperación de contraseña.
- [Focal adicional](runnernative/cnf11-final-local/README.md): seis protocolos
  sintéticos CNF11, 182 aserciones; nueve escenarios literales CNF13, 41 aserciones
  y 54 observaciones; complemento CNF10 JWT normal, tres aserciones.
  [Precisiones del dictamen](runnernative/cnf11-final-local/LIMITS-ADDENDUM.md):
  MP sintético aprobado no depende de credenciales externas; límites reales del
  caso integral y del scan JSON de consola quedan separados.
- [Suplemento CP3-17](ssr-http/dashboard-supplement/README.md): 26/26 checks,
  Dashboard real de A y B con preferencias discriminantes, inventarios iguales
  y cero sesiones/refresh al terminar. No reescribe SSR38.
- [Retención y parada](retention/README.md): nuevo dump privado de 553793 bytes,
  65 tablas inventariadas, seis procesos temporales y PROOF detenidos. Es
  conservación, no otra restauración ejecutada.
- [Suplemento CNF13 robusto](runnernative/cnf13-robust-only/README.md): nueve
  escenarios, 42 aserciones y 54 observaciones; calibración positiva de los
  campos no enumerables de Error antes de la captura real. Conserva las
  limitaciones de las corridas anteriores, sin repetir CNF11 ni Dashboard.
- [Cierre del suplemento](retention-cnf13-robust/README.md): reapertura sólo de
  PROOF y el clon existente, nuevo dump privado de 554859 bytes y parada
  verificada de sus cuatro procesos temporales más PROOF. Ambos dumps previos
  y las 39 tablas originales permanecieron intactos.

Se creó una DB UUID nueva con TEMPLATE template0. Del dump PROOF preservado se
restauraron esquema, exactamente dos identidades Auth existentes, sus perfiles
y migraciones Auth; las finanzas comenzaron vacías. Se aplicaron las dos
migraciones del delta: auditoría DELETE y preferencias. No se crearon usuarios,
roles ni claves externas. Esto es una réplica acotada de pruebas, no otra
restauración integral de Auth/Storage ni recuperación de producción.

La primera preparación falló después de completar el clon y ambas migraciones
por una variable de loop que sombreó la referencia del stack. Sus fuentes y
resultado se conservan en [attempt-1](attempt-1/verification.json). El resume
realizó sólo SQL READ ONLY y verificó las 39 tablas originales, los mismos
bindings y los hashes del backup. No repitió restart, creación o migraciones.

La revisión automática rechazó antes de ejecutar el guardado de una nueva copia
privada de claves y URL con contraseña en `targets.private.json`. La alternativa
completada usa metadata redactada con referencias a los archivos existentes;
las claves se leen sólo a memoria y entornos efímeros, y los tokens/cookies
permanecen en RAM. No se eludió el rechazo mediante otro host o destino.

GoTrue y PostgREST propios del clon, gateway, proveedor doble y Next usan
listeners 127.0.0.1. PROOF se reabrió con su selección y configuración exactas:
sus listeners internos históricos wildcard se conservaron y no acreditan
accesibilidad LAN, TLS ni aislamiento total de red. El contador de cero
requests Auth originales describe los nuevos launchers; no afirma ausencia de
healthchecks o limpieza interna al reabrir PROOF.

La verificación posterior a SSR confirmó cero sesiones y refresh tokens, las
39 tablas originales intactas y el checkpoint privado final sin cambios.
No hubo navegador, ventanas Arc/Chrome, carga masiva, correo de recuperación,
cambio de contraseña, proveedor o cobro real. Los dobles HTTP MP/cotizaciones
y el sender Telegram se identifican en cada paquete.

El PNG de privacidad se generó en RAM y no se guardó como archivo de imagen ni
en logs publicados. El POST válido sí conserva su base64 en una nota sintética
del clon privado; los señuelos también pueden quedar en fixtures DB y sus
respaldos. Esto precisa cualquier frase anterior de imagen «sólo en RAM» y no
implica datos o secretos reales.

El [texto de preparación original](PREPARACION-ORIGINAL.md) conserva su estado
anterior a ejecución. La parada final verificó identidades, inicio, cwd y
listeners antes de cada señal, más la CLI oficial del stack. Los seis actores
temporales de la primera fase y los cuatro de la reapertura CNF13, además de
todos los actores Native PROOF propios, quedaron detenidos;
originales, clon, configuración y data directory permanecen. node_modules quedó
libre para los gates finales del coordinador. No hubo commits ni staging de este
subagente y no se cambió la matriz de casos.

El [control de publicación acotado](publication-selected-private-values.json)
compara este árbol contra valores privados existentes seleccionados, leídos a
memoria sin imprimirlos. Su [fuente reproducible](publication-native-check.py)
y el [manifiesto final de archivos](native-delta-final-manifest.json) permiten revisar su
alcance. Los tokens/cookies efímeros se examinan en los arneses respectivos;
este control no afirma ausencia universal de secretos.

Se conserva el [primer intento del control](publication-attempt-1-ambiguous-token/publication-selected-private-values.json):
marcó como FAIL coincidencias de substring del password nativo con un
identificador/ruta común. El reporte final conserva ese matching exacto bruto
y sus candidatos. El [suplemento contextual](publication-contextual-candidates.json)
busca además asignaciones o URL de credenciales; no encontró esos contextos y
se interpreta junto a la [adjudicación independiente](independent-publication-candidate-review.json):
30 archivos y 60 líneas clasificados como identificadores DB/servicios, rutas,
esquemas URI y literales del clasificador, sin asignación de credencial ni URL
de credencial observada en esas ubicaciones. No sustituye el matching exacto
por un resultado de cero coincidencias. No se publican valores ni fragmentos.

El scan conservado examinó 100 archivos antes de ese dictamen y estos últimos
cambios documentales. No se atribuye su comparación a bytes posteriores. El
[manifiesto del scan](native-delta-manifest.json) queda intacto; el manifiesto
final nuevo incluye el dictamen, este README y el addendum CNF11 actualizado.
No se volvieron a ejecutar scanners ni pruebas después de la revisión.
