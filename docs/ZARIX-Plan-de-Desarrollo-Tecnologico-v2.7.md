# ZARIX – Plan de Desarrollo Tecnológico (TIF UAI)

**Versión:** 2.7 · **Autor:** Jeffrey Dietz · **Última actualización:** Agosto 2026

> Fuente editable del TIF. Diagramas: `docs/tif/diagrams/`. Evidencia código: `docs/EV-COD-zarix.md`.


Facultad de Tecnología Informática

ZARIX

App de Finanzas Personales para Argentina

Plan de Desarrollo Tecnológico

Seminario de Trabajo Final

Trabajo Integrador Final


# Ficha de Seguimiento y Revisión


## Cambios del Autor


## Revisiones


## Descripción del Documento


# Índice General

(Para ver los números de página, hacé clic derecho sobre el índice en Word y elegí “Actualizar campo”.)

Índice: clic derecho → Actualizar campo.


# A. Resumen Ejecutivo

Zarix es una aplicación web progresiva (PWA) de finanzas personales diseñada nativamente para Argentina. En un país con inflación estructural, múltiples tipos de cambio y alto ahorro en dólares y criptomonedas, no existe hoy una herramienta local que refleje la realidad financiera del usuario. Las soluciones internacionales como Mint o YNAB ignoran el dólar blue, el cepo y el Merval; las locales abordan segmentos aislados — inversiones, pagos o presupuesto — sin integrarlos. Zarix resuelve esa brecha.

La plataforma unifica la gestión de patrimonio en ARS, USD, USDT, BTC y ETH; el registro de gastos e ingresos; un dashboard con cotizaciones en tiempo real (oficial, blue, MEP, CCL y crypto); y un portafolio de inversiones con acciones del Merval y mercados USA. Sus diferenciales clave son el bot de Telegram para carga instantánea de movimientos y el parseo automático de tickets por imagen mediante OCR — dos funcionalidades que eliminan la fricción que históricamente destruye la adopción sostenida de este tipo de apps.

El proyecto está en desarrollo activo, construido en solitario sobre Next.js y Supabase con arquitectura PWA, accesible desde cualquier dispositivo sin instalación. Los módulos de Dashboard, Movimientos, Cuentas, Inversiones, Presupuestos y Recurrentes se encuentran operativos, junto con el bot de Telegram, el asistente de IA (Google Gemini) y la facturación por suscripción vía Mercado Pago. El stack fue elegido deliberadamente para minimizar costos operativos y maximizar velocidad de iteración en esta etapa.

El modelo de negocio es freemium: funcionalidades core gratuitas y plan premium a USD 5–10/mes, con escalabilidad hacia integraciones bancarias, alertas inteligentes y herramientas de asesoramiento financiero. El mercado objetivo son adultos de 25 a 45 años con ingresos medios-altos que ya gestionan sus finanzas en apps genéricas o planillas, pero sin una solución local integrada. El mercado accesible inicial supera los 2 millones de personas, con proyección de 7.000 usuarios y 560 suscriptores premium al mes 24.

La inversión inicial es inferior a USD 100, con costos operativos de USD 10–20/mes en los tiers gratuitos de Supabase y Vercel. El punto de equilibrio se alcanza con apenas 7 a 10 suscriptores del plan pago — menos del 10% del objetivo proyectado al primer año — lo que otorga al proyecto un margen de seguridad financiero considerable desde etapas tempranas.


# B. Plan de Negocios


# 1. Descripción General


## 1.1 Descripción Básica del Negocio

Zarix es un proyecto de base tecnológica clasificable como E-Business de tipo B2C (Business to Consumer), en la modalidad de Software como Servicio (SaaS) con acceso vía web y aplicación móvil progresiva. El negocio consiste en proveer una plataforma digital de gestión de finanzas personales adaptada al contexto argentino, que integra en un único panel el seguimiento de activos en múltiples monedas, movimientos del día a día, inversiones bursátiles y cotizaciones en tiempo real.

A diferencia de soluciones internacionales como Mint o YNAB, Zarix está construido con el dólar blue, el cepo cambiario y el Merval como variables nativas del sistema, no como apéndices o integraciones externas.


## 1.2 Situación Actual del Negocio

El proyecto se encuentra en fase de beta previa al lanzamiento público. Los módulos core — Dashboard, Movimientos, Cuentas, Inversiones, Presupuestos, Recurrentes y Análisis — están implementados y operativos, al igual que el bot de Telegram, el asistente de IA (Google Gemini) y la facturación por suscripción vía Mercado Pago. La arquitectura (Next.js + Supabase) está desplegada en producción sobre Vercel.


## 1.3 ¿Qué Hace Único a Zarix?

Diseñado nativamente para Argentina: soporte de dólar blue, MEP, CCL y oficial como ciudadanos de primera clase

Integración con bot de Telegram para registro instantáneo de gastos sin abrir la app

Parseo de tickets por imagen con OCR (Google Gemini multimodal, chatWithImage): sacar foto al ticket y Zarix lo registra automáticamente

Portafolio unificado: efectivo, bancos, crypto y acciones en un solo lugar con P&L en tiempo real

PWA optimizada para mobile: experiencia nativa sin fricción de descarga


## 1.4 Factores Principales de Éxito

Profundo conocimiento del contexto económico argentino como ventaja diferencial insuperable para competidores internacionales

Stack tecnológico moderno que permite iterar rápido y mantener costos bajos

Modelo freemium que elimina la barrera de entrada y permite crecer la base de usuarios antes de monetizar

Bot de Telegram como canal de adquisición orgánico en comunidades de finanzas y cripto

Posibilidad de crecer hacia integraciones con bancos locales (Mercado Pago, Naranja X, Ualá)


## 1.5 Estrategia: Misión, Visión y Propósito Estratégico


### Misión

Empoderar a los argentinos para que tomen decisiones financieras inteligentes, brindándoles una herramienta simple, rápida y adaptada a su realidad económica.


### Visión

Ser la aplicación de finanzas personales de referencia en Argentina y Latinoamérica para usuarios que navegan economías complejas con múltiples monedas.


### Propósito Estratégico

Construir el producto mínimo viable más completo posible con recursos mínimos, validar el product-market fit con los primeros 500 usuarios y luego escalar con funcionalidades premium como integración bancaria automática y asesoramiento con IA.


## 1.6 Identificación de la Oportunidad de Negocio

Argentina tiene más de 45 millones de habitantes con una cultura financiera creciente forzada por la inflación. Según datos del BCRA (2024), el 70% de los argentinos ahorra en dólares y más del 30% tiene algún activo en criptomonedas. Sin embargo, las apps de finanzas personales disponibles localmente son escasas, desactualizadas o simplemente no consideran el tipo de cambio paralelo como variable central. Existe una brecha clara entre la sofisticación financiera del usuario argentino y las herramientas disponibles.


## 1.7 Capacidades Centrales

Desarrollo full-stack con Next.js, React y Supabase (PostgreSQL + Auth + Storage)

Conocimiento profundo del sistema financiero argentino: tipos de cambio, instrumentos de inversión, regulaciones

Capacidad de integración con APIs externas (cotizaciones, mercados financieros, servicios de IA para OCR)

Desarrollo de bots de Telegram para automatización de procesos


## 1.8 Propuesta de Valor para el Cliente

Zarix le permite al usuario argentino ver en 30 segundos cuánto vale su patrimonio real hoy, expresado en la moneda que él elija (ARS o USD), considerando el dólar al que realmente puede comprar y vender.


## 1.9 Valores Nucleares de la Organización

Transparencia: sin letra chica, sin manipulación de datos del usuario

Simplicidad: cada feature debe poder usarse en menos de 3 toques

Localismo: primero Argentina, siempre Argentina

Privacidad: los datos del usuario no se venden ni se comparten


## 1.10 Enfoque e Iniciativas Estratégicas

Fase 1 (0–6 meses): Completar el MVP con los 5 módulos core, lanzar en beta cerrada con 50 usuarios, iterar basado en feedback.

Fase 2 (6–12 meses): Lanzamiento público, activación del plan premium (facturación vía Mercado Pago implementada), crecimiento orgánico vía comunidades de finanzas personales en redes sociales.

Fase 3 (12–24 meses): Integración con Mercado Pago y billeteras virtuales, funcionalidades de IA para análisis predictivo de gastos.


## 1.11 Áreas Clave de Resultados

Adquisición de usuarios: primeros 500 en 6 meses, 2.000 al año

Conversión freemium a premium: objetivo del 8–10% de la base activa

Retención mensual: objetivo superior al 60%

NPS (Net Promoter Score): objetivo > 40


## 1.12 Ingreso al Sector: Estrategias de Inserción

Se adoptará una estrategia de diferenciación (Porter) basada en la especialidad local y la integración de canales no convencionales (Telegram, OCR). El ingreso al mercado seguirá una estrategia de nicho (Kotler): apuntar primero a early adopters de finanzas personales y comunidades de crypto/inversiones en Argentina, para luego expandirse al público general.


# 2. Análisis Estratégico


## 2.1 Análisis de Contexto


### 2.1.1 Descripción del Escenario Local

El proyecto se lanzará desde Rosario, Santa Fe, con alcance nacional desde el día uno al ser una solución digital. Argentina presenta un escenario de alta volatilidad económica que, paradójicamente, genera una alta demanda de herramientas de gestión financiera personal.


### 2.1.2 Factores Económicos

La inflación acumulada en Argentina supera el 200% anual en los últimos años, lo que obliga a los ciudadanos a seguir de cerca el valor de sus activos. La existencia de múltiples tipos de cambio (oficial, blue, MEP, CCL) genera complejidad que ninguna app internacional resuelve adecuadamente. La dolarización del ahorro y el crecimiento del mercado cripto local son tendencias consolidadas.


### 2.1.3 Factores Políticos

El marco regulatorio financiero argentino es cambiante. Las restricciones al acceso al dólar oficial y las normativas del BCRA sobre tenencia de divisas condicionan el comportamiento financiero de los usuarios. Sin embargo, Zarix no opera como entidad financiera sino como herramienta de registro y visualización, por lo que su exposición regulatoria es baja.


### 2.1.4 Factores Tecnológicos

Argentina cuenta con alta penetración de smartphones (75%+) y conectividad a internet. El ecosistema de APIs financieras es creciente (DolarApi y CriptoYa para cotizaciones locales; Yahoo Finance y CoinGecko para mercados y cripto). Los servicios cloud como Supabase y Vercel ofrecen tiers gratuitos generosos que permiten operar con inversión mínima.


### 2.1.5 Escenario Meta

El escenario meta para Zarix es un contexto de estabilización relativa donde los usuarios consolidan hábitos de ahorro e inversión más sofisticados, aumentando la demanda de herramientas de gestión patrimonial. Incluso en escenarios de mayor volatilidad, la necesidad de seguimiento financiero se intensifica.


### 2.1.6 Análisis Sectorial – Oportunidades y Amenazas


## 2.2 Análisis de la Competencia


### 2.2.1 Principales Competidores Directos


### 2.2.2 Análisis de Cadena de Valor

La cadena de valor de Zarix incluye: (1) Adquisición de datos de cotizaciones externas (APIs públicas), (2) Procesamiento y normalización en el backend (route handlers serverless de Next.js en Vercel), (3) Almacenamiento seguro de datos del usuario (PostgreSQL en Supabase), (4) Renderizado en el frontend (Next.js PWA), (5) Canales alternativos de entrada (Bot Telegram, OCR de tickets), (6) Soporte y comunidad (Discord/Telegram).


### 2.2.3 Factores Críticos de Éxito (FCE)

Velocidad de respuesta del dashboard (cotizaciones en <2 segundos)

Precisión de las cotizaciones del dólar blue y paralelos

Facilidad de registro de movimientos (máximo 3 pasos)

Confiabilidad y uptime del servicio (>99.5%)

Actualización continua del producto según cambios regulatorios


### 2.2.4 Fortalezas y Debilidades del Negocio


# 3. Análisis FODA


## 3.1 Cuadro FODA


## 3.2 Análisis de FODA

La principal fortaleza de Zarix —su diseño nativo para Argentina— es también su mayor protección frente a competidores internacionales, ya que replicar el conocimiento del sistema financiero local requiere tiempo y profundidad que los grandes jugadores globales no priorizan para un mercado de 45 millones de personas. La debilidad del equipo unipersonal se mitiga con una arquitectura que minimiza la deuda técnica y prioriza funcionalidades de alto impacto.


## 3.3 Conclusión: Atractivo de la Industria y Fortalezas del Negocio

