# ZARIX Plan de desarrollo tecnológico

Versión 2.13

Trabajo Final de Ingeniería

## Ficha de seguimiento y revisión

| Campo | Detalle |
|---|---|
| Autor e integrante | Jeffrey Dietz |
| Carrera y sede | Ingeniería en Sistemas, Rosario, Santa Fe |
| Profesores de referencia | Matías Banega y Alejandro Sartorio |
| Versión y actualización | 2.13, 6 de octubre de 2026 |
| Documento antecedente | ZARIX Plan de Desarrollo Tecnológico v2.12 |
| Defensa prevista por el autor | Diciembre de 2026, fecha exacta por confirmar |
| Comisión | No aplica según la ficha del antecedente, a confirmar en la entrega |
| Enlace público del borrador | Pendiente de publicación de la versión revisada |

Esta versión sustituye las inconsistencias detectadas en negocio, especificación y evidencia técnica. Consolida todas las capacidades en exactamente cuatro casos de uso; incorpora un modelo financiero mensual calculable, diagramas completos, reglas monetarias y pruebas con entradas y resultados distinguibles. La trazabilidad señala qué se verificó en el código, qué se probó localmente y qué depende de validación externa. Los originales se conservan como antecedentes.

| Fecha | Versión | Cambios |
|---|---|---|
| Abril a junio de 2026 | 1.0 a 2.0 | Elaboración inicial y expansión del plan, según el historial v2.12 |
| Agosto a septiembre de 2026 | 2.2 a 2.12 | Diagramas, requisitos, prototipos y pruebas declaradas, según el historial v2.12 |
| 6 de octubre de 2026 | 2.13 | Negocio reescrito, caja reconciliada, cuatro CU consolidados, contraste con fuente y correcciones con regresiones verificables |

### Registro de revisiones académicas

Las filas siguientes son registros por completar durante una revisión real. La preparación del artefacto y sus pruebas no reemplazan la aprobación del docente o del usuario participante.

| Hito | Artefactos preparados | Auditor o participante | Fecha y conformidad |
|---|---|---|---|
| Acuerdo de alcance | Visión, actores, glosario, RF y RNF | Pendiente de revisión | Pendiente |
| RRR | Cuatro fichas, dominio y navegación | Pendiente de revisión | Pendiente |
| PDR | Robustez, secuencias, datos y arquitectura | Pendiente de revisión | Pendiente |
| CDR | Diseño completo, código y pruebas | Pendiente de revisión | Pendiente |
| Revisión de prototipos | Escenarios y estados de interfaz | Pendiente de participación | Pendiente |


## A. Resumen ejecutivo

ZARIX es un proyecto de gestión de finanzas personales mediante una aplicación web progresiva para Argentina. Su objetivo es reunir movimientos, cuentas, patrimonio e inversiones con monedas y cotizaciones relevantes para el usuario argentino. Está dirigido inicialmente a adultos urbanos de 25 a 45 años que tienen ingresos o gastos en ARS, ahorro o inversión en otra moneda y hoy combinan cuentas, billeteras o planillas. La necesidad específica a validar es reducir el esfuerzo de registrar operaciones y reconstruir el patrimonio sin perder la moneda original, la fuente de la tasa y la fecha de valuación.

El alcance académico queda consolidado en exactamente cuatro objetivos: CU-001 Gestionar movimientos financieros; CU-002 Administrar cuentas y datos personales; CU-003 Consultar y analizar la situación financiera; CU-004 Seguir el portafolio de inversiones. Telegram, lectura de tickets, importación, recurrencias, presupuestos, gastos compartidos, exportación, acceso, preferencias y asistencia se desarrollan como escenarios de esos cuatro casos. La participación invitada en gastos compartidos usa un enlace de acceso limitado, según las reglas de autorización verificadas en el capítulo tecnológico, sin agregar un quinto caso. El modo de demostración académica habilita sus capacidades para evaluación con datos controlados; no acredita contratación ni procesamiento de pagos comerciales. ZARIX registra operaciones realizadas fuera de la plataforma, sin custodiar fondos ni ejecutar compras de activos. Las simulaciones y respuestas del asistente muestran condiciones y fuentes, y no prometen asesoramiento personalizado ni rendimientos.

