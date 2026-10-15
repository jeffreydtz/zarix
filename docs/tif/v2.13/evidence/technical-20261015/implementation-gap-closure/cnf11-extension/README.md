# Extensión local de CNF11

La [revisión independiente de aceptación](independent-acceptance-review.json)
recomienda **PASS para CNF-11**, por composición del contrato original. La
[matriz derivada nueva](case-traceability-cnf11.csv) queda en **239 PASS / 1 FAIL /
33 BLOCKED** sobre los mismos 273 casos. Sólo cambia la aceptación de CNF-11;
el CSV original y las matrices publicadas permanecen intactos. La decisión y sus
pins están en [case-decision-cnf11.json](case-decision-cnf11.json).

La ejecución usó una copia nueva y exacta de producto
`f5f362ee9dbb81da5268049cab41b357d90eccf1`: 517 archivos, manifiesto canónico
`6c108712a7d338b4c6c1d14dca798921637abc9e5f2aa3009318fdf7b24e3a29`.
El checkpoint publicado `23d91aeda8a22903d2bd795dd4ce9f3970ea1b5b`, COPY730 y
los paquetes anteriores permanecieron intactos. No se modificó producto,
esquema versionado, tipos ni dependencias en este suplemento.

| Fase | Resultado observado |
| --- | --- |
| [Nominal, intento 1](nominal/executed-attempt-1/nominal-six-and-payment-rollback.json) | FAIL agregado conservado: 217 aserciones funcionales pasaron, dos flags de limpieza fallaron por interpretar el booleano PostgreSQL `f` como JSON |
| [Diagnóstico independiente](coordinator/nominal-attempt1-cleanup-readonly.json) | Sólo SELECT: seis cuentas archivadas, una regla inactiva, plan restaurado, B intacto, Auth0 y grupo de procesos vacío; confirmó `f` frente a JSON `false` |
| [Nominal, intento 2](nominal/README.md) | PASS: 217 aserciones, 79 llamadas; único cambio del verificador: dos lecturas `to_json(is_active)` |
| [Bot, preparación](bot/executed-prepare-attempt-1/bot-verification.json) | PASS: 121 comprobaciones |
| [Bot, proceso nuevo](bot/README.md) | PASS: 113 comprobaciones, mismos eventos/IDs y misma DB; sin nuevo chatWithTools, tool ni OCR |
| [Conservación y parada](coordinator/executed-attempt-1/retention-stop.sanitized.json) | PASS: nuevo Fc privado validado, cuatro procesos temporales y PROOF detenidos |

El [paquete nominal](nominal/README.md) cubre gasto 1500→saldo8500,
transferencia 1500→8500/3500 y total12000, importación 200+300→dos filas/saldo9500,
cron 400→una ocurrencia/saldo9600 y un outbox durable sin entrega, venta 4×120 de
10×100→cantidad6/realizado80USD y pago sintético. Tras comprobar su
estado durable, retiene el acuse hasta un TimeoutError nativo; luego ejecuta
dos replays y diez concurrentes con la misma clave. El pago autorizado con
estado ACTIVE y fecha fija es un NOOP: no crea un período pagado. Un fallo DB
adicional, con HMAC/proveedor válidos y CHECK limitado a la fixture propia,
conservó la fila completa del perfil, incluido updated_at. Rollback de
transferencia, sus UPDATE/DELETE y sobreventa se componen de evidencia anterior
identificada, junto a los rollback de gasto/cron/importación/venta SQL y Native
que detalla el dictamen. Conservan sus revisiones y fixtures; no se presentan
como nuevos timeouts ni nuevas corridas de todos esos caminos.

El [paquete bot](bot/README.md) cubre gasto de texto, transferencia de texto,
foto→propuesta→confirmación y una derivada de error AI posterior a la tool
monetaria exitosa. Esta última conserva el efecto y la reserva como fence,
con lectura/exportación disponibles; no demuestra recuperación automática
del acuse. El replay en otro proceso mantuvo los efectos únicos. Hubo 53
resoluciones locales de cliente Gemini y una descarga de media doblada;
esos trabajos no se confunden con inferencia o entrega reales.