La industria de fintech personal en Argentina es altamente atractiva por la combinación de alta necesidad (contexto económico complejo), baja oferta especializada local y creciente cultura financiera. Las fortalezas del negocio son sólidas para la fase inicial: bajo costo, alta diferenciación y conocimiento del cliente. El riesgo principal es la ejecución en solitario, mitigable con una hoja de ruta clara y alcance acotado del MVP.


# 4. Segmentación


## 4.1 Segmentación de Consumidores

El mercado se segmenta en tres grupos principales, priorizados en orden de adquisición:


## 4.2 Grupos Diferenciados de Consumidores


## 4.3 Potenciales Usuarios/Compradores

El público primario son adultos de 25 a 45 años, residentes en centros urbanos (Buenos Aires, Rosario, Córdoba), con nivel educativo universitario o terciario, que ya utilizan homebanking y al menos una billetera virtual. Son usuarios de smartphone activos con más de 3 horas de uso diario y participan en comunidades de finanzas en Twitter/X, Reddit (r/argentina, r/merval) o grupos de Telegram.


## 4.4 Pautas de Comportamiento Esperado

Frecuencia de uso: diaria o cada 2-3 días para revisar el dashboard

Registro de movimientos: 3-5 por semana, principalmente desde mobile

Uso del bot de Telegram: principalmente para gastos rápidos en el momento de la compra

Revisión de portafolio: 1-2 veces por semana, con mayor actividad en días de alta volatilidad


# Business Model Canvas


## Marco Teórico

El Business Model Canvas (BMC) fue creado por Alexander Osterwalder y Yves Pigneur (Business Model Generation, 2010). Es una herramienta estratégica que permite visualizar, diseñar y analizar el modelo de negocio de una organización en nueve bloques interconectados sobre una sola página.

Los nueve bloques se agrupan en cuatro dimensiones: (1) Oferta — la Propuesta de Valor en el centro; (2) Clientes — Segmentos, Relaciones y Canales a la derecha; (3) Infraestructura — Socios, Actividades y Recursos Clave a la izquierda; (4) Finanzas — Estructura de Costos y Vías de Ingreso en la base. El orden recomendado para completarlo es: Segmento de Clientes → Propuesta de Valor → Canales → Relaciones → Vías de Ingreso → Recursos Clave → Actividades Clave → Socios Clave → Estructura de Costos.


## Business Model Canvas — Zarix


Nota metodológica: el BMC fue completado partiendo del Segmento de Clientes y la Propuesta de Valor como bloques ancla, dado que Zarix es un producto existente en desarrollo. Los datos provienen de las secciones 1 a 8 del presente Plan de Desarrollo Tecnológico.


## Análisis de los 9 Bloques


### 1. Segmento de Clientes

Zarix se diseña principalmente para el segmento de argentinos de 25-45 años, urbanos, que nunca organizaron sus finanzas de forma estructurada y que necesitan que el producto los lleve de la mano. Ahorristas en dólares (70% según BCRA 2024), freelancers con flujos en múltiples monedas, e inversores principiantes en CEDEARs o crypto. De forma secundaria, Zarix también sirve a usuarios avanzados que ya manejan sus finanzas con sofisticación y buscan una herramienta poderosa que les ahorre tiempo.


### 2. Propuesta de Valor

La propuesta tiene cuatro capas integradas: (1) administración unificada de todo el patrimonio (pesos, dólares, crypto, acciones, CEDEARs) con cotizaciones reales del mercado argentino; (2) eliminación de la fricción cotidiana — lo que siempre fue una planilla manual y tediosa ahora es automático mediante el bot de Telegram, OCR de tickets y transacciones recurrentes; (3) un asistente financiero personal con IA que conoce tus números reales, te habla en lenguaje natural y te marca cosas proactivamente; (4) detección inteligente que analiza tus fallas y te propone planes concretos — si querés hacer un gasto grande, el asistente te dice qué ajustar y en cuánto tiempo lo lográs.

El posicionamiento es “intuitivo para el que no sabe nada, potente para el que sabe todo”. La capa de superficie es radicalmente simple (onboarding sin configuración, el asistente habla primero); la profundidad está disponible para el power user que quiera explorar P&L, reglas complejas, exportación y análisis técnico.


### 3. Canales

Distribución D2C mediante PWA accesible en zarix.app — sin app store, sin fricción de instalación. Adquisición orgánica a través de influencers tech y de finanzas (creadores de contenido sobre dólar, inversiones y crypto), comunidades de Reddit (r/merval, r/argentina), grupos de Telegram, Twitter/X con hilos educativos, lanzamiento en Product Hunt, y SEO/blog sobre finanzas personales en Argentina.


### 4. Relación con Clientes

Self-service con onboarding guiado: simple y acompañado para el principiante. El asistente IA es la relación central — proactivo, conoce el contexto del usuario y le propone acciones. El bot de Telegram funciona como canal conversacional cotidiano de soporte y registro.


### 5. Vías de Ingreso

Modelo freemium: Plan Free (gratuito) con dashboard, movimientos y cotizaciones básicas para generar masa crítica rápida; Plan Premium (USD 5-10/mes facturado en ARS al TC oficial) con asistente IA, bot de Telegram, inversiones, OCR, recurrentes y analítica avanzada. Proyección año 1: 2.000 usuarios con 8% de conversión = USD 1.200/mes. Fuentes secundarias planificadas: alianzas con fintechs locales y modelo B2B white-label para asesores financieros independientes.


### 6. Recursos Clave

Stack Next.js 14 + Supabase + Tailwind CSS + Google Gemini como motor de IA. El recurso más difícil de replicar es el conocimiento profundo del sistema financiero argentino (tipos de cambio, instrumentos, regulaciones, cultura del usuario). Bot de Telegram como activo de canal y experiencia. Founder asumiendo roles de PM, dev y UX en fase inicial.


### 7. Actividades Clave

Desarrollo iterativo de la PWA y del asistente IA con contexto del usuario (el diferencial técnico-funcional). Detección de patrones, anomalías y proyecciones financieras personalizadas. Adquisición orgánica de usuarios mediante influencers y comunidades fintech. Gestión continua de las integraciones con APIs de cotización.


### 8. Asociados Clave

Los socios se dividen en dos categorías. Asociados blandos (estratégicos de negocio): fintechs locales (Mercado Pago, Ualá, Naranja X) para futuras integraciones de pago e inversión, influencers tech y finanzas como red de distribución, y comunidades fintech (Reddit, Telegram). Asociados tecnológicos: Supabase, Vercel y Google Gemini como proveedores de infraestructura e IA, APIs de cotización (DolarApi, CriptoYa, CoinGecko) y Yahoo Finance para precios de mercado.


### 9. Estructura de Costos

Estructura lean dominada por servicios SaaS con tiers gratuitos: costos tecnológicos (Supabase, Vercel, dominio, APIs), costos de IA (tokens de Gemini para usuarios que no traen su propia API key), y costos operativos (desarrollo, marketing orgánico, soporte). Total Fase 1 (MVP): USD 12-50/mes.


# 5. Plan de Acción


## 5.1 Programas Generales de Acción

El plan de acción se estructura en fases alineadas con hitos de producto y de negocio:


## 5.2 Programas Específicos de Acción


# 6. Plan de Marketing


## 6.1 Objetivos

Alcanzar 500 usuarios registrados en los primeros 6 meses post-lanzamiento

Lograr una tasa de conversión al plan premium del 8% en el primer año

Posicionar Zarix como la app de referencia en comunidades argentinas de finanzas personales


## 6.2 Resultados Esperados en Materia de Cobertura y Participación

Se proyecta una base de 2.000 usuarios al cierre del primer año, con un 10% activo diariamente. La cobertura inicial será nacional, con concentración en AMBA, Rosario y Córdoba.


## 6.3 Metas de Posicionamiento

Zarix debe ser reconocida como ‘la app que entiende al argentino’: rápida, confiable y que no necesita configuración para mostrar el tipo de cambio real. El posicionamiento es por atributo diferencial (localismo + multi-moneda) y por usuario (el que ahorra en dólares y controla sus gastos en pesos).


## 6.4 Producto – Estrategia de Producto


### 6.4.1 Qué es y qué no es Zarix

Zarix ES: una herramienta de gestión y visualización del patrimonio personal. NO ES: una billetera digital, una plataforma de inversiones, ni un asesor financiero. No mueve dinero, no custodia activos.


### 6.4.2 Durabilidad del Producto

El servicio es durable y de uso continuo. No es estacional, aunque puede tener picos de interés en momentos de alta volatilidad cambiaria (devaluaciones, elecciones).


### 6.4.3 Características que Influyen en la Decisión de Uso

Cotización del dólar blue en tiempo real en la pantalla de inicio

Registro de movimiento en menos de 10 segundos

Vista de patrimonio total en USD y ARS sin configuración previa


## 6.5 Precio – Estrategia de Precio

La estrategia de precio es de penetración: precio bajo para capturar mercado rápidamente y generar masa crítica antes de ajustar. Se contempla cobro en ARS al tipo de cambio oficial para facilitar la transacción local.


## 6.6 CIM – Comunicaciones Integradas de Marketing


### 6.6.1 Planificación Estratégica de Comunicaciones


### 6.6.2 Diseño del Sitio Web – Las 7 C


## 6.7 Distribución


### 6.7.1 Canales Principales

Al ser una PWA, la distribución es directa a través del navegador web. No requiere app stores, eliminando la fricción de instalación. El enlace se puede compartir directamente vía Telegram, WhatsApp o redes sociales.


### 6.7.2 Estrategia de Distribución

Distribución digital directa (D2C). El usuario accede desde zarix.app (dominio propuesto), puede instalarlo como PWA en su dispositivo y comenzar a usarlo en menos de 2 minutos. El modo demo y los enlaces públicos de gastos compartidos son accesibles sin registro previo.


# 7. Operaciones


## 7.1 Organización de la Empresa

En la fase inicial, Zarix opera como un proyecto unipersonal. El fundador asume los roles de Product Manager, desarrollador full-stack, diseñador UX y responsable de marketing. La estructura evolucionará en función del crecimiento y los ingresos generados.


## 7.2 Grupo Fundador


## 7.3 Composición del Staff Gerencial

En la fase actual, el fundador cumple todas las funciones ejecutivas. Se identifican los siguientes perfiles a incorporar en Fase 3: (1) Desarrollador frontend para mejorar UX/UI, (2) Community Manager para gestión de redes y comunidades.


## 7.4 Estructura Prevista al Lanzamiento y Evolución


## 7.5 Filosofía y Sistema de Trabajo

Metodología ágil con sprints de 2 semanas. El backlog se gestiona en Linear o Notion. Cada sprint tiene un objetivo claro vinculado a una métrica de producto (retention, activation, conversion). El código se versiona en GitHub con deploy automático en Vercel.


## 7.6 Requerimientos de RRHH

En la fase inicial no se requieren contrataciones. Los costos de infraestructura son cubiertos por tiers gratuitos de Supabase (hasta 500MB de base de datos y 2GB de storage) y Vercel (hasta 100GB de bandwidth). La única inversión prevista es en APIs de IA para el módulo OCR de tickets (estimado USD 10-50/mes según volumen).


# 8. Plan Financiero-Económico


## 8.1 Modelo de Ingresos

El modelo de ingresos principal es la suscripción mensual al plan Premium (USD 5-10/mes, facturado en ARS al tipo de cambio oficial). Se proyectan los siguientes escenarios de suscriptores:

Canal secundario de ingresos (Fase 3+): publicidad contextual no intrusiva en el plan Free y potenciales integraciones B2B con brokers o plataformas de inversión.


## 8.2 Modelo de Egresos

Costo total operativo estimado en Fase 1: USD 12-50/mes. En Fase 2: USD 30-100/mes. Escala sublinealmente con el crecimiento de usuarios.


## 8.3 Modelo de Inversión


## 8.4 Amortizaciones y Depreciaciones

Dado el carácter minimal de la inversión, los activos diferidos (APIs, dominio) se amortizan en 12 meses con método de línea recta. El hardware ya está amortizado.


## 8.5 Impuesto a las Ganancias

En la fase inicial, al operar como persona física (Monotributo), el tratamiento impositivo corresponderá al régimen simplificado argentino. La categoría de Monotributo dependerá de los ingresos anuales. En Fase 3, se evaluará la constitución de una SAS (Sociedad por Acciones Simplificada).


## 8.6 Ingresos Brutos

