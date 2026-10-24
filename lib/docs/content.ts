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
          '4. Cabecera Authorization: Bearer zrxp_… y Content-Type application/json.',
          '5. Cuerpo JSON: amount, currency, merchant, cardName, timestamp. El monto o el comercio pueden ir vacíos.',
        ],
      },
      {
        heading: 'Plantilla (ejemplo)',
        body: [
          '{ "amount": 1250.50, "currency": "ARS", "merchant": "Ejemplo Café (dato de ejemplo)", "cardName": "Visa Ejemplo", "timestamp": "2026-10-24T18:00:00-03:00" }',
          'Zarix no crea el movimiento al toque: lo deja en la bandeja de pendientes. La primera vez que mapeás “Visa Ejemplo” a una cuenta, lo recuerda.',
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
          'Ejemplo de texto (dato de ejemplo): “Compra de $1.250,50 en Ejemplo Café con Visa Ejemplo”. Zarix extrae monto y comercio con una heurística. No hace falta una llamada paga a Gemini.',
        ],
      },
    ],
  },
  {
    slug: 'tokens-api',
    title: 'Tokens y API',
    description: 'Tokens personales, permisos y el ingest de Wallet. El REST v1 llega en una segunda etapa.',
    sections: [
      {
        heading: 'Tokens personales',
        body: [
          'Creás, listás y revocás tokens en Configuración → Integraciones. Zarix guarda un hash SHA-256, nunca el valor.',
          'Permisos: read, write, ingest. Podés revocar en cualquier momento. Cada uso queda en el registro de auditoría (IP hasheada).',
        ],
      },
      {
        heading: 'Ingest Wallet',
        body: [
          'POST /api/ingest/wallet con Authorization: Bearer zrxp_… y permiso ingest. Idempotency-Key opcional. Hay recorte de tamaño y de ráfagas.',
        ],
      },
      {
        heading: 'REST y MCP',
        body: [
          'La API REST /api/v1 y el servidor MCP remoto se documentan cuando se activen. Mientras tanto, el chat de la app y Telegram ya usan el mismo registro de herramientas.',
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
        heading: 'En preparación',
        body: [
          'Zarix va a exponer un servidor MCP remoto en /api/mcp autenticado con el mismo token personal.',
          'Las herramientas de lectura llevan la anotación readOnlyHint. Las de escritura piden el permiso write.',
          'Esta página se completa con snippets de Claude, Grok, ChatGPT y Cursor cuando esa pieza esté publicada.',
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
          'gemini_api_key y telegram_bot_token viven cifrados. El cliente autenticado no puede leerlos por la API de datos.',
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
          'No. Lo manda a la bandeja de pendientes. Si activás el auto-confirm y el comercio ya es conocido, se confirma solo.',
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
