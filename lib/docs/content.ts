export type DocsPage = {
  slug: string;
  title: string;
  description: string;
  sections: Array<{ heading: string; body: string[] }>;
};

export const DOCS_PAGES: DocsPage[] = [
  {
    slug: '',
    title: 'Qué es Zarix',
    description: 'Finanzas personales para Argentina, con cuentas, tarjetas, presupuestos y un asistente.',
    sections: [
      {
        heading: 'Para quién',
        body: [
          'Zarix es una app de finanzas personales para uso público y multi-usuario. Cada persona ve solo sus datos.',
          'Está pensada para Argentina: pesos, dólares, blue/MEP/CCL, tarjetas, presupuestos y un bot de Telegram.',
        ],
      },
      {
        heading: 'Funciones principales',
        body: [
          'Cuentas y efectivo, tarjetas de crédito (incluida la deuda), patrimonio líquido e inversiones.',
          'Presupuestos, reglas recurrentes, importar/exportar, y un bot de Telegram (texto, voz y foto de ticket).',
          'Los números de esta documentación son ejemplos etiquetados. No son datos reales de nadie.',
        ],
      },
    ],
  },
  {
    slug: 'funciones',
    title: 'Funciones',
    description: 'Cuentas, tarjetas, patrimonio, inversiones, presupuestos y más.',
    sections: [
      {
        heading: 'Cuentas y tarjetas',
        body: [
          'Cada cuenta tiene moneda (ARS, USD o EUR) y tipo: efectivo, banco, tarjeta, billetera, crypto o broker.',
          'En una tarjeta, el saldo es deuda. Ejemplo: Visa Ejemplo con $12.500 ARS de deuda (dato de ejemplo).',
          'En cada tarjeta ves el resumen proyectado del próximo cierre y de los siguientes: cuotas pendientes mes a mes, deuda futura en ARS y USD, y el vencimiento con el total estimado de ese resumen (no el mínimo ni el saldo de cuenta, que ya incluye cuotas futuras). Ejemplo: cierre 15/11, vencimiento 25/11, $80.000 ARS + US$ 40 (dato de ejemplo).',
        ],
      },
      {
        heading: 'Patrimonio líquido e inversiones',
        body: [
          'El patrimonio líquido suma efectivo y bancos y resta la deuda de tarjetas. Las posiciones de inversión viven en /inversiones y no se mezclan con ese total.',
          'El dashboard de cartera muestra valuación, variación y composición. Ejemplo: 2 CEDEARs AAPL (dato de ejemplo).',
        ],
      },
      {
        heading: 'Presupuestos, recurrentes e importación',
        body: [
          'Podés poner un tope por categoría, cargar el alquiler todos los meses y importar/exportar CSV.',
        ],
      },
    ],
  },
  {
    slug: 'telegram',
    title: 'Telegram',
    description: 'Cómo vincular el bot y cargar gastos por texto, voz o foto.',
    sections: [
      {
        heading: 'Vincular tu chat',
        body: [
          'En Configuración generás un código de un solo uso (10 minutos) y se lo mandás al bot. Quien envía el código demuestra que controla ese chat.',
          'También podés usar un bot propio de BotFather. Zarix nunca vuelve a mostrarte el token: lo guarda cifrado.',
        ],
      },
      {
        heading: 'Qué entiende el bot',
        body: [
          'Texto (“gasté 2500 en el super con Mercado Pago”), voz y foto de ticket. Ejemplo de respuesta: “✓ Super — Mercado Pago $2.500” (dato de ejemplo).',
          'El modelo llama herramientas de Zarix (crear movimiento, saldos, presupuestos). No tiene otra vía para tocar tus datos.',
        ],
      },
    ],
  },
  {
    slug: 'apple-wallet',
    title: 'Apple Wallet y Atajos',
    description: 'Automatización personal que manda cada transacción de Wallet a Zarix.',
    sections: [
      {
        heading: 'Paso a paso',
        body: [
          '1. Creá un token con permiso ingest en Configuración → Integraciones. Copialo: se muestra una sola vez.',
          '2. En Atajos, Automatización personal, disparador de transacción de Wallet.',
          '3. Acción “Obtener contenido de URL”, método POST a https://zarix-phi.vercel.app/api/ingest/wallet',
          '4. Cabecera Authorization: Bearer zrxp_… y Content-Type application/json. Idempotency-Key opcional: la misma clave con el mismo cuerpo y canal reusa el pendiente; otro cuerpo o canal da 409. Sin clave siempre se crea un pendiente nuevo (un match de 15 minutos se marca posible duplicado). Auto-confirmación exige timestamp completo o esa clave; una fecha sola no alcanza.',
          '5. Cuerpo JSON: amount, currency, merchant, cardName, timestamp. El monto o el comercio pueden ir vacíos.',
          '6. En el Atajo mostrá el status de la respuesta (autoConfirmed o pending) y un enlace a /pendientes.',
        ],
      },
      {
        heading: 'Plantilla (ejemplo)',
        body: [
          '{ "amount": 1250.50, "currency": "ARS", "merchant": "Ejemplo Café (dato de ejemplo)", "cardName": "Visa Ejemplo", "timestamp": "2026-10-24T18:00:00-03:00" }',
          'Zarix no crea el movimiento al toque: lo deja en la bandeja de pendientes. La auto-confirmación exige un timestamp completo o Idempotency-Key, monto claro y comercio conocido; nunca aplica a un posible duplicado. La primera vez que mapeás “Visa Ejemplo” a una cuenta, lo recuerda.',
        ],
      },
    ],
  },
  {
    slug: 'android',
    title: 'Android (MacroDroid / Tasker)',
    description: 'Mandá el texto de la notificación al mismo endpoint.',
    sections: [
      {
        heading: 'Misma API que Apple',
        body: [
          'POST a /api/ingest/wallet con Bearer token (permiso ingest). Podés mandar JSON o text/plain con el cuerpo de la notificación.',
          'La auto-confirmación exige un timestamp completo o una cabecera Idempotency-Key; una fecha sola no alcanza. Sin clave, un reintento a los pocos minutos queda pending como posible duplicado (se descarta de un clic en /pendientes). Mostrá autoConfirmed/pending de la respuesta y un enlace a /pendientes.',
          'Ejemplo de texto (dato de ejemplo): “Compra de $1.250,50 en Ejemplo Café con Visa Ejemplo”. Zarix extrae monto y comercio con una heurística. No hace falta una llamada paga a Gemini.',
        ],
      },
    ],
  },
  {
    slug: 'tokens-api',
    title: 'Tokens y API',
    description: 'Tokens personales, permisos, ingest de Wallet y REST v1.',
    sections: [
      {
        heading: 'Tokens personales',
        body: [
          'Creás, listás y revocás tokens en Configuración → Integraciones. Caducan en 1 año (no se puede dejar sin vencimiento). Zarix guarda SHA-256 del token de 256 bits (hash_version=1). hash_version=2 queda reservado para un pepper dedicado; no está habilitado y no usa SUPABASE_JWT_SECRET. Nunca se guarda el valor.',
          'Permisos: read, write, ingest, write:confirm. write estaciona un movimiento en la bandeja. write:confirm deja que MCP/REST confirme el pendiente por su cuenta (payload congelado). Está apagado por defecto: un token robado con write:confirm puede cargar gastos. Preferí confirmar en Pendientes o Telegram. Podés revocar en cualquier momento. Cada uso queda en el registro de auditoría (IP hasheada).',
        ],
      },
      {
        heading: 'Ingest Wallet',
        body: [
          'POST /api/ingest/wallet con Authorization: Bearer zrxp_… y permiso ingest. Idempotency-Key opcional: replay exacto reusa el pendiente; otro cuerpo o canal da 409. Sin clave no hay duplicate:true. Hay recorte de tamaño y de ráfagas.',
        ],
      },
      {
        heading: 'REST v1',
        body: [
          'GET /api/v1/openapi.json describe las herramientas remotas. En v1 las únicas escrituras son create_transaction y create_transactions (borrar, editar, cuentas y recurrentes siguen en la app y Telegram). GET /api/v1/tools las lista según el token (un PAT de solo lectura no ve las de escritura). POST /api/v1/tools/{nombre} las ejecuta.',
          'Idempotency-Key (header) gana sobre requestId del cuerpo; la clave no caduca. El mismo cuerpo y canal reusa el pendiente (incluso confirmado o descartado). Otro cuerpo o canal da 409, sin reescribir la clave. Confirmá SOLO con {confirm:true, pendingId} o pendingIds: campos extra (monto, cuenta) se rechazan y no escriben. Un PAT write estaciona; hace falta write:confirm para confirmar por API.',
          'create_transaction(s) no escriben el libro al toque: quedan en pendientes. El payload estacionado se ejecuta tal cual (cuotas e destino incluidos).',
          'Ejemplo (dato de ejemplo): curl -X POST -H "Authorization: Bearer zrxp_…" -H "Content-Type: application/json" -H "Idempotency-Key: ejemplo-001" -d "{\\"type\\":\\"expense\\",\\"amount\\":10}" https://zarix-phi.vercel.app/api/v1/tools/create_transaction',
        ],
      },
    ],
  },
  {
    slug: 'mcp',
    title: 'Conectar tu propia IA (MCP)',
    description: 'Claude, Grok, ChatGPT y Cursor usarán el mismo registro de herramientas.',
    sections: [
      {
        heading: 'URL y token',
        body: [
          'Servidor remoto: https://zarix-phi.vercel.app/api/mcp (Streamable HTTP). Authorization: Bearer zrxp_… con permiso read (y write si querés estacionar movimientos). Para confirmar por MCP hace falta write:confirm; si no, una persona confirma en la bandeja. Idempotency-Key del header gana sobre requestId del cuerpo.',
          'Hoy el camino soportado es un PAT. Los conectores alojados de Claude y ChatGPT necesitan OAuth; esa vía está detrás de ZARIX_MCP_OAUTH_ENABLED y todavía no está disponible.',
          'Las escrituras se auditan con source mcp. Sin confirm=true quedan en la bandeja. Gemini debe mostrar el preview y solo reintentar con confirm=true si el usuario acepta.',
        ],
      },
      {
        heading: 'Claude / ChatGPT (conectores alojados)',
        body: [
          'Los conectores remotos de Claude y ChatGPT no aceptan un Bearer estático: piden OAuth. Esa bandera está apagada. Mientras tanto usá PAT + REST, o un cliente que mande headers.',
        ],
      },
      {
        heading: 'Cursor, Codex CLI, Claude Code / Desktop',
        body: [
          'Cursor mcp.json: { "zarix": { "url": "https://zarix-phi.vercel.app/api/mcp", "headers": { "Authorization": "Bearer zrxp_…" } } }.',
          'Claude Code / Desktop y Codex CLI: mismo URL Streamable HTTP y el header Authorization. REST: POST /api/v1/tools/{nombre} con el mismo Bearer.',
          'No uses la cuenta real del dueño de Zarix: creá un token de prueba (fixture).',
        ],
      },
    ],
  },
  {
    slug: 'gemini',
    title: 'Tu propia clave de Gemini',
    description: 'Bring-your-own-key. Si no hay clave tuya, se usa la del servidor si está configurada.',
    sections: [
      {
        heading: 'Cómo cargarla',
        body: [
          'En Configuración pegás una API key de Google AI Studio. Zarix la cifra y nunca la vuelve a mostrar.',
          'Sirve para el chat, el bot y (opcional) sugerir categoría en Wallet solo si ya tenés clave propia. El ingest no depende de eso.',
        ],
      },
    ],
  },
  {
    slug: 'privacidad',
    title: 'Privacidad y seguridad',
    description: 'Qué se guarda, cómo se cifran los secretos y cómo revocar acceso.',
    sections: [
      {
        heading: 'Qué se guarda',
        body: [
          'Cuentas, movimientos, presupuestos, reglas, sesiones del bot y (si los usás) tokens hasheados y pendientes de Wallet.',
          'No se guardan números de tarjeta completos. CBU/CUIT/PAN se enmascaran en las respuestas de las herramientas.',
        ],
      },
      {
        heading: 'Cifrado y revocación',
        body: [
          'gemini_api_key y telegram_bot_token se guardan cifrados (Vault, o AES-GCM local). Al guardar, la columna en claro queda null. La lectura usa solo el secreto cifrado; la columna en claro no se lee.',
          'Revocá un token en Integraciones y deja de funcionar. El registro de auditoría muestra altas, bajas y usos, con IP hasheada.',
        ],
      },
    ],
  },
  {
    slug: 'faq',
    title: 'Preguntas frecuentes',
    description: 'Dudas habituales de armado y de datos.',
    sections: [
      {
        heading: '¿El atajo crea el gasto solo?',
        body: [
          'No. Lo manda a la bandeja de pendientes. Si activás el auto-confirm, hay timestamp completo o Idempotency-Key, y el comercio ya es conocido, se confirma solo (autoConfirmed). Un posible duplicado nunca se auto-confirma: queda pending en /pendientes para descartar de un clic.',
        ],
      },
      {
        heading: '¿Puedo usar Zarix sin Telegram?',
        body: [
          'Sí. Telegram es opcional. El chat de la app usa las mismas herramientas.',
        ],
      },
      {
        heading: '¿Los ejemplos de esta doc son reales?',
        body: [
          'No. Todos los montos y comercios están etiquetados como ejemplo.',
        ],
      },
    ],
  },
];

export function docsNav(): Array<{ href: string; title: string }> {
  return DOCS_PAGES.map((p) => ({ href: p.slug ? `/docs/${p.slug}` : '/docs', title: p.title }));
}

export function findDocsPage(slug: string): DocsPage | undefined {
  return DOCS_PAGES.find((p) => p.slug === slug);
}
