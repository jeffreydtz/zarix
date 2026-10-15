# Sexto protocolo CNF11: doble MP nominal separado

Se añadió solamente un proveedor HTTP sintético en127.0.0.1:61339, PID89310,
con fuente nueva y journal nuevo. El proveedor61329 anterior, sus fuentes y su
journal se conservaron. El recurso nominal devuelve `authorized` y fecha fija;
el producto no convierte ese estado de preapproval en tiempo pagado nuevo.

El [journal](mp-nominal-journal.metadata.jsonl) registra13 consultas200, sin
cabeceras, cuerpos, claves ni URLs de capacidad. El [registro de servicio](mp-nominal-service.metadata.json)
fija PID, origen, SHA de fuente y ausencia de proveedor/credencial externa.
Los seis protocolos CNF11 se verifican en el
[paquete focal](../runnernative/cnf11-final-local/README.md); no son seis
integraciones externas aprobadas.

Este proceso quedó incluido entre los seis actores temporales detenidos por el
retainer. No hubo cobro ni solicitud a Mercado Pago real o sandbox externo.