El contexto financiero sustenta explorar el problema, pero no demuestra disposición a pagar. El BCRA informó 37,8 millones de personas con cuentas a diciembre de 2025, y un 62% de titulares con cuentas en moneda extranjera. Es una población de referencia, no compradores de ZARIX ni tenencia de cripto. El mercado servible de planificación se define en 234.360 personas como hipótesis exploratoria, derivada de una fracción explícita de ese contexto; se reemplazará por un estudio de elegibilidad y pago. No se mantiene la atribución sin respaldo de que 70% ahorra en dólares, 30% posee cripto o que existen dos millones de compradores accesibles. [BCRA, inclusión financiera 2 S 2025, publicado el 30/4/2026](https://www.bcra.gob.ar/publicaciones/informe-de-inclusion-financiera-segundo-semestre-de-2025/).

El producto comercial futuro propone un modelo Free/Premium. Free permite tres cuentas, movimientos y transferencias manuales, patrimonio, cotizaciones básicas y exportación de los datos propios. Premium propone USD 7,50 mensuales con cuentas ampliadas, inversiones y simulación, Telegram, OCR, recurrentes, presupuestos, importación y análisis/IA sujetos a cupos. La portabilidad y la conservación del historial no dependen de seguir pagando. El ingreso previsto proviene exclusivamente de suscripciones; no se incluyen publicidad, venta de datos ni comisiones de inversión. La expansión internacional, las integraciones bancarias automáticas y una oferta B2B se conservan como opciones futuras sin ingresos atribuidos en el horizonte evaluado.

Jeffrey Dietz, estudiante de Ingeniería en Sistemas de UAI en Rosario e integrante único según la documentación, asume producto, desarrollo, operaciones y comunicación. El modelo contempla alojamiento apto para actividad comercial desde M4, base de datos productiva, costos de IA por tokens, administración, marketing, provisiones fiscales y una contratación externa de soporte sólo cuando se cumplan umbrales de margen y caja. No se presume un equipo de seis a ocho personas sin presupuesto. Se distinguen el software académico y la puesta en operación del SaaS, que exige verificar la pasarela, las licencias de cotizaciones y las condiciones de tratamiento de datos.

La proyección de 24 meses, precedida por M0, utiliza parámetros explícitos y tres escenarios sin probabilidades inventadas. En el base se proyectan 1.360 registrados/77 Premium en M12 y 5.560/310 en M24, con facturación mensual bruta de USD 2.325 en ese último mes. El aporte inicial total previsto es USD 1.300: cubre puesta en marcha, el déficit máximo y una reserva. El equilibrio estable de referencia es 29 Premium sin soporte y 61 con soporte, calculado con el consumo activo de M12; el flujo mensual pasa a no negativo en M9 y el repago del proyecto se alcanza en M14. El VAN financiero es USD 6.385,45 con tasa de corte supuesta de 25% anual efectiva real USD. Al valorar por separado el tiempo fundador a USD 12/h, el VAN económico base es −4.155,93 y no hay repago económico en 24 meses. Por tanto, el plan demuestra una hipótesis de sostenibilidad de caja que requiere validación; no demuestra todavía una actividad que remunere plenamente al fundador. El escenario adverso pierde USD 3.039,98 acumulados y no presenta repago ni TIR. Las tablas, fórmulas y límites se desarrollan en el capítulo 8 y en el modelo auditable adjunto.


## 1. Descripción general

### 1.1 Descripción básica del negocio

ZARIX se propone como un SaaS B2C: una persona registra y consulta su información mediante PWA, mientras el servicio conserva su historial autorizado y prepara cálculos financieros. El beneficio central es la integración coherente de movimientos, cuentas, patrimonio e inversiones bajo reglas de moneda explícitas. El negocio futuro cobra por capacidades de automatización y análisis. La prestación inicial se limita a Argentina y a finanzas personales; no comprende contabilidad empresarial, custodia, pagos entre terceros ni ejecución bursátil.

### 1.2 Situación actual del negocio

La versión 2.12 contiene documentación del producto, referencias a código y pruebas, prototipos y funcionalidades con estados diferentes. Esos antecedentes requieren la verificación del capítulo tecnológico de v2.13 y no bastan para declarar una operación comercial. No se aportaron evidencias de clientes pagos, facturas, dominio adquirido, encuadre tributario confirmado o acuerdos de datos. La situación de negocio se define, por ello, como **proyecto académico con propuesta comercial futura y validación pendiente**. El plan de suscripción es una especificación y una hipótesis de ingreso; una pantalla o un estado Premium de demostración no prueba el cobro de una suscripción.

### 1.3 Diferenciación de ZARIX

La combinación propuesta es: cotizaciones argentinas identificadas por fuente/fecha, consolidación en ARS y USD conservando importes originales, carga manual o asistida mediante Telegram/ticket, y seguimiento de posiciones dentro del mismo patrimonio. La extracción propone datos que el usuario revisa y confirma; no crea automáticamente un gasto por una imagen sin revisión. La ventaja no consiste en que ningún competidor tenga multimoneda o automatización. Se deberá demostrar que esta combinación reduce tiempo y errores frente a las alternativas que el segmento efectivamente utiliza.

### 1.4 Factores principales de éxito

El éxito depende de integridad de saldos y transferencias, claridad de valuación, autorización sobre datos propios, baja fricción de carga, continuidad de proveedores, hábito de uso y una conversión que cubra consumo y soporte. La especialización local es una decisión de foco, replicable por otros; no una barrera insuperable. El fundador deberá priorizar primero confiabilidad y resolución de los cuatro objetivos, antes de aumentar funciones, canales o países.

### 1.5 Misión, visión y propósito estratégico

**Misión:** facilitar que una persona argentina comprenda y organice su situación financiera con registros y cálculos claros. **Visión:** construir un servicio sostenible y confiable de gestión personal adaptado al contexto local. **Propósito:** completar y verificar los cuatro casos académicos, probar su utilidad con usuarios del segmento y evaluar una suscripción viable sin comprometer integridad ni privacidad. Una eventual expansión regional requerirá nueva validación, fuentes de cotización, adaptación jurídica y presupuesto; no constituye un hito financiado de estos 24 meses.

### 1.6 Oportunidad de negocio

La coexistencia de varias cuentas y monedas plantea una necesidad plausible de consolidación. La información del BCRA citada en el resumen acredita el contexto de cuentas, pero no el problema de organización, la frecuencia de uso de ZARIX ni el pago de USD 7,50. La oportunidad se formula como una hipótesis: una fracción del segmento preferirá una herramienta que combine registro y seguimiento con tasas argentinas antes que sostener su planilla o cambiar a una aplicación genérica. Se validará por tareas, retención y decisiones de pago, no por la cantidad de integrantes de comunidades.

### 1.7 Capacidades centrales

Los antecedentes del autor declaran desarrollo full-stack, integración de APIs y bots, y conocimiento del contexto financiero. La capacidad técnica efectiva se respalda con el código y pruebas verificados de v2.13. El plan requiere además aprendizaje y procedimientos de operación: conciliación de pagos, soporte, seguimiento de costos, restauración y atención de derechos sobre datos. Asesoramiento fiscal y legal se presupuestan como recursos externos a contratar, sin adjudicar al fundador competencias profesionales que no están demostradas.

### 1.8 Propuesta de valor

“Registrar lo cotidiano y entender el patrimonio en una moneda elegida, pudiendo reconstruir de dónde surge cada importe”. Una tasa disponible o seleccionada por el usuario no equivale al precio al que efectivamente podrá operar. ZARIX informa origen, dirección de conversión, momento, disponibilidad y supuestos; evita sumar dos veces fondos y posiciones. La promesa de valor se medirá mediante tiempo y corrección de tareas, en vez de afirmar ya alcanzados “30 segundos” o “tres toques” para todos los recorridos.

### 1.9 Valores nucleares

Transparencia de cálculo y condiciones; simplicidad compatible con confirmación de operaciones; privacidad mediante minimización y control; portabilidad; y foco local. No se comercializan datos personales. Para prestar el servicio sí intervienen proveedores cloud y, cuando el usuario elige esas capacidades, Telegram y el proveedor IA. La política debe explicar qué datos se comunican, para qué, por cuánto tiempo y con qué controles. No se promete que ningún dato salga del dispositivo si la arquitectura necesita procesamiento externo.

### 1.10 Enfoque e iniciativas estratégicas

Primero se cierra el alcance académico y la evidencia de los cuatro CU. El plan comercial relativo comienza en M0 con encuadre y preparación; M1–M3 con estudio y beta sin cobros; M4–M6 con lanzamiento condicionado; M7–M12 con retención y prueba de pago; M13–M24 con mejora operativa y crecimiento nacional sujeto a resultados. Se excluyen de esa proyección sincronización bancaria, nuevas regiones y nuevas líneas de ingreso. Si la puerta de lanzamiento no se cumple, se desplazan cobros y se recalcula caja; el calendario no legitima un cobro sin condiciones previas.

### 1.11 Áreas clave de resultados

| Resultado | Definición y referencia propuesta | Estado |
|---|---|---|
| Integridad | Cero saldo alterado parcialmente en las pruebas críticas de registro, edición, transferencias y recurrencia | A verificar en evidencia técnica |
| Activación | Primera cuenta y movimiento confirmado dentro de siete días/altas válidas; meta exploratoria ≥50% en beta | Hipótesis a medir |
| Retención de uso | Activados que registran o consultan en el mes siguiente/activados del cohorte; meta exploratoria ≥40% | Hipótesis a medir, distinta de churn pago |
| Adquisición | Altas únicas por mes; base financiera 1.360 acumuladas M12 y 5.560 M24 | Proyección |
| Conversión | 8% de altas del mes previo adquiere Premium desde M4 en escenario base | Supuesto del modelo, no 8% de toda la base |
| Churn pago | Premium que deja de estar activo por mes/Premium del cierre previo; base 4% | Supuesto del modelo |
| Cobro | Importe acreditado/facturado anterior; base 95%, sin confundir facturación con caja | Supuesto del modelo |
| Costo | Tokens, costo IA por Premium, consumo nube, minutos de soporte y costo por adquisición | Debe medirse mensualmente |

No se presenta un NPS obtenido. La encuesta de satisfacción se aplica cuando existan participantes y se informa tamaño de muestra, tasa de respuesta y limitación; no condiciona el caso académico a una puntuación ficticia.

### 1.12 Ingreso al sector

La inserción se propone por foco de nicho y diferenciación de utilidad, con comunicación en comunidades donde ya participa el segmento, contenido explicativo y recomendación de usuarios. La primera prueba de mercado reúne residentes urbanos con cuentas en dos monedas, incluyendo empleados y trabajadores independientes; tener afinidad cripto no se vuelve un requisito. No se presupuestan alianzas exclusivas ni incorporación automática de clientes de bancos.

## 2. Análisis estratégico

### 2.1 Análisis de contexto

#### 2.1.1 Escenario local

La base de operación prevista es Rosario, con distribución web nacional. La concentración inicial de entrevistas y soporte se propone en Rosario, Córdoba y AMBA para acotar captación y diversidad de perfiles. Alcance nacional describe accesibilidad, no cobertura comercial lograda ni presencia física en esas ciudades.

#### 2.1.2 Factores económicos

Las variaciones de precios, tipos de cambio e ingresos afectan hábitos y posibilidad de pagar software. INDEC informó una variación acumulada de IPC de 31,5% durante 2025; es un antecedente fechado y no una inflación actual de más de 200% ni un pronóstico para 2026. El modelo se expresa en USD constantes y contempla un colchón de facturación exterior. Si se cobra en ARS, precio, fuente de conversión y reglas de actualización deben informarse antes de cada ciclo. [INDEC, IPC diciembre 2025, p.3](https://www.indec.gob.ar/uploads/informesdeprensa/ipc_01_266741F036E8.pdf).

#### 2.1.3 Factores políticos

La normativa de pagos, moneda, impuestos y datos puede cambiar. La decisión de no custodiar fondos ni ejecutar órdenes reduce el alcance funcional, pero no sustituye un análisis de encuadre. La preparación comercial incluye revisar límites del asistente, contratos de proveedores y pasarela, venta nacional y tratamiento de datos; una nueva integración exige repetir la revisión antes de publicarse.

#### 2.1.4 Factores tecnológicos

PWA, base administrada y servicios externos permiten prototipar con recursos acotados. No garantizan disponibilidad o crecimiento sin costo. Para producción se presupuestan Vercel Pro y Supabase Pro; Vercel Hobby se restringe a uso personal no comercial. El consumo, tamaño de archivos, concurrencia y respaldo deben medirse. El cambio o retiro de una API/modelo se atiende mediante adaptadores, fuente/fecha visibles y recorrido manual; las cuotas y precios se recotizan. [Vercel, condiciones Hobby](https://vercel.com/docs/plans/hobby).

#### 2.1.5 Escenario meta

El escenario meta es un servicio nacional utilizado de forma regular, con precios y registros trazables, exportación disponible y costos mensuales controlados. Su conveniencia se prueba tanto en contextos de mayor volatilidad como de estabilidad. No se asume que una crisis genere más clientes pagos: puede elevar necesidad y reducir capacidad de pago a la vez.

#### 2.1.6 Oportunidades y amenazas sectoriales

| Oportunidad plausible | Amenaza y respuesta |
|---|---|
| Consolidar varias cuentas/monedas en una rutina | Sustitutos gratuitos: demostrar ahorro de tiempo y exactitud con tareas comparables |
| Comunidad como vía de descubrimiento | Bajo alcance orgánico: medir embudo y trabajo requerido, sin atribuir usuarios a grupos completos |
| Captura asistida de movimientos | Errores OCR/IA: revisión previa, cupos, trazabilidad y carga manual |
| Herramientas cloud administradas | Dependencia/precios/licencias: planes comerciales, presupuesto de consumo y contingencia |
| Interés en control patrimonial | Desconfianza y cambios legales: minimización, términos comprensibles y revisión del alcance |

### 2.2 Análisis de competencia

#### 2.2.1 Competidores y sustitutos

Comparación documental al 6/10/2026, sin ensayo directo equivalente ni afirmaciones de ausencia que no estén corroboradas. Las cifras publicadas pueden variar por país, impuestos y tienda; la comparación mensual no equivale a la anual.

| Alternativa | Propuesta publicada o carácter | Precio de referencia | Implicación para ZARIX |
|---|---|---|---|
| Spendee | Gestión, presupuesto, sincronización, importación y exportación; también admite monedas/tasas | Premium USD 5,99/mes o 35,99/año | ZARIX 7,50 no es siempre más barato; debe probar valor de su combinación local |
| YNAB | Servicio de presupuesto y organización financiera | USD 14,99/mes o 109/año, más impuesto aplicable | Compite por hábito y pago; comparar tareas y método, no sólo cotizaciones |
| Monefy | Registro personal; documentación con más de 150 monedas y tasas manuales | No se incorpora una tarifa no verificada para tienda argentina | El diferencial no puede ser “Monefy no tiene multimoneda” |
| Planilla creada por el usuario | Sustituto configurable con mantenimiento manual | Costo de herramienta según cuenta; tiempo del usuario | Evaluar precisión, fricción y portabilidad frente a su planilla real |
| Apps de bancos, billeteras y brokers | Vista de productos propios; sustitutos parciales | No se afirma una tarifa genérica | Comparar consolidación de fuentes sin atribuir acuerdos de integración |

[Spendee, precios](https://www.spendee.com/pricing), [Spendee, monedas y tasas](https://help.spendee.com/article/231-how-to-setchange-the-currency-and-exchange-rate), [YNAB, precios](https://www.ynab.com/pricing), [Monefy, centro de ayuda](https://www.monefy.com/help-center). Mint se conserva sólo como antecedente histórico si se lo menciona: Intuit anunció migración a Credit Karma; no se lo presenta como competidor disponible actual. [Intuit, anuncio oficial](https://www.creditkarma.com/about/releases/intuit-credit-karma-welcomes-all-minters).

#### 2.2.2 Cadena de valor

La cadena comercial es investigar necesidad→diseñar/verificar utilidad→captar visitante→activar usuario→prestar y mantener servicio→cobrar/conciliar→retener/soportar→permitir salida. El valor se pierde si captación no lleva a un primer registro, el saldo no es confiable o el soporte consume más que el margen. El flujo de cotizaciones→normalización→persistencia→interfaz es una cadena técnica que apoya la prestación, pero no reemplaza la cadena comercial. Actividades de apoyo son administración, proveedores, seguridad, documentación y actualización del encuadre.

#### 2.2.3 Factores críticos de éxito

Correctitud de registros y autorizaciones; reconstrucción de cada valuación; tiempo de primera carga; hábito de consulta/registro; respuesta de soporte; costo de servicio por cohorte; y cobro neto. Los objetivos de rendimiento y disponibilidad pertenecen a RNF y a pruebas fechadas. No se vende un SLA de 99,5% respaldado sólo por intención o por la marca del proveedor. La validación del negocio compara retención e ingresos netos con gastos y dedicación.

#### 2.2.4 Fortalezas y debilidades

Fortalezas potenciales: foco argentino, alcance integrado y capacidad de iteración del autor. Debilidades: una sola persona responsable, falta de validación empírica de pago, presupuesto comercial limitado y dependencias externas. Se mitigan con cuatro objetivos académicos estables, documentación operativa, respaldo y restauración probados, medición y contratación condicionada. El servicio no se describe como “costo casi cero” cuando utiliza infraestructura comercial y trabajo humano.

## 3. Análisis FODA

### 3.1 Cuadro FODA

| Dimensión | Elementos y estado de evidencia |
|---|---|
| Fortalezas internas | Foco local y diseño integrado; capacidades del fundador declaradas y sujetas a evidencia técnica |
| Debilidades internas | Equipo único, necesidad de procedimientos, ausencia de pagos o investigación comercial aportados |
| Oportunidades externas | Usuarios con múltiples cuentas y monedas; posibilidad de mejorar fricción, a validar |
| Amenazas externas | Sustitutos, desconfianza, proveedores y precios, derechos de datos, cambios tributarios y regulatorios |

### 3.2 Análisis y acciones

FO: enfocar contenidos y demostración en tareas con dos monedas y múltiples cuentas. DO: beta acotada con entrevistas y tareas para corregir errores antes de promoción amplia. FA: hacer visibles fuente/fecha, limitar IA y priorizar exportación para sostener confianza. DA: reducir inversión irreversible, conservar caja mínima, registrar operaciones críticas y establecer continuidad si el fundador no está disponible. Cada acción se verifica en hitos de 5.2; no se afirma que el FODA pruebe demanda.

### 3.3 Atractivo y posición

El contexto justifica investigar una oportunidad, pero no permite calificar una industria como altamente rentable para ZARIX. La posición inicial es un nicho con especialización útil y recursos limitados. La viabilidad comercial permanece condicionada a retención/pago y la económica a remunerar dedicación. El escenario base financiero y el económico conducen a conclusiones distintas, por lo que se presentan ambos.

## 4. Segmentación

### 4.1 Segmentación de consumidores

Segmento primario único: residentes adultos de 25–45 años en ciudades argentinas, con al menos un flujo de ingreso/gasto en ARS y ahorro/inversión en otra moneda, que acceden a servicios digitales y deben combinar dos o más registros/cuentas. Dentro del mismo segmento se estudian empleados, profesionales y trabajadores independientes. La edad y condiciones son decisiones de foco de ZARIX, no estadísticas extraídas del BCRA. La gestión de gastos compartidos del producto queda dentro de CU-001; no se propone una línea comercial familiar adicional ni contabilidad empresarial. No se dirige comercialización inicial a menores.

### 4.2 Grupos diferenciados

Se distinguen por necesidad, no por una estrategia contradictoria: (a) quien usa planilla y busca automatización sin perder control; (b) quien consulta varias apps y busca consolidación; (c) quien recién comienza a registrar y necesita guía. El grupo (a) se prioriza para prueba de pago por familiaridad con la tarea, mientras (b)/(c) se incluyen en usabilidad. El principiante no reemplaza silenciosamente al segmento primario; avanzado y principiante pueden pertenecer al mismo perfil de monedas/cuentas.

### 4.3 Potenciales usuarios y compradores; tamaño de mercado

Se diferencia contexto, elegibilidad y captación. Universo/TAM referencial: 37,8 millones de personas con cuentas según BCRA. Indicador del problema multimoneda: 62% de titulares con cuenta en moneda extranjera; multiplicar cifras redondeadas da aproximadamente 23,436 millones, sin probar su intersección con edad, ciudades, uso activo o intención de pago. Para evaluar proporciones se adopta un **SAM de planificación hipotético de 234.360 personas**, igual al 1% de esa referencia multimoneda. Ese 1% engloba elegibilidad y alcanzabilidad supuestas; no es una tasa observada ni sustituye un relevamiento demográfico y comercial.

SOM de planificación base a 24 meses: 5.560 registros adquiridos (2,37% del SAM hipotético) y 310 Premium activos (0,132% del mismo SAM). Registro adquirido no significa usuario retenido; Premium al cierre incorpora bajas. Los resultados no se obtienen aplicando 8% al mercado total. No se calculan ingresos multiplicando el TAM por precio, ni se extrapola la cantidad de seguidores de un canal a compradores. La próxima validación deberá estimar cuántos elegibles tienen el problema, pueden ser alcanzados y deciden pagar; hasta entonces estos tamaños permanecen supuestos.

### 4.4 Comportamiento esperado

Hipótesis de uso: carga breve durante la semana, revisión del panel varias veces por mes y consulta del portafolio al actualizar posiciones. No se afirma uso del teléfono de tres horas ni determinada frecuencia diaria sin estudio. Se observará una tarea real por participante: registrar, transferir sin duplicar ingreso, comprobar patrimonio, corregir un ticket y exportar. El embudo será visitante→alta válida→activación→uso retenido→Premium→cobro; cada indicador se calcula sobre su propio denominador y cohorte.

### Business Model Canvas

El Canvas reúne nueve decisiones del modelo, siguiendo el marco de Osterwalder y Pigneur, Business Model Generation (2010), incluido en las referencias de negocio. No equivale a validación de sus hipótesis.

| Bloque | Decisión canónica |
|---|---|
| Segmentos | El perfil único de 4.1; empleados/independientes como subgrupos de prueba |
| Valor | Registro y consolidación multimoneda verificables, captura asistida y seguimiento de posiciones |
| Canales | PWA directa, contenidos y comunidades; dominio comercial por confirmar |
| Relación | Guía inicial, autoservicio, soporte humano acotado; IA como función con límites, no asesor personal |
| Ingresos | Premium 7,50 USD/mes como hipótesis; ningún ingreso por anuncios, datos, activos o acuerdos no celebrados |
| Recursos | Tiempo y conocimiento fundador, código/documentación, infraestructura productiva y fuentes con permiso |
| Actividades | Verificar integridad, atender usuario, mantener fuentes, medir retención/costos, conciliar, cumplir derechos |
| Asociados | Proveedores por contratar y potenciales canales; banco, fintech o influencer no es aliado confirmado |
| Costos | Puesta en marcha, nube apta para comercio, uso IA, datos, administración, marketing, provisiones y soporte condicionado; tiempo fundador separado |

## 5. Plan de acción

### 5.1 Programas generales

Se separa el cierre académico del reloj comercial. El primero verifica cuatro CU, artefactos trazables y evidencia de pruebas de v2.13. El segundo comienza en un T0 por programar cuando se decida ejecutar el SaaS; M0 es preparación previa, M1–M24 son meses consecutivos. Las fechas relativas evitan afirmar que ya transcurrió un lanzamiento comercial. El presupuesto financiero asume lanzamiento en M4 sólo para comparar escenarios; toda demora altera ingresos, capital de trabajo y repago.

### 5.2 Programas específicos y puertas

| Período | Trabajo y entregable | Responsable y dedicación prevista | Costo/presupuesto y puerta de continuidad |
|---|---|---|---|
| Cierre académico | Cuatro fichas y diagramas consistentes, modelo financiero, código/pruebas y pendientes visibles | Fundador; ejecución académica fuera de ventas modeladas | Puerta: trazabilidad y evidencia; firmas sólo cuando existan |
| M0 | Términos/privacidad/encuadre, derechos de fuentes, pasarela y presupuesto | Fundador 80 h + asesoramiento a contratar |198 USD de gasto; aporte base total 1300 incluye capital de trabajo |
| M1–M3 |12 entrevistas exploratorias, 30 sesiones de tareas y beta de hasta 50 participantes; correcciones | Fundador 60 h/mes; reclutamiento consentido |10 USD/mes herramientas/pruebas; resultados reales documentados, sin cuotas de venta |
| M4–M6 | Lanzamiento nacional acotado, primer ciclo Premium, conciliación, atención | Fundador 40 h/mes; producto 24, operación 8 y comunicación 8 como reparto inicial | Fijo base 170/mes + variables; puerta: flujo de pago auténtico, exportación, restauración, derechos y términos verificados |
| M7–M12 | Evaluar cohortes, costo/uso, mejorar retención y comunicación | Fundador; sin nuevas contrataciones por calendario | Revisar en M6 y M9; caja mensual base no negativa M9 y repago posterior, no objetivos asegurados |
| M13–M24 | Crecimiento, mantenimiento y soporte según margen | Fundador 40 h/mes, 32 h con contrato; 20 h/mes soporte eventual | Contrato 200/mes al cumplirse puerta de 7.4; base comienza M20; sin equipo de 6–8 ni expansión extranjera presupuestados |

Los tamaños del estudio son metas de reclutamiento. Si no se alcanzan, se informa muestra real y limitaciones, sin fabricar respuestas. El hito de recuperación de inversión proyectada se incluye hasta M14 base; el seguimiento continúa hasta M24. No se interpreta una proyección de suscriptores como una prueba de producto/mercado.

## 6. Plan de marketing

### 6.1 Objetivos

Probar comprensión del valor y utilidad del primer registro; alcanzar activación y retención definidas en 1.11; y verificar que cobros netos superen costo completo de servicio. La captación base reproduce las altas mensuales del modelo; no se mantienen metas de 500/2000 usuarios de versiones anteriores si contradicen el flujo. El objetivo académico es demostrar y defender cuatro CU; marketing no agrega más casos de uso.

### 6.2 Cobertura y participación esperadas

Cobertura inicial: disponibilidad web para Argentina y reclutamiento acotado en ciudades indicadas. Proyección base de adquisición: 340 registros al cierre M6, 1360 en M12 y 5560 en M24. Premium base: 15 en M6, 77 en M12 y 310 en M24. Estas son hipótesis de adquisición/conversión/bajas, no personas activas actuales. La participación sólo se expresa respecto del SAM hipotético de 4.3, mostrando esa condición; no se anuncia cuota real de mercado.

### 6.3 Posicionamiento

“Tus registros y patrimonio multimoneda, con cuentas claras para Argentina”. La comunicación muestra una tarea y sus tasas/fuentes antes de formular superioridad general. No afirma exclusividad, rendimientos financieros, demanda comprobada o precio inferior a todas las alternativas. El asistente se presenta como una consulta sobre datos autorizados y reglas del sistema.

### 6.4 Producto

#### 6.4.1 Qué es y qué no es ZARIX

Es un servicio de registro, organización, valuación orientativa y seguimiento; el alcance se organiza en los cuatro CU canónicos. No recibe depósitos, no mantiene saldos reales en cuentas bancarias de ZARIX, no ejecuta órdenes ni sincroniza bancos automáticamente en esta entrega. Una transferencia registra un movimiento entre cuentas del usuario; una compra/venta del portafolio registra una operación realizada fuera del sistema. El patrimonio depende de datos y cotizaciones disponibles, no acredita tenencia real ni sustituye estados de un banco/broker.

#### 6.4.2 Durabilidad

El software tiene uso recurrente mientras mantenga utilidad y continuidad; no se promete una duración garantizada o consumo estacional. Cambios de proveedores, modelos, monedas o normativa pueden requerir mantenimiento. Ante cierre se permite exportar y se aplica 7.5/8.12. La actualización se prioriza por integridad y necesidades comprobadas, sin convertir cada solicitud en ampliación del alcance académico.

#### 6.4.3 Características que influyen en la decisión

Carga y corrección confiables; historial y exportación; consolidación explicable; claridad de tasas; uso móvil; límites transparentes de planes; y costo final. La confirmación de datos OCR y Telegram se muestra como protección de exactitud. La prueba comercial compara tiempo y éxito de tareas con la alternativa del participante y registra errores, abandono y preferencia; no reduce la decisión de uso a número de toques.

#### 6.4.4 Estudios para desarrollar el producto

Estudio previsto, sin resultados atribuidos: 12 entrevistas exploratorias para identificar problema, sustituto y frecuencia; 30 sesiones de tareas para medir terminación, tiempo, errores y comprensión de tasas; beta de hasta 50 personas para estudiar activación/retención. Preguntas: qué cuentas y monedas usa, cómo consolida hoy, cuál fue el último error, qué tarea repetiría, qué sustituiría y bajo qué condiciones pagaría. Se propone comparar el precio 7,50 con una alternativa y recoger motivos, evitando interpretar una intención verbal como pago. La prueba de disposición efectiva exige un ciclo comercial lícito y cobro real después de las puertas de lanzamiento. No se incluyó ese resultado en el proyecto recibido.

Los resultados se documentarán con fecha, consentimiento, instrumento, muestra efectiva, denominador y sesgo de reclutamiento. Los datos financieros sensibles no son necesarios para la entrevista: se usan ejemplos ficticios o importes anonimizados. Una muestra de conveniencia no estima por sí sola todo el mercado nacional. El estudio es una acción futura del negocio, no una encuesta inventada para completar la tesis.

### 6.5 Precio

#### 6.5.1 Condiciones de precio y planes

Esta tabla es la política comercial propuesta única. Los límites son configurables y no acreditan que el control de planes haya sido implementado. La demo académica habilita las funciones evaluables de los cuatro CU con datos controlados.

| Capacidad | Free | Premium propuesto 7,50 USD/mes | CU/RF de referencia |
|---|---|---|---|
| Cuentas | Hasta 3 activas | Hasta 20 activas, límite comercial propuesto | CU-002/RF04 |
| Movimientos/transferencias manuales | Incluidos | Incluidos | CU-001/RF01 |
| Patrimonio/cotizaciones básicas | Incluidos, con fuente/fecha | Incluidos | CU-003/RF02–03 |
| Exportación de datos propios | Siempre disponible, también al cancelar/bajar | Siempre disponible | CU-002/RF07 |
| Inversiones y simulación | Sin nuevos registros; historial propio conservado y exportable | Incluidas | CU-004/RF05 |
| Telegram, OCR y recurrentes | Sin automatización productiva | Incluidos; OCR 20 tickets/ciclo | CU-001/RF06/08/09 y RF16 transversal |
| Presupuestos e importación | Sin nuevas operaciones avanzadas | Incluidos | CU-001/RF12 y RF07 |
| Análisis/IA | Resumen básico determinístico | Incluidos; asistente 40 consultas/ciclo | CU-003/RF10–11 |
| Acceso, preferencias y control de datos | Incluidos | Incluidos | CU-002/RF13–14 |
| Estado/cancelación del plan | Estado Free y alta futura | Ciclo y estado de suscripción | CU-002/RF15; escenario comercial |

Los gastos compartidos se cubren como variante de gestión manual en CU-001, con división y seguimiento de saldos entre participantes. La persona invitada por enlace accede sólo al grupo y operaciones permitidas; no adquiere acceso a cuentas personales del propietario. Su participación no genera por sí sola una suscripción o un ingreso adicional del modelo. La política de 3/20 cuentas, 7,50 USD y cupos es una propuesta comercial: los valores de fallback y configuración actualmente encontrados en el código no acreditan que esta política ya esté operativa.

Se propone cobro mensual en ARS equivalente al precio de referencia, con valor final, fuente de conversión, fecha, tratamiento fiscal y período visibles antes de la aceptación. La regla de conversión contractual se fija al habilitar la pasarela; no se afirma que un “dólar oficial” indeterminado ya rija. No se presupone Stripe disponible o Mercado Pago contratado. La activación exige una notificación auténtica e idempotente y conciliación; un botón de simulación no acredita pago.

La cancelación detiene futuras renovaciones según condiciones comunicadas; se conserva el período acreditado y se informa vencimiento. Al bajar el plan se mantienen lectura y exportación del historial. Si hay más de tres cuentas, el usuario selecciona las habilitadas para nuevos movimientos Free; las demás permanecen consultables. No se borran datos ni se ejecutan recurrentes suspendidos retroactivamente sin confirmación. Cupos IA no se acumulan; al agotarse queda disponible carga manual. No se vende “IA ilimitada” ni se obliga a aportar una clave de API para cumplir Premium.

#### 6.5.2 Estrategia de precio

USD 7,50 es una hipótesis de prueba de valor y margen, sin descuento o abono anual incluido en los 24 meses. Se evita competir exclusivamente por precio: Spendee publica un mensual inferior y YNAB uno superior. Se probará comprensión del beneficio y pago real; cada cambio de precio/cupo recalcula la caja y se informa antes de renovar. Si el precio final al consumidor requiere absorber impuestos o cargos distintos, se ajusta la facturación neta del modelo y no se presume que 7,50 sea ingreso disponible.

### 6.6 Comunicaciones integradas

#### 6.6.1 Planificación de comunicaciones

Plan de primer año: M1–M3 reclutar estudio y beta mediante contactos y comunidades, sin presupuesto publicitario; M4–M6 publicar una demostración semanal de una tarea y una guía mensual de registro/moneda; M7–M9 medir activación por canal y corregir contenidos; M10–M12 priorizar canales que retienen y recogen consultas útiles. El fundador reserva 8 h/mes iniciales de comunicación dentro de sus 40 h comerciales; no se presenta promoción orgánica como trabajo sin costo. El presupuesto base de 25 USD/mes desde M4 corresponde a contenidos, herramientas y experimentos pequeños por cotizar, no garantiza determinado número de visitas.

Se miden visitas válidas, altas únicas, activados, retención y pagos por canal. El CAC financiero divide gasto de captación por altas Premium nuevas atribuibles; el CAC económico agrega horas de captación valoradas. Se excluyen seguidores, impresiones y personas no deduplicadas del denominador de clientes. No hay calendario de influencers contratados, premios por inversión ni comunicación a terceros enviada en nombre del autor. Mensajes y campañas se publican sólo al ejecutar el plan.

#### 6.6.2 Diseño del sitio: siete C

| Dimensión | Aplicación propuesta y control |
|---|---|
| Contexto | PWA legible en móvil, navegación a los cuatro objetivos, formularios con confirmación |
| Contenido | Historial, totales, tasas y fechas; límites del cálculo y del asistente visibles |
| Comunidad | Canal opcional para comentarios; no un chat que exponga datos financieros de participantes |
| Customización | Preferencia de moneda/panel sin alterar moneda original ni registros históricos |
| Comunicación | Ayuda y soporte; avisos útiles y opcionales; fallas de aviso separadas del registro financiero |
| Conexión | Fuentes externas por adaptadores, identificación de frescura y acceso seguro |
| Comercio | Precio/ciclo/condiciones, estados de cobro y cancelación; demostración diferenciada de pasarela real |

Los prototipos y pantallas que respaldan estas funciones se referencian en el capítulo tecnológico; no se ilustran compras reales sin evidencia.

### 6.7 Distribución

#### 6.7.1 Canales principales

PWA por enlace directo como único canal de contratación propuesto, sin obligación de tienda móvil. Telegram es canal de interacción vinculado a una identidad autorizada, no un revendedor ni un banco. El nombre `zarix.app` es referencia de dominio propuesto: su compra/control y URL productiva se acreditarán antes de usarlo como acceso comercial. Una vista de demostración sin registro usa datos sintéticos; persistir información personal requiere cuenta y condiciones informadas.

#### 6.7.2 Estrategia de distribución

Venta directa nacional, activación guiada, ayuda y exportación. Se mide la caída entre enlace, alta, primer movimiento y pago. Se mantiene el recorrido manual ante falta de Telegram/OCR. Nuevos países o tiendas requieren presupuesto y validación propios; no se incluyen ingresos de expansión regional.

#### 6.7.3 Tipo y nivel de canal

Canal directo de nivel cero: ZARIX→usuario. Cloud, pasarela y cotizaciones son proveedores de la prestación, no intermediarios comerciales que adquieran el servicio para revenderlo. Un influencer que difunda un enlace sería canal de comunicación; un acuerdo de comisión requiere contrato y presupuesto antes de incorporarlo.

#### 6.7.4 Puntos de venta físicos

No aplica al lanzamiento previsto: el servicio se contrata y utiliza en línea. Rosario es sede del fundador, no sucursal de atención ni local comercial con alquiler omitido. Si se abre atención física, se agregan su costo, condiciones y responsabilidad.

#### 6.7.5 Asociaciones

No hay alianzas comerciales verificadas. Se podrán explorar comunidades y divulgadores; bancos, billeteras y brokers no se nombran como asociados confirmados. Cada acuerdo debe definir permisos de datos, contraprestación, comunicación y conflicto de interés. El modelo no depende de que dichos acuerdos ocurran.

#### 6.7.6 Just in time

No aplica inventario ni logística física JIT: se presta acceso digital. El equivalente operativo relevante es aprovisionar capacidad según consumo medido, presupuestar recursos antes de ampliar y mantener contingencia. Esa elasticidad no significa costo marginal nulo ni eliminación de respaldo.

## 7. Operaciones

### 7.1 Organización

Organización inicial unipersonal. Jeffrey Dietz decide prioridades y atiende producto, desarrollo, operación, soporte y comunicación. Proveedores externos prestan infraestructura, datos y pasarela; asesoramiento fiscal/legal se contratará al ejecutar. No se presume directorio, empresa constituida ni acciones repartidas. Se documentan calendario, procedimientos y accesos para reducir dependencia de una sola persona.

### 7.2 Grupo fundador

El documento recibido identifica un fundador e integrante académico: Jeffrey Dietz, estudiante de Ingeniería en Sistemas en UAI, sede Rosario. No se inventan socios, capital social inscripto, antecedentes profesionales externos ni participación de profesores en la empresa. La propiedad y cesión de código de colaboradores futuros se establecen por contrato; la titularidad de activos comerciales se acredita al adquirirlos.

### 7.3 Staff y perfiles

El fundador reúne inicialmente responsable de producto, desarrollo, operación y comunicación. La función fiscal/legal externa requiere profesional habilitado con alcance y honorario confirmado. El eventual soporte necesita atención escrita clara, diagnóstico de incidentes sin acceder indiscriminadamente a datos, seguimiento y documentación. No se prevén cargos de dirección remunerados ni especialistas adicionales en el horizonte; si una exigencia supera capacidad, se recorta alcance comercial o se recotiza, en vez de declarar puestos gratuitos.

### 7.4 Estructura de lanzamiento y evolución

M0–M3: fundador y asesoramiento puntual. M4 en adelante: fundador + proveedores; referencia 40 h/mes, sin salario pagado de fundador y con costo de oportunidad expreso. Un único contrato de soporte de 20 h/mes a 10 USD/h se habilita en el mes posterior a cumplir simultáneamente tres meses previos con margen antes del contrato ≥600 USD cada mes, ≥100 Premium y acumulado del proyecto ≥600 USD. La condición se evalúa con caja del proyecto sin aportes, para no confundir capital financiado con capacidad de contratación. Una vez contratado, 200 USD/mes permanece en la proyección.

Organigrama propuesto: fundador→producto/desarrollo, operación/soporte y comunicación; proveedores reportan por contrato y no son empleados internos. La contratación se habilita M20 en base, M14 optimista y nunca en adverso. El equipo no crece por el simple paso del tiempo. El eventual retiro fundador o una contratación laboral exigirá rehacer remuneraciones, cargas y condiciones legales; no se financia con una previsión implícita.

### 7.5 Filosofía, sistema y procesos

Iteración por prioridades y revisiones quincenales, con cambios trazables. Los controles operativos se diseñan antes de cobrar y su ejecución requiere registros reales:

| Proceso | Frecuencia/responsable | Control y respuesta |
|---|---|---|
| Alta/activación | Cada alta; fundador mantiene reglas | Identidad, condiciones, primera cuenta, ayuda y ausencia de datos ajenos |
| Cotizaciones/IA | Cada consulta y resumen diario; servicio+fundador | Fuente/fecha, caché válida, faltantes, token/cupo, propuesta confirmada y manual disponible |
| Cobro/factura | Notificación+conciliación semanal; fundador/asesor | Autenticidad e idempotencia, importe/estado, comprobante conforme a encuadre; no activar por retorno del navegador |
| Incidentes/soporte | Revisión diaria hábil; fundador, luego contrato | Priorizar integridad/acceso; registrar incidente y restauración; respuesta inicial objetivo ≤2 días hábiles, no SLA vendido |
| Costos/caja | Semanal y cierre mensual; fundador | Consumo, provisiones, pagos y reservas; recálculo escenario y puertas |
| Respaldo/continuidad | Según diseño verificado, con restauración de ensayo mensual | Verificar recuperación y exportación; procedimiento si falta fundador |
| Derechos/cancelación | Por solicitud y seguimiento semanal | Identidad, exportación, revocación de vínculos, supresión/retención conforme a política y registro del cierre |

La autorización y la minimización son parte del servicio. Se evita usar tickets o finanzas reales en logs de soporte/IA si no son necesarios. La pérdida de una notificación no implica repetir un movimiento confirmado. La falla de un proveedor no autoriza informar como vigente una cotización antigua. Se prioriza resolver incidentes críticos antes de campañas o nuevas capacidades.

### 7.6 RRHH y capacitación

No hay empleados previstos al iniciar ni promesa de seis a ocho integrantes sin costos. Se registra dedicación real para contrastar las 40 h/mes; un crecimiento de soporte que supere capacidad activa revisión de contratación y presupuesto. Capacitación inicial propuesta: documentar restauración, respuesta de incidentes, protección de datos y conciliación; entregar guía y datos sintéticos para que un eventual soporte pueda operar sin acceso financiero general. Usuarios reciben ayuda sobre moneda, transferencias, tasas y confirmación de OCR. Las habilidades y tiempos se evalúan antes de delegar accesos. La infraestructura se presupone en 8.2/9.1 y no sustituye este requerimiento humano.

## 8. Plan financiero-económico

El modelo prospectivo incluye M0 y 24 meses completos para base, optimista y adverso. Se acompaña el archivo auditable `modelo_financiero.csv`, sus parámetros y resultados calculados. No son estados contables históricos. Se define USD constante del momento de evaluación como unidad, tasa real efectiva anual 25% y su mensual equivalente `(1,25)^(1/12)−1`. Es una exigencia de retorno supuesta por riesgo de adopción/ejecución; no una tasa oficial ni una estimación de WACC. Se muestra sensibilidad a 15%, 35% y 50% anual para no apoyar la decisión en una única tasa elegida.

Se distinguen tres magnitudes: facturación bruta, cobro efectivo y flujo del proyecto. Financiación del fundador no es venta ni mejora VAN. El flujo económico, además, descuenta dedicación valorada sin fingir que fue un salario abonado. Todos los indicadores usan exactamente la serie mensual correspondiente, con costos y redondeos de centavos. No se conservan tablas por tramos que mezclan montos mensuales con acumulados.

### 8.1 Modelo de ingresos

Única fuente de ingreso modelada: Premium 7,50 USD/mes, desde M4. En base, 8% de altas registradas del mes previo se convierte a Premium; 4% del stock Premium previo causa baja mensual. Cada cantidad se redondea al entero más próximo. No se recalcula 8% de todo el acumulado ni se convierte de nuevo a quienes rechazaron. `Premium_t = Premium_(t−1)+altas_Premium_t−bajas_t`; `facturación_t = Premium_t×7,50`. El cobro supone acreditar 95% de lo facturado el mes anterior. Ese rezago y 5% no cobrado son hipótesis conservadoras, no condiciones reales de una pasarela contratada. El impago se simplifica como definitivo; un retraso real requiere seguimiento de antigüedad.

El modelo no incorpora intereses, publicidad, venta de datos, comisiones por activos, sincronización bancaria ni B2B. Al M24 quedan USD 2208,75 de cuentas a cobrar esperadas del base, informadas pero sin recuperación terminal agregada al VAN de 24 meses. No se afirma que un usuario registrado esté activo o que un usuario Premium haya sido cobrado hasta conciliar su acreditación.

### 8.2 Modelo de egresos

Presupuesto base desde M4; los importes de administración y provisión son hipótesis a recotizar/encuadrar. La ausencia de factura no convierte el presupuesto en gasto real.

| Partida | Valor base y forma de cálculo | Naturaleza |
|---|---|---|
| Vercel Pro |20 USD/mes, una persona desarrolladora | Base oficial de alojamiento apto para comercio |
| Supabase Pro |25 USD/mes, un proyecto Micro | Base oficial; crédito compute del plan considerado una sola vez |
| SMTP/email |3 USD/mes | Provisión de proveedor a cotizar |
| Cotizaciones/derechos |15 USD/mes | Presupuesto sujeto a licencia/contrato; no autorización obtenida |
| Facturación exterior |25%×(Vercel+Supabase+email+IA) | Colchón de conversión/cargos/impuestos de proveedores; no alícuota fiscal afirmada |
| IA |Premium×0,20750×50% de utilización | Tokens, cupo y reintentos presupuestados; cupo 40 consultas+20 OCR |
| Uso adicional nube |0,01 USD×MAU | Provisión agregada, no tarifa publicada por usuario |
| Administración |30 USD/mes | Hipótesis de asesoramiento/conciliación |
| Marketing |25 USD/mes | Experimentos/contenido/herramientas; horas separadas |
| Otros operativos |10 USD/mes | Monitoreo/prueba/contingencias menores; en M1–M3 herramientas e IA de prueba |
| Cobranza |6%×cobros efectivos | Comisión presupuestaria, pendiente de contrato/tributos aplicables |
| Provisión fiscal fija |30 USD/mes | Reserva de planificación, encuadre pendiente |
| Provisión fiscal variable |5%×cobros efectivos | Reserva de planificación, no “IIBB 5%” ni tasa legal |
| Dominio |18 USD en M0/M12/M24 | Presupuesto anual supuesto, no gasto mensual duplicado |
| Soporte externo |200 USD/mes desde puerta 7.4 | Contrato presupuestado 20 h/mes, no nómina omitida |

Vercel/Supabase publican esos precios base y pueden cobrar consumo o impuestos adicionales según condiciones. El plan no asume costos ilimitadamente constantes. [Vercel, precios](https://vercel.com/pricing), [Supabase, precios](https://supabase.com/pricing). Gemini 2.5 Flash Standard pago se presupuesta a 0,30 USD/millón de entrada texto/imagen y 2,50 USD/millón de salida, incluido razonamiento. Los volúmenes del cupo son estimaciones pendientes de medición, no tokens observados. El cálculo completo consta en el soporte financiero. [Google, tarifas Gemini](https://ai.google.dev/gemini-api/docs/pricing).

El fijo comercial base sin IA/excesos/comisiones/provisión variable/dominio/soporte es 170 USD/mes: 20+25+3+15+12 de colchón fijo+30+25+10+30. M1–M3 incluyen sólo 10 USD/mes de herramientas y prueba sin ventas. Pago de dominio, costos de apertura y soporte se incorporan en sus meses efectivos. No hay financiación bancaria, intereses ni adquisición de hardware en este horizonte. Una factura de nube superior al presupuesto activa reestimación de consumo; una contratación adicional exige otra fila de costo.

### 8.3 Inversión, capital de trabajo y financiación

M0 presupuesta 198 USD: 18 de dominio, 150 de revisión legal/encuadre y 30 de prueba. Son gastos de preparación y prepago de acceso, no un activo fijo de software capitalizado. El equipo informático ya disponible del autor se utiliza sin compra nueva de caja; no se lo declara “amortizado” sin contabilidad.

El capital necesario incluye la caja de preparación y el déficit operativo. Aporte inicial total=`redondeo_superior_a50(abs(mínimo_acumulado_proyecto)+3×fijo_comercial)`. Base: mínimo −777,76, reserva 510; aporte 1300. Ese 1300 ya incluye los 198 de apertura y no se suma a otra “inversión inicial 1300”. Se financia hipotéticamente por el fundador, sin préstamo o aporte conseguido. El modelo no prueba disponibilidad personal de fondos; ejecutar un escenario requiere confirmar la capacidad de aportar. Optimista requiere 1250 y adverso 3700 para cubrir su horizonte completo y reserva. El escenario adverso no se propone financiar indefinidamente: 8.11 establece revisión/cierre si no mejora.

### 8.4 Amortizaciones y depreciaciones

No se registra nuevo activo depreciable ni capitalización de tiempo fundador en la vista de caja. Nube, API, IA, asesoramiento y pruebas son gastos de período; no se amortizan otra vez para producir doble egreso. El dominio anual 18 USD puede reconocerse en una vista de resultado como 1,50/mes durante 12 meses; la caja conserva pagos 18 en M0/M12/M24. No se agrega ese devengamiento a los pagos del CSV. Si se adquiere hardware o se reconoce un intangible, una vista contable separada definirá costo, vida, residual y depreciación lineal `(costo−residual)/meses_de_vida` con soporte. No se afirma una amortización fiscal aprobada.

### 8.5 Encuadre fiscal y Ganancias

Se propone consultar la prestación como actividad unipersonal antes del cobro. ARCA describe el Monotributo como régimen que integra IVA/Ganancias y componentes previsionales/de salud; eso no determina automáticamente que ZARIX reúna condiciones ni su categoría/costo. Se debe confirmar actividad, residencia, ingresos previstos, facturación, obligaciones, retenciones, posibles servicios/importaciones y transición de régimen. No se agrega Ganancias por separado si el encuadre confirmado ya lo incluye. [ARCA, explicación del Monotributo](https://www.arca.gob.ar/monotributo/ayuda/que-es.asp).

Hasta ese dictamen/cotización, 30 USD fijos+5% de cobros son una **provisión financiera supuesta** del base, no cuota ARCA, declaración de impuesto ni alícuota. Se modelan como salida reservada en sus meses para no mostrar caja disponible artificialmente. Al operar se sustituyen por pagos/retenciones reales, se concilia y libera diferencia; no se suman provisión e impuesto real como dos gastos definitivos. El colchón de facturación exterior es otra incertidumbre, limitada a proveedores, y se recalcula también para evitar duplicar cargos ya incluidos.

### 8.6 Ingresos Brutos y venta nacional

No se mantiene 3,5% como alícuota de ZARIX sin código de actividad, jurisdicción y régimen confirmados. Rosario implica revisar Santa Fe y el alcance nacional puede requerir considerar distribución jurisdiccional; se consulta antes del lanzamiento. La provisión variable de 8.5 cubre incertidumbre tributaria de planificación sin adjudicar su totalidad a IIBB. La legislación 2026 de Santa Fe es fuente a revisar para el encuadre concreto, no prueba de una exención o tasa de software. [Santa Fe, Ley tributaria 2026](https://www.santafe.gov.ar/index.php/web/content/download/283588/1466851/file/Ley%20Tributaria%202026.pdf). En adverso se aumenta la provisión fija a 45 y variable a 8% como sensibilidad de caja, sin afirmar que cambia la norma.

### 8.7 Remuneraciones y cargas

La caja base no paga retiro/salario fundador; esa es una hipótesis de reinversión, no costo humano cero. La vista económica valora 80 h en M0, 60 h/mes M1–M3 y 40 h/mes desde M4 a 12 USD/h; 32 h con soporte. El costo exacto base total del horizonte es 12720 USD, calculado desde las horas de cada fila. La dedicación y valor deberán contrastarse con horas reales; no es una tarifa profesional de mercado demostrada.

El único contrato de soporte presupuesta 200 USD/mes cuando se cumple 7.4 y permanece después en la caja. Se asume servicio independiente por cotizar, no relación laboral confirmada. Si corresponde empleo o la facturación incluye impuestos/cargas adicionales, se cambia modalidad y costo antes de contratar. No se omiten salarios de una dotación futura declarada, porque no se proyecta otra dotación. En base el margen de caja no remunera por completo al fundador: VAN económico negativo y sin repago económico en 24 meses.

### 8.8 Presupuesto mensual

`flujo_t = cobros_t−pagos_t`; `acumulado_t = acumulado_(t−1)+flujo_t`; `caja_final_t = caja_inicial_t+aporte_t+flujo_t`. M0 parte de caja cero y recibe el aporte; la caja siguiente abre con el cierre anterior. No hay fondos aportados nuevamente ni préstamos. La caja financiada positiva no equivale a repago: ese indicador usa el acumulado del proyecto sin aportes. La tabla completa mes a mes y todas las partidas se incorporan en la planilla auditable; el cuadro siguiente sólo presenta hitos del base, todos obtenidos del mismo CSV.

| Mes | Registrados adquiridos | Premium cierre | Facturación bruta | Cobro efectivo | Pagos totales | Flujo proyecto | Acumulado proyecto |
|---:|---:|---:|---:|---:|---:|---:|---:|
|Mes 0|0|0|0,00|0,00|198,00|−198,00|−198,00|
|Mes 3|100|0|0,00|0,00|10,00|−10,00|−228,00|
|Mes 6|340|15|112,50|64,13|180,20|−116,07|−661,80|
|Mes 12|1360|77|577,50|456,00|252,91|203,09|−328,65|
|Mes 18|3100|179|1342,50|1132,88|328,67|804,21|2937,55|
|Mes 24|5560|310|2325,00|2037,75|671,82|1365,93|9410,21|

Importes en USD; los hitos muestran facturación y cobro distintos por el rezago y la cobranza efectiva. El generador concilia pagos, acumulados y caja con centavos. Si el capítulo adjunta resultados nuevos, deberá regenerar esta tabla desde el CSV, no modificar hitos a mano.

### 8.9 Evaluación de inversión

VAN=`Σ flujo_t/(1+r_mensual)^t`, t=0..24; TIR resuelve esa misma suma igual a cero. TIR anual=`(1+TIR mensual)^12−1`. Repago: primer mes con acumulado≥0 incluyendo M0 y operación, sin aportes. El adverso tiene todos los flujos netos negativos: no hay cambio de signo y no tiene TIR ni recuperación en 24 meses. No se inventa una TIR para completar la tabla.

Equilibrio de régimen estable base, con MAU M12 y sin soporte: margen unitario=`7,50×0,95×(1−0,06−0,05)−0,20750×0,50×1,25`=6,2115625 USD. Numerador=fijo 170+infra 4,76+dominio equivalente 1,50=176,26. `ceil(176,26/6,2115625)`=29 Premium. Con soporte 200, el valor es 61. Este equilibrio local depende de MAU, costo/provisión y plan; no es una constante universal. El rezago explica que el primer flujo mensual no negativo sea M9 y repago M14, distintos de equilibrio teórico.

| Indicador desde la misma serie M0–M24 | Base | Optimista | Adverso |
|---|---:|---:|---:|
| Cobros totales |16572,81|55095,60|2193,75|
| Pagos totales, incluye M0 |7162,60|14189,15|5233,73|
| Acumulado proyecto M24 |9410,21|40906,45|−3039,98|
| VAN financiero a 25% anual |6385,45|28291,55|−2489,64|
| TIR mensual financiera |18,765%|32,160%|No existe |
| TIR anual equivalente financiera |687,521%|2739,166%|No existe |
| Primer flujo comercial ≥0 |M9|M8|No ocurre |
| Repago financiero |M14|M10|No ocurre |
| Equilibrio sin soporte, MAU M12 |29|31|40|
| Equilibrio con soporte, MAU M12 |61|63|77|
| VAN económico, tiempo fundador incluido |−4155,93|18174,19|−13349,97|
| Repago económico |No ocurre |M17|No ocurre |
| Costo oportunidad fundador total |12720,00|12144,00|13200,00|
| TIR mensual económica |−3,235%|10,882%|No existe |
| TIR anual económica equivalente |−32,605%|245,415%|No existe |

Las TIR financieras elevadas provienen de una base inicial de efectivo pequeña y de no pagar el trabajo fundador en caja; no son una garantía ni un retorno equivalente sobre la dedicación. La TIR económica negativa base sí existe matemáticamente porque el flujo económico cambia una vez de signo, aunque no recupere el esfuerzo en el horizonte. Se priorizan VAN económico, caja, retención y capacidad operativa para decidir. No se incluye precio de venta, valor de datos ni cobranza terminal para mejorar rentabilidad.

| VAN financiero con tasa anual real USD | Base | Optimista | Adverso |
|---|---:|---:|---:|
|15%|7384,72|32458,88|−2678,16|
|25%|6385,45|28291,55|−2489,64|
|35%|5579,74|24930,94|−2331,38|
|50%|4632,76|20979,64|−2136,46|

Una tasa mayor hace menos negativos egresos futuros descontados en el adverso; no mejora su caja ni vuelve viable la pérdida. Esta sensibilidad de tasa no sustituye la incertidumbre de usuarios y costos del apartado siguiente.

### 8.10 Escenarios de riesgo

| Supuesto/resultado | Base | Optimista | Adverso |
|---|---:|---:|---:|
| Conversión altas del mes anterior |8%|10%|4%|
| Baja mensual Premium |4%|2%|8%|
| Cobranza efectiva previa |95%|98%|90%|
| MAU/registrados adquiridos |35%|40%|25%|
| Uso del cupo IA |50%|60%|100%|
| Multiplicador nube/email/datos |1|1|1,50|
| Fee supuesto |6%|6%|8%|
| Provisión fiscal fija/variable |30+5%|30+5%|45+8%|
| Marketing mensual desde M4 |25|40|15|
| Registrados M12/M24 |1360/5560|2860/14020|640/1600|
| Premium M12/M24 |77/310|216/1122|15/29|
| Facturación mensual M24 |2325|8415|217,50|
| Déficit máximo acumulado |777,76|669,55|3039,98|
| Reserva 3 meses fijo |510|555|637,50|
| Aporte inicial total |1300|1250|3700|
| Caja financiada al cierre |10710,21|42156,45|660,02|
| Soporte contratado |M20|M14|No |

Los tres escenarios comparten precio y lógica; cambian captación mensual, retención, cobro, utilización y costos. No se asignan probabilidades 20/60/20 sin datos. Optimista implica una capacidad de captación significativamente mayor a probar, no una elección de cifras finales. Adverso es un estrés combinado con pérdida y necesita más capital pese a gastar menos en marketing. La literalidad variable del ejemplo Vilaboa sobre cantidad/tipo de pesimistas se cubre con un escenario adverso explícito y sensibilidades, sin atribuirlo como requisito de la cátedra. Un segundo choque de demora del lanzamiento debe modelarse si ocurre; no se conserva el calendario de cobros sin la puerta M4.

### 8.11 Contingencia financiera y operativa

El fundador revisa semanalmente caja y cada mes cohortes/costos. Gatillos propuestos: menos de 3 meses del fijo en caja disponible; conversión inferior 4% o churn superior 8% durante dos cierres; consumo/provisión superior al 150% de presupuesto; o falla crítica de integridad/permiso. Primero detener captación paga y nuevas ampliaciones, reducir procesos de IA a cupos/reintentos controlados, revisar fuentes y presupuesto, atender integridad y conservar exportación. No se propone mover un negocio comercial a Vercel Hobby para ahorrar incumpliendo condiciones.

En M6 y M9 se decide continuar, reducir escala o preparar cierre. Continuar con pérdida requiere aporte nuevo confirmado y modelo actualizado; no se registra automáticamente dinero futuro para evitar insolvencia. Un pivot B2B exige investigación/ventas y costo propio, por lo que no se presenta como ingreso de emergencia. Si no hay avance de utilidad/pago o la caja no conserva el período de salida, se inicia 8.12 antes de agotar fondos. El escenario adverso de 24 meses describe exposición máxima comparativa, no autoriza quemar 3700 sin revisiones.

### 8.12 Plan de salida

Salida ordenada propuesta: detener nuevas suscripciones, avisar con plazo informado, mantener lectura/exportación durante una ventana prevista de 30 días, conciliar cobros y resolver reintegros/ciclos conforme a términos y normativa confirmada, revocar links/tokens y cancelar proveedores al finalizar. La reserva de operación sostiene la ventana; los importes concretos se actualizan con obligaciones existentes. Se conserva únicamente lo exigido por norma/contrato durante el plazo pertinente y se suprime lo restante conforme a política. No se inventa un plazo legal de conservación común a todo dato.

Marca, código y activos contractuales podrían transferirse si su propiedad/licencias lo permiten; los datos personales no se ofrecen como activo vendible libremente. Cualquier continuidad por otro responsable requiere analizar información, base legal/consentimiento y contratos. Publicar código abierto es una posibilidad que excluye secretos, datos reales y licencias incompatibles; no sustituye exportación, reintegros o supresión. El VAN no contempla ingreso por venta del proyecto.

## 9. Factibilidades

### 9.1 Factibilidad técnica

Recursos documentados: equipo informático del fundador, conocimientos de desarrollo, código y stack Next/React/Supabase/PWA. La verificación fechada del capítulo 10 determina versiones reales, casos cubiertos y evidencia de pruebas; esta sección no declara integraciones por mencionarlas. Recursos requeridos para operar: nube comercial, proyecto productivo con respaldo, SMTP, derechos de cotizaciones, proveedor IA pago controlado y pasarela configurada. Se presupuestan en 8.2 y no se promete operar con tiers gratis ilimitados.

Los límites se controlan por BD/archivos/tráfico/funciones/concurrencia/tokens y no sólo registrados. Supabase Free publica 500 MB de BD, 1 GB de archivos y 50000 MAU; eso no equivale a “máximo 500 usuarios”. Pro incluye capacidad y respaldo según términos, con posible costo adicional; el plan no tiene SLA general garantizado por ZARIX. Capacitación y soporte de 7.6 forman parte de factibilidad; manual de restauración y recuperación de proveedores deben verificarse. [Supabase, capacidades y precios](https://supabase.com/pricing).

La conclusión técnica es condicionada: el alcance académico se acredita con artefactos/código/pruebas; la operación exige prueba de carga y presupuesto de consumo real, restauración, autorización y contratos. No se afirma capacidad para 1122 Premium del optimista sin medir carga. Antes de escalar se comparan consumos al 80% de cuotas o presupuesto, se recotiza ampliación y se prueba continuidad.

### 9.2 Factibilidad comercial

Existe contexto verificable de múltiples cuentas/monedas y alternativas vigentes, pero la disposición a pagar ZARIX sigue sin evidencia empírica aportada. La segmentación y SAM son hipótesis; los 4 CU permiten demostrar utilidad, no cuota de mercado. El precio propuesto no es menor que todas las opciones. La factibilidad comercial se confirma sólo con tareas útiles repetidas, retención y cobros netos que sostengan el servicio. El escenario base requiere captación y conversión explícitas y no remunera plenamente al fundador; el optimista sí muestra VAN económico positivo, pero exige más usuarios y capacidad. El adverso muestra pérdida. La conclusión es “validación pendiente con un plan medible”, sin demanda comprobada o afirmación de rentabilidad universal.

### 9.3 Factibilidad administrativa

La organización unipersonal puede gestionar un piloto acotado si separa tareas y conserva registros. El modelo reserva horas, 30 USD/mes de administración y soporte condicionado, en vez de confundir usar una herramienta de tareas con tener control administrativo. Conciliación semanal, cierre mensual, comprobantes, proveedores, incidentes y solicitudes de datos tienen responsable y frecuencia. La administración comercial comienza sólo con encuadre confirmado y pasarela auténtica; frente a mayor demanda se ajusta capacidad o presupuesto. La falta de reemplazo fundador se mitiga con documentación, accesos mínimos y procedimiento de continuidad; su efectividad necesita ejercicio.

### 9.4 Factibilidad legal, datos, propiedad intelectual y contratos

La prestación se limita por diseño a registros/consultas; no se concluye categóricamente que ninguna autorización BCRA/CNV aplique. Antes de cobrar se debe revisar el alcance concreto, especialmente respuestas IA, fuentes de mercado, afiliaciones y cambios de integración. Se propone operar inicialmente con un titular individual si reúne condiciones; una sociedad futura sólo se evalúa por riesgo/escala y no se declara constituida.

| Materia | Acción concreta antes de producción comercial | Estado |
|---|---|---|
| Tributación/facturación | Código de actividad, régimen, categoría/jurisdicción, retenciones, venta nacional y comprobantes; sustituir provisiones por pagos reales | Encuadre profesional pendiente; presupuesto explícito |
| Datos personales | Informar responsable, finalidades, datos necesarios, destinatarios, seguridad, acceso/rectificación/supresión y canal; verificar registros aplicables | Política/procedimiento por formalizar y verificar |
| Cloud/transferencias | Mapa de proveedores/regiones, contratos y base de transferencia; minimizar datos enviados a Telegram/IA | No presumir cumplimiento por usar Supabase/Gemini |
| Links de compartidos | Acceso limitado al grupo, capacidad revocable, datos mínimos, protección ante enumeración y consentimiento de participantes | Controles a acreditar en evidencia técnica |
| Términos/consumo | Precio final, ciclo, renovación, cancelación, refund, disponibilidad/cupos y límites de cálculo; aceptación rastreable | Debe aprobarse antes de cobro real |
| IA/OCR | Revisión de extracción, consultas sólo sobre datos autorizados, límites/retención y proveedor apropiado | Medición y contrato comercial pendientes |
| Cotizaciones | Permiso de uso, redistribución/atribución, límites, precisión y contingencia por cada API | Presupuesto no equivale a licencia conseguida |
| Código/licencias | Inventario dependencias, licencias, autoría y cesión de colaboradores; excluir secretos/datos de repositorio | Auditoría documental/técnica requerida |
| Marca/dominio | Verificar disponibilidad, titularidad, derechos y costo; distinguir nombre de registro | No se afirma marca registrada ni dominio comprado |
| Pasarela/terceros | Cuenta admitida, contrato, fees, notificaciones, seguridad y conciliación | Simulación académica distinta de cobro real |
| Salida | Aviso, cancelación, exportación, reintegros, retención/supresión y eventual cambio de responsable | Plan 8.12, ejecución sólo si corresponde |

AAIP explica obligaciones de responsables y condiciones de transferencias internacionales, incluyendo tratamiento por servicios externos. ZARIX debe convertirlas en documentos y controles de su arquitectura real, sin prometer genéricamente “no comparte datos” o “compatible GDPR” sin evaluación. [AAIP, obligaciones](https://www.argentina.gob.ar/aaip/datospersonales/responsables/obligaciones), [AAIP, transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales). No se fabrican consentimientos, inscripciones, contratos, licencias ni aprobaciones docentes. La viabilidad jurídica permanece condicionada a completar esas actuaciones reales; el documento define su cobertura y responsables.

## Referencias de negocio y soporte

Los enlaces oficiales precedentes se consultaron el 6/10/2026. Las cifras BCRA corresponden a diciembre 2025, publicación 30/4/2026; IPC corresponde a diciembre 2025. Precios de software son valores publicados al consultar, sujetos a cambio y a condiciones de país/impuestos. El Canvas se atribuye a Osterwalder, A. y Pigneur, Y. (2010), Business Model Generation, Wiley. Se conservan referencias teóricas efectivamente utilizadas del plan, con la referencia bibliográfica incluida en este documento. El soporte financiero adjunto identifica parámetros, fórmulas, redondeo, fuentes y resultados; la documentación técnica es la fuente de estados de implementación, no las hipótesis comerciales de este capítulo.

## 10 Aspectos descriptivos de la solución tecnológica

### 10.1 Objetivo de desarrollo

El objetivo académico es construir y justificar una PWA de finanzas personales con una especificación que pueda recorrerse desde la necesidad del usuario hasta la evidencia de ejecución. La unidad de alcance es el objetivo del usuario: cuatro casos de uso totales. Sus escenarios cubren los canales y funciones auxiliares sin multiplicar fichas de subcasos técnicos. El criterio de cierre exige coherencia entre requisitos, reglas, prototipos, dominio, robustez, secuencias, clases, datos, arquitectura y pruebas.

### 10.2 Método y organización del trabajo

Se aplica ICONIX mediante visión y requisitos, modelo de dominio, fichas de casos de uso, robustez BCE, secuencias y clases de diseño. Los diagramas conceptuales representan conceptos del negocio; el modelo físico contiene claves y tipos de almacenamiento. Los escenarios alternativos y excepciones tienen un punto de entrada y una salida identificables. El código mantiene una capa de servicios, rutas HTTP y persistencia; se atribuyen patrones sólo cuando sus participantes y colaboraciones pueden localizarse.

El trabajo lo realiza un integrante. El seguimiento separa implementación, pruebas y revisión académica. Cada cambio conserva su referencia de origen, modificación, prueba y resultado. Un resultado histórico se identifica por su fecha y revisión, y una prueba diseñada no se cuenta como ejecutada. El seguimiento financiero usa hipótesis editables y un solo flujo de cálculo por escenario seleccionado.

### 10.3 Plan de construcción y aceptación

| Etapa | Resultado | Evidencia de aceptación |
|---|---|---|
| Especificación | Cuatro CU, reglas, actores, RF y RNF | Matriz completa y revisión del alcance |
| Diseño | Dominio, datos, BCE, secuencias, clases y arquitectura | Figuras legibles, participantes coherentes y revisión PDR/CDR |
| Implementación | Rutas, servicios e integraciones correspondientes | Fuente versionada, compilación y comprobación de contratos |
| Verificación | Pruebas de lógica, SQL y escenarios de interfaz | Entradas, oráculos, resultados y evidencia conservada |
| Validación | Usuarios y cátedra revisan utilidad y artefactos | Registro real de observaciones y conformidad |
| Entrega y defensa | Borrador accesible y demostración reproducible | Versión publicada, checklist y recorrido de los cuatro CU |

Las etapas describen un orden de dependencia, no un calendario aprobado. Los meses comerciales del plan financiero son períodos relativos al lanzamiento supuesto. La fecha de defensa informada por el autor no se usa para fabricar actas ni resultados de pruebas.


## 10.4 Documento de visión

### 10.4.1 Propósito y propuesta de valor

ZARIX es una aplicación web progresiva para que una persona residente en Argentina pueda registrar su actividad financiera, administrar cuentas en distintas monedas, comprender su patrimonio y seguir las inversiones que realizó fuera del sistema. Integra cotizaciones de referencia, captura asistida de movimientos y consultas sobre el propio historial. El resultado esperado es un registro comprobable y una visión financiera que indique las fuentes, fechas y supuestos de cada cálculo.

Las funciones se organizan en cuatro objetivos del usuario: gestionar movimientos financieros, administrar cuentas y datos personales, consultar y analizar la situación financiera, y seguir el portafolio de inversiones. Importación, exportación, OCR, Telegram, recurrencias y análisis son escenarios de esos cuatro objetivos. No constituyen casos de uso adicionales.

### 10.4.2 Alcance y límites

El alcance incluye registro y corrección de gastos, ingresos y transferencias; cuentas de efectivo, banco, criptomonedas, inversión y tarjeta; saldos separados por moneda; patrimonio expresado en ARS y USD; cotizaciones de dólar oficial, blue, MEP y CCL y de USDT, BTC y ETH; registro histórico de compras y ventas de inversiones; importación y exportación; reglas recurrentes; presupuestos por categoría; OCR de tickets; bot vinculado; consultas en lenguaje natural; anomalías y proyecciones deterministas; acceso, preferencias y administración de la suscripción a ZARIX.

ZARIX no custodia fondos, no ejecuta compras ni ventas en mercados, no sincroniza automáticamente con bancos, no recomienda operaciones de inversión y no ofrece patrimonio familiar compartido ni aplicaciones móviles nativas. Las posiciones representan operaciones realizadas por el usuario fuera de ZARIX. También incluye grupos de gastos compartidos con enlace de capacidad y reparto entre invitados; esa colaboración no comparte el patrimonio privado. La aplicación requiere conexión para sincronizar y consultar fuentes externas; la cola local conserva borradores sin conexión hasta sincronizar, sin confirmar dinero ni modificar saldo mientras están pendientes. En la corrección de entrega sólo elimina el pendiente tras respuesta confirmada; ante error de sesión, datos, servidor o red conserva el registro, detiene el lote y presenta recuperación o reintento. Si el servidor confirmó y falla la eliminación local, exige revisar los movimientos antes de otro intento; esa revisión evita prometer idempotencia persistente inexistente.

La versión académica registra cantidades de activos y precios en su moneda de negociación. Dividendos, splits, canjes, préstamos de títulos, posiciones cortas, derivados y cálculo automático de ratios de CEDEAR quedan fuera del alcance. Un CEDEAR se registra con su ticker y precio de negociación local; no se convierte automáticamente en la acción subyacente. El catálogo permite también bonos, FCI, plazo fijo, caución, inmuebles y otros registros manuales; no se garantiza precio automático para cada tipo. Bonos usan nominal 100. Las operaciones se calculan sin comisiones ni impuestos; esa limitación se informa junto al resultado. El uso de valores manuales se identifica con fecha y fuente manual.

| Capacidad | Free autenticado | Premium activo |
|---|---|---|
| Movimientos manuales y correcciones | Sí | Sí |
| Cuentas activas | Hasta tres | Hasta veinte según hipótesis comercial; verificar enforcement real |
| Patrimonio y cotizaciones de referencia | Sí | Sí |
| Preferencias, acceso, gestión del plan y exportación de datos propios | Sí | Sí |
| Portafolio y simulación | No, salvo lectura del historial propio ya existente al vencer el plan | Sí |
| Análisis avanzado, chat, anomalías y proyecciones | No | Sí; hipótesis de 40 consultas IA, período y enforcement a verificar |
| OCR, bot, recurrentes y grupos compartidos | No | Sí; hipótesis de 20 OCR, período y enforcement a verificar |
| Importación y presupuestos | No | Sí |

Free significa acceso con una identidad autenticada. Las cuentas personales no son públicas. El grupo compartido expone nombres visibles, gastos y repartos únicamente a quien posee su enlace de capacidad; no se presenta el enlace como autenticación nominal fuerte. Una cuenta multimoneda cuenta como una cuenta, no como una cuenta por moneda. Al vencer Premium se conserva todo el historial: se detienen las reglas automáticas y se impiden nuevas acciones Premium; no se eliminan datos ni se crean cargos nuevos. Si hay más de tres cuentas activas, se permite consultar y operar manualmente sobre las existentes, pero no crear otra mientras no se reduzca la cantidad o se reactive Premium. Los cupos comerciales de esta tabla no se dan por implementados sólo por existir en el plan de negocio. El precio y período de Premium pertenecen al catálogo comercial; la tecnología utiliza ese catálogo y no contiene un precio fijo distinto.

### 10.4.3 Actores y glosario

| Actor externo | Responsabilidad frente a ZARIX |
|---|---|
| Invitado con enlace | Persona que posee el token de un grupo y se identifica como miembro; puede operar dentro de ese grupo, sin acceso a cuentas personales |
| Usuario | Persona titular de sus cuentas y datos; inicia los cuatro objetivos, confirma operaciones y configura sus preferencias |
| Telegram | Transporta mensajes, confirmaciones y avisos del usuario vinculado; no decide la identidad financiera |
| Programador externo | Dispara vencimientos mediante una solicitud autenticada de servicio |
| Proveedores de cotizaciones | Entregan precios de monedas o activos y sus fechas |
| Gemini | Propone extracción de tickets o interpreta y redacta consultas; no confirma movimientos ni calcula cifras financieras autorizadas |
| Mercado Pago | Procesa el cobro del plan y comunica sus estados verificables |

Supabase Auth, PostgreSQL, Storage, las pantallas, la caché y los controles de aplicación son componentes internos de ZARIX. La identidad de un usuario puede ser provista por Supabase Auth sin convertir la base de datos en un actor del negocio. No se representa a un administrador inexistente.

| Término canónico | Definición |
|---|---|
| Cuenta | Contenedor financiero de un usuario, con tipo, estado y política monetaria |
| Saldo por moneda | Valor firmado disponible o adeudado en una moneda de una cuenta; cada moneda tiene un saldo propio |
| Movimiento | Hecho financiero confirmado que produce uno o más efectos de saldo; su tipo persistido distingue ingreso, gasto, transferencia y ajuste, incluida apertura identificada como ajuste |
| Transferencia | Un solo hecho entre dos cuentas propias, con débito y crédito indivisibles; no es ingreso ni gasto económico |
| Categoría | Clasificación de ingreso o gasto del usuario; una transferencia no requiere una categoría económica |
| Regla recurrente | Configuración que genera un movimiento en cada vencimiento permitido |
| Ocurrencia | Vencimiento concreto de una regla, identificado por regla y fecha local, con resultado único |
| Suscripción personal | Gasto recurrente marcado como suscripción del usuario a un tercero |
| Suscripción de plan | Derecho temporal a funciones Premium de ZARIX, vinculado a un pago verificado; distinto de una suscripción personal |
| Presupuesto | Límite de gasto de una categoría, moneda y período |
| Activo | Instrumento o moneda negociable identificado por símbolo, mercado y moneda |
| Posición | Cantidad mantenida de un activo en una cuenta, con costo contable remanente |
| Operación de inversión | Registro externo de un lote o venta histórica que modifica cantidad y resultado de una posición, sin mover efectivo automáticamente |
| Cotización | Precio con fuente, fecha, moneda de referencia y estado actual, de respaldo, manual o no disponible |
| Patrimonio líquido | Suma de cuentas no inversión incluidas en total y en líquido, convertidas según referencia; deuda reduce valor con signo negativo |
| Patrimonio total | Patrimonio líquido más cuentas no líquidas incluidas y valor de inversiones; cada cuenta o posición aporta una sola vez según su clasificación |
| Resultado realizado | Diferencia entre ingreso de una venta y costo contable asignado a las unidades vendidas |
| Resultado no realizado | Diferencia entre valor de mercado y costo contable de las unidades aún mantenidas |
| Idempotencia | Repetir una solicitud con la misma identidad produce el mismo resultado lógico, sin otro movimiento ni efecto de saldo |

### 10.4.4 Requerimientos funcionales y aceptación

Los requerimientos describen resultados observables. Los servicios, tablas y algoritmos que los satisfacen se especifican en el diseño, sin introducirlos en su enunciado. Los ejemplos de aceptación son datos sintéticos; cada ejecución debe guardar revisión del código, ambiente, fecha real y resultado obtenido.

| ID y enunciado | Caso y escenario | Criterio de aceptación |
|---|---|---|
| RF01. Registrar, consultar, corregir y eliminar gastos, ingresos y transferencias con saldos coherentes, y administrar repartos de gastos compartidos | CU-001 básico, A01, A08–A11 | Con ARS 10.000, un gasto de 1.500 deja 8.500 y un ingreso de 500 deja 10.500 en ejecuciones independientes. Una transferencia de 1.500 desde 10.000 a 2.000 deja 8.500 y 3.500, sin ingreso ni gasto económico. Editar o eliminar compensa el efecto anterior una sola vez; repartir 100 entre tres miembros conserva 100 y asigna 33,34/33,33/33,33; una entrada inválida no altera datos |
| RF02. Mostrar cotizaciones de dólar oficial, blue, MEP y CCL y de USDT, BTC y ETH, indicando fuente, moneda, fecha y estado | CU-003 básico y E01 | Cada valor visible tiene esos metadatos; ante falla de fuentes se muestra el último valor identificado como respaldo, o no disponible. Un valor ausente, negativo o cero no se presenta como cotización válida |
| RF03. Mostrar patrimonio líquido y total en ARS y USD y permitir reconstruir la conversión | CU-003 básico | ARS 120.000 y USD 100 con tasa sintética 1 USD = 1.200 ARS producen ARS 240.000 o USD 200. Una posición se suma una sola vez; un componente sin tasa produce un total parcial identificado |
| RF04. Crear, editar, archivar y restaurar cuentas propias de distintos tipos y monedas | CU-002 básico y A01–A03 | **Objetivo comercial pendiente de enforcement:** Free permite tres cuentas activas y rechaza la cuarta; la lectura del servicio inicial no acredita ese gate. ARS y USD mantienen saldos independientes. Eliminar desde la UI archiva la cuenta sin borrar movimientos; la cuenta archivada no aparece en listados normales y bloquea nuevos registros; restaurar recupera su visibilidad |
| RF05. Registrar compras y ventas de inversiones realizadas externamente y mostrar tenencia, costo y resultados realizados y no realizados | CU-004 básico y A01–A03 | Compra de diez unidades a USD 100, venta de cuatro a USD 120 y precio de referencia USD 110 dejan seis unidades, precio de compra del lote 100, resultado realizado 80, no realizado 60 y valor 660. Vender siete cuando se tienen seis se rechaza sin cambios |
| RF06. Capturar movimientos por Telegram para un usuario vinculado, solicitar datos faltantes y registrar sólo tras confirmación | CU-001 A03 | El usuario recibe una propuesta y confirma; se prueba que dos confirmaciones del mismo borrador generen un único movimiento; hasta verificar concurrencia no se declara idempotencia completa. Un Telegram ajeno o revocado no obtiene ni modifica datos financieros |
| RF07. Importar y exportar movimientos y datos relacionados en CSV y JSON con un formato documentado y resultado por fila | CU-001 A04; CU-002 A04 | En una cuenta con 10.000, importar gasto 500, ingreso 700 y gasto 0 acepta dos filas, rechaza una y deja 10.200. CSV y JSON equivalentes tienen el mismo resultado. El archivo exportado contiene sólo datos propios y preserva identificadores, relaciones, fechas, montos y monedas |
| RF08. Extraer de un ticket comercio, fecha, total e ítems disponibles y proponer una categoría para que el usuario revise y confirme el gasto | CU-001 A02 | Una propuesta de 1.500 corregida a 1.600 registra únicamente 1.600 tras confirmación. Antes de confirmar no existe movimiento. Extracción fallida permite carga manual |
| RF09. Administrar reglas de ingresos, gastos y suscripciones personales y ejecutar una sola ocurrencia por vencimiento válido | CU-001 A05 y A06 | Dos disparos concurrentes de una regla diaria de gasto 1.000 sobre saldo 10.000 generan una ocurrencia, un movimiento y saldo 9.000. Vencimiento final inclusivo; reglas suspendidas o expiradas no producen movimientos; falla de aviso no duplica ni revierte el registro |
| RF10. Responder consultas en lenguaje natural sobre los datos propios en PWA o Telegram, con período, filtros y origen de las cifras visibles | CU-003 A02 y A03 | Gastos de Alimentos 500, 700 y 800 del 1 al 6 de octubre suman 2.000; se excluyen septiembre y otro usuario. Consulta ambigua pide precisión; un resultado no verificable se informa; una respuesta de consulta CU-003 no ejecuta movimientos; una intención de escritura se deriva a confirmación CU-001 |
| RF11. Detectar anomalías y producir proyecciones sobre el historial propio mediante reglas deterministas explicadas | CU-003 A04 | Con gastos previos de tres meses que suman 3.000, promedio 1.000, un gasto actual de 2.000 activa ratio 2 y 1.999 no. Categoría nueva con 5.000 no activa; con 5.000,01 sí. Con promedio de ingresos 1.000 y gastos 700 en meses completos con actividad y efectivo ARS 2.000, proyecciones 3/6/12 meses son 2.900/3.800/5.600. Sin un mes completo con actividad o con monedas excluidas por falta de tasa no se proyecta |
| RF12. Crear, modificar y eliminar presupuestos mensuales por categoría o globales y moneda y mostrar consumo, disponible y exceso | CU-001 A07 | Límite 1.000 y gastos elegibles 700 muestran consumido 700 y disponible 300; una transferencia no aumenta el consumo; con gasto total 1.100 se informa exceso 100. Se verifica unicidad usuario/mes/categoría |
| RF13. Permitir registro, inicio y cierre de sesión y recuperación de acceso, protegiendo los datos de cada persona | CU-002 A05; transversal | Acceso válido identifica al dueño; acceso inválido no concede sesión; recuperación no revela si otro correo existe; cerrar sesión impide una nueva consulta protegida. No se exponen filas de otro usuario por cambiar un identificador |
| RF14. Guardar moneda base y orden o visibilidad de widgets permitidos por el plan | CU-002 A06; CU-003 A05 | Cambiar ARS a USD cambia la presentación de valores y conserva montos y monedas originales. Al volver a ingresar se recupera la configuración; widgets inexistentes o no permitidos se rechazan |
| RF15. Administrar la contratación, estado, cancelación y vencimiento del plan Premium según pagos verificados | CU-002 A07 | Un pago pendiente no activa Premium; una aprobación auténtica lo activa hasta su vencimiento. Una notificación repetida consulta nuevamente el recurso de la misma suscripción y actualiza su estado verificado; no se atribuye registro durable de eventos ni se da por probada la decisión bajo concurrencia. Un mensaje falso o pago rechazado no activa permisos; la cancelación y el vencimiento conservan el historial |
| RF16. Vincular y revocar una identidad Telegram con la identidad financiera propia | CU-002 A05 | Código de vínculo de un solo uso y con vencimiento une una identidad Telegram a un usuario; no se permite el mismo Telegram activo en dos usuarios. Revocarlo bloquea inmediatamente nuevas operaciones y consultas desde ese vínculo |

### 10.4.5 Requerimientos no funcionales

Los valores de esta tabla son metas de aceptación de la revisión, pendientes de medición en un ambiente identificado. Las condiciones forman parte del requisito y evitan presentar una cifra sin contexto.

| ID | Clasificación y objetivo medible | Método de aceptación |
|---|---|---|
| RNF01 | Desempeño. Dashboard autenticado con 10 cuentas, 5.000 movimientos y 100 posiciones: percentil 95 de carga útil inferior a 2 s con caché de cotización vigente, 20 sesiones concurrentes y red de 20 Mbps/latencia 50 ms | Al menos 100 navegaciones tras calentamiento en ambiente equivalente al despliegue. Desde inicio de navegación a widgets propios visibles. Medir también arranque frío y proveedor caído por separado; no excluir fallas silenciosamente |
| RNF02 | Disponibilidad. Objetivo mensual de al menos 99,5% para acceso, consulta y registro manual | Sonda autenticada cada 5 min durante el mes; disponibilidad = muestras satisfactorias/muestras programadas. Timeout 10 s; mantenimiento incluido. La falla de IA o cotizaciones cuenta para su módulo, y no convierte un registro manual exitoso en falla. No se confunde la meta del proyecto con una garantía contratada a proveedores |
| RNF03 | Seguridad. Todas las rutas financieras requieren identidad válida; ninguna lectura o escritura cruza usuarios. HTTPS obligatorio; datos persistidos protegidos por cifrado del proveedor y autorización por fila | Matriz permitir/denegar para usuario A, B, sin sesión y credencial de servicio en cada tabla y operación. Comprobar grants, RLS, almacenamiento privado y secreto ausente del cliente. Verificar HTTPS, configuración de cifrado y evidencia del proveedor en el entorno real. RLS autoriza filas; no cifra datos |
| RNF04 | Usabilidad y accesibilidad. Las tareas básicas se completan a 320, 375, 768 y 1.440 px sin scroll horizontal de página; campos tienen etiqueta, errores asociados, foco visible y operación por teclado | Recorrido manual de los cuatro casos con estados vacío, carga, error y confirmación. Cinco participantes realizan registro, cuenta y consulta; al menos cuatro completan cada tarea sin asistencia, con observaciones y consentimiento documentados. La revisión sigue pendiente hasta realizarse |
| RNF05 | Compatibilidad. Curso básico y alternativas soportadas en las versiones estable actual y anterior de Chrome, Edge, Firefox y Safari disponibles al ejecutar la verificación | Registrar versiones reales, sistema operativo y resultado de los cuatro casos. El navegador sin instalación PWA conserva la versión web; no se promete una API opcional sin alternativa |
| RNF06 | Integridad monetaria. Contrato de corrección: una acción lógica produce como máximo un efecto, incluso ante concurrencia o reintento; saldo y posición nunca quedan parcialmente actualizados | Repetir y ejecutar concurrentemente registro, transferencia, importación, cron, venta y webhook. Verificar unicidades, rollback, número de movimientos y conciliación de saldo con movimientos, apertura y ajustes; comparar decimales exactos y no float binario |
| RNF07 | Recuperación. Meta inicial RPO 24 h y RTO 4 h para datos persistidos | Documentar mecanismo efectivamente disponible en el plan de infraestructura; restaurar una copia en ambiente aislado y medir pérdida y tiempo. Si el plan no ofrece el mecanismo, no dar por cumplida la meta ni afirmar backup automático diario |
| RNF08 | Observabilidad. Todo registro, ejecución recurrente y evento de pago tiene identificador de correlación y resultado; logs no contienen credenciales, imágenes ni texto financiero completo | Forzar éxito, rechazo y error; reconstruir el resultado con IDs y timestamps sin datos sensibles. Avisos fallidos tienen registro de error; las métricas diferencian error de proveedor de error de consistencia |

### 10.4.6 Reglas monetarias comunes

**RN01 Entrada y fecha.** Importe, cantidad y precio deben ser finitos y positivos donde corresponda. ARS/USD se redondean a dos decimales en registro monetario; cripto conserva precisión de origen hasta ocho. La fecha elegida se guarda como día civil, convencionalmente mediodía UTC, para evitar mostrar el día anterior. Zona del negocio: `America/Argentina/Buenos_Aires`. Fecha omitida toma el día actual. Los informes realizados excluyen fechas futuras; las compras en cuotas y reglas pueden programar fechas futuras y no se tratan como gasto realizado antes de su fecha. No se agrega una prohibición general de fechas futuras que contradiga estos escenarios.

**RN02 Propiedad y plan.** La identidad proviene de la sesión validada, nunca de un user_id suministrado libremente. Se valida propiedad y cuenta activa. Categorías pueden ser propias o del catálogo de sistema. Los permisos y cupos Free/Premium son contrato comercial objetivo que debe verificarse en servidor; los rate limits existentes no demuestran por sí solos enforcement de suscripción.

**RN03 Saldo y deuda.** La implementación usa `accounts.balance`; saldo negativo de deuda/tarjeta representa obligación y saldo positivo en tarjeta puede ser crédito a favor. `min_balance`, `credit_limit`, `include_in_total` e `include_in_liquid` parametrizan presentación y política. No se impone ahora un bloqueo por descubierto o una política de crédito nueva no evidenciada. Si se agrega un bloqueo, debe unificarse entre PWA, Telegram, importación y recurrencias con validación atómica y pruebas. Archivar una cuenta conserva historia y bloquea nuevos registros; restaurarla permite operar otra vez. Los listados e informes de gestión excluyen las cuentas archivadas según su filtro; la exportación histórica debe poder preservarlas.

**RN04 Transferencia.** Un solo registro `transactions` representa origen y destino. La base aplica débito y crédito dentro de la operación de escritura. Entre monedas, el monto puede expresarse en origen o destino; la UI indica la dirección de tasa, puede aceptar override positivo y muestra ambos efectos antes de confirmar. Las nuevas altas y ediciones conservan `amount_in_account_currency`, `exchange_rate` y `destination_amount_in_account_currency` para aplicar el monto de destino exacto sin reconstruirlo desde una tasa inversa redondeada. Este último campo es NUMERIC(20,8), admite NULL en históricos y es la autoridad para el crédito de destino; trigger, recomputación y lecturas lo prefieren, con fallback histórico a amount por exchange_rate. Así, una transferencia sintética de ARS 120.000 a USD 100 conserva USD 100, y ARS 120.000.000 a USD 100.000 conserva USD 100.000. La migración `20261007000231_preserve_transfer_destination_amount.sql` forma parte de la entrega local, no se afirma aplicada a producción; tampoco reconstruye automáticamente el destino exacto de los registros históricos. Transferencia no se suma como gasto ni ingreso ordinario. Origen y destino deben ser distintos, propios y activos.

**RN05 Única autoridad monetaria.** El servicio crea, modifica o elimina el movimiento; `update_account_balance` en PostgreSQL ajusta el saldo para INSERT/UPDATE/DELETE. La aplicación no agrega un segundo UPDATE de saldo por el mismo movimiento. Actualizar debe revertir el efecto completo anterior y aplicar el nuevo, incluyendo cambios de tipo, cuenta, destino, monto, moneda y tasa. Eliminar revierte el efecto. Las correcciones del trigger y sus pruebas se registran en la revisión de código de entrega. No se prescribe una tabla nueva de asientos ni reversión contable histórica que la implementación no utiliza. Ajustar saldo de una cuenta se identifica como `adjustment` para conciliación.

**RN06 Reintentos e idempotencia.** La corrección de recurrentes reside en `lib/cron/recurring-job.ts`. Primero crea el movimiento; el índice único `idx_transactions_recurring_occurrence` sobre usuario, regla y fecha argentina de transaction_date arbitra duplicados. Un error 23505 sólo se trata como repetición si se recupera una transacción del mismo usuario/regla en el día local, intervalo UTC [03:00,03:00 del día siguiente). Después actualiza last_executed_date. Si el INSERT falla, no marca y se puede reintentar; si la marca falla tras INSERT, el reintento recupera el movimiento existente y repara la marca sin otro débito. Movimiento y saldo son atómicos por el trigger; movimiento y marca no forman una única transacción SQL. Se registra esa distinción, no se afirma atomicidad inexistente.

Sólo la ejecución que crea notifica; la repetida no vuelve a enviar. La falla de Telegram se registra y no revierte dinero. No existe outbox durable ni garantía de reentrega. Idempotencia general de confirmación manual, bot, importación u offline sigue como aceptación pendiente de verificación y de una garantía persistente equivalente; la unicidad recurrente no acredita esos canales.

**RN07 Recurrencias y cuotas.** Reglas admiten diaria, semanal, mensual y anual, fechas de inicio/fin, suscripción personal y avisos. Se aplica calendario argentino, rango inclusivo y ajuste mensual al último día cuando corresponde. Fecha final anterior al día actual argentino desactiva la regla antes de seleccionar ocurrencias; el fin es inclusivo. La corrección de recuperación y unicidad recurrente fue verificada mediante pruebas locales; eso no acredita su despliegue en producción. Una cuenta archivada se omite. Compras en cuotas utilizan de dos a treinta y seis cuotas y exigen la misma moneda que la cuenta; el RPC crea el conjunto y distribuye importes manteniendo total. Un error revierte el conjunto; las cuotas futuras no ingresan en informes de períodos ya cerrados. El cron sigue `CronJob.run` e `IterativeCronJob.execute`, sin duplicar autenticación y manejo de errores en cada job.

**RN08 Referencia cambiaria.** Se conserva la convención implementada: USD→ARS usa blue venta; ARS→USD usa inverso blue compra; ARS→EUR y otros pares soportados siguen `getExchangeRate`. Para P&L de inversiones, ARS se convierte a USD con blue venta para comparar costo y mercado. No se introduce midpoint ni una serie histórica cambiaria inexistente. Se explican las diferencias de dirección y que son referencias, no precio de ejecución. Una conversión elegida al registrar se conserva; los resúmenes de gastos convierten con referencia consultada al calcular y lo indican.

`CotizacionesService` mantiene TTL configurable, por defecto 300 s, caché en memoria del proceso y respaldo persistido `exchange_rates`. CriptoYa, DolarApi y DbCache son Strategies de dólar; CoinGecko y fuentes de mercado cubren activos pertinentes. No existe Redis en este diseño. Un dato de respaldo lleva fecha original; cero/negativo no es una cotización válida. Si falta tasa, el resultado se identifica parcial y señala monedas excluidas. Precio ausente de inversión no representa una pérdida cierta a cero. La evidencia de UI debe comprobar estos estados, además de la estructura de código.

**RN09 Registro de inversiones.** Cada `investment` es una posición/lote con cantidad, precio y moneda de compra; la venta se guarda en `investment_sales`. No se debita ni acredita automáticamente una cuenta de efectivo por cargar una posición o venderla: ZARIX registra una operación externa. El usuario registra su flujo de efectivo por separado cuando corresponda. La cuenta de inversión aporta el valor de las posiciones y no se suma nuevamente ese mismo valor como un saldo adicional. La venta atómica `sell_investment_position` verifica tenencia, inserta historial y reduce cantidad; cerrar conserva historial.

**RN10 Costo y resultado.** Costo remanente de una posición = cantidad restante × precio de compra / factor; precio de compra se conserva al vender. Acciones/CEDEAR/ETF/cripto: factor 1; bono por nominal 100: factor 100. Resultado realizado = cantidad vendida × (precio venta convertido a USD − precio compra convertido a USD)/factor. No realizado = valor de mercado restante − costo restante, en moneda comparable. No se afirma promedio ponderado entre compras distintas: nuevas compras pueden ser lotes separados. No se incorporan comisiones ni impuestos a la fórmula. Simulación modifica sólo una copia de referencia y no compra, vende ni cambia cantidades reales.

**RN11 Datos y repartos.** Importación y exportación conservan cuenta, fecha, tipo, monto, moneda, categoría y relaciones de datos según contrato versionado; la exportación propia siempre está disponible en Free. Cada fila importada informa su resultado. Presupuestos mensuales muestran gasto, remanente, porcentaje y umbral de aviso; no bloquean gasto válido. Los gastos compartidos pertenecen a su grupo, no a cuentas personales: reparto en centavos, suma de partes = importe, balance miembro = pagado − parte que le corresponde. Liquidación greedy ofrece quién debe pagar a quién; no ejecuta esos pagos. Un token activo limita acceso al grupo; el miembro indicado debe pertenecer a él. El RPC save_shared_expense guarda o reemplaza el gasto y sus partes atómicamente: los ensayos offline verificaron suma exacta y rollback ante falla, sin alterar saldos personales. Su aplicación a producción no se presume. El token de capacidad concede acceso al portador y no prueba nominalmente que éste sea una persona concreta; los detalles personales de correo/teléfono no se devuelven en la vista pública.

### 10.4.7 Contrato determinista de RF11

RF11 es heurístico y no llama a Gemini. Las rutas `app/api/ai/anomalies/route.ts` y `app/api/ai/projections/route.ts` usan funciones deterministas `lib/financial-anomalies.ts` y `lib/financial-projections.ts`. La revisión conserva el umbral real, interpreta fechas según calendario argentino y excluye mes incompleto y fechas futuras de la proyección. Se registra por separado esa modificación y su prueba; no se presenta la conducta defectuosa inicial como fórmula deseada.

**Anomalía por categoría.** Se consultan gastos propios visibles desde el primer día de los tres meses calendario anteriores hasta la fecha de corte local, sin futuros. Cada importe se convierte a ARS con la referencia disponible usada por el servicio; la API devuelve partial, excludedCurrencies y message cuando falta tasa, y el widget contiene un aviso aun si no hay alertas; la aceptación autenticada de ese estado se registra separadamente de sus pruebas puras. Para cada categoría, `B = gastoTotalTresMesesPrevios/3`, incluidos meses sin gasto con valor cero; `G` es acumulado del mes actual hasta el corte. Si `B>0` y `G/B >= 2`, se informa categoría, G, B, ratio y exceso `G−B`. No se extrapola el mes actual ni se exige una muestra de cinco días o seis gastos, porque esa condición no está en el algoritmo preservado. Si no hay base positiva y `G>5.000 ARS`, se informa categoría nueva significativa con ratio nulo; `G=5.000` no activa. La UI explica que comparar un mes parcial con meses completos es una alerta de gasto acumulado, no una predicción.

Fixture al 06/10/2026: julio/agosto/septiembre suman 3.000, B=1.000; octubre 2.000 activa ratio 2 y exceso 1.000; octubre 1.999 no activa. Nueva categoría 5.000 no activa, 5.000,01 sí. Sin gastos no hay alertas. Se conserva el umbral ≥2 del código y se retira el ejemplo anterior de +45% que no correspondía a esta regla.

**Proyección corregida.** Se toman los tres meses calendario completos anteriores a la fecha de corte en Argentina; se excluyen mes actual y futuros. La ruta delimita días a las 03:00 UTC, correspondientes a medianoche argentina; el helper interpreta timestamps históricos en fecha civil de Argentina. Se agrupan ingresos/gastos propios visibles por mes y se promedian únicamente los meses con actividad, mínimo uno. Un mes sin registro no se supone igual a cero ni completo: se informa número y período de meses analizados y esa limitación. Si la conversión excluye monedas por falta de cotización, la ruta devuelve `hasData=false`, identifica `excludedCurrencies` y explica el motivo; no calcula ahorro o proyección con una historia monetaria incompleta. `I` y `G` son promedios mensuales; `A=I−G`; tasa de ahorro=`100×A/I` si I>0, si no 0. `S` suma saldos de cuentas activas ARS no marcadas deuda; se etiqueta **efectivo ARS de referencia**, no patrimonio total o líquido. La fórmula es `S(k)=S+k×A`, k=1..12; se presentan hitos 3/6/12 meses y serie mensual. No integra nuevas cotizaciones futuras, inflación, rendimiento de inversión ni ocurrencias futuras separadas: las recurrencias ya registradas forman parte de sus meses y no se vuelven a sumar.

Fixture: en los meses completos con actividad, promedio ingreso 1.000 y gasto 700; ahorro 300; efectivo ARS 2.000. Hitos 2.900/3.800/5.600; tasa 30%. Gastos/ingresos del mes actual no alteran esos promedios. Cuenta USD, deuda o cuenta archivada no aumentan S. Sin un mes completo con actividad devuelve `hasData=false` y motivo. Redondeo de campos monetarios para API mantiene la política de presentación y la serie usa el cálculo sin reusar el redondeo como dato de entrada.

**RF10 y captura conversacional.** `internal-ai-chat` y bot-tools utilizan un catálogo de herramientas, contexto autorizado y ejecución determinista. Las consultas de CU-003 devuelven período, filtros y cifras propias; la interpretación del modelo no concede acceso a otro user_id ni SQL libre. Una intención de registrar no se trata como consulta: se deriva al borrador y confirmación de CU-001, con resultado financiero identificable. Pregunta ambigua pide aclaración; falla del modelo ofrece filtros o carga manual. No se atribuye a Gemini una cifra que sólo puede calcular el servicio autorizado.

## 10.5 Descripción global y diseño del producto

### 10.5.1 Navegación y prototipos

El ingreso lleva a Dashboard. La navegación contiene Movimientos, Cuentas, Inversiones, Análisis, Presupuestos, Recurrentes y Configuración; Asistente se abre desde Dashboard o Análisis. Acceso y recuperación se muestran cuando no existe sesión válida. Las pantallas Premium indican el permiso requerido y enlazan a Plan. El enforcement equivalente en servidor es un objetivo comercial pendiente de verificación; el diseño no lo acredita como implementado.

| Prototipo / Boundary | Controles y datos | Casos y estados obligatorios |
|---|---|---|
| P01 Movimientos y formulario | Listado, filtro cuenta/categoría/período, nuevo gasto/ingreso/transferencia, origen/destino, monto, moneda, fecha, categoría, descripción, saldo previsto, confirmar/cancelar, corregir/anular | CU-001 básico/A01/A08. Carga, vacío, campo inválido, conversión no disponible, error de corrección, error técnico y resultado con ID |
| P02 Captura asistida | Imagen JPG/PNG hasta 5 MiB; preview editable; archivo CSV/JSON hasta 5 MiB o 10.000 filas; mapeo, tabla de errores/duplicados y confirmación por filas | CU-001 A02/A04. Extrayendo, propuesta, extracción fallida con carga manual, importación parcial y resumen verificable |
| P03 Conversación Telegram | Propuesta con cuenta/tipo/monto/moneda/categoría/fecha; aclarar dato; confirmar/cancelar; respuesta con ID | CU-001 A03; CU-003 A03. No vinculado, permiso ausente, ambigüedad, duplicado confirmado y servicio no disponible |
| P04 Recurrentes y presupuestos | Frecuencia, inicio/fin, próxima fecha, suspender y última ejecución; categoría/moneda/mes/límite, consumo, disponible/exceso | CU-001 A05–A07. Cuenta inactiva, regla expirada y ejecución fallida; el aviso fallido se registra sin prometer reentrega |
| P05 Cuentas | Nombre, tipo, monedas y saldos de apertura; descubierto; límite por moneda de tarjeta; editar, desactivar y archivar/restaurar sin borrar historia | CU-002 básico/A01–A03. Tres cuentas Free, cuarta rechazada, deuda/crédito identificado, archivo conserva referencias |
| P06 Configuración y acceso | Registro/inicio/recuperación/cierre; moneda base y widgets; descarga CSV/JSON; vincular/revocar Telegram; Plan con precio y período del catálogo | CU-002 A04–A07. Confirmación, vínculo vencido, exportación fallida, pago pendiente/aprobado/rechazado/vencido y sesión expirada |
| P07 Dashboard, detalle y análisis | Total líquido/total, moneda y tipo de cambio, componentes, fuente/fecha/estado de cada cotización; filtros; anomalías con fórmula; serie proyectada y supuestos; widgets | CU-003 básico/A01/A04/A05. Carga, vacío, parcial, respaldo, sin referencia e historial insuficiente |
| P08 Asistente | Pregunta, período y filtros entendidos, aclaración, resultado y registros/agregados usados | CU-003 A02. Generando, ambigua, fuera de catálogo, sin permiso, falla del modelo y respuesta verificable |
| P09 Portafolio y operación | Cuenta inversión, activo/mercado, cantidad, precio, moneda, fecha; compra/venta, tenencia, costo remanente, realizado/no realizado, fuente/fecha | CU-004 básico/A01–A03. Tenencia insuficiente, cuenta ajena, manual, respaldo/no precio y rollback |
| P10 Simulación | Variación porcentual finita, valor real e hipotético y aviso de supuesto; volver | CU-004 A04. Simulación válida o entrada inválida; no ofrece confirmar como operación real ni guardar escenario |
| P11 Gastos compartidos | Crear grupo, moneda, miembros y enlace; vista por token con nombres visibles, gasto, pagador, participantes, reparto, balances y liquidación sugerida | CU-001 A09. Token inválido/inactivo, miembro o pagador ajeno, descripción/monto inválidos; no muestra contactos privados ni cuentas personales |
| P12 Cuotas y cola local | Número de cuotas y total, misma moneda; borradores pendientes sin conexión y estado de sincronización | CU-001 A10/A11. Dos a treinta y seis cuotas, moneda distinta rechazada; cola pendiente no confirma saldo; reintento y duplicado requieren garantía de RN06 |

Las figuras PT01–PT12 corresponden respectivamente a las fronteras P01–P12. Estos prototipos especifican interacciones y estados; no son capturas del producto terminado. La revisión con usuarios debe registrar participante, fecha, tarea, dificultad y cambio decidido. La tabla de RNF04 define la aceptación de esa revisión; todavía no se registra aprobación.


![PT01](figures/PT01.png)
![PT02](figures/PT02.png)
![PT03](figures/PT03.png)
![PT04](figures/PT04.png)
![PT05](figures/PT05.png)
![PT06](figures/PT06.png)
![PT07](figures/PT07.png)
![PT08](figures/PT08.png)
![PT09](figures/PT09.png)
![PT10](figures/PT10.png)
![PT11](figures/PT11.png)
![PT12](figures/PT12.png)

### 10.5.2 Diagrama general de cuatro casos de uso

El modelo tiene exactamente cuatro óvalos dentro del límite ZARIX: CU-001 Gestionar movimientos financieros; CU-002 Administrar cuentas y datos personales; CU-003 Consultar y analizar la situación financiera; CU-004 Seguir el portafolio de inversiones. Usuario se asocia a los cuatro; Invitado con enlace se asocia únicamente a CU-001; Telegram, Programador, Gemini, Mercado Pago y Proveedores sólo se asocian a los objetivos donde intervienen. No se extraen validación, persistencia, saldo, autenticación o cotización como óvalos. El nivel agregado se valida en RRR. Los escenarios compartidos no crean un quinto óvalo.

Fuente editable: `diagramas/UC-General.dot`. Los escenarios A y E de las fichas se distinguen mediante fragmentos de robustez y secuencia, no mediante nuevos casos. No hay relaciones include/extend porque no se ha extraído otro objetivo de usuario con ficha independiente.


![UC-General](figures/UC-General.svg)

### 10.5.3 Fichas integradas

**CU-001 Gestionar movimientos financieros.** Actores principales Usuario y, únicamente en A09, Invitado con enlace; secundarios Telegram, Gemini y Programador externo. Disparador: nueva captura, corrección, gestión de regla/presupuesto o vencimiento programado. Precondición para captura: identidad válida, cuenta propia activa y permiso de canal; A09 usa token de capacidad del grupo y pertenencia de miembro, sin requerir acceso al patrimonio; el cron usa identidad de servicio y no una sesión abierta del usuario. Éxito: hecho y saldo confirmados una sola vez; fallo: ningún cambio parcial.

Curso básico: (1) usuario abre Movimientos; sistema muestra lista y filtros; (2) elige gasto/ingreso; sistema abre P01; (3) completa datos; sistema presenta resumen y saldo previsto; (4) confirma; sistema verifica autorización, cuenta activa, datos y conversión; (5) inserta movimiento y aplica trigger de saldo atómicamente; (6) devuelve identificador, saldo y lista actualizada. A01 transferencia retoma validación con dos cuentas y efectos indivisibles. A02 OCR y A03 Telegram producen un borrador editable y retoman la confirmación; cancelar termina sin movimiento. A04 importación confirma preview, aplica el mismo contrato por fila y termina con resumen. A05 crea/edita/suspende una regla y termina mostrando próxima fecha e historial. A06 cron evalúa ocurrencias según RN07 y termina con resultado y aviso si la ejecución fue nueva; un reintento no crea otra. A07 presupuesto termina con límite y consumo del período. A08 edición/eliminación revierte efecto previo y termina con nuevo saldo. A09 grupos compartidos crea grupo propio, enlace activo y miembros; el invitado abre el enlace, se identifica en el grupo y registra/edita/elimina un gasto, el sistema valida pertenencias, reparte centavos y devuelve balances y liquidación sugerida; un token inválido termina sin datos y un gasto inválido sin cambios. A10 cuotas crea de dos a treinta y seis registros en la misma moneda con suma igual al total. A11 cola sin conexión conserva borrador y, al sincronizar y confirmar, aplica el mismo contrato de registro; no cambia saldo mientras está pendiente. E01 datos inválidos vuelve al formulario; E02 propiedad/cuenta o conversión inválidas rechaza sin cambios; E03 persistencia revierte el movimiento y su efecto, e informa resultado para reintento, con límite de idempotencia de RN06; E04 sesión expirada pide acceso sin exponer datos. RN01–RN07 y RN11 se aplican a todos los canales.

**Entrada, retorno y cierre de escenarios CU-001.**

| Escenario | Entrada desde el básico | Desarrollo y cierre |
|---|---|---|
| A01 Transferencia | Reemplaza paso 2 al elegir transferencia | En 3 captura origen/destino y moneda; en 4 verifica ambas cuentas y conversión; sigue 5–6 con débito/crédito de un único registro. |
| A02 OCR | Reemplaza captura manual de 3 | El usuario carga ticket; el sistema extrae una propuesta; el usuario corrige y confirma; retoma 4. Cancelar termina sin escritura; extracción fallida permite volver a 3 manual. |
| A03 Telegram | Reemplaza interfaz de 1–3 | El canal verifica vínculo, solicita datos faltantes y presenta borrador. La confirmación retoma 4–6 por el mismo contrato monetario; cancelar termina sin movimiento. El límite de idempotencia del canal permanece explícito en RN06. |
| A04 Importación | En 1 el usuario elige importar | Selecciona archivo y mapeos, revisa filas y confirma; cada fila elegible sigue 4–5. Termina en 6 con resumen de aceptadas/rechazadas, saldo y errores identificados, sin afirmar atomicidad de todo el archivo. |
| A05 Gestionar regla | En 1 el usuario elige Recurrentes | Completa/edita/suspende regla, el sistema valida identidad, cuenta y fechas y la guarda; termina en 6 con estado, próxima fecha e historial. No genera un movimiento por guardar la regla. |
| A06 Ejecutar vencimiento | Disparador programado alternativo al paso 1 | Identidad de servicio, elegibilidad de regla y fecha local; creación o recuperación única por índice; marca posterior; termina con resultado de ejecución y aviso sólo si nueva, según RN06–RN07. No requiere sesión interactiva. |
| A07 Presupuesto | En 1 el usuario elige Presupuestos | Define período/categoría/moneda/límite, el sistema valida y guarda; termina en 6 con consumido/disponible/exceso. La transferencia no aumenta consumo y el exceso no agrega un bloqueo monetario inexistente. |
| A08 Corregir o eliminar | En 1 el usuario selecciona un movimiento existente | Revisa el cambio o confirma eliminación; retoma 4 con autorización; en 5 revierte OLD y aplica NEW si corresponde; termina 6 con registro/saldo resultante o rollback. |
| A09 Gastos compartidos | En 1 el usuario elige un grupo; el invitado puede entrar directamente por enlace | El dueño administra grupo, miembros y enlace. El invitado con token activo selecciona miembro; confirma gasto/cambio/eliminación; el sistema valida pertenencias y conserva la suma de partes; termina con balances y liquidación sugerida del grupo. No usa 4–5 para mover cuentas personales. Token inválido termina sin datos; entrada inválida vuelve al formulario del grupo sin cambios. |
| A10 Cuotas | En 3 el usuario activa cuotas | Completa total y cantidad 2–36 en la misma moneda; valida el reparto y las fechas; retoma 4–5 para los registros relacionados y termina 6 con resumen. El RPC create_installment_transactions crea el conjunto completo y un error revierte todas sus cuotas; no se aplica una segunda actualización de saldo desde la aplicación. |
| A11 Cola local | En 3 se pierde conexión | Conserva borrador identificado como pendiente y termina sin confirmar saldo. Al recuperar conexión e identidad vuelve a 4; sólo la respuesta de persistencia confirmada permite el paso 6 y eliminar la entrada local. Cualquier fallo detiene el lote y conserva el pendiente. Si falla la eliminación local después del commit pide revisar los movimientos antes del reintento, porque no existe una clave persistente de idempotencia general. La repetición se trata con RN06, sin atribuir la unicidad recurrente a ese canal. |
| E01 Datos inválidos | En 4 | El sistema señala el campo y vuelve a 3 sin INSERT. |
| E02 Propiedad, cuenta o conversión inválida | En 4 | Deniega sin escritura; permite corregir elección en 3 o terminar. No expone datos ajenos. |
| E03 Persistencia fallida | En 5 | Movimiento y efecto de saldo se revierten; informa error en 6, conserva datos para reintento y aplica el alcance de RN06. |
| E04 Sesión expirada | Al ingresar o enviar solicitud protegida | Solicita recuperar acceso; no devuelve finanzas. Tras acceso confirmado el usuario puede volver al contexto permitido. |

**CU-002 Administrar cuentas y datos personales.** Actor principal Usuario; secundario Mercado Pago para el plan. Disparador: Cuentas, Configuración o Acceso. Precondición: identidad válida para datos; registro/inicio/recuperación acepta visitante sin sesión y no consulta finanzas. Éxito: configuración propia coherente o resultado de acceso; fallo: configuración anterior conservada.

Curso básico: (1) usuario abre Cuentas; sistema muestra tipos y saldos; (2) solicita cuenta; sistema presenta P05; (3) completa nombre/tipo/monedas y apertura, o deuda/límite si tarjeta; (4) confirma; sistema valida propiedad, datos y límite de plan; (5) crea cuenta con balance 0 y ajuste de apertura identificable, cuya recuperación ante fallo se verifica; (6) muestra cuenta y saldos. A01 editar/desactivar conserva historia y registra ajuste para modificar saldo. A02 eliminar desde UI archiva, conserva referencias e historia y termina fuera del listado activo; restaurar recupera su visibilidad. No se promete borrado físico. A03 multimoneda mantiene saldos independientes. A04 exportación produce archivo propio versionado o un error reintentable. A05 acceso/vinculación termina en sesión/vínculo confirmado o rechazo seguro; revocar invalida nuevas solicitudes. A06 preferencias termina con configuración persistida. A07 pago termina pendiente/aprobado/rechazado; webhook consulta el estado auténtico de la misma suscripción y actualiza permisos y vigencia según el recurso del proveedor y cancelación/vencimiento los actualiza. E01 formulario inválido vuelve al campo; E02 límite Free conserva cuentas; E03 ID ajeno deniega sin revelar datos; E04 servicio externo fallido informa estado real, sin falsa activación. RN02, RN03, RN06 y RN11 son transversales.

**Entrada, retorno y cierre de escenarios CU-002.**

| Escenario | Entrada desde el básico | Desarrollo y cierre |
|---|---|---|
| A01 Editar | En 1 selecciona cuenta propia | Sustituye 2–3 con sus datos, confirma 4, guarda cambios o ajuste de saldo identificado en 5 y termina 6. Cambiar moneda/modo multimoneda con movimientos se rechaza. |
| A02 Archivar/restaurar | En 1 selecciona cuenta | Confirma acción, el sistema valida propiedad y cambia visibilidad/estado conservando historia; termina 6 con listado actualizado. Eliminar en UI significa archivar. |
| A03 Multimoneda | En 3 elige modo compatible | El sistema presenta saldos separados por moneda; sigue 4–6 y evita mezclar importes. |
| A04 Exportar | En 1 o Configuración elige exportación propia | Define período/formato, el sistema obtiene datos autorizados y genera archivo; termina con descarga o error reintentable. Disponible en Free; no crea cuenta. |
| A05 Acceso y vínculo | Entrada Acceso sin sesión o Configuración autenticada | Registro/inicio/recuperación concluyen con resultado seguro. Vincular requiere identidad financiera y código vigente de un uso; revocar invalida operaciones nuevas. Termina con sesión/vínculo confirmado o rechazo, sin abrir datos de otro usuario. |
| A06 Preferencias | En 1 o Configuración elige preferencias | Selecciona base/widgets permitidos, confirma, el sistema valida y guarda; termina con configuración recuperable. No modifica montos históricos. |
| A07 Plan | En 1 o Configuración elige contratar/cancelar | Obtiene plan del catálogo, inicia pago y presenta estado real; la notificación verificada actualiza vigencia según RF15. Pendiente/rechazado no confirma activación; termina con estado y período. No se atribuye a esta ficha enforcement comercial aún no implementado. |
| E01 Formulario inválido | En 4 | Vuelve a 3 con campo identificado, sin cambio. |
| E02 Límite comercial Free | En 4, como contrato objetivo pendiente | Conserva cuentas y explica límite; no se da por probado el gate actual. |
| E03 ID ajeno | En una solicitud protegida | Deniega sin revelar ni modificar datos ajenos. |
| E04 Servicio externo fallido | En acceso, vínculo, exportación o pago | Presenta estado real y reintento permitido; conserva configuración y no muestra falsa activación. |

**CU-003 Consultar y analizar la situación financiera.** Actor principal Usuario; secundarios Proveedores, Gemini y Telegram. Disparador: Dashboard, Análisis o pregunta. Precondición: identidad válida y permiso para capacidades Premium; no se exige tener historial para abrir una pantalla vacía. Éxito: resultado reconstruible con supuestos; fallo: ausencia, parcialidad o error visibles.

Curso básico: (1) usuario abre Dashboard; sistema muestra carga; (2) obtiene saldos/posiciones propios y referencias; (3) clasifica fuente y vigencia; (4) aplica RN08 y evita duplicaciones; (5) muestra líquido, total y componentes; (6) usuario abre detalle; sistema permite reconstruir la conversión. A01 filtros producen ingresos/gastos/flujo del período y excluyen transferencias del resultado económico. A02 chat valida intento, calcula sobre datos autorizados y redacta con cifras verificadas; ambigüedad vuelve a aclaración. A03 canal Telegram aplica exactamente el mismo contrato y verifica vínculo. A04 RF11 calcula ratio≥2/nueva categoría>5.000 y proyección lineal 3/6/12 meses completos, devuelve resultados y limitaciones o insuficiencia. A05 preferencias actualiza widgets sin modificar historia. E01 proveedor fallido usa respaldo identificado o muestra ausencia; E02 sin datos muestra estado vacío y acceso a registrar/cuenta; E03 tasa faltante identifica componente no convertible y patrimonio parcial; en RF11 bloquea la proyección y explica las monedas excluidas; E04 IA fallida ofrece filtros convencionales. RN08 y contrato RF10/RF11 rigen las cifras.

**Entrada, retorno y cierre de escenarios CU-003.**

| Escenario | Entrada desde el básico | Desarrollo y cierre |
|---|---|---|
| A01 Filtros | Tras 1, antes de 2 | Selecciona período/cuenta/categoría; 2–4 obtienen y agregan movimientos elegibles; 5–6 muestran resultado y detalle excluyendo transferencias económicas. |
| A02 Consulta PWA | Reemplaza 1 con pregunta | Interpreta filtros y pide aclaración si ambigua; obtiene datos autorizados en 2, calcula en 4 y devuelve cifras verificables en 5–6. Una intención de escritura pasa a propuesta/confirmación de CU-001. |
| A03 Consulta Telegram | Reemplaza interfaz de A02 | Verifica vínculo antes de obtener datos; aplica el mismo contrato de consulta y termina con respuesta o rechazo seguro en el canal. |
| A04 RF11 | En 1 elige Análisis | Obtiene historia propia en 2 y aplica contrato determinista en 4; 5–6 muestran ratio/nueva categoría y proyección 3/6/12, supuestos, o insuficiencia sin inventar datos. |
| A05 Widgets | Tras 5 elige personalizar | Deriva guardado a CU-002 A06 y vuelve a 5 con presentación ordenada, sin reescribir historia. |
| E01 Proveedor fallido | En 2–3 | Devuelve respaldo fechado si disponible o ausencia identificada; sigue 5–6 con estado real. |
| E02 Sin datos | En 2 | Muestra vacío e invita a registrar/crear cuenta; termina sin cifras inventadas. |
| E03 Tasa ausente | En 3–4 | Patrimonio parcial identificado; proyección RF11 indisponible si hay monedas excluidas. Termina 5–6 explicando la limitación. |
| E04 IA fallida | En A02/A03 | Informa indisponibilidad y permite filtros convencionales deA01; no devuelve una cifra ficticia. |

**CU-004 Seguir el portafolio de inversiones.** Actor principal Usuario; secundario Proveedores de precios. Disparador: Portafolio, nueva compra/venta o simulación. Precondición para escritura: identidad válida, Premium activo, cuenta de inversión propia activa y moneda compatible; lectura del historial propio se conserva al vencer Premium. Éxito: posición y venta histórica coherentes; fallo: cantidad e historial conservan su estado anterior. El registro de posición no mueve efectivo automáticamente.

Curso básico: (1) usuario abre Portafolio; sistema muestra posición, precio y fecha; (2) solicita compra; sistema muestra P09; (3) completa y confirma; sistema valida datos, propiedad, cantidad y precio; (4) registra posición/lote con cantidad y precio de compra; (5) obtiene referencia o declara ausencia; (6) muestra historial, valor y resultados. A01 venta verifica tenencia, conserva precio de compra y actualiza cantidad e historial atómicamente; total cierra la posición sin borrar historia. A02 activo manual exige identificación y precio fechado. A03 precio ausente produce respaldo identificado o resultado no disponible. A04 simulación calcula una copia y termina comparando valores, sin escritura financiera. E01 datos inválidos vuelve al formulario; E02 sobreventa rechaza; E03 activo/cuenta ajenos deniega; E04 persistencia revierte todos los efectos. RN09–RN10 especifican cantidades, costo y caja.

**Entrada, retorno y cierre de escenarios CU-004.**

| Escenario | Entrada desde el básico | Desarrollo y cierre |
|---|---|---|
| A01 Venta | En 2 elige vender una posición | Captura cantidad/precio/moneda/fecha en 3, verifica tenencia; 4 reduce cantidad y registra venta atómicamente; 5–6 muestran costo/realizado/historial. Venta total conserva historia. |
| A02 Activo manual | En 3 identifica activo sin fuente automática | Registra identificación y precio fechado, sigue 4–6 con referencia rotulada manual. |
| A03 Precio ausente | En 5 | Usa respaldo identificado o presenta valor no disponible; termina 6 sin representar ausencia como una pérdida cierta a cero. |
| A04 Simulación | En 1 elige simular | Obtiene copia de posición/precio, captura variación, calcula escenario y termina 6 comparando real/hipotético. Omite escritura financiera de 4; no cambia cantidad, precio persistido, saldo ni ventas. |
| E01 Datos inválidos | En 3 | Identifica campo y vuelve al formulario sin registro. |
| E02 Sobreventa | En A01 antes de 4 | Rechaza conservando cantidad/costo/historia; permite corregir cantidad. |
| E03 Cuenta/activo ajenos | En 3–4 | Deniega sin revelar ni modificar datos ajenos. |
| E04 Persistencia fallida | En 4 | Rollback del registro y sus efectos; termina con error reintentable conservando cantidad/historia previa. |

### 10.5.4 Modelo de dominio conceptual

El dominio representa conceptos y relaciones del negocio, sin UUID, claves foráneas, SQL, servicios ni métodos de implementación. Para impresión se divide en las vistas conceptuales `DOM-Finanzas.dot`, `DOM-Automatizacion.dot`, `DOM-Inversiones.dot`, `DOM-Personal.dot` y `DOM-Compartidos.dot`. Se repiten Usuario/Cuenta como contexto, sin crear entidades duplicadas. Usuario posee cero o más cuentas, categorías, reglas y presupuestos. Una categoría de sistema no necesita un usuario propietario: la multiplicidad del propietario es cero o uno. Cuenta contiene uno o más saldos conceptuales por moneda; el saldo secundario de tarjeta es una lectura derivada en la implementación, no otra tabla supuesta. Movimiento tiene tipo, fecha, descripción y origen y puede afectar una cuenta o dos en transferencia. EfectoMonetario expresa ese impacto conceptual, sin introducir una tabla de asientos.

Categoría es propia o del sistema y puede clasificar movimientos; es opcional para transferencias/ajustes. Regla tiene vencimientos u ocurrencias conceptuales: una vencida o rechazada no implica un movimiento exitoso. Presupuesto tiene mes, moneda y categoría opcional para límite global. Posición representa un lote registrado en una cuenta, con cantidad y precio de compra; VentaInversión explica disminuciones y realizado. Cotización conserva referencia y momento. Preferencias, vínculo Telegram y vigencia del plan existen conceptualmente aunque sus campos estén integrados en Usuario.

GrupoCompartido tiene dueño, moneda, miembros, gastos y partes del reparto. El invitado con enlace opera sólo en ese grupo; no posee cuentas del dueño. Cantidad máxima de miembros 30; reparto mantiene centavos. Grupo sin miembros aún es un estado inicial válido, pero un gasto necesita pagador y participantes del grupo. Las multiplicidades cero de Usuario se justifican por onboarding sin historial; una cuenta puede tener más de una moneda; una venta pertenece a una posición; un grupo tiene cero o más gastos. El modelo se actualiza tras la revisión de las cuatro familias de robustez y se contrastan estos conceptos con las tablas de la sección siguiente.


![DOM-Finanzas](figures/DOM-Finanzas.svg)
![DOM-Automatizacion](figures/DOM-Automatizacion.svg)
![DOM-Inversiones](figures/DOM-Inversiones.svg)
![DOM-Personal](figures/DOM-Personal.svg)
![DOM-Compartidos](figures/DOM-Compartidos.svg)

### 10.5.5 Modelo de datos y restricciones

El ER representa persistencia observada en `supabase/schema.sql`, sus migraciones y `types/database.ts`. Se divide en vistas ER de movimientos, cuentas, usuario, inversiones, snapshots, recurrentes, presupuestos, compartidos e integraciones; cada tabla aparece completa en su vista y como contexto breve en las relacionadas. Las tablas de contexto no son otras tablas. No se confunde persistencia con dominio conceptual. PostgreSQL usa NUMERIC para cantidades/montos; los DTO TypeScript usan number, por lo que redondeo y validación se comprueban en sus contratos y en SQL.

| Tabla real | Responsabilidad y restricciones a verificar |
|---|---|
| users | Identidad referida a Auth, preferencias, integración Telegram/Gemini y estado/vigencia del plan. No se inventan tablas separadas de preferencias ni suscripciones existentes |
| accounts | Propiedad, tipo, moneda, balance firmado, deuda, inclusión total/líquida, moneda secundaria y estado activo. Bajas lógicas; cambios de moneda/modo bimoneda con movimientos se rechazan |
| transactions | Registro de ingreso/gasto/transferencia/ajuste, cuenta/destino, monto original y convertido, tasa, categoría, fecha, regla y cuotas. El trigger aplica y revierte efectos en la misma escritura; corregir su caso UPDATE requiere comprobar todos los cambios permitidos |
| categories / budgets / budget_alerts | Categorías propias o de sistema; presupuesto mensual, moneda, categoría opcional y umbral; avisos por nivel. Comprobar coherencia de moneda y repetición de aviso |
| investments / investment_sales | Lote con cantidad/precio/monedas y precio de mercado; venta con costo de compra al vender y realizado. RPC de venta verifica cantidad bajo concurrencia y conserva historia |
| recurring_rules | Frecuencia, rango, cuenta y last_executed_date; la corrección local permite recuperar una marca fallida sin repetir el dinero mediante índice y lookup por día argentino. Las pruebas locales no acreditan despliegue ni una tabla de ocurrencias inexistente |
| exchange_rates / market_data_cache | Referencias persistidas y snapshot global de mercado; caché de memoria separada, TTL 300 por defecto; acceso de servicio para escritura |
| portfolio_performance_snapshots / net_worth_snapshots | Historial diario de portafolio y patrimonio; unicidad usuario+fecha, cifras y referencia blue |
| bot_sessions | Contexto y última actividad de sesión Telegram; no concede permiso financiero sin vínculo validado |
| shared_groups / shared_group_members / shared_expenses / shared_expense_splits | Token de 32 caracteres hexadecimales único, dueño, miembros, pagador y partes. API comprueba pertenencia de IDs al grupo; acceso directo restringido por RLS. El RPC save_shared_expense confirma gasto y partes en una operación atómica, con suma igual al importe y reversión completa ante fallo. La corrección fue probada offline; no modifica accounts.balance ni se afirma desplegada |

Las relaciones deben impedir referencia a una cuenta, posición o grupo ajeno. Las validaciones de servicio complementan las restricciones de SQL y los permisos por fila. La evidencia de esquema es estática; confirmar que migraciones están desplegadas exige inspección o ejecución del ambiente real. La migración de una corrección conserva datos y se verifica en una copia antes de producción. No se prescribe una nueva capa de tablas de ledger, outbox, evaluaciones o suscripciones que el alcance actual no utiliza.

**Exposición y seguridad Supabase.** Se habilita RLS en toda tabla expuesta y se conceden únicamente los grants necesarios. Políticas de SELECT/INSERT/UPDATE/DELETE se definen por operación; propiedad se evalúa con la identidad validada. UPDATE exige política de lectura y verifica tanto fila anterior como nueva. Las vistas financieras expuestas preservan la autorización del invocador; en versiones compatibles se utiliza `security_invoker=true`. Rutinas monetarias operan con privilegios mínimos; funciones privilegiadas y tablas de procesamiento se mantienen fuera del esquema expuesto y se revoca EXECUTE público. El servicio valida además propiedad y permiso Premium antes de una operación; RLS no sustituye esa regla.

Tickets se guardan, si la retención es necesaria, en bucket privado por usuario, con política de lectura/escritura propia y retención declarada; una URL firmada tiene vencimiento. La carga exige permisos INSERT y la sobrescritura requiere también SELECT/UPDATE cuando se utilice upsert. Nunca se publica una imagen financiera por usar Storage. El navegador usa clave publicable y sesión de usuario. Claves secretas o legacy service_role permanecen sólo en servidor; al omitir RLS requieren controles explícitos de autorización para cron/webhooks. No se comparte un cliente autenticado de servidor entre solicitudes de usuarios distintos.

Estas decisiones se apoyan en [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [control de Storage](https://supabase.com/docs/guides/storage/security/access-control) y [claves API](https://supabase.com/docs/guides/getting-started/api-keys). El [cambio oficial de grants por defecto](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) exige verificar la configuración real del proyecto: no se presume exposición automática. Las políticas quedan pendientes de validación permitir/denegar en el entorno y la revisión elegidos.


![ER-CU001-Movimientos](figures/ER-CU001-Movimientos.svg)
![ER-CU002-Cuentas](figures/ER-CU002-Cuentas.svg)
![ER-CU002-Usuario](figures/ER-CU002-Usuario.svg)
![ER-CU004-Inversiones](figures/ER-CU004-Inversiones.svg)
![ER-CU003-Snapshots](figures/ER-CU003-Snapshots.svg)
![ER-CU001-Recurrentes](figures/ER-CU001-Recurrentes.svg)
![ER-CU001-Presupuestos](figures/ER-CU001-Presupuestos.svg)
![ER-CU001-Grupos](figures/ER-CU001-Grupos.svg)
![ER-CU001-Reparto](figures/ER-CU001-Reparto.svg)
![ER-CU002-Integraciones](figures/ER-CU002-Integraciones.svg)

### 10.5.6 Arquitectura objetivo y decisiones

Las vistas de componentes y despliegue representan el diseño objetivo; su dibujo no certifica configuración ni retención del ambiente productivo. Las fuentes impresas son ARQ-Logica-Impresa, ARQ-Componentes-Datos/Analisis/Canales y ARQ-Despliegue-Impresa.

Se utiliza un único backend de aplicación, con cuatro módulos funcionales y controles transversales; no se requieren microservicios para el alcance académico. Las vistas lógica, de componentes y de despliegue distinguen responsabilidades y distribución. La asignación observada utiliza Next.js/React, funciones Node en Vercel, Telegraf, Supabase y proveedores externos; versiones finales registradas en la evidencia de entrega. Fuentes: `diagramas/ARQ-Logica.dot`, `diagramas/ARQ-Componentes.dot` y `diagramas/ARQ-Despliegue.dot`.

| Capa o componente | Responsabilidad e interfaz |
|---|---|
| Presentación PWA React/Next.js | P01–P12, validación de formato y estados. Envía comandos/consultas autenticados; no decide saldo, costo, autorización ni permisos definitivos |
| Entradas API del backend | Contratos de usuario, webhook Telegram, webhook Mercado Pago y cron. Verifica identidad/firma, límites de entrada, correlación y autorización antes de llamar controles |
| Aplicación | GestionarMovimientos, AdministrarCuentas, ConsultaFinanciera y GestionarPortafolio coordinan las secuencias; recurrencias, importación, planes, chat y heurísticas poseen responsabilidades separadas |
| Dominio y cálculos | PolíticaSaldo, CostoPosicion, Conversion, ResumenMovimientos y Heuristica implementan reglas deterministas; no dependen de pantallas ni formatos de proveedores |
| Integración/persistencia | Los servicios usan supabase-js; el trigger de movimientos y los RPC atómicos materializan operaciones monetarias; interfaces de cotización, IA, pago y aviso ocultan cambios externos |
| Supabase | Auth provee identidad; PostgreSQL conserva hechos y restricciones; Storage privado conserva adjuntos bajo política de retención. No se prescribe Edge Functions además de las funciones Node sin una necesidad concreta |
| Vercel | Aloja PWA/backend y un disparador cron autorizado. Su programación y límites deben contrastarse con el plan contratado |

Para dólar se usa la lista CriptoYa→DolarApi→DbCache; para otros activos se utilizan fuentes compatibles. El orden de proveedores de dólar está configurado en código; sólo un proveedor que realmente ofrezca ese dato participa. Un adaptador valida y normaliza cada respuesta. La última referencia válida se conserva en PostgreSQL; la caché de 300 s es una optimización de lectura y no una base Redis inexistente en la fuente revisada. El diseño tolera reinicio de una función sin perder la última referencia persistida.

La PWA recibe un resultado de lectura con sus metadatos o una confirmación de comando con ID. Cron llama a TransactionsService.create; el trigger mantiene la misma autoridad de saldo. Telegram verifica origen y vínculo antes de crear un borrador; no utiliza un user_id enviado libremente. Mercado Pago se consulta o verifica según el contrato oficial del proveedor antes de activar la suscripción; el estado se verifica con el proveedor y el período se actualiza coherentemente, sin atribuir una tabla de eventos inexistente. Gemini se invoca a través de un adaptador, con mínimo contenido necesario y permiso del usuario para procesar un ticket; se establece tiempo de espera y una alternativa manual. Ningún adaptador externo tiene acceso irrestricto a las tablas financieras.

| Decisión de diseño | Motivo y requisitos que satisface | Costo o límite |
|---|---|---|
| ADR01 Trigger/RPC como autoridad monetaria | Evita doble saldo y estado parcial; RF01/05/07/09, RNF06 | Requiere cubrir INSERT/UPDATE/DELETE completos y no duplicar efectos desde aplicación |
| ADR02 Saldo principal y desglose multimoneda, deuda firmada | Resuelve tarjeta multimoneda y patrimonio; RF03/04 | UI debe explicar signo y límite por moneda; no hay conversión implícita de deuda |
| ADR03 Unicidad recurrente y alcance de reintentos | Reintento seguro y carreras; RF09, RN06 | El índice único de usuario/regla/día argentino evita repetir dinero y permite reparar la marca posterior. Garantía persistente de bot, importación y cola es un objetivo pendiente; no se atribuye a esos canales la unicidad recurrente |
| ADR04 Referencias normalizadas con fecha y respaldo | Fallas externas y claridad de patrimonio; RF02/03/05, RNF01/02 | Puede mostrar valor parcial o antiguo; no promete precio de ejecución |
| ADR05 Heurísticas deterministas sin LLM | Hace RF11 reproducible y comprobable | Meses observados y ahorro mensual constante; no predice causalidad |
| ADR06 Consulta determinista tras intención permitida | Cifras autorizadas y verificables; RF10, RNF03 | Catálogo de preguntas limitado; respuestas fuera de catálogo se aclaran |
| ADR07 Datos personales aislados por grants, RLS y servidor | Propiedad y permisos; RF13/15/16, RNF03 | Pruebas por tabla/operación y atención especial a credenciales de servicio |
| ADR08 Aviso posterior al hecho financiero | Telegram fallido no revierte dinero; RF09, RNF06/08 | Ganador de inserción notifica y falla se registra, sin outbox ni garantía de reentrega |
| ADR09 Patrimonio distingue cuenta común e inversión | Patrimonio sin duplicación y costo correcto; RF03/05 | Registro de posición/venta no mueve efectivo; no conecta con broker |

La revisión local utiliza Next.js 15.5.27, Vitest 5.0.3 y Node.js 22.17.0 para su validación. Estas versiones pertenecen al código y a las pruebas de la entrega; no acreditan una actualización del entorno desplegado. Las versiones del cliente Supabase y de PostgreSQL se registran a partir de lockfile y ambiente efectivamente verificado. El diseño contempla límites de peticiones, timeout externo, lectura paginada e índices por propietario/fecha; las cifras de desempeño y recuperación se validan según RNF01/RNF07.


![ARQ-Logica-Impresa](figures/ARQ-Logica-Impresa.svg)
![ARQ-Componentes-Datos](figures/ARQ-Componentes-Datos.svg)
![ARQ-Componentes-Analisis](figures/ARQ-Componentes-Analisis.svg)
![ARQ-Componentes-Canales](figures/ARQ-Componentes-Canales.svg)
![ARQ-Despliegue-Impresa](figures/ARQ-Despliegue-Impresa.svg)

### 10.5.7 Robustez: cuatro familias BCE

Cada familia distingue `<<boundary>>`, `<<control>>` y `<<entity>>`. El actor sólo intercambia con una frontera; la frontera intercambia con un control; las entidades son consultadas o modificadas por controles. No hay actor→control, actor→entity, boundary→entity ni entity→entity. Los controles pueden coordinar otros controles. Una integración externa es una frontera técnica frente al proveedor, no una entidad del dominio. Los errores regresan al control y de allí a la frontera de entrada.

| Familia | Fronteras y controles principales | Entidades y cobertura |
|---|---|---|
| ROB-CU001 | P01/P02/P03/P04/P11/P12, entrada cron y adaptador OCR; GestionarMovimiento, CapturarTicket, ImportarLote, Recurrencias, Presupuestos y ValidarAcceso | Cuenta, SaldoMoneda, Movimiento, Categoría, Regla, vencimiento y Presupuesto; Grupo/Miembro/Gasto/Parte. Básico, transferencia, ticket, Telegram, importación, regla/cron, presupuesto, corrección, compartidos, cuotas y cola |
| ROB-CU002 | P05/P06, acceso y adaptador de pagos; AdministrarCuenta, Acceso, Exportar, Preferencias, VincularTelegram y Plan | Usuario, Cuenta, SaldoMoneda, Movimiento, Posición, Regla, Preferencias, VinculoTelegram, SuscripciónPlan. Creación/corrección/baja, multimoneda, exportación, identidad, preferencias y pago |
| ROB-CU003 | P07/P08/P03 y fronteras cotización/IA; ConsultaFinanciera, Cotizaciones, Conversion, Resumen, ResolverConsulta y Heuristicas | Cuenta, SaldoMoneda, Movimiento, Posición, Cotización y Preferencias. Dashboard/detalle, filtros, chat PWA/Telegram, RF11 y widgets |
| ROB-CU004 | P09/P10 y frontera precios; GestionarPortafolio, CostoPosicion, Cotizaciones y Simulacion | Cuenta, SaldoMoneda, Activo, Posición, VentaInversión y Cotización. Registro de lote, venta, manual, ausencia/precio de respaldo y simulación sin cambios |

Las fuentes impresas son los fragmentos ROB-CU001-* a ROB-CU004-* del catálogo de vistas. Cada fragmento conserva su familia y escenarios; los cuatro dibujos generales se conservan como fuente de análisis. El etiquetado de aristas identifica escenarios, autorización y devolución; la omisión de una llamada de persistencia en una simulación es deliberada. Los dibujos complementan las fichas y no sustituyen sus reglas de cierre.


![ROB-CU001-Registro](figures/ROB-CU001-Registro.svg)
![ROB-CU001-OCR](figures/ROB-CU001-OCR.svg)
![ROB-CU001-Importacion](figures/ROB-CU001-Importacion.svg)
![ROB-CU001-Telegram](figures/ROB-CU001-Telegram.svg)
![ROB-CU001-Reglas](figures/ROB-CU001-Reglas.svg)
![ROB-CU001-Cron](figures/ROB-CU001-Cron.svg)
![ROB-CU001-Aviso](figures/ROB-CU001-Aviso.svg)
![ROB-CU001-Presupuesto](figures/ROB-CU001-Presupuesto.svg)
![ROB-CU001-Compartidos](figures/ROB-CU001-Compartidos.svg)
![ROB-CU002-Cuentas](figures/ROB-CU002-Cuentas.svg)
![ROB-CU002-Datos](figures/ROB-CU002-Datos.svg)
![ROB-CU002-Preferencias](figures/ROB-CU002-Preferencias.svg)
![ROB-CU002-Acceso](figures/ROB-CU002-Acceso.svg)
![ROB-CU002-Plan](figures/ROB-CU002-Plan.svg)
![ROB-CU003-Patrimonio](figures/ROB-CU003-Patrimonio.svg)
![ROB-CU003-Cotizaciones](figures/ROB-CU003-Cotizaciones.svg)
![ROB-CU003-Resumen](figures/ROB-CU003-Resumen.svg)
![ROB-CU003-Chat](figures/ROB-CU003-Chat.svg)
![ROB-CU003-RF11](figures/ROB-CU003-RF11.svg)
![ROB-CU004-Operacion](figures/ROB-CU004-Operacion.svg)
![ROB-CU004-Referencias](figures/ROB-CU004-Referencias.svg)
![ROB-CU004-Simulacion](figures/ROB-CU004-Simulacion.svg)

### 10.5.8 Secuencia: cuatro familias completas

Las secuencias asignan responsabilidades a los mismos participantes de robustez. Una familia puede usar varias figuras para conservar lectura. Las llamadas de servicios, trigger y RPC realizan el acceso a entidades; no cambian la clasificación BCE. El curso básico aparece en el orden de mensajes y los fragmentos `alt`, `loop` y `critical` explican variantes, rechazos, concurrencia y retorno a la frontera.

| Familia | Fuentes editables y escenarios |
|---|---|
| SEC-CU001 | Registro, captura, reglas, cron, cuotas, cola y compartidos. Fuentes: SEC-CU001-Crear, SEC-CU001-EditarEliminar, SEC-CU001-OCR, SEC-CU001-Telegram, SEC-CU001-Importar, SEC-CU001-ReglasPresupuestos, SEC-CU001-CronSeleccion, SEC-CU001-CronOcurrencia, SEC-CU001-Cuotas, SEC-CU001-Cola, SEC-CU001-Sincronizacion, SEC-CU001-CompartidosGrupo, SEC-CU001-CompartidosReparto |
| SEC-CU002 | Cuenta, datos, acceso, preferencias y pago. Fuentes: SEC-CU002-AccesoPreferencias, SEC-CU002-PagoInicio, SEC-CU002-PagoWebhook, SEC-CU002-CuentasAlta, SEC-CU002-CuentasDatos |
| SEC-CU003 | Consulta, fuentes, chat, anomalías y proyección. Fuentes: SEC-CU003-Dashboard, SEC-CU003-Cotizaciones, SEC-CU003-ChatIntencion, SEC-CU003-ChatRespuesta, SEC-CU003-AnomaliasSeleccion, SEC-CU003-AnomaliasCalculo, SEC-CU003-Proyeccion |
| SEC-CU004 | Lote, venta, valoración y simulación. Fuentes: SEC-CU004-Compra, SEC-CU004-VentaValidar, SEC-CU004-VentaRPC, SEC-CU004-Valoracion, SEC-CU004-Simulacion-Detalle |

La respuesta de un proveedor nunca confirma un movimiento personal. El resultado de un commit se devuelve primero al control y luego a la pantalla. La prueba de reintentos distingue unicidad recurrente persistida de la idempotencia de confirmación manual/bot aún pendiente de garantía general. Un cron técnico fallido puede reintentar; un rechazo de negocio termina con motivo. El webhook de pago valida origen y recurso y vuelve a consultar preapproval. Authorized/active utiliza next_payment_date; rejected desde ACTIVE inicia gracia y una repetición serial ya en GRACE_PERIOD conserva su fin. La lectura del estado y la decisión no forman una transacción bloqueada: no se promete idempotencia concurrente ni una tabla durable de eventos.


![SEC-CU001-Crear](figures/SEC-CU001-Crear.svg)
![SEC-CU001-EditarEliminar](figures/SEC-CU001-EditarEliminar.svg)
![SEC-CU001-OCR](figures/SEC-CU001-OCR.svg)
![SEC-CU001-Telegram](figures/SEC-CU001-Telegram.svg)
![SEC-CU001-Importar](figures/SEC-CU001-Importar.svg)
![SEC-CU001-ReglasPresupuestos](figures/SEC-CU001-ReglasPresupuestos.svg)
![SEC-CU001-CronSeleccion](figures/SEC-CU001-CronSeleccion.svg)
![SEC-CU001-CronOcurrencia](figures/SEC-CU001-CronOcurrencia.svg)
![SEC-CU001-Cuotas](figures/SEC-CU001-Cuotas.svg)
![SEC-CU001-Cola](figures/SEC-CU001-Cola.svg)
![SEC-CU001-Sincronizacion](figures/SEC-CU001-Sincronizacion.svg)
![SEC-CU002-AccesoPreferencias](figures/SEC-CU002-AccesoPreferencias.svg)
![SEC-CU002-PagoInicio](figures/SEC-CU002-PagoInicio.svg)
![SEC-CU002-PagoWebhook](figures/SEC-CU002-PagoWebhook.svg)
![SEC-CU003-Dashboard](figures/SEC-CU003-Dashboard.svg)
![SEC-CU003-Cotizaciones](figures/SEC-CU003-Cotizaciones.svg)
![SEC-CU003-ChatIntencion](figures/SEC-CU003-ChatIntencion.svg)
![SEC-CU003-ChatRespuesta](figures/SEC-CU003-ChatRespuesta.svg)
![SEC-CU003-AnomaliasSeleccion](figures/SEC-CU003-AnomaliasSeleccion.svg)
![SEC-CU003-AnomaliasCalculo](figures/SEC-CU003-AnomaliasCalculo.svg)
![SEC-CU003-Proyeccion](figures/SEC-CU003-Proyeccion.svg)
![SEC-CU004-Compra](figures/SEC-CU004-Compra.svg)
![SEC-CU004-VentaValidar](figures/SEC-CU004-VentaValidar.svg)
![SEC-CU004-VentaRPC](figures/SEC-CU004-VentaRPC.svg)
![SEC-CU004-Valoracion](figures/SEC-CU004-Valoracion.svg)
![SEC-CU001-CompartidosGrupo](figures/SEC-CU001-CompartidosGrupo.svg)
![SEC-CU001-CompartidosReparto](figures/SEC-CU001-CompartidosReparto.svg)
![SEC-CU002-CuentasAlta](figures/SEC-CU002-CuentasAlta.svg)
![SEC-CU002-CuentasDatos](figures/SEC-CU002-CuentasDatos.svg)
![SEC-CU004-Simulacion-Detalle](figures/SEC-CU004-Simulacion-Detalle.svg)

### 10.5.9 Diseño de clases e interfaces

Las vistas CLASES-CU001-* a CLASES-CU004-* muestran servicios y operaciones observados; CLASES-Datos-* representa DTO de persistencia separados del dominio conceptual. Las figuras de patrones separan Strategy/Adapter de TemplateMethod. Para impresión se emplean nombres de operación breves; las firmas centrales declaradas se transcriben en la tabla siguiente, sin sustituirlas por tipos imaginados. Los nodos ApiEntradas y Heuristicas son fronteras/funciones del análisis con mapeo a rutas y funciones puras, no clases nuevas atribuidas al código. Los campos opcionales/nulos del código se describen en `types/database.ts`.

| Control de análisis | Participante de implementación | Responsabilidad y secreto |
|---|---|---|
| GestionarMovimiento | TransactionsService y rutas de transactions | Entrada financiera, propiedad, conversión y escritura; trigger oculta mantenimiento de saldo |
| AdministrarCuenta / ConsultaFinanciera | AccountsService y composición de rutas/dashboard | Configuración y agregación; desglose multimoneda y flags de inclusión |
| Captura / ResolverConsulta | internal-ai-chat, bot-tools, Gemini y executeBotTransaction | Catálogo de herramientas, propuesta/confirmación y traducción de lenguaje |
| Importar / Exportar | Rutas import/export | Formatos y validación/mapeo; exportación siempre propia |
| Recurrencias | RecurringService, RecurringRulesJob e IterativeCronJob | Configuración, calendario y procesamiento; índice persistente y marca posterior recuperan un fallo parcial sin duplicar |
| Presupuestos | BudgetsService y get_budget_status | Mes, moneda, consumo y avisos |
| Cotizaciones / Conversion | CotizacionesService y proveedores | Formatos, fallback, tasa direccional y caché |
| Heuristicas | Rutas anomalies/projections y funciones puras de corrección | Fórmulas deterministas de RF11, sin LLM |
| GestionarPortafolio / CostoPosicion | InvestmentsService y sell_investment_position | Precio de compra del lote, venta histórica y lock contra sobreventa |
| Simulacion | Frontera de portafolio y cálculo sobre copia | Resultado hipotético; no invoca venta ni registra posición real |
| Compartidos | SharedExpensesService | Capacidad por token, validación de grupo, centavos, balance y liquidación |
| Acceso / Plan | Supabase Auth, rutas de usuario/billing y adaptador Mercado Pago | Sesión, período, identidad del plan y verificación de cobro |

El diagrama de diseño no vuelve una entidad del negocio responsable de HTTP ni pone cálculo financiero en un widget. Los servicios encapsulan consultas y controles; eso no acredita Repository. Se conserva composición de proveedores para cambios de fuente. Cron usa herencia sólo porque el esqueleto fijo delega operaciones y hooks documentados; ésa es la colaboración real de TemplateMethod. El cliente Supabase del servidor se crea por solicitud/contexto; no se presenta como Singleton global de sesiones. Las secuencias conservan nombres de controles del análisis, con este mapeo explícito a código. Cada llamada financiera final debe coincidir con su función/RPC de la revisión entregada.


#### Firmas centrales observadas

Las operaciones de esta selección conservan parámetros, opcionalidad, valores por defecto y retorno declarados en el código local. La extracción completa queda en firmas_observadas.json; las restantes operaciones se identifican en las fuentes de servicios. «Retorno inferido» significa que TypeScript lo deduce y la función no declara una anotación explícita. Los alias y objetos de entrada se resuelven en el archivo fuente indicado. Los diagramas muestran responsabilidades; no sustituyen este contrato.

| Clase o función / visibilidad | Firma declarada | Fuente |
|---|---|---|
| TransactionsService / pública | create(input: CreateTransactionInput): Promise<Transaction> | lib/services/transactions.ts |
| TransactionsService / pública | getById(id: string, userId: string): Promise<TransactionWithCategory> | lib/services/transactions.ts |
| TransactionsService / pública | delete(id: string, userId: string): Promise<void> | lib/services/transactions.ts |
| AccountsService / pública | create(input: CreateAccountInput): Promise<Account> | lib/services/accounts.ts |
| AccountsService / pública | getMulticurrencyBreakdown(userId: string, accountId: string): Promise<{ primary: number; secondary: number; secondaryCurrency: string }> | lib/services/accounts.ts |
| AccountsService / pública | getById(id: string, userId: string, options?: { includeInactive?: boolean }): Promise<Account \| null> | lib/services/accounts.ts |
| InvestmentsService / pública | create(input: CreateInvestmentInput): Promise<Investment> | lib/services/investments.ts |
| InvestmentsService / pública | sell(input: SellPositionInput): Promise<SellPositionResult> | lib/services/investments.ts |
| InvestmentsService / pública | getPortfolioSummary(userId: string, options?: { forceRefreshQuotes?: boolean; skipDailySnapshot?: boolean; skipQuoteRefresh?: boolean }): Promise<PortfolioSummaryPayload> | lib/services/investments.ts |
| RecurringService / pública | listActive(userId: string): Promise<RecurringRuleWithRelations[]> | lib/services/recurring.ts |
| RecurringService / pública | create(input: CreateRecurringInput): Promise<RecurringRule> | lib/services/recurring.ts |
| BudgetsService / pública | create(input: CreateBudgetInput): Promise<Budget> | lib/services/budgets.ts |
| BudgetsService / pública | getStatus(userId: string, month: Date): Promise<BudgetStatus[]> | lib/services/budgets.ts |
| SharedExpensesService / pública | createGroup(input: CreateSharedGroupInput): Promise<SharedGroup> | lib/services/sharedExpenses.ts |
| SharedExpensesService / pública | getGroupByToken(token: string): Promise<SharedGroupDetail \| null> | lib/services/sharedExpenses.ts |
| SharedExpensesService / pública | addExpenseByToken(token: string, input: { actorMemberId: string; paidByMemberId: string; description: string; amount: number; expenseDate?: string; splitMemberIds?: string[]; }): Promise<SharedExpense \| null> | lib/services/sharedExpenses.ts |
| SharedExpensesService / pública | updateExpenseByToken(token: string, expenseId: string, input: { actorMemberId: string; paidByMemberId: string; description: string; amount: number; expenseDate?: string; splitMemberIds?: string[]; }): Promise<SharedExpense \| null> | lib/services/sharedExpenses.ts |
| SharedExpensesService / pública | deleteExpenseByToken(token: string, expenseId: string, actorMemberId: string): Promise<boolean> | lib/services/sharedExpenses.ts |
| CotizacionesService / pública | getDolarQuotes(opts?: { preferCache?: boolean }): Promise<Record<string, DolarQuote>> | lib/services/cotizaciones.ts |
| CotizacionesService / pública | getExchangeRate(from: string, to: string = 'ARS'): Promise<number> | lib/services/cotizaciones.ts |
| función pura / pública | calculateFinancialAnomalies(transactions: AnomalyTransaction[], now: Date = new Date()): FinancialAnomaly[] | lib/financial-anomalies.ts |
| función pura / pública | calculateFinancialProjection(transactions: ProjectionTransaction[], currentARS: number, now: Date = new Date()) — retorno inferido, sin anotación explícita | lib/financial-projections.ts |
| CronJob / pública | run(request: NextRequest): Promise<NextResponse> | lib/cron/cron-job.ts |


![CLASES-Datos-Movimientos](figures/CLASES-Datos-Movimientos.svg)
![CLASES-Datos-Cuentas](figures/CLASES-Datos-Cuentas.svg)
![CLASES-Datos-Inversiones](figures/CLASES-Datos-Inversiones.svg)
![CLASES-Datos-Automatizacion](figures/CLASES-Datos-Automatizacion.svg)
![CLASES-CU001-Movimientos](figures/CLASES-CU001-Movimientos.svg)
![CLASES-CU001-Automatizacion](figures/CLASES-CU001-Automatizacion.svg)
![CLASES-CU001-Compartidos](figures/CLASES-CU001-Compartidos.svg)
![CLASES-CU002-Cuentas](figures/CLASES-CU002-Cuentas.svg)
![CLASES-CU003-Analisis](figures/CLASES-CU003-Analisis.svg)
![CLASES-CU004-Inversiones](figures/CLASES-CU004-Inversiones.svg)

### 10.5.10 Trazabilidad y revisiones

| Requisitos | Ficha / prototipo | Robustez / secuencia | Responsables |
|---|---|---|---|
| RF01/06/07-import/08/09/12 y compartidos/cuotas/cola | CU-001; P01–P04/P11/P12 | ROB-CU001; SEC-CU001, fragmentos por escenario | GestionarMovimiento, TransactionsService/trigger, ImportarLote, Recurrencias, Presupuestos |
| RF04/07-export/13/14/15/16 | CU-002; P05–P06 | ROB-CU002; SEC-CU002, fragmentos por escenario | AdministrarCuenta, Exportar, Acceso, Preferencias, Plan |
| RF02/03/10/11 y presentación RF14 | CU-003; P07–P08/P03 | ROB-CU003; SEC-CU003, fragmentos por escenario | ConsultaFinanciera, Cotizaciones, Conversion, Resumen, ResolverConsulta, Heuristicas |
| RF05 y simulación | CU-004; P09–P10 | ROB-CU004; SEC-CU004, fragmentos por escenario | GestionarPortafolio, CostoPosicion, Cotizaciones, Simulacion |
| RNF01–RNF08 | Los cuatro, según tabla de aceptación | Arquitectura y escenarios de error/concurrencia | Responsables transversales y evidencias de prueba de la entrega |

Cada criterio de aceptación se enlaza además con caso de prueba, resultado real, revisión del código y evidencia exportable. Una prueba diseñada se etiqueta diseñada; el estado ejecutada exige salida o registro real. La existencia de un diagrama no prueba que su código esté completo. Las referencias locales o de repositorio que no sean accesibles para el evaluador se sustituyen por un paquete de fuentes y evidencias identificadas por revisión.

| Hito | Artefactos a revisar | Estado en esta revisión |
|---|---|---|
| RRR | Alcance, actores, glosario, 16 RF, RNF, cuatro fichas y prototipos | Pendiente de revisión real y registro de observaciones/acuerdo |
| PDR | Robustez, dominio, datos, reglas monetarias y arquitectura | Pendiente de revisión real y registro de observaciones/acuerdo |
| CDR | Secuencias, clases, patrones, mapeo a código y pruebas | Pendiente de revisión real y registro de observaciones/acuerdo |

El registro de cada hito contiene nombre, rol, fecha, artefactos/revisión, observaciones, decisiones y aceptación real cuando exista. No se completan firmas, fechas ni nombres por inferencia.


#### Catálogo de vistas impresas

Una familia conserva su caso de uso aunque tenga varios fragmentos. Los nombres breves de controles en ROB se corresponden con la tabla de responsabilidades y las entidades conservan su identidad entre vistas. B/«boundary» identifica frontera, C/«control» coordinación y E/«entity» dato del dominio. Los rechazos regresan al control y a la frontera; las vistas de detalle no agregan óvalos ni actores internos. En dominio, ER y DTO, la etiqueta de relación reúne el rol y las multiplicidades con el nombre de cada extremo para evitar superposición; las vistas ER de recurrentes identifican R/U/A/C/T en sus encabezados. Los fragmentos muestran distintas fases de un mismo escenario; no exigen repetir la acción del usuario.

| Sección / familia | Fuentes de las vistas impresas |
|---|---|
| 10.5.4 | DOM-Finanzas, DOM-Automatizacion, DOM-Inversiones, DOM-Personal, DOM-Compartidos |
| 10.5.5 | ER-CU001-Movimientos, ER-CU002-Cuentas, ER-CU002-Usuario, ER-CU004-Inversiones, ER-CU003-Snapshots, ER-CU001-Recurrentes, ER-CU001-Presupuestos, ER-CU001-Grupos, ER-CU001-Reparto, ER-CU002-Integraciones |
| 10.5.6 | ARQ-Logica-Impresa, ARQ-Componentes-Datos, ARQ-Componentes-Analisis, ARQ-Componentes-Canales, ARQ-Despliegue-Impresa |
| 10.5.7 | ROB-CU001-Registro, ROB-CU001-OCR, ROB-CU001-Importacion, ROB-CU001-Telegram, ROB-CU001-Reglas, ROB-CU001-Cron, ROB-CU001-Aviso, ROB-CU001-Presupuesto, ROB-CU001-Compartidos, ROB-CU002-Cuentas, ROB-CU002-Datos, ROB-CU002-Preferencias, ROB-CU002-Acceso, ROB-CU002-Plan, ROB-CU003-Patrimonio, ROB-CU003-Cotizaciones, ROB-CU003-Resumen, ROB-CU003-Chat, ROB-CU003-RF11, ROB-CU004-Operacion, ROB-CU004-Referencias, ROB-CU004-Simulacion |
| 10.5.8 | SEC-CU001-Crear, SEC-CU001-EditarEliminar, SEC-CU001-OCR, SEC-CU001-Telegram, SEC-CU001-Importar, SEC-CU001-ReglasPresupuestos, SEC-CU001-CronSeleccion, SEC-CU001-CronOcurrencia, SEC-CU001-Cuotas, SEC-CU001-Cola, SEC-CU001-Sincronizacion, SEC-CU002-AccesoPreferencias, SEC-CU002-PagoInicio, SEC-CU002-PagoWebhook, SEC-CU003-Dashboard, SEC-CU003-Cotizaciones, SEC-CU003-ChatIntencion, SEC-CU003-ChatRespuesta, SEC-CU003-AnomaliasSeleccion, SEC-CU003-AnomaliasCalculo, SEC-CU003-Proyeccion, SEC-CU004-Compra, SEC-CU004-VentaValidar, SEC-CU004-VentaRPC, SEC-CU004-Valoracion, SEC-CU001-CompartidosGrupo, SEC-CU001-CompartidosReparto, SEC-CU002-CuentasAlta, SEC-CU002-CuentasDatos, SEC-CU004-Simulacion-Detalle |
| 10.5.9 | CLASES-Datos-Movimientos, CLASES-Datos-Cuentas, CLASES-Datos-Inversiones, CLASES-Datos-Automatizacion, CLASES-CU001-Movimientos, CLASES-CU001-Automatizacion, CLASES-CU001-Compartidos, CLASES-CU002-Cuentas, CLASES-CU003-Analisis, CLASES-CU004-Inversiones |
| Anexo D | PATRONES-Cotizaciones, PATRONES-Cron, SEC-StrategyAdapter, SEC-TemplateMethod |


### 10.5.12 Plan y resultados de pruebas de ZARIX v2.13

Fecha de revisión: 6 de octubre de 2026, zona Argentina. Se inspeccionó el código obtenido del commit base `5cbd7ac984782b5f50e19f72ba7e0c3c8b5304fd` y se corrigieron defectos en la rama de revisión. El código verificado quedó registrado en el commit `98250f5dfb83bb88eeed241f80807a5770e4caaf` (anexo A.7). Las pruebas locales y los casos de aceptación diseñados se registran por separado. Las migraciones preparadas no acreditan su aplicación a producción.

El alcance tiene exactamente cuatro casos de uso: **CU-001 Gestionar movimientos financieros**, **CU-002 Administrar cuentas y datos personales**, **CU-003 Consultar y analizar la situación financiera** y **CU-004 Seguir el portafolio de inversiones**. Telegram, OCR, importación, recurrentes, presupuestos y gastos compartidos son escenarios de CU-001; exportación, acceso, preferencias y plan pertenecen a CU-002; dashboard, cotizaciones, chat y heurística a CU-003; posiciones, ventas y simulación a CU-004. No se agregan CU para los escenarios secundarios.

#### 10.5.12.1 Método y evidencia

Una prueba compara una salida obtenida por ejecución con una especificación. El diseño del caso es preparación, no demostración. [Introducción al testing, pp. 3–4 y 7](https://www.fceia.unr.edu.ar/ingsoft/testing-intro-a.pdf). Caja negra utiliza particiones válidas/ inválidas, fronteras y constantes representativas, con un oráculo independiente. El apunte complementario desarrolla esta disciplina sobre especificaciones Z; no se exige reescribir el proyecto completo en Z. [Testing funcional, pp. 2–5 y 22–25](https://www.fceia.unr.edu.ar/ingsoft/testing-func-a.pdf).

Sentencias, ramas, condiciones y caminos se reportan como criterios distintos. Cubrir una decisión no demuestra todas las combinaciones de sus condiciones. Para bucles se incluyen cero, una y varias iteraciones. [Testing estructural, pp. 5–9](https://www.fceia.unr.edu.ar/ingsoft/testing-estruct-a.pdf), [Práctica de testing, ejercicios 5–12](https://www.fceia.unr.edu.ar/ingsoft/p-testing.pdf).

| Evidencia real de esta revisión | Resultado y alcance |
|---|---|
| `regresiones-vitest.json` | 65/65 pruebas aprobadas en cuatro archivos: 32 de servicios financieros, cinco de edición/helpers, 20 de calendario y ocho del coordinador recurrente. Vitest 5.0.3; inicio `2026-10-07T00:14:42.967Z`; Node 24.19.0 en esa corrida selectiva |
| `sql-original.json` | 14/18 aprobadas y cuatro fallidas al ejecutar el trigger anterior en Postgre SQL WASM. Es una reproducción previa a la corrección |
| `sql-revisado.json` | 18/18 aprobadas después de corregir reversión OLD/aplicación NEW, antes de agregar el importe destino autoritativo |
| `sql-revisado-destino.json` | 28/28 aprobadas: 25 casos del trigger y tres del resumen bimoneda. PGlite 0.5.8 / Postgre SQL 18.3 WASM; esquema mínimo aislado; inicio del reporte registrado en UTC |
| `anomalies-vitest.json` | 8/8 pruebas aprobadas del helper RF11: ratio 2/1,999; categoría nueva 5000/5000,01; medianoche Argentina; ausencia de gastos; negativos/cero/no finitos; corte inclusivo y futuros. Vitest 5.0.3 / Node 24.19.0; fecha UTC en JSON |
| `shared_sql_resultados.json` | 11/11 pruebas aprobadas del RPC compartido en PGlite / Postgre SQL 18.3: centavos, deduplicación, scope, token y rollback. Base mínima aislada; no identidad individual del invitado ni RLS global |
| `final-vitest.json` / `verificacion_final.json` | 304/304 aprobadas en 32 archivos. Vitest 5.0.3 / Node 22.17.0 / npm 11.4.2; inicio UTC `2026-10-07T00:45:34.693Z`. Incluye las regresiones selectivas y los helpers RF11; no se suman otra vez |
| `coverage/coverage-summary.json` / `final-coverage.log` | Conjunto configurado: sentencias 659/1081 (60,96%), ramas 549/973 (56,42%), funciones 71/112 (63,39%), líneas 601/958 (62,73%). Calendario: 37/37 sentencias, 30/30 ramas, 4/4 funciones, 30/30 líneas (100%) |
| Aceptación de producto y servicios externos | Los CP de sistema/aceptación del CSV siguen diseñados cuando no existe obtenido y evidencia. Los dobles de Supabase/Telegram/Yahoo prueban contratos de servicio y fallas controladas; no equivalen a una corrida del proveedor o interfaz en producción |

La corrida selectiva se ejecutó con un runtime distinto del utilizado por la corrida general del proyecto. Se conserva esa diferencia para reproducibilidad; no se etiqueta la ejecución Node 24.19 como Node 22.17. La corrida general verificó el código que quedó registrado en el commit `98250f5dfb83bb88eeed241f80807a5770e4caaf`, sobre la base `5cbd7ac`. El anexo A.7 identifica ese commit y los archivos de evidencia.

La v2.12 declaraba 162/162 pruebas sobre `f4874c6e56964bab9e689c924e2c3e13a46d60c7`, sin fecha calendario completa: sentencias/líneas 23,27 % (159/683), ramas 96,82 % (61/63), funciones 46,42 % (13/28). Se conserva como evidencia histórica declarada del documento anterior. No describe la rama corregida ni el porcentaje de requisitos demostrados. El override `test-7 CUMPLE` por CP diseñados se sustituye por estado verificable por requisito.

#### 10.5.12.2 Contratos monetarios de la implementación revisada

`TransactionsService.create(input: CreateTransactionInput): Promise<Transaction>` valida monto finito positivo, precisión, cuotas enteras 1–36, cuotas sólo para gastos, cuentas propias/activas, destino distinto y tasa manual válida. Los movimientos manuales admiten ARS/USD/EUR según el catálogo de la API. Las conversiones de cuentas crypto conservan ocho decimales; los importes de cuenta fiat ARS/USD/EUR usan dos. El mínimo positivo de entrada fiat es 0,01; cero, negativos, NaN, infinito y 0,001 se rechazan. El almacenamiento numérico y sus escalas SQL se mantienen documentados; el cálculo del servicio usa números JavaScript y redondeo explícito, no una biblioteca decimal que no exista en el producto.

No existe un atributo `allowOverdraft` implementado. Por lo tanto, este plan no declara un rechazo por saldo insuficiente basado en esa bandera. El saldo puede quedar negativo según el modelo actual. Cualquier política futura de bloqueo por cuenta requiere requisito, cambio de esquema y pruebas propios.

`computeTransferAmounts(amount: number, currency: string, sourceCurrency: string, destinationCurrency: string, override?: number | null)` devuelve una promesa con `{amountInSource, amountInDestination, exchangeRate}`. Es una unidad de cálculo con posible consulta a cotizaciones; no valida propietario ni consulta saldos. Las cuentas y su identidad se validan en el servicio/API.

El monto de transferencia se expresa en moneda origen o destino. Si se expresa en origen, la tasa es destino/origen y el débito es el monto; si se expresa en destino, la tasa solicitada es origen/destino y el crédito es el monto. Para cuentas de la misma moneda se usa 1 y se rechaza una tercera moneda. La tasa debe ser positiva/finita; un importe aplicado que redondee a cero se rechaza.

| Entrada sintética | Oráculo económico |
|---|---|
| Cuenta A: ARS 10000 / cuenta B: ARS 2000; transfer 1500 ARS | A: 8500 / B: 3500; total 12000; sin ingreso/gasto económico |
| Monto origen 120000 ARS; tasa 1/1200 USD/ARS | Débito 120000 ARS; crédito 100 USD |
| Monto destino 100 USD; tasa 1200 ARS/USD | Débito 120000 ARS; crédito 100 USD; no segunda conversión |
| Monto origen 120000000 ARS; tasa 1/1200 | Crédito 100000 USD, aun cuando la tasa SQL se almacene con ocho decimales |
| Monto 1 ARS; tasa 0,005 USD/ARS | Crédito 0,01 USD por redondeo explícito |
| Monto 0,01 ARS; tasa 0,0001 USD/ARS | Crédito redondeado 0 USD: rechazo sin persistencia |

La migración `20261007000231_preserve_transfer_destination_amount.sql` agrega `transactions.destination_amount_in_account_currency NUMERIC(20,8)` nullable para históricos y positivo cuando presente. El servicio persiste el crédito calculado antes de que SQL redondee una tasa inversa a ocho decimales. Trigger, resumen bimoneda, recomputación y helpers usan ese importe autoritativo. Los registros antiguos sin el campo conservan `amount × exchange_rate` como fallback; no se reconstruyen ni se corrigen saldos históricos automáticamente.

La edición de texto/categoría sin cambiar monto, moneda o cuentas conserva las equivalencias históricas; no aplica una cotización nueva. Cuando cambia la intención monetaria, PATCH recalcula los dos importes de una transferencia y confirma ambos con el movimiento. La API conserva el tipo original y los ajustes de saldo se realizan por su flujo específico. El trigger soporta cambios de tipo a nivel de base de datos y se verifica por SQL, aunque esa transición no se ofrezca en la edición de la interfaz.

#### 10.5.12.3 Unidad de caja blanca: calendario recurrente

**Unidad real:** `shouldExecuteToday`, archivo `lib/cron/recurring-schedule.ts`. Firma inspeccionada:

```typescript
shouldExecuteToday(rule: {
  start_date?: string | null;
  end_date?: string | null;
  last_executed_date?: string | null;
  frequency?: string | null;
}): boolean
```

El reloj se controla mediante fake timers en las pruebas; `todayYmdAr()` obtiene la fecha civil de `America/Argentina/Buenos_Aires`. El predicado no escribe la base de datos ni envía mensajes. Inicio/fin/última fecha utilizan el prefijo civil de diez caracteres, validado con `isCivilYmd`. Inicio ausente o imposible devuelve false; antes del inicio devuelve false; fin inválido, anterior al inicio o vencido devuelve false; última fecha inválida, igual a hoy o futura devuelve false.

Diaria corresponde dentro de la ventana. Semanal exige el día de semana del inicio. Mensual exige el día `min(díaInicio, últimoDíaMes)`. Anual exige el mismo mes y ese día ajustado; el código inspeccionado ya ajustaba 29/02 a 28/02 en años no bisiestos. Frecuencia desconocida devuelve false. La regla activa y la cuenta activa se validan fuera del predicado. La fecha fin es inclusiva.

**CFG derivado del código local revisado.** Las dos vistas conectadas, Guardas y Frecuencia, conservan los identificadores visibles S0, S1–S12, SF y ST de `shouldExecuteToday`. Guardas continúa en S8 cuando S6 es no o S7 es no; Frecuencia parte de esa misma ejecución y no repite la llamada. Deben conservarse las dos vistas junto con el commit/hash de ese archivo al exportar la versión final.

![CFG-01-Guardas](figures/CFG-01-Guardas.svg)

![CFG-01-Frecuencia](figures/CFG-01-Frecuencia.svg)

| Partición / frontera | Entradas concretas de la suite real | Esperado / obtenido |
|---|---|---|
| Inicio ausente | Hoy 15/08/2026; daily sin start | false / aprobado |
| Inicio inválido | Hoy 06/10/2026; 2026-02-30,2026-13-01, invalid | false cada variante / aprobado |
| Antes de inicio | Hoy 10/08/2026; inicio 15/08 | false / aprobado |
| Ventana vencida | Hoy 20/08; inicio 01/08, fin 15/08 | false / aprobado |
| Fin inclusivo | Hoy 06/10; inicio 01/10, fin 06/10 | true / aprobado |
| Ventana inválida | Hoy 06/10; inicio 06/10, fin 05/10; o fin 30/02 | false / aprobado |
| Ya ejecutada | Hoy 15/08; inicio 01/08, última 15/08 | false / aprobado |
| Última futura/inválida | Hoy 06/10; inicio 01/10; última 07/10 o 30/02 | false / aprobado |
| Última anterior | Hoy 06/10; inicio 01/10, última 05/10 | true / aprobado |
| Diaria | Hoy 15/08; inicio 01/08 | true / aprobado |
| Semanal | Hoy sábado 15/08; inicio 08/08 sábado y 09/08 domingo | true/false / aprobado |
| Mensual | Inicio 31/01/2026; hoy 28/02 y 27/02 | true/false / aprobado |
| Anual | Inicio 15/08/2025; hoy 15/08/2026 y 15/09/2026 | true/false / aprobado |
| Anual bisiesto | Inicio 29/02/2024; hoy 28/02/2025 y 27/02/2025 | true/false / aprobado |
| Frecuencia desconocida | Inicio 01/08; hoy 15/08; quarterly | false / aprobado |
| Frontera UTC/local | Inicio 06/10/2026; reloj 02:59:59Z y 03:00:00Z de 06/10 | false/true / aprobado |

Los 20 tests incluyen los helpers de fecha/día de semana/último día de febrero. Las aserciones agrupadas prueban más de una entrada cuando se indica. Los caminos completos se reconstruyen siguiendo S1–S12; por ejemplo la frontera sin fin/última de 03:00Z toma S1 sí→S2 no→S3 no→S6 no→S8 diaria→true. El caso mensual no coincidente toma la misma entrada a S8 mensual→S10 no→false. V8 registró 37/37 sentencias y 30/30 ramas, además de 4/4 funciones y 30/30 líneas, en el archivo del calendario. Esto demuestra 100% de las ramas instrumentadas de esa unidad. No se infiere cobertura de todas las condiciones simples ni de todos los caminos de la aplicación a partir de esa medición.

#### 10.5.12.4 Integración SQL y correcciones demostradas

`scripts/test-balance-trigger.mjs` ejecuta el PL/pg SQL real de las migraciones en Postgre SQL WASM local con tablas mínimas y fixtures descartables. Se comparan vectores de saldo calculados manualmente. No usa producción. Su alcance no incluye Auth, RLS, proveedores externos, el esquema completo ni concurrencia entre procesos remotos.

El trigger anterior falló en cuatro casos: gasto→ingreso, cambio de cuenta origen de una transferencia, ingreso→transferencia y gasto→ajuste secundario de tarjeta. La migración `20261006235424_fix_balance_update_old_new_impacts.sql` revierte el impacto de OLD y aplica NEW por separado. Bloquea las cuentas afectadas en orden de ID dentro de la transacción del movimiento. Esta propiedad del código no se presenta como una corrida de estrés concurrente remota.

El modelo de referencia es `saldoFinal = saldoAnterior - impacto(OLD) + impacto(NEW)`. En INSERT, OLD es cero; en DELETE, NEW es cero. Gasto debita, ingreso acredita, transferencia debita origen y acredita destino; ajuste firmado actúa en el ledger correspondiente. Un ajuste secundario de tarjeta bimoneda no cambia el saldo primario.

| Caso SQL real | Resultado aprobado |
|---|---|
| Gasto 1500 sobre 10000; UPDATE monto 2000 | 8000 |
| Gasto 1500 de A: 10000; cambiar a B: 2000 | A: 10000 / B: 500 |
| Gasto 1500→ingreso 1500 | 11500 |
| DELETE gasto 1500 o ingreso 500, fixtures independientes | 10000 |
| TransferA→B: 1500; cambiar a A→C: 1000; iniciales 10000/2000/3000 | A: 9000 / B: 2000 / C: 4000 |
| TransferA→B: 1500; cambiar origen a C | A: 10000 / B: 3500 / C: 1500 |
| DELETE transferencia | Restituye ambos saldos |
| Ajuste secundario INSERT/UPDATE/DELETE | Saldo primario inalterado |
| Ajuste secundario→primario | Aplica únicamente el nuevo importe primario |
| Rollback de transferencia | Movimiento y ambos efectos revertidos |
| Crédito explícito 100 USD con tasa inversa SQL 0,00083333 | Acredita 100, no 99,9996 |
| Transferencia 120000000 ARS→100000 USD | Conserva 100000 USD |
| UPDATE/DELETE crédito explícito | Aplica/revierte el crédito confirmado exactamente |
| Histórico sin crédito explícito | Conserva fallback 99,9996 USD; no reconstrucción silenciosa |
| Resumen bimoneda INSERT/UPDATE/DELETE de crédito explícito | 100/200/0 USD, coherentes con los importes persistidos |

Los fixtures se restauran entre casos. Se conservan consultas, obtenido, esperado y estados en el JSON. La nueva columna y función deben migrarse antes de desplegar el servicio que las utiliza. Después de un despliegue autorizado se puede diseñar una conciliación de históricos; esta revisión no ejecuta esa operación.

Los gastos compartidos pertenecen a CU-001 A: 09. El RPC y las pruebas SQL de ese escenario se incluyen en `npm run test: db`, junto con los tests de saldo. El reporte `shared_sql_resultados.json` acredita 11/11 casos en Postgre SQL 18.3 aislado. Dividir 10,01 ARS entre tres conserva 1001 centavos: 3,34+3,34+3,33. Editar a 12,35 con lista [C, A, C] deduplica y conserva fecha: C: 6,18/A: 6,17. Actor/pagador/split de otro grupo, recurso de otro grupo y token inválido/revocado se rechazan sin cambio. Una falla inyectada en split revierte gasto+splits y evita huérfanos. El fixture 100/3 y neto total de grupo 0 del CP de aceptación siguen diseñados; no se les atribuye esta ejecución. La autoría del invitado se declara mediante una capacidad/enlace: poseerlo no demuestra identidad personal Auth.

#### 10.5.12.5 Cartera por lotes y pruebas de P&L

La implementación gestiona lotes/posiciones con `quantity` y `purchase_price`; una compra nueva puede crear otro lote. No se impone un promedio ponderado mutante que el esquema no implemente. El costo remanente de un lote es `cantidadRemanente × precioCompra / factor`; el factor de bonos es 100 por VN 100, y para acciones/ETF/crypto es 1. Una venta parcial conserva el precio de compra del lote y separa resultado realizado del no realizado. `sell(input: SellPositionInput)` utiliza el RPC `sell_investment_position`, cuyo decremento condicionado e INSERT de venta están en una transacción SQL. Los tests del servicio prueban parámetros/errores de ese RPC con doble de Supabase; no sustituyen la ejecución de su SQL real.

| Fixture real de servicio | Esperado aprobado |
|---|---|
| Lote remanente 6×USD 100; actual USD 110; ventas previas realizado USD 80 | Costo 600, valor 660, no realizado 60, realizado 80 |
| Referencia sin cotización: lote 6×EUR 100, EUR/USD 1,1 | Costo 660 USD, valor 660 USD y P&L 0; precio de referencia expresado en EUR |
| Bono comprado USD 100/VN 100, cantidad VN 1000; quote ARS 60000/VN 100, blue 1200 | Costo 1000 USD, valor 500 USD, no realizado −500 USD; cache conserva moneda real ARS |
| Venta 4×EUR 120 de lote EUR 100; EUR/USD 1,2 | Realizado 80 EUR y 96 USD, guardados en unidades distintas correctamente |
| Bono VN 1000 compra USD 100; vender VN 400 a USD 120 | Realizado USD 80 por factor 100 |
| Vender 7 con tenencia 6 | Rechazo antes de invocar el RPC |
| Precio manual activado sin valor | Rechazo antes de persistir |
| FX blue cero o faltante | Error explícito; no conversión 1:1 ficticia |
| FX EUR no disponible | Error de valoración; no costo/valor 0 inventados |
| Query de ventas falla | Error; no realizado 0 ficticio |

Cuando no existe precio actual ni cache, el código utiliza el precio de compra como **referencia**, no como cotización confirmada. La respuesta distingue `valuation_price_source`: live, manual, cache o purchase_reference y conserva la fecha correspondiente. La referencia respeta la moneda de compra; una cotización confirmada respeta la moneda real del proveedor también en bonos, y la almacena junto al precio cacheado. La interfaz debe exhibir esa fuente. Un fallo de FX impide presentar un total consolidado falso; no se declara un cálculo parcial implementado si la ruta responde con error.

Registrar compra/venta de una posición no mueve efectivo automáticamente. Se siguen operaciones externas; el usuario debe mantener el saldo efectivo de la cuenta conciliado mediante el flujo de movimientos/ajustes. Patrimonio incluye el efectivo declarado más las posiciones una sola vez; no representa custodia, ejecución de órdenes ni conciliación automática con un broker. Las pruebas de compra, venta completa, instrumentos argentinos, simulación y servicios reales del CSV requieren su ejecución de aceptación independiente.

#### 10.5.12.6 Coordinador recurrente e idempotencia

La clase `RecurringRulesJob` está en `lib/cron/recurring-job.ts`; la ruta `/api/cron/recurring` delega GET al patrón común que valida el Bearer. Antes de cargar las reglas activas, desactiva las vencidas con `end_date < fechaHoy`. La cuenta archivada se omite. La ocurrencia se identifica por el índice existente `idx_transactions_recurring_occurrence`, sobre `(user_id, recurring_rule_id, fecha civil Argentina de transaction_date)` en la migración 20260819.

La corrección inserta el movimiento antes de marcar `last_executed_date`. Un fallo de creación no consume la fecha. Un conflicto 23505 se trata como repetición sólo si se recupera la ocurrencia del mismo dueño/regla dentro de `[03:00UTC del día, 03:00UTC del siguiente)`. Si la marca falla después del INSERT, el siguiente intento recupera la fila y repara la marca sin otro débito. Sólo el creador envía el aviso. Movimiento/saldos son atómicos por el trigger; movimiento/marca no son una sola transacción y la recuperación depende del índice y reintento.

Los ocho tests reales verifican falla antes de crear sin marcar, orden crear→marcar, recuperación de ocurrencia existente, conflicto no relacionado, fallo de marca, Telegram caído, fin inclusivo/desactivación posterior y cuenta archivada. El coordinador se prueba con servicios controlados; la unicidad debe existir en la base desplegada. No existe outbox durable en este código. Una falla de Telegram se registra y no revierte el movimiento, pero no se promete reentrega persistente ni envío externo exactamente una vez.

La idempotencia recurrente no se generaliza a todos los registros manuales o callbacks del bot. Esas rutas tienen su propio protocolo y sus CP de aceptación. No se inventa `client_request_id` ni una restricción de unicidad ausentes en el esquema.

##### Cola offline: confirmación y retención

La unidad real `syncPendingTransactions(items, send, remove)` de `lib/offline-queue-sync.ts` procesa en orden y elimina un ítem sólo después de una respuesta satisfactoria. Doce pruebas de `offline-queue-sync.test.ts` aprobaron en la corrida general: dos ítems confirmados se envían/eliminan en orden; HTTP 400/401/403/408/409/422/429/500/503 conserva la cola y detiene el lote; pérdida de conexión tras el primero conserva el segundo; falla al borrar después del acuse detiene antes del siguiente y devuelve `failure=storage`. V8 cubrió 12/12 sentencias y 2/2 ramas del helper, con 1/1 función y 11/11 líneas.

`send` y `remove` son dobles controlados. Esta ejecución no utiliza IndexedDB ni la interfaz PWA, ni demuestra integración o deduplicación en el servidor. Si el servidor ya confirmó y se pierde el acuse o falla el borrado local, el ítem permanece para reintento; sin una clave persistente por comando, el reenvío puede repetir un movimiento. CNF-11 conserva esa aceptación pendiente por canal. Retener un rechazo evita perder un pendiente, pero no acredita entrega exactamente una vez.

#### 10.5.12.7 Caja negra, oráculos de IA y heurística

El CSV registra entrada, estado inicial, resultado esperado, tipo y evidencia requerida por CP. CSV y JSON se importan en fixtures independientes. Un resultado financiero “correcto” se sustituye por números: ARS 120000 + USD 100 a 1200 ARS/USD → ARS 240000 / USD 200; tres gastos Alimentos 500+700+800 del 1 al 6 de octubre inclusive → ARS 2000, excluyendo septiembre, otro usuario, ingresos y transferencias.

RF10 se compara por contenido semántico: monto, moneda, período, usuario y ausencia de modificaciones. No se exige una frase literal. Se prueban consulta por PWA/Telegram, ambigüedad, proveedor caído, historial vacío e instrucciones adversarias de acceso a otro usuario o modificación de datos. Un doble de Gemini o una prueba local de sanitización no acredita por sí solo la calidad de respuesta del proveedor real.

RF11 conserva el contrato del algoritmo revisado: heurística sin Gemini. Para anomalías, promedio de los tres meses calendario anteriores; ratio = gasto actual hasta la fecha de corte / promedio; alerta con ratio>=2. Una categoría sin promedio previo alerta sólo si supera ARS 5000. No se utiliza el 45 % ni la mediana 3× de propuestas anteriores. Las pruebas de corte usan fecha civil Argentina y excluyen registros futuros, montos no positivos y tipos no elegibles. La consulta está acotada desde 03:00UTC del primer día histórico hasta 03:00UTC del día posterior al corte, exclusivo; el helper convierte cada timestamp a fecha Argentina. No usa el prefijo UTC del ISO. Si falta una tasa, esa moneda se excluye y la API registra `partial`/`excludedCurrencies`; el widget muestra el aviso incluso cuando no quedan alertas. Por lo tanto, una lista vacía parcial no se interpreta como ausencia comprobada de anomalías. Ocho pruebas locales aprobaron las fronteras del helper; son evidencia de cálculo y no una corrida del widget/proveedor real.

La proyección usa ingresos/gastos de los tres meses completos previos, convertido explícitamente a ARS. Promedia los meses observados con movimientos elegibles y proyecta 3/6/12 meses desde el efectivo activo no deuda en ARS. Sin meses observados devuelve falta de datos. No se presenta como proyección de patrimonio multimoneda, ni se declara un algoritmo 90 d/30 d o suma futura de recurrentes que el código no implemente. Ejemplo diseñado: meses con ingresos 30000/33000/36000 y gastos 10000/12000/14000 → ingresos medios 33000, gastos 12000, ahorro 21000; efectivo ARS 50000 → proyección a 3 meses: 113000; 6 meses: 176000; 12 meses: 302000. Se excluyen el mes en curso, meses futuros y transferencias. El CSV y el reporte final identifican cuáles fixtures de RF11 fueron efectivamente ejecutados.

#### 10.5.12.8 Matriz requisito → CU → CP → evidencia

RF12–RF16 completan capacidades del alcance que antes no tenían requisito explícito. El texto del capítulo de requerimientos y los permisos Free/Premium deben coincidir con esta matriz. La política comercial objetivo permite en Free tres cuentas activas, movimientos manuales/transferencias, patrimonio/cotizaciones y exportación propia; Premium incluye las demás prestaciones del alcance. Esta matriz no acredita enforcement general de cupos o plan: debe comprobarse por ruta en servidor, además de la presentación de la interfaz.

| Requisito | CU / escenario | Pruebas de aceptación diseñadas | Evidencia actual / límite |
|---|---|---|---|
| RF01 Movimientos y compartidos | CU-001 Básico/A: 01/A: 08/A: 09 | CP1-01–13/33–38; CB-T | Regresiones 65 selectivas, SQL 28 y compartidos SQL 11 prueban partes; sistema/compartidos en sus reportes específicos |
| RF02 Cotizaciones | CU-003 Básico/E01 | CP3-01/02/03/19 | Converter financiero local; aceptación de proveedores/caché pendiente donde no hay reporte |
| RF03 Patrimonio | CU-003 Básico/A: 01/E02/E03 | CP3-04–08/18/19; CP4-12 | Oráculos diseñados; no acreditar dashboard sólo con cálculo de un helper |
| RF04 Cuentas | CU-002 Básico/A: 01/A: 02/A: 03 | CP2-01–05/19/20 | SQL de saldo/bimoneda acotado; ciclo de cuentas/API/RLS por sus CP |
| RF05 Inversiones | CU-004 Básico/A: 01–A: 04 | CP4-01–12; CB-P | Tests de servicio/P&L aprobados; RPC de venta y proveedores reales requieren ejecución y evidencia propias |
| RF06 Telegram captura | CU-001 A: 03 | CP1-14/15/16 | Diseño; corrida de captura/callback y resultado real pendientes si no se adjuntan |
| RF07 CSV/JSON | CU-001 A: 04; CU-002 A: 04 | CP1-19–22; CP2-06/07 | Import/export de transfer preserva crédito explícito; aceptación por formato requiere archivo y estado obtenidos |
| RF08 OCR | CU-001 A: 02 | CP1-17/18 | Diseño; imagen/hash, preview/edición y confirmación real requeridos |
| RF09 Recurrentes | CU-001 A: 05/A: 06 | CP1-23–30/35; CB-R | 20 tests calendario + 8 coordinador aprobados; base remota/cron/proveedor no acreditados por mocks |
| RF10 Consulta IA | CU-003 A: 02/A: 03 | CP3-09–12 | Diseño y pruebas locales específicas; falta evidencia de respuesta real donde no exista corrida |
| RF11 Heurísticas | CU-003 A: 04 | CP3-13–16 | Contrato alineado a código; resultados de helper en reporte general, sin equivaler a aceptación UI |
| RF12 Presupuestos | CU-001 A: 07 | CP1-31/32 | Oráculos diseñados; consultas/moneda/período necesitan obtenido |
| RF13 Acceso | CU-002 A: 05; transversal | CP2-08–10/21 | Auth/sesión/reset/RLS requieren evidencia por entorno; no inferir cifrado de una policy |
| RF14 Preferencias | CU-002 A: 06; CU-003 A: 05 | CP2-11/12; CP3-17 | Diseño; persistencia/aislamiento e importe intacto requeridos |
| RF15 Plan Premium | CU-002 A: 07; transversal | CP2-13–16/20 | Contratos/prestaciones; sandbox de pago/webhook/expiración y gates reales por sus reportes |
| RF16 Vínculo Telegram | CU-002 A: 05; CU-001 A: 03; CU-003 A: 03 | CP2-17/18; CP1-16; CP3-10 | Diseño; token de un uso/vencimiento/revocación e identidad requieren ejecución |
| RNF01 Desempeño p95<2 s | CU-003 Básico | CNF-01 | Perfil canónico de 10 cuentas/5000 movimientos/100 posiciones, 20 sesiones y 100 navegaciones; no medido |
| RNF02 Disponibilidad≥99,5% | Servicios CU-001–004 | CNF-02 | Sondeo autenticado cada 5 min, timeout 10 s, mes identificado y mantenimiento incluido; no medido |
| RNF03 Seguridad | CU-001–004 | CNF-03/04/10; CP2-19; CP3-11 | Cifrado, Auth/RLS y secretos se acreditan separadamente |
| RNF04 Responsive | CU-001–004 | CNF-05–08 | Capturas/acciones por viewport requeridas |
| RNF05 Navegadores | CU-001–004 | CNF-09 | Matriz Chrome/Firefox/Safari/Edge con versiones y resultados requerida |
| RNF06 Integridad monetaria | CU-001–004 | CNF-11; regresiones monetarias/cron y SQL | SQL 28, cron local y doce tests del helper offline prueban partes. Concurrencia/reintento por cada canal y venta/webhook requieren aceptación; no se generaliza unicidad del cron |
| RNF07 Recuperación RPO 24 h/RTO 4 h | CU-001–004 | CNF-12 | Diseñado; backup real y restauración medida en copia aislada pendientes |
| RNF08 Observabilidad | CU-001–004 | CNF-13 | Diseñado; nueve escenarios éxito/rechazo/falla con correlación y señuelos sensibles; sin obtenido |

La matriz no marca globalmente CUMPLE. Un caso parcialmente demostrado por SQL o un doble de servicio se identifica con ese alcance. El CSV incorpora filas de regresiones ejecutadas y mantiene los CP de producto pendientes cuando no hay obtenido. Los casos diseñados para una mejora no implementada deben indicar esa condición o retirarse del alcance final. El CSV contiene 273 registros: 149 casos diseñados y 124 registros seleccionados ejecutados aprobados (65 regresiones + 8 anomalías + 12 cola offline + 28 SQL financieras + 11 SQL compartidos). Estos 124 ya están incluidos en sus reportes correspondientes y no se suman al total 304 de Vitest.

#### 10.5.12.9 Cobertura y reproducibilidad

La unidad académica seleccionada para caja blanca es el calendario real. Se reporta sentencia alcanzada/instrumentada, rama alcanzada/instrumentada, condición simple verdadera/falsa y camino seleccionado. El objetivo de la unidad acotada es cubrir sus ramas instrumentadas; no se exige ni se afirma 100 % de toda la aplicación. Una condición imposible por precondiciones se justifica; no se marca ejecutada. El gate histórico>=90 % no reemplaza la medición de la rama final.

El reporte general conserva runner/provider, configuración include/exclude, archivos/unidades, totales y numeradores/denominadores. La medición final usa V8 y estos 15 archivos: las rutas anomalies/projections, billing/subscription-link, cron/recurring y webhooks/mercado-pago; los helpers financial-anomalies/financial-projections; billing/plans; cron/cron-job, recurring-job y recurring-schedule; import/csv; services/transactions, services/investments y lib/offline-queue-sync.ts. Se excluyen archivos fuera del conjunto configurado y los tests no constituyen el denominador de cobertura. El porcentaje no describe toda la aplicación ni es comparable directamente con la selección histórica v2.12.

| Métrica final / conjunto configurado | Cubierto / instrumentado | Porcentaje |
|---|---|---|
| Sentencias |659/1081|60,96%|
| Ramas |549/973|56,42%|
| Funciones |71/112|63,39%|
| Líneas |601/958|62,73%|
| Calendario: sentencias/ramas |37/37 y 30/30|100% de la unidad seleccionada|
| Cola offline: sentencias/ramas |12/12 y 2/2|100% del helper; dobles de envío/borrado|

La ruta de anomalías no fue invocada por los ocho tests puros: su cobertura instrumentada es 0%. El helper tiene 26/26 líneas, 28/29 sentencias y 33/40 ramas (82,5%). La corrección de consulta/aclaración visible fue inspeccionada, pero su aceptación autenticada continúa pendiente. No se sustituye ese límite por el 100% del calendario. Tests SQL se reportan aparte de Vitest porque no están instrumentados por V8. Las 65 regresiones selectivas, los ocho tests de anomalías y los doce de cola offline forman parte de la suite general y no se suman otra vez para inflar el número de pruebas aprobadas.

Para reproducir:

1. Identificar commit final y estado de cambios; registrar hashes de lockfile, fixtures, configuración y migraciones. Instalar desde lockfile y usar el runtime indicado por ese entorno.
2. Ejecutar `npm test` y `npm run test: coverage`, guardando comando, versión, fecha UTC/zona, salida/código de salida, JSON y reporte HTML/LCOV. Ejecutar `npm run test: db` para los scripts Postgre SQL WASM aislados; no ejecutar dbpush/reset de producción.
3. Restaurar fixtures por CP. Los tests de calendario controlan el reloj; los de servicio indican mocks y fallas inyectadas. Sandbox/proveedores/UI se ejecutan y reportan por separado.
4. Completar por caso entrada real, esperado, obtenido, recorrido, aprobado/fallido/omitido/bloqueado y evidencia con versión/fecha/ambiente. Una firma en blanco y una marca manual no sustituyen evidencia.
5. Medir RNF01 en el perfil canónico: Dashboard autenticado con 10 cuentas, 5000 movimientos y 100 posiciones; caché vigente; 20 sesiones concurrentes; red 20 Mbps/latencia 50 ms. Realizar al menos 100 navegaciones tras calentamiento en un ambiente equivalente al despliegue. Desde inicio de navegación a widgets financieros propios visibles, con login previo. Conservar duración y estado de cada carga, método de p95, p50/máximo y todas las fallas; objetivo p95<2000 ms. Registrar frío/proveedor caído aparte, sin excluir fallas silenciosamente.
6. Medir RNF02 durante un mes identificado, con sonda autenticada cada 5 min y timeout 10 s para acceso, consulta y registro manual. Disponibilidad=muestras satisfactorias/muestras programadas; meta≥99,5%, incluido mantenimiento. IA/cotizaciones se reportan por módulo y no convierten un registro manual exitoso en falla. En fixture de 30 días hay 8640 muestras: 43 no satisfactorias→99,5023148% (cumple); 44→99,4907407% (no cumple). Ausencias no cuentan como éxito. Son casos diseñados, sin medición real de producción.
7. Separar TLS/transporte y evidencia de cifrado en reposo de autorización RLS. Verificar los cuatro CU en 320×568, 375×812, 768×1024, 1440×900 y zoom 200 %, luego Chrome/Firefox/Safari/Edge con versiones/SO reales.
8. Ejecutar CNF-11 por canal con repetición y concurrencia: gasto 1500 sobre 10000→8500, transferencia A/B1500→8500/3500, importación 200+300→9500, cron 400→9600 y venta 4×120 de lote 10×100→remanente 6/realizado 80 USD. Conservar datos y errores de rollback. Estos son oráculos de aceptación; no acreditan idempotencia persistente de todos los canales.
9. Ejecutar CNF-12 con backup realmente disponible y restauración aislada. Fixture nominal RPO 23 h/RTO 3 h 30 min; fronteras 24 h/4 h cumplen, un segundo superior incumple. Registrar datos efectivamente recuperados/perdidos y tiempos, sin presumir backup diario por el nombre del proveedor.
10. Ejecutar CNF-13 con nueve intentos manual/cron/pago de éxito, rechazo y falla. Reconstruir correlación y resultado; comprobar ausencia de marcadores sintéticos de credencial/texto financiero/imagen y distinguir fallo de proveedor de inconsistencia.
11. Tras una corrección, repetir los casos afectados y los escenarios que compartan el riesgo; conservar las corridas anteriores y no retroatribuir un resultado al commit histórico.

#### 10.5.12.10 Estado del checklist de la cátedra

| Ítem | Evidencia disponible | Condición de cierre |
|---|---|---|
| test-0 Unidad/especificación | Firma real/calendario y contratos de transferencia/cartera inspeccionados | Conservar firma/fragmento/hash de la rama entregada |
| test-1 CFG | Grafo del código del calendario y explicación de sus bloques | Render final y enlace al código de la versión ejecutada |
| test-2 Criterio | Sentencias/ramas/condiciones/caminos distinguidos; criterio de ramas instrumentadas del calendario | V8: 30/30 ramas. Conservar contraste con CFG; condiciones/caminos no se atribuyen globalmente |
| test-3 Suite satisface criterio | 20 tests calendario con entradas/esperados/obtenido; regresiones adicionales | Tabla de recorrido y cobertura real; justificar ramas/condiciones pendientes |
| test-4 Medición | Reporte general 304/304, cobertura con configuración/denominadores, JSON selectivos y SQL reales | Evidencia local disponible; conservar los archivos junto con la revisión entregada |
| test-5 Normales/límites/fallas | Casos ejecutados positivos/fechas/montos/FX/reintento/errores SQL y servicios | Ejecutar CP restantes aplicables del producto |
| test-6 Reproducible | Scripts, fixtures y fecha/ambiente de las corridas locales | Registrar commit final, lockfile, hash, comandos y evidencia de entrega |
| test-7 Cada requisito demostrado | Matriz RF01–16/RNF01–08 sobre exactamente cuatro CU | Resultado/evidencia por aceptación del alcance; no cerrar RNF ni integraciones reales sólo con tests locales |

La defensa puede explicar con precisión las correcciones comprobadas y los límites de la evidencia. Los pendientes de aceptación o despliegue se mantienen visibles hasta su ejecución real.

## 11 Anexos y fuentes


### 11.1 Criterios de calidad

Los 59 enunciados del checklist oficial orientan el relevamiento de tecnología. Se distinguen existencia y coherencia de un artefacto, correspondencia con código, prueba ejecutada y revisión efectuada. Un diagrama presente no demuestra aceptación; un informe de cobertura no prueba rendimiento, disponibilidad o aislamiento real entre usuarios. Las referencias de cada criterio permiten encontrar evidencia o su pendiente concreto.

La prueba funcional usa particiones de entrada, límites y resultados observables. La prueba estructural identifica contratos, grafo de flujo, criterio, caminos y datos que los recorren. La cobertura se informa con su alcance y denominadores; no se interpreta la cobertura de un subconjunto como cobertura de todo ZARIX. El apunte de caja blanca de UNR es referencia metodológica para contratos y grafos. Las decisiones de herramienta mantienen la versión ejecutada y el comando reproducible.

### 11.2 Formatos y anexos reproducibles

El repositorio conserva las fuentes de diagramas y el informe de pruebas junto con la especificación revisada. La planilla ZARIX Modelo financiero v2.13 incluye supuestos, selector de escenario y caja de M0 a M24 con fórmulas. Los CSV de escenarios y casos de prueba permiten inspeccionar todos los registros. Los datos usados para pruebas son sintéticos y no constituyen resultados de ventas, entrevistas o un piloto de mercado.

Los formatos de importación y exportación deben conservar día civil, tipo, monto, moneda y referencias propias. El importador CSV admite comillas, separadores y saltos de línea dentro de una celda; el importador de un respaldo JSON usa los nombres y relaciones del respaldo para resolver únicamente cuentas y categorías propias. Un error de fila se informa sin transformarlo en una operación válida; las reglas de lote y los efectos confirmados se detallan en sus pruebas.

### 11.3 Bibliografía metodológica

- Vilaboa, Final Project Development Plan 2025. PDF suministrado por el autor, 20 páginas físicas. Guía para los puntos de negocio; sus recomendaciones facultativas se distinguen de requisitos de la cátedra.
- [Cátedra UAI, checklist SAP TFI 2026](https://cursos-uai.github.io/sap_tfi_2026/checklist.html).
- [Cátedra UAI, guías de dominio](https://cursos-uai.github.io/sap_tfi_2026/guias.html).
- [UNR FCEIA, teoría de diseño](https://www.fceia.unr.edu.ar/ingsoft/diseno-a.pdf).
- [UNR FCEIA, problemas de diseño](https://www.fceia.unr.edu.ar/ingsoft/problemasDiseno.pdf).
- [UNR FCEIA, práctica de diseño](https://www.fceia.unr.edu.ar/ingsoft/p-diseno.pdf).
- [UNR FCEIA, introducción al testing](https://www.fceia.unr.edu.ar/ingsoft/testing-intro-a.pdf).
- [UNR FCEIA, testing estructural](https://www.fceia.unr.edu.ar/ingsoft/testing-estruct-a.pdf).
- [UNR FCEIA, testing funcional](https://www.fceia.unr.edu.ar/ingsoft/testing-func-a.pdf).
- [UNR FCEIA, práctica de testing](https://www.fceia.unr.edu.ar/ingsoft/p-testing.pdf).
- Osterwalder, A. y Pigneur, Y. Business Model Generation, Wiley, 2010. Referencia de Business Model Canvas.

Las fuentes de mercado, precios, privacidad y plataforma se citan junto a los supuestos correspondientes en los capítulos de negocio y arquitectura. La fecha de consulta identifica la información verificada, sin convertirla en una garantía de precio o regla futura.

## Anexo A Evidencia de verificación de la revisión

La versión de código se basa en main 5cbd7ac984782b5f50e19f72ba7e0c3c8b5304fd y contiene las correcciones de esta revisión. Se conservaron los reportes de pruebas y sus configuraciones. Los resultados de la corrida general se consignan en A.6 y la versión del código en A.7. Los ambientes locales utilizaron datos sintéticos y credenciales ficticias; no se ejecutaron pagos reales ni se modificó la base productiva.

### A.1 Correcciones comprobables

- Saldo: UPDATE revierte todos los impactos OLD y aplica NEW; transferencias conservan el crédito exacto en el destino, sin depender de la tasa redondeada para reconstruirlo.
- Recurrentes: INSERT antes de la marca, recuperación de ocurrencia única y reintento sin perder la fecha cuando falla la persistencia. La notificación no tiene outbox durable.
- Gastos compartidos: registro y reparto se guardan mediante un RPC atómico que valida token y pertenencia; un error conserva el estado anterior.
- Importación: CSV con comillas y celdas multilineales; fechas imposibles rechazadas; respaldo JSON resuelve relaciones propias y el exportador conserva los dos importes de transferencia. El respaldo actual cubre cinco tablas y no equivale a restauración completa del producto.
- Proyección: tres meses calendario completos anteriores, con actividad; mes parcial y futuros excluidos; base de efectivo ARS identificada.
- Cobro del plan: precio explícito, plan inexistente rechazado y período anual de doce meses. Las pruebas usan un doble de la pasarela.
- Inversión: tasas inválidas rechazadas, resultado en moneda nativa correcto, error del historial visible y origen del precio distinguido en interfaz. Registro externo sin movimiento automático de caja.
- Cola sin conexión: sólo elimina el pendiente después de una respuesta exitosa; conserva rechazos HTTP y fallas de red, detiene el lote y permite reintentar. Ante fallo del almacenamiento después de confirmar, exige revisión antes de otra sincronización en la sesión actual. Doce pruebas del coordinador con dobles aprobaron; no acreditan IndexedDB/UI real ni idempotencia persistente del servidor.
- Plataforma: Next.js 15.5.27, Vitest 5.0.3 y dependencias actualizadas; gráficos diferidos se alojan en componentes cliente, conservando la obtención de datos en servidor.

### A.2 Migraciones y compatibilidad

Se prepararon tres migraciones incrementales: corrección del trigger, RPC atómico de gastos compartidos e importe destino autoritativo. Antes de desplegar el código dependiente deben aplicarse a una copia de ensayo y comprobar permisos, datos y saldos. El campo destino es nullable para históricos; el fallback conserva su comportamiento anterior. No se repararon ni revaluaron importes históricos automáticamente. Las pruebas SQL usan un esquema mínimo aislado de PostgreSQL 18.3 mediante PGlite 0.5.8; no acreditan todas las políticas RLS ni la migración sobre la totalidad de los datos productivos.

### A.3 Comprobación de interfaz local

En la ruta pública de demostración se abrió el formulario, se registró un gasto sintético de ARS 1.500 y se observó que cuenta y patrimonio disminuyeron exactamente 1.500. La pantalla indica que nada se guarda y permite reiniciar. Se comprobó también la pantalla de acceso sin introducir credenciales. Este recorrido verifica esa demostración; no prueba los cuatro CU autenticados ni servicios externos.

### A.4 Dependencias pendientes

La auditoría final identifica cero alertas críticas y cero moderadas. Permanecen siete entradas de severidad alta derivadas de la misma dependencia braces, usada por las herramientas de búsqueda de patrones de Tailwind/ESLint. La alerta no tiene versión corregida publicada al 6/10/2026. Se conservan patrones de compilación configurados por el proyecto y se evita aceptar patrones de archivos suministrados por usuarios en esas herramientas. Debe repetirse la auditoría y actualizar cuando exista una solución compatible; la existencia de esta limitación no se oculta como una auditoría sin alertas. [Aviso de seguridad de braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

### A.5 Pendientes antes de afirmar aceptación completa

Faltan recorridos autenticados integrales de los cuatro CU, pruebas de aislamiento real por RLS/grants, cargas y recuperación en un entorno identificado, verificaciones controladas de OCR/Telegram/Gemini/pago y la garantía persistente de idempotencia en los canales que todavía no la tienen. Los límites Free/Premium son hipótesis comerciales que requieren enforcement coherente si se decide comercializar. También faltan revisión de usuarios, conformidad RRR/PDR/CDR, datos administrativos confirmados y publicación/entrega accesible para la cátedra. Las tablas de seguimiento permiten registrar esos hechos cuando ocurran; no se fabrican firmas ni resultados.

### A.6 Resultado final de la corrida general

| Comprobación | Resultado |
|---|---|
| Suite Vitest 5.0.3 / Node 22.17.0 / npm 11.4.2 | 304/304 aprobadas en 32 archivos; inicio UTC 2026-10-07T00:45:34.693000+00:00 |
| SQL financiero PostgreSQL 18.3/PGlite 0.5.8 | 28/28 aprobadas, esquema mínimo aislado |
| SQL grupos compartidos | 11/11 aprobadas, operaciones y permisos del RPC aislado |
| Total SQL aislado | 39/39 aprobadas (28 financieras + 11 de compartidos); informado aparte de Vitest |
| TypeScript y lint | Aprobados sin errores |
| Compilación Next.js 15.5.27 | Aprobada con credenciales ficticias |
| Modelo financiero | 75 filas conciliadas; tres escenarios y cambio de un supuesto posterior recalculados; cero errores de fórmula |

Cobertura V8 del conjunto configurado, no de todo ZARIX:

| Métrica | Cubierto / instrumentado | Porcentaje |
|---|---|---|
| Sentencias | 659/1081 | 60,96% |
| Ramas | 549/973 | 56,42% |
| Funciones | 71/112 | 63,39% |
| Líneas | 601/958 | 62,73% |

La unidad académica calendario tiene 37/37 sentencias y 30/30 ramas cubiertas (100%); cuatro funciones y treinta líneas cubiertas. Esto satisface el criterio acotado de ramas instrumentadas del calendario. No demuestra todas las condiciones simples ni todos los caminos de la aplicación.

Archivos incluidos en cobertura:

- app/api/ai/anomalies/route.ts

- app/api/ai/projections/route.ts

- app/api/billing/subscription-link/route.ts

- app/api/cron/recurring/route.ts

- app/api/webhooks/mercado-pago/route.ts

- lib/financial-anomalies.ts

- lib/financial-projections.ts

- lib/billing/plans.ts

- lib/cron/cron-job.ts

- lib/cron/recurring-job.ts

- lib/cron/recurring-schedule.ts

- lib/import/csv.ts

- lib/services/investments.ts

- lib/services/transactions.ts

- lib/offline-queue-sync.ts

El total Vitest incluye las regresiones selectivas; no se suman otra vez. SQL se informa aparte. Las pruebas de contrato con dobles y el recorrido de la demostración no acreditan aceptación de los cuatro CU completos ni de las integraciones reales.

### A.7 Versión del código verificado

Repositorio `jeffreydtz/zarix`, rama `codex/tfi-v2-13-consistencia`, commit de código `98250f5dfb83bb88eeed241f80807a5770e4caaf`. El manifiesto SHA-256 de fuentes está en `docs/tif/v2.13/evidence/source-manifest.json`; las pruebas se ejecutaron sobre ese contenido antes de publicarlo. Los commits posteriores que sólo integran fuentes del plan y evidencia no modifican el código verificado. La base de comparación es `5cbd7ac984782b5f50e19f72ba7e0c3c8b5304fd`.

## Anexo B Archivos reproducibles

| Archivo de la entrega | Contenido | Límite de uso |
|---|---|---|
| ZARIX-Modelo-financiero-v2.13.xlsx | Supuestos editables, selector 1/2/3, caja M0–M24, VAN y TIR recalculados | Hipótesis de negocio; no ventas ni tasas fiscales confirmadas |
| modelo_financiero.csv | 75 filas, tres escenarios de 25 períodos | Se concilia con la planilla al centavo |
| matriz_negocio_v2.13.csv | Los 70 puntos de Vilaboa vinculados a secciones v2.13 y pendientes reales | Cobertura documental; no aprobación ni validación de mercado |
| guia_defensa_v2.13.md | Guion de 12 minutos, preguntas y oráculos sintéticos | Recorrido propuesto hasta que exista ensayo autenticado |
| casos_prueba.csv | Casos diseñados y resultados ejecutados distinguidos | Una fila diseñada no equivale a aceptación |
| Fuentes de diagramas | DOT y Mermaid correspondientes a las figuras | Código editable conservado con la entrega |
| Reportes de ejecución | JSON Vitest, LCOV y resumen de cobertura, SQL local | Alcance y ambiente identificados en anexo A |

El modelo opera sobre un único flujo seleccionado; cambiar Supuestos D5 recalcula el mismo flujo con el escenario elegido. Los componentes monetarios se redondean en centavos enteros para evitar divergencias de semicentavo por float binario. Se verificó la coincidencia de los 25 períodos y tres escenarios con un cálculo independiente Decimal, así como el cambio de un supuesto posterior a M12 y la ausencia de errores de fórmula. Los reportes se conservan junto al código revisado; las referencias locales no acreditan acceso del profesor a un repositorio privado.


La matriz de negocio conserva los 70 puntos de la guía Vilaboa y permite localizar su tratamiento en esta revisión. Las hipótesis de demanda, contratación y encuadre comercial mantienen sus acciones de validación; las aplicaciones no pertinentes al SaaS se justifican expresamente.

## Anexo C Seguimiento de los 59 criterios de la cátedra
Fuente: [Checklist SAP TFI 2026](https://cursos-uai.github.io/sap_tfi_2026/checklist.html). El estado documental no equivale a aprobación académica ni a aceptación de todo el producto. Las pruebas ejecutadas y sus límites figuran en el anexo A.
### Requerimientos
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| req-0 Funcionales identificados, numerados y sin decisiones de implementación Cada requisito expresa una capacidad observable. | 10.4.2 a 10.4.7; matriz RF/CU | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| req-1 No funcionales clasificados Considerar seguridad, desempeño, usabilidad, portabilidad y disponibilidad. | 10.4.2 a 10.4.7; matriz RF/CU | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| req-2 Alcance, actores y glosario acordados El vocabulario es consistente en todos los artefactos. | 10.4.2 a 10.4.7; matriz RF/CU | **Pendiente de validación.** El vocabulario está unificado; falta conformidad real sobre el alcance. |
| req-3 Cada requisito se vincula con casos de uso La matriz permite recorrer REQ → CU. | 10.4.2 a 10.4.7; matriz RF/CU | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| req-4 Al menos un criterio de aceptación por requisito Debe ser comprobable y describir el resultado esperado. | 10.4.2 a 10.4.7; matriz RF/CU | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Casos de uso y especificaciones
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| cu-0 Diagrama general con actores, casos y límite del sistema Cada actor persigue un objetivo claro. | 10.5.2 y 10.5.3; cuatro fichas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| cu-1 include y extend usados con sentido include es obligatorio reutilizado; extend, opcional o condicionado. | 10.5.2 y 10.5.3; cuatro fichas | **Preparado documentalmente.** No se extraen casos técnicos reutilizados; include/extend no aplican al modelo agregado de cuatro objetivos, según justificación 10.5.2. |
| cu-2 Una especificación por caso relevante Incluye objetivo, actor, precondiciones, disparador y postcondiciones. | 10.5.2 y 10.5.3; cuatro fichas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| cu-3 Curso básico escrito en voz activa Cada paso muestra actor, acción y respuesta del sistema. | 10.5.2 y 10.5.3; cuatro fichas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| cu-4 Alternativos, excepciones y reglas documentados Cada desvío tiene condición, respuesta y cierre. | 10.5.2 y 10.5.3; cuatro fichas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| cu-5 Hito RRR revisado con interesados Casos de uso, dominio y prototipo capturan los requerimientos. | 10.5.2 y 10.5.3; cuatro fichas | **Pendiente de validación.** RRR preparado; falta revisión fechada de los interesados. |
### Modelo de dominio
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| dom-0 Clases tomadas del lenguaje del negocio No incluye pantallas, controles ni detalles técnicos. | 10.5.4; DOM Conceptual | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| dom-1 Atributos conceptuales relevantes Evita claves foráneas y decisiones de persistencia. | 10.5.4; DOM Conceptual | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| dom-2 Relaciones y multiplicidades justificadas Cada asociación expresa un hecho del dominio. | 10.5.4; DOM Conceptual | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| dom-3 Nombres sin sinónimos ni ambigüedades El mismo concepto conserva su nombre. | 10.5.4; DOM Conceptual | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| dom-4 Modelo actualizado después de robustez Todas las entidades descubiertas aparecen en el dominio. | 10.5.4; DOM Conceptual | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Prototipo
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| ui-0 Pantallas y estados relevantes representados Incluye formularios, listados, mensajes, confirmaciones y errores. | 10.5.1; prototipos P01 a P12 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| ui-1 Cada pantalla se vincula con casos y actores La navegación materializa cursos básicos y alternativos. | 10.5.1; prototipos P01 a P12 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| ui-2 Controles y datos coinciden con las especificaciones No hay acciones huérfanas ni entradas faltantes. | 10.5.1; prototipos P01 a P12 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| ui-3 Prototipo revisado con usuarios Se registraron observaciones y decisiones. | 10.5.1; prototipos P01 a P12 | **Pendiente de validación.** Faltan participantes, observaciones y decisiones de una revisión real. |
| ui-4 Se usa como especificación, no como producto final Sirve para desambiguar y descubrir fronteras. | 10.5.1; prototipos P01 a P12 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Arquitectura
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| arch-0 Vistas funcional, de datos y del sistema separadas Cada una responde una pregunta arquitectónica. | 10.5.5 y 10.5.6; tres vistas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| arch-1 Componentes, capas, responsabilidades e interfaces visibles Las dependencias respetan el estilo declarado. | 10.5.5 y 10.5.6; tres vistas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| arch-2 Despliegue, nodos y tecnologías documentados Incluye persistencia e integraciones externas. | 10.5.5 y 10.5.6; tres vistas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| arch-3 Decisiones justificadas por requerimientos No se basan sólo en preferencias tecnológicas. | 10.5.5 y 10.5.6; tres vistas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| arch-4 Calidad y testing considerados Contempla cambio, seguridad, rendimiento y comprobabilidad. | 10.5.5 y 10.5.6; tres vistas | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Diagramas de robustez
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| rob-0 Un diagrama por caso de uso diseñado El texto se sigue frase por frase. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-1 Actor, Boundary, Control y Entity diferenciados Fronteras y entidades son sustantivos; controles, acciones. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-2 Reglas de comunicación respetadas Actor↔Boundary; Boundary↔Control; Entity↔Control. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-3 Una frontera clara por pantalla o interfaz Los nombres coinciden con prototipo y texto. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-4 Entidades consistentes con el dominio Toda entidad está en el modelo actualizado. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-5 Controles cubren cursos básicos y alternativos Sin asignar todavía métodos ni algoritmos. | 10.5.7; ROB CU001 a CU004 | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| rob-6 Hito PDR aprobado Texto, robustez, dominio, datos y arquitectura son consistentes. | 10.5.7; ROB CU001 a CU004 | **Pendiente de validación.** PDR preparado; falta aprobación académica registrada. |
### Diagramas de secuencia
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| seq-0 Un diagrama por caso de uso Incluye curso básico y alternativos. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| seq-1 Participantes derivados de robustez No aparecen objetos sin responsabilidad explicada. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| seq-2 Texto del caso mapeado a mensajes Orden, retornos, condiciones y ciclos son visibles. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| seq-3 Controles asignados a operaciones u objetos Cada mensaje llega al responsable del comportamiento. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| seq-4 Mensajes respetan arquitectura y patrones El detalle orienta la implementación. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| seq-5 Errores y resultados observables representados Las respuestas regresan a la frontera. | 10.5.8; fragmentos de cuatro familias | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Diagrama de clases
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| class-0 Clases con responsabilidades, atributos y operaciones Las operaciones surgen de secuencia. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-1 Tipos, visibilidad y firmas especificados Los contratos permiten comprender la colaboración. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-2 Relaciones y multiplicidades correctas Herencia y composición tienen necesidad demostrable. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-3 Alta cohesión y bajo acoplamiento revisados Cada clase protege un secreto coherente. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-4 Interfaces aíslan decisiones que pueden cambiar Se aplica ocultamiento de información. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-5 Consistencia con dominio, secuencias y código No faltan ni sobran elementos sin trazabilidad. | 10.5.9; vistas de dominio y aplicación | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| class-6 Hito CDR aprobado Diseño completo, correcto, realizable y alineado. | 10.5.9; vistas de dominio y aplicación | **Pendiente de validación.** CDR preparado; falta aprobación académica registrada. |
### Patrones de diseño
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| patterns-0 Cada patrón resuelve un problema concreto Se explica contexto y necesidad. | Anexo D; estructura y colaboración | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| patterns-1 Participantes y colaboraciones identificados Las clases del TP se mapean a roles. | Anexo D; estructura y colaboración | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| patterns-2 Clases reflejan la estructura del patrón No es sólo un ejemplo genérico copiado. | Anexo D; estructura y colaboración | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| patterns-3 Secuencias reflejan su comportamiento Los mensajes muestran un escenario real. | Anexo D; estructura y colaboración | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| patterns-4 Alternativas, beneficios y costos documentados Evalúa acoplamiento, extensión y complejidad. | Anexo D; estructura y colaboración | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
### Testing estructural
| Criterio oficial | Referencia | Estado y evidencia |
|---|---|---|
| test-0 Unidad, especificación y dominio de entrada definidos Cada caso usa valores concretos y salida esperada. | 10.5.12; anexo A; casos CSV y reportes | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| test-1 Grafo de flujo de control construido Nodos, decisiones y flechas corresponden al código. | 10.5.12; anexo A; casos CSV y reportes | **Preparado documentalmente.** CFG del calendario extraído del código revisado; los grafos de contratos adicionales se identifican como diseño cuando no tienen instrumentación real. |
| test-2 Criterio de cobertura declarado Distingue sentencias, ramas, condiciones y caminos. | 10.5.12; anexo A; casos CSV y reportes | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| test-3 Conjunto de pruebas satisface el criterio Vincula entrada, camino, esperado y obtenido. | 10.5.12; anexo A; casos CSV y reportes | **Verificado en unidad acotada.** Se mide el conjunto configurado y la unidad calendario; la cobertura no acredita todo el sistema ni equivale a cubrir condiciones o todos los caminos. |
| test-4 Cobertura medida y evidencia adjunta Incluye reporte o cálculo verificable. | 10.5.12; anexo A; casos CSV y reportes | **Verificado en unidad acotada.** Se mide el conjunto configurado y la unidad calendario; la cobertura no acredita todo el sistema ni equivale a cubrir condiciones o todos los caminos. |
| test-5 Casos normales, límites y fallas incluidos La selección busca revelar defectos. | 10.5.12; anexo A; casos CSV y reportes | **Preparado documentalmente.** Artefacto incorporado y contrastado con la especificación y fuente de esta revisión. |
| test-6 Pruebas re-ejecutables y resultado registrado Documenta ambiente, versión, fecha y estado. | 10.5.12; anexo A; casos CSV y reportes | **Preparado documentalmente.** Comandos, versión, ambiente, fecha y reportes conservados para las ejecuciones locales de la revisión. |
| test-7 Trazabilidad hasta TEST comprobada Una prueba demuestra cada requisito del alcance. | 10.5.12; anexo A; casos CSV y reportes | **Pendiente de validación.** Existe diseño REQ→CU→TEST; faltan ejecuciones funcionales integrales y RNF para demostrar todos los requisitos. |
## Anexo D Patrones y evidencia de diseño

La inspección estática de main `5cbd7ac` identifica Strategy y la normalización Adapter en `lib/services/cotizaciones.ts`, y TemplateMethod en `lib/cron/cron-job.ts` y `lib/cron/recurring-job.ts`. La lectura acredita estructura y colaboración de código; no acredita éxito de APIs ni pruebas ejecutadas. Facade se conserva como decisión de coordinación de la consulta, sin declararla una clase aplicada si la composición efectiva está distribuida en las rutas. Las vistas de estructura son PATRONES-Cotizaciones.dot y PATRONES-Cron.dot; las secuencias son SEC-StrategyAdapter.mmd y SEC-TemplateMethod.mmd. Cada colaboración se presenta por separado para lectura impresa. El criterio de descomposición por secretos y cambios se apoya en [Diseño de Software, Cristiá](https://www.fceia.unr.edu.ar/ingsoft/diseno-a.pdf) y [ejercicios](https://www.fceia.unr.edu.ar/ingsoft/p-diseno.pdf).

### D.1 Strategy: elección de una fuente de cotización

Problema: una fuente puede caer o no ofrecer el par/tipo requerido, y nuevas fuentes deben incorporarse sin acoplar a Dashboard o Portafolio a sus formatos. Context: CotizacionesService. Strategy: DolarRateProvider, operación `fetch(): Promise<Record<string, DolarQuote>>`. ConcreteStrategy: CriptoYaProvider, DolarApiProvider y DbCacheProvider. Cotizaciones mantiene composición con una lista ordenada y realiza la selección; el resultado incluye fuente y estado.

Colaboración: ConsultaFinanciera llama `resolver`; Cotizaciones consulta proveedores en orden hasta un resultado válido; si sólo hay referencia persistida devuelve respaldo; si no hay ninguna devuelve no disponible. La normalización corresponde a Adapter y la política de orden corresponde a Strategy. La iteración de fallback es una colaboración explícita, no prueba de que se haya implementado además otro patrón GoF. Alternativa: condicionales concretos en cada consumidor; menor número de clases inicial, mayor duplicación y costo al cambiar fuentes. Costo del diseño: interfaz, adaptadores, pruebas por proveedor y configuración de prioridad.

### D.2 Adapter: normalización de la respuesta externa

Problema: cada API tiene campos, timestamps y unidades propios. Target: DolarRateProvider. Adapter: CriptoYaProvider y DolarApiProvider; Adaptee: cliente HTTP del proveedor real. Operación: validar el esquema, rechazar datos imposibles y traducir a DolarQuote con tipo, compra, venta y timestamp, conservando la convención bid/ask→buy/sell o compra/venta→buy/sell.

Colaboración: la estrategia ejecuta su cliente, traduce la respuesta o devuelve error; Cotizaciones y Conversion reciben un contrato uniforme. Agregar un proveedor modifica su adaptador y configuración, sin trasladar JSON al dominio. Alternativa: traducir en Dashboard/Portafolio; se rechaza por duplicación y discrepancias de conversión. Costo: mantener versiones de contratos externos y fixtures de normalización. No se confunde un DTO con un Adapter si no existe la traducción colaborativa.

### D.3 Facade: consulta consolidada del dashboard

Problema: la frontera necesita saldos, posiciones, cotizaciones, conversiones y estados coherentes en un resultado. Facade: ConsultaFinanciera; subsistemas: LecturaFinanciera, Cotizaciones, Conversion y ResumenMovimientos; Client: Dashboard/Detalle. `dashboard(ctx, preferencias): ResultadoDashboard` conserva componentes y metadatos para reconstrucción.

Colaboración: Dashboard llama una operación; ConsultaFinanciera obtiene snapshot autorizado, resuelve referencias y construye totales/estados; devuelve el resultado a la frontera. La fachada coordina, sin absorber algoritmos de costo, identidad o RF11. Alternativa: llamadas independientes desde widgets; permite carga incremental, pero favorece snapshots incoherentes y reglas duplicadas. Costo: contrato de lectura y coordinación; pueden mantenerse cargas progresivas siempre que compartan fecha/identidad y estado de cálculo.

### D.4 TemplateMethod: ejecución común de tareas programadas

Problema: recurrentes, cotizaciones y otros jobs comparten validación de credencial, cliente de servicio, resultado y tratamiento de errores, pero procesan datos distintos. AbstractClass: CronJob; template `run(request)` verifica bearer, crea cliente, invoca `execute`, uniforma salida y alerta ante fallos. IterativeCronJob<TItem> implementa execute con fetchItems, beforeAll, shouldProcess, processItem y afterAll. ConcreteClass de CU-001: RecurringRulesJob, que implementa selección, calendario y creación de movimiento.

La ruta instancia un job nuevo por solicitud y llama run; la base delega a la subclase sin que ésta repita autenticación. El ciclo acumula processed/errors y un error de ítem no cancela silenciosamente todo el lote. Este patrón está estructuralmente evidenciado en los archivos leídos. Alternativa: handlers con boilerplate repetido; costo menor al inicio, pero errores y autorización divergen. Costo de herencia: respetar el contrato de hooks y no sobrescribir run ni compartir estado mutable entre ejecuciones. Su existencia no garantiza recuperación de una ocurrencia reclamada antes de una creación fallida; esa corrección se trata en RNF06 y en la regla RN06.

### D.5 Variaciones no atribuidas

No se llaman Observer al trigger o a una pantalla React por su sola existencia. No se declara Repository al acceso mediante servicios. El ciclo de vida del cliente Supabase se documenta por contexto, no como Singleton global de identidades. Strategy, Adapter y TemplateMethod tienen participantes y colaboraciones estáticas evidenciadas; Facade es una decisión de coordinación. La aprobación académica y resultados de prueba se registran sólo cuando ocurran.

![PATRONES-Cotizaciones](figures/PATRONES-Cotizaciones.svg)
![PATRONES-Cron](figures/PATRONES-Cron.svg)
![SEC-StrategyAdapter](figures/SEC-StrategyAdapter.svg)
![SEC-TemplateMethod](figures/SEC-TemplateMethod.svg)
