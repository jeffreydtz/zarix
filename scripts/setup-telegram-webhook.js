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
