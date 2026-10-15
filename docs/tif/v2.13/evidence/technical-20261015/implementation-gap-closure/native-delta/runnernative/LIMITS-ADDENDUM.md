# Salvedades de la primera corrida Native14

El paquete `executed-attempt-1` se conserva sin reescribir sus JSON ni fuentes.
Sus 14 grupos y 159 aserciones son una variante focal aprobada, no el cierre
literal completo de CNF13. El importe manual de esa corrida fue 1 y dejó 9999;
el CSV exige 1500 y 8500. Sus marcadores de privacidad tampoco coinciden con
los tres señuelos literales del contrato. Un paquete adicional separado debe
ejecutar esos nueve escenarios exactos antes de promover el caso.

Las 60 observaciones corresponden a 54 de las nueve correlaciones y seis del
POST de CP1-08. No son 60 escenarios independientes.

`logoutStatuses: [204, 204, 204]` fue inferido por el arnés desde la ausencia de
error del SDK; no se capturaron tres respuestas HTTP204. Lo efectivamente
observado son tres llamadas `signOut({scope:'global'})` sin error y SQL real con
cero sesiones y cero refresh grants. Esa distinción no requiere repetir Auth.

Las tres sesiones iniciales del worker se abrieron antes del PUT de preferencias.
Su independencia prueba aislamiento; la persistencia después de logout/login se
observó separadamente en el paquete Next HTTP/SSR38, con un nuevo login A
posterior al PUT. Ese complemento no transforma source-worker en prueba UI.