Se calcularán sobre los ingresos netos por suscripciones, a la alícuota correspondiente a la actividad de servicios de software en la provincia de Santa Fe (estimado 3.5%).


## 8.7 Remuneraciones y Cargas Sociales

No aplica en Fase 1 (operación unipersonal bajo Monotributo). En Fases 3-4, se incorporará personal bajo relación de dependencia o como contratados por proyecto.


## 8.8 Presupuesto Financiero

Valores mensuales estimados al cierre de cada período:


## 8.9 Evaluación de la Inversión

Punto de equilibrio: 7-10 suscriptores premium (USD 52-75/mes cubre todos los costos operativos)

Período de repago: estimado en Mes 5-6 con costos iniciales de USD 100-150

VAN (tasa 10% anual, horizonte 2 años): positivo desde el primer año en escenario base

TIR: >200% por la mínima inversión inicial requerida


## 8.10 Escenarios de Riesgo


## 8.11 Plan de Contingencia

En escenario pesimista prolongado: (1) reducir costos al mínimo (tier free de todas las plataformas), (2) pivotar hacia modelo B2B ofreciendo Zarix como herramienta white-label para asesores financieros independientes, (3) monetizar la audiencia vía afiliados de plataformas de inversión.


## 8.12 Plan de Salida

En caso de inviabilidad del proyecto: (1) los datos de usuarios se exportan y se entregan según política de privacidad, (2) el código fuente puede publicarse como open source, (3) el activo principal (base de usuarios y marca) puede ofrecerse a adquisición por parte de fintech local.


# 9. Factibilidades


## 9.1 Técnica

La factibilidad técnica es alta. El stack elegido (Next.js 14 + Supabase + Vercel) es moderno, con amplia documentación, comunidad activa y tiers gratuitos generosos. El fundador cuenta con las capacidades técnicas para desarrollar y mantener el sistema. Las APIs externas requeridas (cotizaciones, mercados financieros) cuentan con versiones gratuitas o de bajo costo.


## 9.2 Comercial

La factibilidad comercial es alta. Existe demanda comprobada a través de la popularidad de grupos de Telegram y subreddits dedicados a finanzas personales en Argentina, donde los usuarios comparten spreadsheets propios por falta de herramientas adecuadas. El precio del plan premium (USD 5-10/mes) es significativamente inferior al de competidores internacionales y representa menos del 0.5% del ingreso mensual promedio del segmento objetivo.


## 9.3 Administrativa

La factibilidad administrativa es alta para la fase inicial. La operación unipersonal bajo Monotributo es simple de gestionar. Se utilizarán herramientas SaaS para todas las funciones administrativas (Notion para documentación, Linear para gestión de tareas, Mercado Pago para cobros).


## 9.4 Legal

Zarix opera como herramienta de registro y visualización de datos financieros personales, sin custodiar activos ni operar como entidad financiera. Por lo tanto, no requiere licencias del BCRA ni de la CNV. Deberá cumplir con: (1) Ley 25.326 de Protección de Datos Personales (Argentina), (2) Términos de uso claros que expliciten que Zarix no presta asesoramiento financiero, (3) Política de privacidad GDPR-compatible para futuras expansiones a Europa.


# 10. Aspectos Descriptivos de la Solución Tecnológica


## 10.1 Carátula

Ver página 1 del presente documento.


## 10.2 Índice

Ver tabla de contenidos al inicio del documento.


## 10.3 Historial de Revisión


## 10.4 Documento Visión


### 10.4.1 Propuesta de Valor del Proyecto

Zarix provee a sus usuarios la capacidad de conocer su situación financiera real en segundos, con información consolidada de todas sus cuentas, inversiones y activos, expresada en la moneda que el usuario elija y utilizando los tipos de cambio que realmente aplican a su vida cotidiana. El valor central es tiempo ahorrado y claridad financiera.


### 10.4.2 Especificaciones de Requerimientos

Requerimientos funcionales principales:

RF01: El sistema debe permitir registrar movimientos financieros (gastos, ingresos, transferencias) con cuenta, monto, moneda, categoría y fecha

RF02: El sistema debe mostrar cotizaciones actualizadas de dólar (oficial, blue, MEP, CCL) y criptomonedas

RF03: El sistema debe calcular y mostrar el patrimonio total consolidado en ARS y USD

RF04: El sistema debe gestionar múltiples cuentas de distintos tipos (banco, efectivo, crypto, inversiones)

RF05: El sistema debe permitir registrar y seguir posiciones de inversión con cálculo de P&L

RF06: El sistema debe integrar un bot de Telegram para registro de movimientos

RF07: El sistema debe permitir importar/exportar datos en formato CSV y JSON

RF08: El sistema debe procesar imágenes de tickets para registro automático de gastos

RF09: El sistema debe permitir configurar y gestionar transacciones recurrentes (gastos, ingresos y suscripciones periódicas) con ejecución automática mediante cron job

RF10: El sistema debe integrar un asistente de inteligencia artificial (Google Gemini) que permita consultar y analizar los datos financieros del usuario mediante lenguaje natural desde el dashboard y desde el bot de Telegram

RF11: El sistema debe detectar automáticamente anomalías en los patrones de gasto (ratio ≥2× vs promedio de 3 meses por categoría) y generar proyecciones financieras lineales (3/6/12 meses) basadas en el historial del usuario, mediante heurísticas determinísticas en /api/ai/anomalies y /api/ai/projections (sin invocar Gemini)

Requerimientos no funcionales:

RNF01: Tiempo de carga del dashboard inferior a 2 segundos

RNF02: Disponibilidad del servicio superior al 99.5%

RNF03: Cifrado de datos en tránsito (HTTPS) y en reposo (provisto por Supabase), con aislamiento de datos por usuario mediante Row Level Security (RLS)

RNF04: Diseño mobile-first responsive

RNF05: Soporte para navegadores modernos (Chrome, Firefox, Safari, Edge)


### 10.4.3 Alcance del Desarrollo

Dentro del alcance: Dashboard, Movimientos, Cuentas, Inversiones (Merval y USA), Análisis, Presupuestos, Transacciones Recurrentes, Asistente IA (Google Gemini, RF10) y detección algorítmica de anomalías/proyecciones (RF11), Configuración, Bot Telegram, OCR de tickets, Importación/Exportación CSV/JSON, gastos compartidos mediante enlaces públicos (invitados sin cuenta), gestión de suscripciones vía Mercado Pago.

Fuera del alcance: Sincronización bancaria automática (open banking), asesoramiento financiero con IA, plataforma multiusuario (familiar), versión iOS/Android nativa.


### 10.4.4 Definiciones, Acrónimos y Abreviaciones


### 10.4.5 Descripción del Entorno del Sistema

Lado del cliente: Navegador web moderno con soporte PWA. Resolución mínima 320px (mobile). Sin requerimientos especiales de hardware. Conexión a internet requerida para cotizaciones en tiempo real.

Lado del servidor: Supabase (PostgreSQL 15, Auth JWT, Storage S3-compatible). Vercel (CDN global, funciones serverless Node.js y cron jobs). Requisitos de backup: respaldo automático diario provisto por Supabase.


## 10.5 Descripción Global del Producto


### 10.5.1 Mapa de Navegación

El sistema cuenta con las siguientes secciones principales accesibles desde el menú de navegación:


### 10.5.2 Índice de Casos de Uso


Figura 1 – Diagrama de Casos de Uso: actores, 8 CU core (CU-001…CU-008), relaciones «include» y «extend»


### 10.5.3 Especificaciones de Casos de Uso


### CU-001 – Registrar Movimiento


### CU-001-I1 – Actualizar Saldo de Cuenta (include)


### CU-001-I2 – Validar Datos del Movimiento (include)


### CU-001-E1 – Registrar Movimiento por Telegram (extend)


### CU-002 – Gestionar Cuentas


### CU-003 – Visualizar Dashboard


### CU-004 – Gestionar Portafolio de Inversiones


### CU-005 – Importar/Exportar Datos


### CU-006 – Gestionar Reglas Recurrentes


### CU-007 – Consultar Asistente IA (RF10)

Actor principal: Usuario autenticado (web o Telegram). Precondición: suscripción activa para orquestador IA; API key Gemini del usuario o del servidor configurada. Postcondición: respuesta en lenguaje natural y/o acciones ejecutadas vía function calling (create_transaction, get_spending, get_portfolio, etc.). Flujo principal: (1) Usuario envía mensaje en dashboard (InternalAiChat) o Telegram; (2) POST /api/ai/chat o bot Telegraf → processInternalAiChatMessage; (3) GeminiClient.chatWithTools (hasta 8 rondas); (4) executeBotTool scoped por userId; (5) respuesta al usuario. Código: lib/ai/gemini.ts, lib/ai/bot-tools.ts, lib/services/internal-ai-chat.ts, app/api/ai/chat/route.ts, lib/telegram/bot.ts.


### CU-008 – Detectar Anomalías y Proyecciones (RF11)

Actor principal: Usuario autenticado. Precondición: historial de movimientos suficiente (≥1 mes). Postcondición: lista de anomalías por categoría y/o proyección de patrimonio a 3/6/12 meses. Flujo: heurísticas determinísticas — anomalía si gasto del mes ≥2× promedio de 3 meses previos; proyección lineal sobre ingresos/gastos promedio. NO utiliza Gemini (costo y determinismo). Código: app/api/ai/anomalies/route.ts, app/api/ai/projections/route.ts, components/dashboard/AnomaliesWidget.tsx, components/analysis/ProjectionsWidget.tsx.


### CU-001-E2 – Parsear Ticket por Imagen (extend)

Canal Telegram: foto de ticket → GeminiClient.chatWithImage → JSON (monto, comercio, fecha, categoría) → confirmación → create_transaction. Implementación: lib/telegram/bot.ts (handler message("photo")), lib/ai/gemini.ts. Motor: Google Gemini multimodal (no OpenAI Vision).


### Reglas de Negocio (RN)

Reglas de negocio derivadas del código real (validaciones y triggers). Cada CU referencia sus reglas; la matriz de trazabilidad (10.5.15) las vincula.


### 10.5.4 Modelo de Dominio

El modelo de dominio identifica las entidades principales del sistema y sus relaciones:


Figura 2 – Modelo de Dominio: 8 entidades con atributos, asociaciones y multiplicidades


### 10.5.5 Diagrama de Robustez – CU-001 Registrar Movimiento

El diagrama de robustez para el caso de uso CU-001 identifica los siguientes elementos:

ACTORES: Usuario (actor externo), Bot Telegram (actor secundario).

BOUNDARY OBJECTS (interfaces): Pantalla de Nuevo Movimiento, Formulario de Movimiento, Mensaje de Confirmación, Pantalla de Dashboard (actualizada).

CONTROL OBJECTS (lógica): Controlador de Movimientos, Validador de Datos, Calculador de Saldo, Invalidador de Caché.

ENTITY OBJECTS (datos): Movimiento, Cuenta, Categoría, Usuario.

FLUJO PRINCIPAL DE ROBUSTEZ:

Usuario → [Pantalla Nuevo Movimiento] → [Controlador de Movimientos]

[Controlador de Movimientos] → [Validador de Datos] → {Movimiento, Cuenta, Categoría}

[Validador de Datos] → [Calculador de Saldo] → {Cuenta} (actualiza saldo)

[Calculador de Saldo] → [Invalidador de Caché] → [Pantalla de Dashboard]

FLUJO ALTERNATIVO (Telegram): Bot Telegram → [Parser de Mensaje] → [Controlador de Movimientos]


Figura 3 – Diagrama de Robustez CU-001: objetos Boundary, Control y Entity


### 10.5.6 Diagrama de Robustez – CU-003 Visualizar Dashboard

BOUNDARY OBJECTS: Pantalla Dashboard, Widget Patrimonio, Widget Cotizaciones, Widget Últimos Movimientos, Widget Estado Tarjetas.

CONTROL OBJECTS: Controlador Dashboard, Gestor de Cotizaciones, Calculador de Patrimonio, Gestor de Caché.

ENTITY OBJECTS: Cotización, Cuenta, Movimiento, Posición, Usuario.

FLUJO:

Usuario → [Pantalla Dashboard] → [Controlador Dashboard]

[Controlador Dashboard] → [Gestor de Cotizaciones] → APIs Externas / {Cotización caché}

[Controlador Dashboard] → [Calculador de Patrimonio] → {Cuenta, Posición, Cotización}

[Calculador de Patrimonio] → [Widget Patrimonio] (renderiza)

[Controlador Dashboard] → {Movimiento} → [Widget Últimos Movimientos]


