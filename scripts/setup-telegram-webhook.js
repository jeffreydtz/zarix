require('dotenv').config({ path: '.env.local' });
const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!TELEGRAM_BOT_TOKEN || !APP_URL || !WEBHOOK_SECRET) {
  console.error('❌ Faltan variables de entorno:');
  console.error('   - TELEGRAM_BOT_TOKEN');
  console.error('   - NEXT_PUBLIC_APP_URL');
  console.error('   - TELEGRAM_WEBHOOK_SECRET');
  process.exit(1);
}

const webhookUrl = `${APP_URL}/api/telegram/webhook`;

const options = {
  hostname: 'api.telegram.org',
  path: `/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

const data = JSON.stringify({
  url: webhookUrl,
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query'],
});

console.log('🔧 Configurando webhook de Telegram...');
console.log(`   URL: ${webhookUrl}`);

const req = https.request(options, (res) => {
  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    const response = JSON.parse(body);

    if (response.ok) {
      console.log('✅ Webhook configurado correctamente!');
      console.log(`   ${response.description}`);
      setBotCommands();
    } else {
      console.error('❌ Error configurando webhook:');
      console.error(`   ${response.description}`);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error de red:', error.message);
  process.exit(1);
});

req.write(data);
req.end();

// Registra el menú de comandos "/" que ve el usuario en el chat. Sin esto, el
// botón de comandos de Telegram aparece vacío aunque el bot los soporte.
function setBotCommands() {
  const commands = [
    { command: 'cuentas', description: 'Saldos de todas tus cuentas' },
    { command: 'cotizaciones', description: 'Dólar (blue, MEP, CCL) y cripto' },
    { command: 'resumen', description: 'Resumen del mes al instante' },
    { command: 'resumenes', description: 'Avisos semanal y mensual' },
    { command: 'notificaciones', description: 'Configurar avisos automáticos' },
    { command: 'reset', description: 'Borrar la memoria del chat' },
    { command: 'help', description: 'Ayuda y ejemplos' },
  ];
  const payload = JSON.stringify({ commands });
  const cmdReq = https.request(
    {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const r = JSON.parse(body);
          console.log(r.ok ? '✅ Menú de comandos registrado!' : `⚠️ setMyCommands: ${r.description}`);
        } catch {
          console.log('⚠️ No se pudo leer la respuesta de setMyCommands');
        }
      });
    }
  );
  cmdReq.on('error', (error) => console.log('⚠️ setMyCommands error de red:', error.message));
  cmdReq.write(payload);
  cmdReq.end();
}