Los handlers, servicios financieros, Auth, REST, RPC y PostgreSQL usados son
reales y locales. Los adaptadores de acuse, Telegram, Gemini/media y proveedor
MP/cotizaciones son dobles explícitos. No se acredita caída física de red,
navegador/UI, integración externa ni diez primeros commits concurrentes.
Estos resultados no modifican por sí solos la matriz original.
Los contextos sintéticos de `bot_sessions` sí se persistieron; no se agregaron
vínculos de acceso del bot en perfiles. El dueño custom se suministró por la
interfaz real ya autenticada, sin sustituir la verificación del secret del
webhook conservada en el paquete CNF-10 anterior.

Las fases fueron estrictamente secuenciales: nominal 1, diagnóstico, nominal
2, bot prepare, bot replay. Cada worker terminó y dejó cero sesiones/refresh
antes del siguiente. Se restauraron exactamente los campos de plan usados;
sólo updated_at automático pudo cambiar en A, y B se comparó completo. Las
fixtures propias se archivaron sin tocar cuentas previas ni ampliar el límite
Premium. La reserva incierta del bot y sus datos sintéticos se conservaron.

El [coordinador](coordinator/README.md) verificó las 39 tablas originales,
backups anteriores, CSV y fuentes. El nuevo Fc tiene 564353 bytes y SHA
`f0c4bdedbc47c0c3e2dcf6468e902849e3821bc3d1489803987d6da285f322ea`.
Conserva datos/esquema/Auth del clon; TOC y decodificación pasaron. No es otra
restauración ejecutada ni amplía cobertura de objetos Storage. Todos los
actores temporales y PROOF quedaron detenidos; originales, clon y backups
permanecen. Los checkpoints privados, credenciales y logs crudos no se exportan.

El archivo privado nuevo contiene 65 tablas. Pasó TOC/decodificación e incluye
datos sintéticos sensibles de Auth; no se publica. Es retención, no otra
restauración ni respaldo nuevo de objetos Storage. Las observaciones de loopback
se refieren a los cuatro actores temporales; los listeners internos de PROOF se
registran sin afirmar aislamiento universal de red.

La [revisión de privacidad del runtime](independent-postruntime-privacy-review.json)
separa 14 valores seleccionados en RAM del proceso nominal y 13 por fase del
bot, sin coincidencias en los argumentos capturados. El bot calibró Error,
stack y cause antes de Auth/SQL; el proceso nominal no tuvo canary propia.
Los scanners de publicación tienen un dictamen adicional y límites distintos;
estos controles no demuestran ausencia universal de secretos.

`python3 reconcile-cnf11.py --verify` reproduce los bytes de la matriz sin
escribirla. Su creación usa archivos exclusivos y comprueba revisiones, pins,
el CSV original y las cuatro migraciones originales. Los launchers requieren
las referencias privadas y prerrequisitos de la instancia sintética identificada;
no aprovisionan acceso externo automáticamente. Los README de preparación y
sus manifiestos son instantáneas anteriores a las corridas publicadas.

Los seis gates de f5 se conservan en el [checkpoint anterior](../README.md):
1037 pruebas/105 archivos y cobertura acotada a 37 archivos. No se repitieron
por cambios sólo documentales y del arnés; la CI del nuevo HEAD se informa en
el PR. La auditoría completa anterior sigue FAIL con 7 high de desarrollo y
producción 0, con su reconsulta primaria conservada. Los 33 BLOCKED restantes y
CP2-09 FAIL mantienen sus [motivos concretos](../DECISIONES-PENDIENTES.md).
CNF-02 requiere observación mensual real; siguen pendientes contratos,
autorizaciones, proveedores reales, aceptación visual e infraestructura. No se
abrieron navegadores ni se cambiaron permisos. El PR sigue en borrador, sin
fusión ni despliegue.