Figura 4 – Diagrama de Robustez CU-003: Dashboard con Gestor de Cotizaciones y Caché


### 10.5.7 Diagrama de Secuencia – CU-001 Registrar Movimiento


Figura 5 – Diagrama de Secuencia CU-001: formulario → route handler → servicios → PostgreSQL (saldo por trigger)


### 10.5.8 Diagrama de Paquetes

La arquitectura del sistema se organiza en los siguientes paquetes lógicos:


Figura 6 – Diagrama de Paquetes: arquitectura en capas (dependencias dirigidas hacia la persistencia)


### 10.5.9 Diagrama de Componentes

Los componentes principales del sistema y sus interfaces son:


Figura 7 – Diagrama de Componentes: Next.js, Supabase, Vercel, Bot Telegram y APIs externas


### 10.5.10 Diagrama de Clases – Entidades Principales

A continuación se describen las clases principales del modelo de dominio con sus atributos y métodos:


Figura 8 – Diagrama de Clases Técnico: servicios TypeScript (lógica) + entidades tipadas (espejo de tablas Supabase)


### 10.5.11 Diagrama Entidad-Relación

A continuación se describe el modelo entidad-relación de la solución. Se utilizan los nombres reales de las tablas del esquema (supabase/schema.sql):

El esquema completo incluye además tablas de soporte (bot_sessions, exchange_rates históricas, budget_alerts, investment_sales, portfolio_performance_snapshots) y el módulo de gastos compartidos (shared_groups, shared_group_members, shared_expenses, shared_expense_splits). El diagrama muestra las 8 tablas núcleo del dominio.


Figura 9 – Diagrama ER: 8 tablas núcleo (incl. recurring_rules), PKs, FKs y Row Level Security (RLS)


### 10.5.12 Diagrama de Despliegue

La arquitectura de despliegue de Zarix es serverless y cloud-native:


Figura 10 – Diagrama de Despliegue: arquitectura serverless cloud-native ZARIX


### 10.5.13 Especificación de Casos de Prueba


### 10.5.14 Prototipos de Interfaz de Usuario


### Prototipo 1 – Dashboard Principal

El dashboard se organiza en una grilla de widgets responsiva. En la parte superior, una barra muestra el patrimonio total en ARS y USD junto con los indicadores de cotización del dólar (oficial, blue, MEP, CCL). Debajo, en dos columnas, se muestran: (izquierda) balance por cuenta agrupado por tipo, y (derecha) los últimos 5 movimientos con categoría, monto y fecha. En la parte inferior, las tarjetas de crédito muestran barra de progreso de consumo vs límite.


### Prototipo 2 – Formulario de Nuevo Movimiento

Bottom sheet deslizable desde la parte inferior de la pantalla. Diseño de un solo paso con todos los campos visibles. Toggle superior para cambiar entre Gasto / Ingreso / Transferencia con cambio de color (rojo/verde/azul). Campo de monto grande en el centro, con selector de moneda inline. Selector de cuenta con ícono y saldo actual visible. Selector de categoría como grilla de íconos. Campo de descripción opcional colapsable.


### Prototipo 3 – Vista de Portafolio de Inversiones

Pantalla con header que muestra el valor total del portafolio en USD y ARS, y el P&L total del día (% y monto absoluto). Debajo, lista de posiciones ordenable por valor o por variación. Cada posición muestra: ticker en bold, nombre completo, cantidad de acciones, precio actual, variación del día (verde/rojo), valor total de la posición y P&L desde la compra. Barra inferior con botón para agregar nueva posición.


### 10.5.15 Matriz de Trazabilidad

Siguiendo el formato del material de cátedra (sap_tfi_2026), la matriz vincula cada requerimiento con su caso de uso, reglas de negocio, diagramas, modelo de datos y casos de prueba. Garantiza que cada artefacto ICONIX sea verificable contra el código real.


# C. Anexos


# 11. Contenido


## 11.1 Normas de Calidad

El desarrollo de Zarix sigue las siguientes normas y estándares de calidad:

TypeScript strict mode: tipado fuerte en todo el código base para prevenir errores en tiempo de desarrollo

ESLint + Prettier: formato y linting automático en cada commit

Testing (implementado, risk-based): suite Vitest con 132 tests unitarios sobre lógica monetaria pura (conversiones, impacto en saldos, gastos compartidos, auth de crons/webhooks); pipeline CI en GitHub Actions (lint + typecheck + test + build en cada push/PR). Playwright E2E para CU-001/CU-003 permanece planificado (ADR 0005). Smoke manual complementario: npm run test:bot. Ver docs/EV-COD-zarix.md.

Git flow: ramas feature/, fix/, release/ con PR obligatorio para mergear a main; CI GitHub Actions en .github/workflows/ci.yml

Supabase RLS: Row Level Security habilitado en todas las tablas para garantizar aislamiento de datos entre usuarios

OWASP Top 10: mitigaciones implementadas para las principales vulnerabilidades web (XSS, CSRF, SQL Injection)


## 11.2 Anexos Específicos del Proyecto


### Anexo A: Estructura de Base de Datos SQL

La base de datos se implementa en PostgreSQL vía Supabase. Todas las tablas cuentan con: id UUID generado automáticamente (gen_random_uuid()), timestamps created_at y updated_at con trigger automático, y Row Level Security (RLS) habilitado con políticas que restringen el acceso al usuario dueño del registro.

El esquema (supabase/schema.sql) define 18+ tablas nucleares y de soporte: users, accounts, categories, transactions, recurring_rules, budgets, investments, portfolio_performance_snapshots, investment_sales, bot_sessions, exchange_rates, budget_alerts, shared_groups, shared_group_members, shared_expenses, shared_expense_splits, net_worth_snapshots, market_data_cache. Todas con UUID, timestamps y RLS donde corresponde.


### Anexo B: Formato de Importación CSV

La importación acepta archivos CSV (delimitador , o ; detectado automáticamente) y XLSX, con encabezados en español o inglés (insensibles a mayúsculas y tildes). El formato coincide con el de la exportación, permitiendo ciclos de ida y vuelta sin pérdida.

Las filas con errores se reportan individualmente (fila y motivo) sin abortar la importación del resto.


## 11.3 Bibliografía Consultada

Larman, C. (2002). Applying UML and Patterns. Prentice Hall.

Fowler, M. (2003). Patterns of Enterprise Application Architecture. Addison-Wesley.

Evans, E. (2003). Domain-Driven Design. Addison-Wesley.

Gamma, E., Helm, R., Johnson, R. & Vlissides, J. (1995). Design Patterns: Elements of Reusable Object-Oriented Software. Addison-Wesley.

Cristiá, M. (2015). Material de cátedra sobre documentación de patrones de diseño. FCEIA, Universidad Nacional de Rosario.

Documentación oficial de Next.js 14: https://nextjs.org/docs

Documentación oficial de Supabase: https://supabase.com/docs

API DolarApi (cotizaciones del dólar): https://dolarapi.com

API CriptoYa (cotizaciones y cripto): https://criptoya.com

BCRA (2024). Informe de Inclusión Financiera. Buenos Aires: Banco Central de la República Argentina.

Ministerio de Economía Argentina (2024). Informes económicos mensuales.

Porter, M. (1985). Competitive Advantage. Free Press.

Kotler, P. & Armstrong, G. (2018). Principles of Marketing. Pearson.

Ries, E. (2011). The Lean Startup. Crown Business.


# D. Anexo Técnico: Patrones de Diseño y Estilos Arquitectónicos

Este anexo documenta, siguiendo la metodología ICONIX y los estándares de la materia, los patrones de diseño GoF aplicados al código real de Zarix y los estilos arquitectónicos identificados en su arquitectura. Ambos artefactos se derivan por ingeniería del código fuente del proyecto (Next.js 14 + Supabase), no de un diseño teórico.


## D.1 Patrón Aplicado: Strategy (Obtención de Cotizaciones Multi-Fuente)

La cotización del dólar es un dato crítico de Zarix: alimenta el cálculo de patrimonio, la conversión de movimientos y el dashboard. Obtenerla es frágil porque depende de APIs externas que pueden fallar, demorar o devolver datos degradados (por ejemplo, el dólar blue en 0). Por eso el servicio resuelve la cotización con una cadena de fuentes y fallback: CriptoYa (fuente primaria) → DolarApi (respaldo HTTP) → último valor persistido en la base de datos.

Esa lógica se encapsuló aplicando el patrón Strategy (Gamma et al., 1995): cada fuente de datos se modela como una estrategia intercambiable que cumple una interfaz común (DolarRateProvider), y el servicio (Context) recorre las estrategias en orden hasta obtener una cotización válida. El refactor reemplaza un bloque de try/catch anidados por una colección ordenada de proveedores, cumpliendo el principio Open/Closed: agregar una fuente nueva es implementar la interfaz y sumarla al arreglo, sin tocar el código que la consume.

Documentación del patrón (estándar FCEIA-UNR para documentación de patrones de diseño, Cristiá 2015):

Pattern ObtencionDeCotizaciones based on Strategy because

Cambios previstos: i) la cotización del dólar puede obtenerse de varias
fuentes (CriptoYa, DolarApi, caché en base de datos); ii) si una fuente
falla o devuelve datos inválidos (ej. blue en 0), el sistema debe intentar
con la siguiente sin acoplar al cliente a una fuente concreta; iii) debe
poder agregarse una nueva fuente sin modificar el código que la consume;
iv) el orden de preferencia/fallback debe ser explícito y configurable.

where
  Strategy is DolarRateProvider (interfaz con fetch())
  Context is CotizacionesService (mantiene la lista de proveedores)
  ConcreteStrategy is CriptoYaProvider (fuente primaria)
  ConcreteStrategy is DolarApiProvider (fallback HTTP)
  ConcreteStrategy is DbCacheProvider (último valor persistido en exchange_rates)
  algorithm() is fetch(): Promise<Record<string, DolarQuote>>
  contextInterface() is getDolarQuotes() (recorre las estrategias en orden)

comments
  La interfaz DolarRateProvider define el contrato fetch() que toda fuente
  de cotización debe cumplir. CotizacionesService (Context) mantiene un
  arreglo ordenado de proveedores y los recorre hasta que uno devuelve una
  cotización válida, cacheando el resultado (TTL 300s) y persistiéndolo en
  la tabla exchange_rates cuando proviene de una fuente en vivo. Agregar una
  fuente nueva = implementar DolarRateProvider y sumarla al arreglo
  (principio Open/Closed). El patrón también exhibe rasgos de Chain of
  Responsibility por su semántica de fallback ordenado.


Figura 11 – Patrón Strategy aplicado a la obtención de cotizaciones (GoF + implementación en Zarix)

Implementación: lib/services/cotizaciones.ts. Participantes: la interfaz DolarRateProvider; las estrategias concretas CriptoYaProvider, DolarApiProvider y DbCacheProvider; y el contexto CotizacionesService.getDolarQuotes(), que itera el arreglo this.dolarProviders.


## D.2 Patrón Aplicado: Template Method (Automatización de Cron Jobs)

Zarix ejecuta ocho tareas programadas en Vercel Cron (transacciones recurrentes, actualización de precios, resúmenes semanal y mensual, alertas de vencimiento, gracia de suscripción y alertas de presupuesto). Las rutas repetían el mismo esqueleto: validar el bearer secreto del cron, crear el cliente de base de datos con service-role, recorrer filas procesando de a una (para que un error en un ítem no corte el lote) y responder un resumen JSON con contadores. Ese andamiaje duplicado (~80 líneas por ruta) se encapsuló aplicando el patrón Template Method (Gamma et al., 1995): la clase abstracta CronJob fija el esqueleto del algoritmo en run() y delega los pasos que varían en operaciones primitivas y hooks que cada job concreto redefine.

Documentación del patrón (estándar FCEIA-UNR para documentación de patrones de diseño, Cristiá 2015):

Pattern EjecucionDeCronJobs based on Template Method because

Cambios previstos: i) los ocho cron jobs comparten el mismo esqueleto
(autenticar, conectar, iterar, resumir) pero difieren en qué filas
procesan y cómo procesan cada una; ii) deben poder agregarse nuevos
jobs sin repetir la validación del secreto ni el manejo de errores;
iii) pasos opcionales (precarga por lote, persistencia posterior,
filtro por ítem) deben poder engancharse sin tocar el esqueleto.

where
  AbstractClass is CronJob (run() = template method)
  AbstractClass is IterativeCronJob<TItem> (execute() = sub-template)
  templateMethod() is run(request) / execute(supabase)
  primitiveOperation() is fetchItems(supabase)
  primitiveOperation() is processItem(supabase, item)
  hook() is shouldProcess(item)
  hook() is beforeAll(supabase, items)
  hook() is afterAll(supabase, items)
  ConcreteClass is RecurringRulesJob (reglas recurrentes)
  ConcreteClass is UpdatePricesJob (precios de mercado)
  ConcreteClass is WeeklySummaryJob / MonthlySummaryJob
  ConcreteClass is MaturityAlertsJob (vencimientos)
  ConcreteClass is BudgetAlertsJob (alertas de presupuesto)
  ConcreteClass is SubscriptionGraceJob (UPDATE atómico único)

comments
  run() valida el bearer de Vercel Cron, crea el service client y
  envuelve el resultado o error en una respuesta JSON uniforme; las
  subclases no pueden saltearse la autenticación (está en el esqueleto,
  principio de Hollywood: "no nos llames, nosotros te llamamos").
  IterativeCronJob agrega el sub-esqueleto fetch → filtrar → procesar
  de a uno con try/catch por ítem → contadores. Agregar un cron job
  nuevo = una subclase (principio Open/Closed).


Figura 12 – Patrón Template Method aplicado a los cron jobs (GoF + implementación en Zarix)

Implementación: lib/cron/cron-job.ts (clases CronJob e IterativeCronJob) y app/api/cron/**/route.ts (los siete jobs concretos). Cada route handler quedó reducido a una subclase con sus operaciones primitivas y un GET de una línea: return new XxxJob().run(request).


## D.3 Estilos Arquitectónicos Identificados

Como todo sistema real, Zarix no usa un único estilo arquitectónico sino una combinación de varios en distintas partes. A continuación se identifican los ocho estilos presentes y dónde se aplican, siguiendo el apunte de estilos arquitectónicos de la materia.

Cliente-Servidor: El navegador (PWA) hace requests HTTP/HTTPS a Vercel; el servidor nunca inicia la comunicación.

N-Tier: Capas separadas: Cliente (PWA) · API (route handlers) · Servicios (lib/services) · Datos (Supabase).

Layered (Capas): Dentro del backend: rutas → servicios → clientes Supabase; cada capa depende solo de la inferior.

Serverless / FaaS: Sin servidores propios: funciones serverless y 8 cron jobs ejecutan en Vercel bajo demanda.

BaaS (Backend as a Service): Supabase provee PostgreSQL, Auth (JWT) y Storage como servicio gestionado.

Repository: Los *Service encapsulan el acceso a datos vía supabase-js; el resto del código no hace SQL directo.

Event-Driven: Triggers de BD (update_account_balance), cron jobs programados y webhooks (Telegram, Mercado Pago).

Strategy / Adapter: Los proveedores de cotización (D.1) normalizan fuentes heterogéneas tras una interfaz común con fallback.


Figura 13 – Arquitectura de Zarix con los estilos arquitectónicos identificados

Beneficios de esta combinación: extensibilidad (Serverless + Strategy), bajo costo operativo (Serverless + BaaS en free tier), mantenibilidad (Layered + Repository) y reactividad (Event-Driven). Trade-off principal: la dispersión de la lógica entre capas y servicios externos exige disciplina en el filtrado por user_id (la seguridad de datos depende de ello, no solo del RLS).


<!-- Tabla 1 -->
| Autor | Jeffrey Dietz |
| --- | --- |
| Legajo | [completar] |
| Carrera | Ingeniería en Sistemas |
| Sede | Rosario, Santa Fe |
| Profesores | Matías Banega; Alejandro Sartorio |
| Fecha | Junio 2026 |
| Versión | 2.1 |

<!-- Tabla 2 -->
| Fecha | Autor | Versión | Referencia de los cambios |
| --- | --- | --- | --- |
| Abril 2026 | Jeffrey Dietz | 1.0 | Versión inicial del documento |
| Mayo 2026 | Jeffrey Dietz | 1.1 | Incorporación del Business Model Canvas |
| Junio 2026 | Jeffrey Dietz | 1.2 | Expansión de los puntos 1.3 a 4 (Plan de Negocios) |
| Junio 2026 | Jeffrey Dietz | 2.0 | Documento completo: puntos 5 a 11, diagramas UML, especificación de casos de uso y anexos técnicos |
| Julio 2026 | Jeffrey Dietz | 2.1 | Auditoría integral contra el código fuente del repositorio; diagramas ICONIX rediseñados según el material de cátedra (sap_tfi_2026); segundo patrón GoF (Template Method); reglas de negocio y matriz de trazabilidad |
| Agosto 2026 | Jeffrey Dietz | 2.7 | Alineación con código verificado (EV-COD): CU-007 Asistente IA y CU-008 Anomalías/Proyecciones; OCR vía Gemini multimodal; RF11 heurístico (sin LLM); suite Vitest (132 tests) + CI; 8 cron jobs Vercel; correcciones de stack (sin Zustand); pack de evidencia docs/EV-COD-zarix.md. |

<!-- Tabla 3 -->
| Auditor | Versión aprobada | Responsabilidad/Rol | Fecha |
| --- | --- | --- | --- |
| — | — | — | — |

<!-- Tabla 4 -->
| Ítem | Detalle |
| --- | --- |
| Título del documento | ZARIX – Plan de Desarrollo Tecnológico |
| Autor | Jeffrey Dietz |
| Fecha de Creación | Abril 2026 |
| Última Actualización | Agosto 2026 (v2.7) |

<!-- Tabla 5 -->
| Oportunidades | Amenazas |
| --- | --- |
| Alta demanda de herramientas financieras locales | Cambios regulatorios repentinos del BCRA |
| Mercado de fintech en crecimiento en LATAM | Entrada de competidores internacionales con más recursos |
| Comunidades activas de finanzas personales en redes | Desconfianza del usuario en apps que manejan datos financieros |
| Integración posible con billeteras virtuales (Ualá, MP) | Dificultad para monetizar en contexto de restricciones cambiarias |

<!-- Tabla 6 -->
| Competidor | Tipo | Fortaleza | Debilidad vs Zarix |
| --- | --- | --- | --- |
| Fintual | App de inversiones | Marca establecida | No gestiona gastos ni multi-moneda |
| Spendee | App internacional | UI moderna | Sin soporte para ARS/blue/Merval |
| Google Sheets manual | Herramienta genérica | Flexibilidad total | Sin automatización ni cotizaciones |
| Monefy | App de gastos | Simple y rápida | Sin inversiones ni multi-moneda |
| Personal Finance (varios) | Apps locales antiguas | Conocimiento local | UX desactualizada, sin crypto |

<!-- Tabla 7 -->
| Fortalezas | Debilidades |
| --- | --- |
| Especialidad en contexto argentino | Equipo unipersonal (dependencia del founder) |
| Stack tecnológico moderno y escalable | Sin inversión de marketing inicial |
| Costo operativo casi cero en fase inicial | Funcionalidades aún en maduración |
| Integración con Telegram como canal diferencial | Sin track record o testimonios de usuarios |

<!-- Tabla 8 -->
|  | Positivo | Negativo |
| --- | --- | --- |
| Interno | F: Conocimiento local profundo, stack moderno, costos bajos, diferenciación clara, producto funcional | D: Equipo unipersonal, sin presupuesto de marketing, dependencia de APIs externas gratuitas |
| Externo | O: Mercado desatendido, crecimiento fintech LATAM, comunidades digitales activas, ecosistema cripto en expansión | A: Regulación cambiante, competidores internacionales con capital, desconfianza del usuario en datos financieros |

<!-- Tabla 9 -->
| Segmento | Perfil | Necesidad Principal |
| --- | --- | --- |
| Early Adopter Tech-Finance | 25-35 años, trabaja en IT o finanzas, opera con crypto y dólares | Patrimonio unificado ARS+USD+Crypto con P&L |
| Profesional Independiente | 30-45 años, freelancer o PyME, ingresos en USD y gastos en ARS | Control de flujo de caja multi-moneda |
| Inversor Principiante | 22-35 años, comenzando a invertir en CEDEARs o cripto | Seguimiento de portafolio simple con P&L claro |

<!-- Tabla 10 -->
| Asociados Clave | Actividades Clave | Propuesta de Valor | Relación con Clientes | Segmento de Clientes |
| --- | --- | --- | --- | --- |
| ¿Quiénes son nuestros socios y proveedores clave? | ¿Qué actividades clave requiere la propuesta de valor? | ¿Qué valor entregamos? ¿Qué problema resolvemos? | ¿Qué relación esperamos con cada segmento? | ¿Para quién creamos valor? ¿Quiénes son los clientes? |
| Blandos: fintechs locales (Mercado Pago, Ualá, Naranja X), influencers tech y finanzas, comunidades fintech (Reddit, Telegram). Tecnológicos: Supabase, Vercel y Google Gemini; APIs de cotización (DolarApi, CriptoYa, CoinGecko) y Yahoo Finance. | Desarrollo iterativo de la PWA y del asistente IA con contexto del usuario. Detección de patrones, anomalías y proyecciones. Adquisición orgánica vía influencers y comunidades. Gestión de las integraciones de cotización. | Patrimonio unificado (ARS, USD, crypto, acciones, CEDEARs) con cotizaciones reales. Elimina la planilla manual: bot de Telegram, OCR y recurrentes. Asistente IA que conoce tus números y actúa proactivamente. “Intuitivo para el que no sabe nada, potente para el que sabe todo”. | Self-service con onboarding guiado. El asistente IA proactivo es la relación central. El bot de Telegram es el canal conversacional cotidiano. | Primario: argentinos 25-45, urbanos, que nunca organizaron sus finanzas y necesitan ser guiados. Ahorristas en dólares, freelancers multi-moneda, inversores principiantes. Secundario: usuarios avanzados que buscan potencia. |
|  | Recursos Clave |  | Canales |  |
|  | ¿Qué recursos clave requiere la propuesta de valor? |  | ¿A través de qué canales llegamos a los clientes? |  |
|  | Stack Next.js 14 + Supabase + Tailwind + Gemini. El conocimiento profundo del sistema financiero argentino (el más difícil de replicar). Bot de Telegram como activo de canal. Founder full-stack (PM, dev, UX). |  | Distribución D2C vía PWA (zarix.app), sin app store. Adquisición orgánica: influencers tech/finanzas, Reddit (r/merval, r/argentina), Telegram, Twitter/X, Product Hunt y SEO/blog. |  |

<!-- Tabla 11 -->
| Estructura de Costos | Vías de Ingreso |
| --- | --- |
| ¿Cuáles son los costos más importantes del modelo? | ¿Por qué valor pagan los clientes? ¿Cómo pagan? |
| Estructura lean dominada por SaaS con tiers gratuitos. Costos tecnológicos (Supabase, Vercel, dominio, APIs), de IA (tokens de Gemini) y operativos (desarrollo, marketing orgánico, soporte). Fase 1 (MVP): USD 12-50/mes. | Freemium: Plan Free (masa crítica) + Premium USD 5-10/mes (en ARS al TC oficial) con IA, Telegram, inversiones, OCR, recurrentes y analítica. Año 1: 2.000 usuarios × 8% = USD 1.200/mes. Secundarias: alianzas fintech y B2B white-label. |

<!-- Tabla 12 -->
| Fase | Período | Objetivos | Hitos Clave |
| --- | --- | --- | --- |
| Fase 1: MVP | Meses 1-3 | Completar los 5 módulos core | Dashboard funcional, Bot Telegram operativo, Beta con 50 usuarios |
| Fase 2: Lanzamiento | Meses 4-6 | Lanzamiento público y primeros ingresos | Plan premium activo, 500 usuarios registrados, 30+ suscriptores |
| Fase 3: Crecimiento | Meses 7-12 | Escalar base de usuarios | 2.000 usuarios, 150+ suscriptores premium, integración MP/Ualá |
| Fase 4: Expansión | Año 2 | Nuevos mercados LATAM | Versión Colombia/México, 5.000+ usuarios totales |

<!-- Tabla 13 -->
| Plan | Precio | Funcionalidades |
| --- | --- | --- |
| Free | Gratis | Dashboard, movimientos ilimitados, 2 cuentas, cotizaciones básicas |
| Premium | USD 5-10/mes | Todo lo anterior + inversiones, bot Telegram, OCR tickets, cuentas ilimitadas, analítica avanzada, exportación de datos |

<!-- Tabla 14 -->
| Canal | Objetivo | Tipo de Contenido | Costo Estimado |
| --- | --- | --- | --- |
| Twitter/X | Awareness en comunidad fintech | Tips de ahorro, capturas del dashboard, hilos educativos | $0 (orgánico) |
| Grupos Telegram | Adquisición directa | Demo del bot, casos de uso | $0 (orgánico) |
| Product Hunt | Lanzamiento y visibilidad global | Post de lanzamiento | $0 |
| Reddit (r/merval, r/argentina) | Comunidad de inversores | Posts educativos + mención de Zarix | $0 (orgánico) |
| SEO / Blog | Tráfico orgánico | Artículos sobre finanzas en Argentina | $0–20/mes (hosting) |

<!-- Tabla 15 -->
| C | Descripción |
| --- | --- |
| Contexto | Diseño limpio, oscuro, orientado a datos. Mobile-first con PWA. |
| Contenido | Dashboard con widgets configurables, listado de movimientos, gráficos de tendencias |
| Comunidad | Bot de Telegram como canal social. Futuro: foro o Discord de usuarios |
| Customización | Moneda base elegible (ARS/USD), widgets del dashboard configurables |
| Comunicación | Notificaciones push (movimientos, alertas de cotización), respuestas del bot |
| Conexión | Integración con APIs de cotizaciones, Merval, Yahoo Finance, servicios de IA para OCR |
| Comercio | Suscripción premium vía Mercado Pago (preapproval), facturación en ARS |

<!-- Tabla 16 -->
| Rol | Nombre | Perfil |
| --- | --- | --- |
| Fundador / CTO / CPO | Jeffrey Dietz | Desarrollador full-stack con conocimiento profundo del sistema financiero argentino. Estudiante de Ingeniería en Sistemas – UAI Rosario. |

<!-- Tabla 17 -->
| Etapa | Estructura |
| --- | --- |
| Fase 1 (MVP) | 1 persona: Fundador (todo) |
| Fase 2 (Lanzamiento) | 1-2 personas: Fundador + colaborador part-time (marketing) |
| Fase 3 (Crecimiento) | 3-4 personas: Fundador + dev frontend + community manager + soporte |
| Fase 4 (Expansión) | 6-8 personas: Añadir roles de datos, ventas B2B y operaciones LATAM |

<!-- Tabla 18 -->
| Período | Usuarios Totales | Suscriptores Premium (8%) | Precio Prom. USD/mes | Ingreso Mensual USD |
| --- | --- | --- | --- | --- |
| Mes 6 | 500 | 40 | 7.50 | 300 |
| Mes 12 | 2.000 | 160 | 7.50 | 1.200 |
| Mes 18 | 4.000 | 320 | 8.00 | 2.560 |
| Mes 24 | 7.000 | 560 | 8.00 | 4.480 |

<!-- Tabla 19 -->
| Concepto | Tipo | Costo Mensual (USD) | Notas |
| --- | --- | --- | --- |
| Supabase | Infraestructura | 0-25 | Tier Free hasta 500 usuarios activos aprox. |
| Vercel | Hosting / Deploy | 0-20 | Tier Free hasta límites de bandwidth |
| APIs de IA (Google Gemini) | IA | 10-50 | Según volumen de tickets y consultas procesadas |
| APIs Cotizaciones premium | Datos | 0-15 | Alternativas gratuitas disponibles |
| Dominio y SSL | Infraestructura | 2 | Anual ~USD 15-20 |
| Herramientas (Linear, Notion) | Operativo | 0-10 | Tiers gratuitos disponibles |

<!-- Tabla 20 -->
| Rubro | Tipo | Monto USD |
| --- | --- | --- |
| Tiempo del fundador (oportunidad) | Intangible | No monetizado en Fase 1 |
| APIs y servicios de IA | Activo diferido | 50-100 |
| Dominio y registro de marca | Activo diferido | 30-50 |
| Diseño y assets gráficos | Activo diferido | 0 (herramientas gratuitas) |
| Hardware (computadora existente) | Activo fijo | Ya adquirido |

<!-- Tabla 21 -->
| Concepto | Mes 1-3 | Mes 4-6 | Mes 7-12 | Mes 13-24 |
| --- | --- | --- | --- | --- |
| Ingresos mensuales (USD) | 0 | 300 | 1.200 | 3.500 |
| Egresos operativos mensuales (USD) | 50 | 80 | 120 | 200 |
| Flujo neto mensual (USD) | -50 | +220 | +1.080 | +3.300 |
| Saldo acumulado estimado (USD) | -150 | +70 | +1.150 | +5.050 |

<!-- Tabla 22 -->
| Escenario | Descripción | Impacto | Probabilidad |
| --- | --- | --- | --- |
| Optimista | Crecimiento viral en comunidades, 300 suscriptores año 1 | Ingreso USD 2.250/mes en mes 12 | 20% |
| Base | Crecimiento orgánico sostenido, 160 suscriptores año 1 | Ingreso USD 1.200/mes en mes 12 | 60% |
| Pesimista | Lento despegue, 50 suscriptores año 1 | Ingreso USD 375/mes, por encima del punto de equilibrio | 20% |

<!-- Tabla 23 -->
| Componente | Tecnología | Estado |
| --- | --- | --- |
| Frontend | Next.js 14, React 18, Tailwind CSS | Operativo |
| Backend / BaaS | Supabase (PostgreSQL, Auth, Storage) | Operativo |
| Hosting | Vercel (deploy automático desde GitHub) | Operativo |
| Bot Telegram | Telegraf + webhook (route handler /api/telegram/webhook en Vercel) | Operativo |
| IA (Gemini) | Google Gemini 2.5 Flash / Flash-Lite (API key por usuario) | Implementado |
| APIs Cotizaciones | DolarApi, CriptoYa, CoinGecko, Yahoo Finance, stooq, data912 | Integradas |
| PWA | manifest.json + service worker propio (public/sw.js) | Configurado |

<!-- Tabla 24 -->
| Versión | Responsable | Descripción | Fecha |
| --- | --- | --- | --- |
| 1.0 | Jeffrey Dietz | Versión inicial del documento | Abril 2026 |
| 1.1 | Jeffrey Dietz | Incorporación del Business Model Canvas | Mayo 2026 |
| 1.2 | Jeffrey Dietz | Expansión de los puntos 1.3 a 4 (Plan de Negocios) | Junio 2026 |
| 2.0 | Jeffrey Dietz | Documento completo: puntos 5 a 11, diagramas UML, especificación de casos de uso y anexos técnicos | Junio 2026 |
| 2.1 | Jeffrey Dietz | Auditoría integral contra el código fuente; diagramas ICONIX rediseñados según el material de cátedra (sap_tfi_2026); Template Method en cron jobs; reglas de negocio y matriz de trazabilidad | Julio 2026 |

<!-- Tabla 25 -->
| Término | Definición |
| --- | --- |
| ARS | Peso Argentino |
| USD | Dólar estadounidense |
| USDT | Tether (stablecoin en dólares) |
| BTC | Bitcoin |
| ETH | Ethereum |
| MEP | Mercado Electrónico de Pagos (tipo de cambio financiero legal) |
| CCL | Contado con Liquidación (tipo de cambio financiero) |
| P&L | Profit & Loss (ganancia y pérdida de una inversión) |
| Merval | Índice de la Bolsa de Comercio de Buenos Aires |
| CEDEAR | Certificados de Depósito Argentinos (acciones extranjeras en pesos) |
| PWA | Progressive Web App (app web instalable) |
| OCR | Optical Character Recognition (reconocimiento de texto en imágenes) |
| RLS | Row Level Security (seguridad a nivel de fila en Supabase) |
| BaaS | Backend as a Service |

<!-- Tabla 26 -->
| Sección | Subsecciones | Acceso |
| --- | --- | --- |
| Dashboard | Patrimonio, Cotizaciones, Últimos movimientos, Estado tarjetas | Público (free) |
| Movimientos | Listado, Nuevo movimiento, Filtros, Categorías | Público (free) |
| Cuentas | Listado por tipo, Nueva cuenta, Editar cuenta | Público (free, máx 2) |
| Inversiones | Portafolio, Nueva posición, Historial, P&L | Premium |
| Análisis | Gráficos de gastos, Tendencias, Flujo de caja | Premium |
| Asistente IA | Chat con Gemini, Detección de anomalías, Proyecciones financieras | Premium |
| Presupuestos | Límites por categoría, Recurrentes | Premium |
| Recurrentes | Lista de reglas, Nueva regla, Historial de ejecuciones, Suscripciones | Premium |
| Gastos Compartidos | Grupos, gastos, balances y liquidaciones; enlace público para invitados | Público (vía enlace) |
| Configuración | Perfil, Importar/Exportar, Preferencias, Plan | Público (free) |

<!-- Tabla 27 -->
| ID | Nombre del Caso de Uso | Módulo |
| --- | --- | --- |
| CU-001 | Registrar Movimiento | Movimientos |
| CU-001-I1 | Actualizar Saldo de Cuenta | Movimientos (include) |
| CU-001-I2 | Validar Datos del Movimiento | Movimientos (include) |
| CU-001-E1 | Registrar Movimiento por Telegram | Movimientos (extend) |
| CU-001-E2 | Parsear Ticket por Imagen (OCR/Gemini) | Movimientos (extend) |
| CU-002 | Gestionar Cuentas | Cuentas |
| CU-002-I1 | Calcular Saldo Total por Moneda | Cuentas (include) |
| CU-002-E1 | Configurar Tarjeta Bi-Moneda | Cuentas (extend) |
| CU-003 | Visualizar Dashboard | Dashboard |
| CU-003-I1 | Obtener Cotizaciones | Dashboard (include) |
| CU-003-I2 | Calcular Patrimonio Consolidado | Dashboard (include) |
| CU-003-E1 | Consultar Asistente IA | Dashboard (extend) |
| CU-003-E2 | Detectar Anomalías de Gasto | Dashboard (extend) |
| CU-004 | Gestionar Portafolio de Inversiones | Inversiones |
| CU-004-I1 | Obtener Precios de Mercado | Inversiones (include) |
| CU-004-I2 | Calcular P&L de Posición | Inversiones (include) |
| CU-005 | Importar/Exportar Datos | Configuración |
| CU-005-I1 | Validar Formato de Archivo | Configuración (include) |
| CU-005-I2 | Mapear Categorías y Cuentas | Configuración (include) |
| CU-006 | Gestionar Reglas Recurrentes | Recurrentes |
| CU-006-I1 | Ejecutar Transacción Recurrente | Recurrentes (include) |
| CU-AUTH-001 | Validar Sesión (getUser) | Transversal (include) |

<!-- Tabla 28 -->
| ID | CU-001 |
| --- | --- |
| Nombre | Registrar Movimiento |
| Descripción | Permite al usuario registrar un nuevo movimiento financiero (gasto, ingreso o transferencia) en el sistema, asociando cuenta, categoría y monto en la moneda correspondiente. |
| Actor Principal | Usuario |
| Precondiciones | El usuario debe estar autenticado. Debe existir al menos una cuenta y una categoría configuradas. |
| Postcondiciones | El movimiento queda registrado. El saldo de la cuenta afectada se actualiza automáticamente. El movimiento aparece en el listado y se refleja en el dashboard. |
| Flujo Principal | 1. El usuario accede a Movimientos. 2. Selecciona ‘Nuevo Movimiento’. 3. Elige tipo: Gasto, Ingreso o Transferencia. 4. Selecciona cuenta origen. 5. Ingresa monto y moneda. 6. Selecciona categoría. 7. Agrega descripción y fecha (opcional). 8. Confirma el registro. 9. El sistema valida y guarda. |
| Flujo Alternativo | 3a. Si es transferencia, selecciona cuenta destino. 5a. Si la moneda difiere de la cuenta, solicita tipo de cambio. 9a. Si saldo negativo no permitido, muestra advertencia. |
| Includes | CU-001-I1 (Actualizar Saldo de Cuenta), CU-001-I2 (Validar Datos del Movimiento) |
| Extends | CU-001-E1 (Registrar Movimiento por Telegram), CU-001-E2 (Parsear Ticket por Imagen) |

<!-- Tabla 29 -->
| ID | CU-001-I1 |
| --- | --- |
| Nombre | Actualizar Saldo de Cuenta |
| Descripción | Recalcula y actualiza el saldo de la cuenta afectada tras registrar un movimiento, considerando moneda y tipo de operación. |
| Disparador | Se ejecuta automáticamente al confirmar el registro (paso 9). |
| Flujo | 1. Obtiene saldo actual. 2. Calcula nuevo saldo según tipo (suma ingreso, resta gasto). 3. Si es transferencia, actualiza ambas cuentas. 4. Persiste nuevo saldo. 5. Invalida caché del dashboard. |

<!-- Tabla 30 -->
| ID | CU-001-I2 |
| --- | --- |
| Nombre | Validar Datos del Movimiento |
| Descripción | Verifica que todos los datos ingresados sean válidos antes de persistir el movimiento. |
| Disparador | Se ejecuta cuando el usuario confirma el registro (paso 8). |
| Flujo | 1. Verifica monto > 0. 2. Valida cuenta existente y activa. 3. Verifica categoría válida para el tipo. 4. Valida formato de fecha. 5. Retorna resultado de validación. |

<!-- Tabla 31 -->
| ID | CU-001-E1 |
| --- | --- |
| Nombre | Registrar Movimiento por Telegram |
| Descripción | Permite registrar movimientos mediante mensajes al bot de Telegram (texto en lenguaje natural o nota de voz). Se modela como extensión por usar un canal y flujo diferentes. |
| Disparador | El usuario envía mensaje al bot con formato de movimiento (ej: ‘gasto 500 supermercado’). |
| Flujo | 1. El bot recibe y parsea el mensaje (Gemini con function-calling). 2. Identifica tipo, monto y categoría. 3. Solicita confirmación. 4. Si confirma, registra el movimiento. 5. Responde con resumen. |

<!-- Tabla 32 -->
| ID | CU-002 |
| --- | --- |
| Nombre | Gestionar Cuentas |
| Descripción | Permite crear, editar, activar/desactivar y eliminar cuentas financieras de distintos tipos: banco, efectivo, tarjetas, billeteras virtuales e inversiones. |
| Actor Principal | Usuario |
| Precondiciones | El usuario debe estar autenticado. |
| Postcondiciones | Las cuentas quedan configuradas según las modificaciones. Los cambios se reflejan en todo el sistema. |
| Flujo Principal | 1. El usuario accede a Cuentas. 2. Sistema muestra cuentas agrupadas por tipo. 3. Usuario selecciona crear o editar. 4. Completa formulario: nombre, tipo, moneda, saldo inicial. 5. Para tarjetas, configura límite y fecha de cierre. 6. Confirma. 7. Sistema valida y persiste. |
| Flujo Alternativo | 4a. Si es bi-moneda, configura ambas monedas (ARS/USD). 3a. Si elimina, verifica que no tenga movimientos. 7a. Si hay errores, muestra mensajes específicos. |
| Includes | CU-002-I1 (Calcular Saldo Total por Moneda) |
| Extends | CU-002-E1 (Configurar Tarjeta Bi-Moneda) |

<!-- Tabla 33 -->
| ID | CU-003 |
| --- | --- |
| Nombre | Visualizar Dashboard |
| Descripción | Muestra un resumen ejecutivo de la situación financiera: patrimonio líquido y total, cotizaciones actuales, últimos movimientos y estado de tarjetas. |
| Actor Principal | Usuario |
| Precondiciones | El usuario debe estar autenticado. Debe existir al menos una cuenta. |
| Postcondiciones | El usuario visualiza información actualizada de su patrimonio. |
| Flujo Principal | 1. El usuario accede al Dashboard. 2. Sistema obtiene cotizaciones. 3. Calcula patrimonio líquido y total. 4. Obtiene últimos N movimientos. 5. Calcula estado de tarjetas. 6. Renderiza todos los widgets. |
| Flujo Alternativo | 2a. Si APIs no responden, muestra última cotización con indicador de fecha. 3a. Si hay múltiples monedas, convierte a moneda base del usuario. |
| Includes | CU-003-I1 (Obtener Cotizaciones), CU-003-I2 (Calcular Patrimonio Consolidado) |
| Extends | CU-003-E1 (Consultar Asistente IA), CU-003-E2 (Detectar Anomalías de Gasto) |

<!-- Tabla 34 -->
| ID | CU-004 |
| --- | --- |
| Nombre | Gestionar Portafolio de Inversiones |
| Descripción | Permite registrar, visualizar y seguir posiciones de inversión en acciones USA y Merval, con cálculo de P&L. |
| Actor Principal | Usuario |
| Precondiciones | El usuario debe estar autenticado y tener al menos una cuenta de tipo ‘Inversión’. |
| Postcondiciones | El portafolio refleja las posiciones actuales con precios y P&L actualizados. |
| Flujo Principal | 1. El usuario accede a Inversiones. 2. Sistema muestra portafolio con posiciones. 3. Muestra ticker, cantidad, precio promedio, precio actual y P&L. 4. Usuario puede agregar posición. 5. Ingresa ticker, cantidad y precio de compra. 6. Sistema valida ticker. 7. Registra posición. |
| Flujo Alternativo | 4a. Si vende, registra venta y calcula ganancia realizada. 6a. Si ticker no existe, permite ingreso manual. 3a. Si sin cotización, muestra último precio. |
| Includes | CU-004-I1 (Obtener Precios de Mercado), CU-004-I2 (Calcular P&L de Posición) |
| Extends | — |

<!-- Tabla 35 -->
| ID | CU-005 |
| --- | --- |
| Nombre | Importar/Exportar Datos |
| Descripción | Permite importar movimientos desde CSV/XLSX y exportar datos en CSV/JSON para backup o análisis externo. |
| Actor Principal | Usuario |
| Precondiciones | El usuario debe estar autenticado. Para importar, el archivo debe cumplir el formato esperado. |
| Postcondiciones | Los datos quedan importados correctamente o el archivo exportado descargado. |
| Flujo Principal | 1. El usuario accede a Configuración > Importar/Exportar. 2. Selecciona operación. 3. Para exportar: tipo y formato. 4. Sistema genera y descarga archivo. 5. Para importar: sube archivo. 6. Sistema valida. 7. Muestra preview. 8. Usuario confirma. 9. Sistema importa. |
| Flujo Alternativo | 6a. Si formato inválido, muestra errores. 7a. Si hay duplicados, permite elegir acción. 9a. Si hay errores en filas, las reporta y continúa. |
| Includes | CU-005-I1 (Validar Formato de Archivo), CU-005-I2 (Mapear Categorías y Cuentas) |
| Extends | — (el parseo de tickets por imagen se modela como CU-001-E2, ingreso vía bot de Telegram) |

<!-- Tabla 36 -->
| ID | CU-006 |
| --- | --- |
| Nombre | Gestionar Reglas Recurrentes |
| Descripción | Permite al usuario crear, editar, activar/desactivar y eliminar reglas de transacciones recurrentes (gastos, ingresos o suscripciones periódicas). El sistema ejecuta automáticamente las transacciones según la frecuencia configurada mediante un cron job diario. |
| Actor Principal | Usuario (gestión manual); Sistema/Cron (ejecución automática) |
| Precondiciones | El usuario debe estar autenticado. Debe existir al menos una cuenta y una categoría activas. |
| Postcondiciones | La regla recurrente queda configurada. En cada ejecución del cron, el sistema genera automáticamente la transacción correspondiente y actualiza last_executed_date. |
| Flujo Principal | 1. El usuario accede a Recurrentes. 2. El sistema muestra la lista de reglas activas e inactivas. 3. El usuario selecciona “Nueva regla”. 4. Ingresa: tipo, cuenta, monto, moneda, categoría, descripción, frecuencia y fecha de inicio. 5. Opcionalmente indica si es suscripción (nombre del servicio). 6. Confirma. 7. El sistema valida y persiste la regla. 8. El cron job diario (/api/cron/recurring) evalúa y ejecuta reglas pendientes automáticamente. |
| Flujo Alternativo | 3a. Si edita una regla existente, pre-carga los datos actuales. 5a. Si define fecha de fin, la regla se desactiva automáticamente al superarla. 8a. Si la cuenta no tiene fondos suficientes para un gasto recurrente, el cron registra la transacción igualmente y notifica al usuario. |
| Includes | CU-006-I1 (Ejecutar Transacción Recurrente) |

<!-- Tabla 37 -->
| ID | Regla | Dónde se aplica (evidencia) |
| --- | --- | --- |
| RN-MOV-001 | El monto de un movimiento debe ser mayor a cero. | Validación en POST /api/transactions (CU-001-I2) |
| RN-MOV-002 | Si la moneda del movimiento difiere de la de la cuenta, se convierte con el tipo de cambio vigente y se persisten ambos montos. | transactionsService.create() + cotizacionesService.getExchangeRate() |
| RN-MOV-003 | El saldo de la cuenta se actualiza por trigger en la base de datos, nunca por código de aplicación. | Trigger update_account_balance() (supabase/schema.sql) |
| RN-CTA-001 | Toda consulta o escritura de datos de usuario filtra por user_id. | Capa de servicios (service-role + .eq(‘user_id’, …)) y políticas RLS |
| RN-REC-001 | Una regla recurrente no se ejecuta dos veces el mismo día (se reclama la fecha antes de crear el movimiento). | app/api/cron/recurring (CU-006-I1) |
| RN-REC-002 | Una regla recurrente contra una cuenta desactivada se saltea sin desactivar la regla. | app/api/cron/recurring — shouldProcess() |
| RN-COT-001 | La cotización del dólar se resuelve por fuentes con fallback ordenado (CriptoYa → DolarApi → caché en BD) y se cachea 300 segundos. | cotizacionesService (patrón Strategy, Anexo D.1) |
| RN-SEG-001 | Los cron jobs solo se ejecutan con el bearer secreto de Vercel Cron; los webhooks validan firma/secreto. | lib/cron/cron-job.ts (Anexo D.2), webhook MP (HMAC), webhook Telegram |

<!-- Tabla 38 -->
| Entidad | Descripción | Atributos Principales | Relaciones |
| --- | --- | --- | --- |
| Usuario | Persona que usa el sistema | email, moneda por defecto, zona horaria, estado de suscripción | Posee Cuentas; registra Movimientos; define Categorías; planifica Presupuestos |
| Cuenta | Contenedor de fondos de un tipo específico | nombre, tipo, moneda, saldo, es deuda, incluir en total | Pertenece a Usuario; origen/destino de Movimientos; contiene Inversiones; alimenta Reglas |
| Movimiento | Transacción financiera registrada | tipo, monto, moneda, monto en moneda de la cuenta, tipo de cambio, descripción, fecha | Pertenece a Cuenta y Categoría; puede originarse en una Regla Recurrente |
| Categoría | Clasificación de movimientos (con subcategorías) | nombre, tipo (gasto/ingreso), icono | Clasifica Movimientos; limita Presupuestos; puede agrupar Categorías hijas |
| Inversión | Posición en un activo financiero | ticker, nombre, tipo, cantidad, precio de compra, precio actual | Pertenece a Cuenta y Usuario |
| ReglaRecurrente | Regla de transacción periódica | descripción, monto, frecuencia, fecha de inicio, activa | Pertenece a Cuenta y Usuario; genera Movimientos automáticamente |
| Presupuesto | Límite de gasto por categoría y mes | mes, monto, moneda, alerta al porcentaje | Pertenece a Categoría y Usuario |
| Cotización | Precio de una moneda/activo en un momento | fuente, moneda origen, moneda destino, valor, fecha | Referenciada por Movimientos y por el cálculo de patrimonio |

<!-- Tabla 39 -->
| Paso | Actor / Objeto | Acción / Mensaje |
| --- | --- | --- |
| 1 | Usuario | Completa monto, cuenta, categoría en TransactionForm |
| 2 | TransactionForm (boundary) | POST /api/transactions { type, accountId, amount, currency } |
| 3 | Route handler (/api/transactions) | auth.getUser() valida la sesión |
| 4 | Route handler (/api/transactions) | Valida tipo, moneda y monto (400 si son inválidos) |
| 5 | transactionsService | create(input) |
| 6 | PostgreSQL (Supabase) | SELECT * FROM accounts WHERE id=? AND user_id=? |
| 7 | cotizacionesService | getExchangeRate(currency, account.currency) — solo si moneda ≠ moneda de la cuenta (caché 300s o API) |
| 8 | PostgreSQL (Supabase) | INSERT INTO transactions (amount_in_account_currency, exchange_rate, …) |
| 9 | PostgreSQL (Supabase) | TRIGGER update_account_balance(): UPDATE accounts SET balance = balance ± monto |
| 10 | Route handler (/api/transactions) | 201 Created con la transacción |
| 11 | TransactionForm (boundary) | Muestra confirmación al usuario |

<!-- Tabla 40 -->
| Paquete | Tecnología | Responsabilidad | Dependencias |
| --- | --- | --- | --- |
| Capa 1: Presentación | Next.js / React | app/(authenticated), components/ por feature + ui/, landing y /shared públicos | Capa 2 |
| Capa 2: Routing y Middleware | Next.js App Router | middleware.ts (guard de sesión), app/api/** (route handlers) | Capa 3 |
| Capa 3: Servicios (dominio) | TypeScript | lib/services: transactions, accounts, cotizaciones, investments, budgets, recurring, sharedExpenses | Capa 4 |
| Capa 4: Integración / Infraestructura | supabase-js, Telegraf, Gemini | lib/supabase, lib/telegram, lib/ai, lib/market-data, lib/cron | Capa 5 |
| Capa 5: Persistencia | Supabase (BaaS) | PostgreSQL + Auth (JWT) + RLS + triggers | — |
| Capa 6: Servicios externos | HTTP/REST | CriptoYa, DolarApi, CoinGecko, Yahoo Finance, Telegram, Gemini, Mercado Pago | accedidos desde Capas 3/4 |

<!-- Tabla 41 -->
| Componente | Tipo | Interfaz Provista | Interfaz Requerida |
| --- | --- | --- | --- |
| PWA Frontend (React / App Router) | Web Client (Vercel) | HTTP UI | Route Handlers (HTTP/REST) |
| Route Handlers (app/api/**) | Backend serverless (Vercel) | HTTP/REST JSON | Capa de Servicios, Motor de IA |
| Capa de Servicios (lib/services) | TypeScript | API interna de dominio | supabase-js, APIs de mercado |
| Bot de Telegram (Telegraf) | Integración (Vercel) | Webhook Telegram | Servicios, Motor de IA, Telegram Bot API |
| Motor de IA (Gemini, function-calling) | Integración (Vercel) | Chat / OCR / anomalías | API de Google Gemini |
| Cron Jobs (7 tareas) | Vercel Cron | — | Capa de Servicios |
| PostgreSQL + RLS | Supabase (BaaS) | supabase-js / SQL | — |
| Auth (JWT) | Supabase (BaaS) | JWT Auth API | — |
| CriptoYa / DolarApi / CoinGecko / Yahoo Finance | APIs externas | REST JSON | — |
| Mercado Pago (suscripciones) | API externa | Preapproval + webhook x-signature | — |

<!-- Tabla 42 -->
| Clase | Atributos | Métodos Principales |
| --- | --- | --- |
| TransactionsService | — | create(input), list(filters), getById(id, userId), createBalanceAdjustment(…), delete(id, userId) |
| AccountsService | — | list(userId), aggregateAccountTotals(accounts), getTotalBalance(userId) |
| CotizacionesService | dolarProviders: DolarRateProvider[] (patrón Strategy) | getDolarQuotes(), getExchangeRate(from, to), getCryptoQuote(symbol), getStockQuote(ticker, market) |
| InvestmentsService | — | list(userId), getPortfolioSummary(userId), sell(input) |
| Account (entidad) | id, userId, name, type, currency, balance, isDebt, creditLimit? | — |
| Transaction (entidad) | id, userId, type, amount, currency, amountInAccountCurrency, exchangeRate?, transactionDate | — |
| Category (entidad) | id, name, type (‘expense’|‘income’), parentId? | — |
| Investment (entidad) | id, ticker?, type, quantity, purchasePrice, currentPrice? | — |
| RecurringRule (entidad) | id, frequency, amount, startDate, isActive | — |
| Budget (entidad) | id, month, amount, alertAtPercent | — |

<!-- Tabla 43 -->
| Entidad | PK | FKs | Atributos Adicionales |
| --- | --- | --- | --- |
| users | id (UUID) | — | email, full_name, base_currency, subscription_status, created_at |
| accounts | id (UUID) | user_id → users | name, type, currency, balance, is_active, credit_limit, closing_date |
| transactions | id (UUID) | account_id → accounts; category_id → categories; destination_account_id → accounts (nullable) | type, amount, currency, transaction_date, description, exchange_rate |
| categories | id (UUID) | user_id → users (nullable, null = sistema) | name, type, icon, color, is_active |
| investments | id (UUID) | user_id → users; account_id → accounts | ticker, quantity, purchase_price, market, updated_at |
| exchange_rates | id (UUID) | — | type, buy_value, sell_value, timestamp, source |
| budgets | id (UUID) | user_id → users; category_id → categories | limit_amount, period, month, year |
| recurring_rules | id (UUID) | user_id → users; account_id → accounts; category_id → categories | type, amount, currency, frequency, start_date, end_date, last_executed_date, is_subscription, is_active |

<!-- Tabla 44 -->
| Nodo | Tecnología | Descripción |
| --- | --- | --- |
| Cliente (Browser/Mobile) | Chrome / Safari / Firefox | PWA instalable (React + Service Worker). HTTPS contra Vercel. |
| Vercel (Edge Network) | Next.js 14 serverless | Frontend SSR/CSR + route handlers (app/api/**) + webhook de Telegram. Deploy automático desde GitHub. |
| Cron Jobs (Vercel) | Vercel Cron | 7 tareas: recurring, update-prices, weekly-summary, monthly-summary, maturity-alerts, subscription-grace, budget-alerts. |
| Base de datos (Supabase) | PostgreSQL 15 + RLS + triggers | Datos de usuario con RLS; trigger update_account_balance(). |
| Auth (Supabase) | GoTrue (JWT) | Sesiones, tokens JWT, magic links. |
| APIs externas | CriptoYa / DolarApi / CoinGecko / Yahoo Finance / Google Gemini | Cotizaciones, precios de mercado e IA. Consultadas desde Vercel vía HTTPS; caché en memoria (TTL 300s) + histórico en exchange_rates. |
| Mercado Pago | Preapproval + Webhook | Suscripciones; webhook validado con firma HMAC x-signature. |
| Telegram | Bot API | Webhook entrante con secreto; mensajes salientes (DM). |

<!-- Tabla 45 -->
| ID | Caso de Uso | Caso de Prueba | Entrada | Resultado Esperado |
| --- | --- | --- | --- | --- |
| CP-001-01 | CU-001 | Registrar gasto válido en ARS | Tipo: Gasto, Cuenta: Banco, Monto: 5000, Moneda: ARS, Categoría: Supermercado | Movimiento guardado. Saldo cuenta reducido en 5000 ARS. Aparece en listado. |
| CP-001-02 | CU-001 | Registrar movimiento con monto cero | Monto: 0, demás campos válidos | Error: ‘El monto debe ser mayor a cero’. No se guarda. |
| CP-001-03 | CU-001 | Registrar transferencia entre cuentas | Tipo: Transferencia, Origen: Efectivo, Destino: Banco, Monto: 10000 ARS | Saldo efectivo -10000, saldo banco +10000. Dos movimientos registrados. |
| CP-001-04 | CU-001 | Registrar en moneda diferente a la cuenta | Cuenta ARS, Monto: 100 USD | Sistema solicita tipo de cambio. Con TC 1150, guarda 115.000 ARS. |
| CP-002-01 | CU-002 | Crear cuenta nueva tipo banco | Nombre: ‘Santander’, Tipo: Banco, Moneda: ARS, Saldo: 50000 | Cuenta creada y visible en listado. Saldo total actualizado. |
| CP-002-02 | CU-002 | Eliminar cuenta con movimientos | Cuenta con 5 movimientos asociados | Error: ‘No se puede eliminar una cuenta con movimientos’. Se sugiere desactivar. |
| CP-003-01 | CU-003 | Carga del dashboard con cotizaciones | Usuario con 3 cuentas, cotización USD blue: $1150 | Dashboard carga en <2s. Patrimonio en USD calculado correctamente. |
| CP-003-02 | CU-003 | Dashboard sin conexión a API cotización | API de cotizaciones no disponible | Muestra última cotización conocida con indicador ‘Última actualización: hace X min’. |
| CP-004-01 | CU-004 | Agregar posición de acción USA | Ticker: AAPL, Cantidad: 5, Precio compra: 185 USD | Posición guardada. P&L calculado según precio actual de mercado. |
| CP-005-01 | CU-005 | Exportar movimientos a CSV | Filtro: últimos 3 meses, Formato: CSV | Archivo CSV descargado con columnas: Fecha, Tipo, Monto, Moneda, Monto en Cuenta, Cuenta, Categoría, Descripción, Notas, Cuota. |
| CP-005-02 | CU-005 | Importar CSV con formato inválido | Archivo CSV sin columna ‘monto’ | Error: ‘Columna obligatoria faltante: monto’. No se importan datos. |

<!-- Tabla 46 -->
| Elemento UI | Descripción | Interacción |
| --- | --- | --- |
| Barra de Patrimonio | Muestra total ARS y total USD con variación del día | Tap para detalle por moneda |
| Widget Cotizaciones | Grilla con dólar oficial/blue/MEP/CCL y BTC/ETH/USDT | Tap para historial de cotización |
| Widget Cuentas | Lista agrupada: Bancos, Efectivo, Crypto, Inversiones | Tap cuenta para ver movimientos |
| Últimos Movimientos | Lista con ícono de categoría, descripción, monto y fecha | Tap movimiento para editar |
| FAB (+) | Botón flotante de acción rápida para nuevo movimiento | Abre bottom sheet con formulario |
| Estado Tarjetas | Barra de progreso por tarjeta: gastado / límite | Tap para ver detalle |

<!-- Tabla 47 -->
| Campo | Tipo UI | Validación |
| --- | --- | --- |
| Tipo | Toggle segmentado (Gasto/Ingreso/Transferencia) | Obligatorio |
| Monto | Input numérico grande + selector moneda inline | Obligatorio, > 0 |
| Cuenta | Dropdown con nombre, tipo e icono de cuenta | Obligatorio |
| Categoría | Grilla de íconos (12 categorías por tipo) | Obligatorio |
| Fecha | Date picker con default hoy | Obligatorio, no futura |
| Descripción | Input texto colapsable (opcional) | Max 200 caracteres |
| Tipo de cambio | Input numérico (solo visible si moneda ≠ cuenta) | Obligatorio si aplica |

<!-- Tabla 48 -->
| Requisito | Caso de Uso | Reglas | Robustez | Secuencia | Clases | Modelo de datos | Casos de Prueba |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RF01 | CU-001 | RN-MOV-001..003 | Figura 3 | Figura 5 | Figura 8 | transactions, accounts, categories | CP-001-01..04 |
| RF02 | CU-003-I1 | RN-COT-001 | Figura 4 | — | Figura 8 / Figura 11 | exchange_rates | CP-003-01, CP-003-02 |
| RF03 | CU-003-I2 | RN-CTA-001 | Figura 4 | — | Figura 8 | accounts, investments | CP-003-01 |
| RF04 | CU-002 | RN-CTA-001 | — | — | Figura 8 | accounts | CP-002-01, CP-002-02 |
| RF05 | CU-004 | RN-CTA-001 | — | — | Figura 8 | investments | CP-004-01 |
| RF06 | CU-001-E1 | RN-MOV-001..003 | Figura 3 (flujo Telegram) | — | — | transactions, users | — |
| RF07 | CU-005 | RN-CTA-001 | — | — | — | transactions | CP-005-01, CP-005-02 |
| RF08 | CU-001-E2 | RN-MOV-001..003 | Figura 3 (flujo Telegram) | — | — | transactions | — |
| RF09 | CU-006 | RN-REC-001, RN-REC-002, RN-SEG-001 | — | — | Figura 12 | recurring_rules, transactions | — |
| RF10 | CU-003-E1 | RN-CTA-001 | — | — | — | transactions, accounts | — |
| RF11 | CU-003-E2 | RN-CTA-001 | — | — | — | transactions | — |

<!-- Tabla 49 -->
| Columna (ES / EN) | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| fecha / date | YYYY-MM-DD o fecha de Excel | Sí | Fecha del movimiento |
| tipo / type | gasto|ingreso|transferencia | Sí | Tipo de movimiento |
| monto / amount | decimal (ej: 1500.00) | Sí | Monto del movimiento (positivo) |
| moneda / currency | ARS|USD|USDT|BTC|ETH | Sí | Moneda del movimiento |
| cuenta / account | string | Sí | Nombre exacto de la cuenta |
| categoría / category | string | Sí | Nombre de la categoría |
| monto en cuenta / amount in account | decimal | No | Monto convertido a la moneda de la cuenta (movimientos multi-moneda) |
| descripción / description | string | No | Descripción libre del movimiento |
| notas / notes | string | No | Notas adicionales |
| cuota / installment | string | No | Identificación de cuota (compras en cuotas) |