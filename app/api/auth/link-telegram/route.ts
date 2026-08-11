import { NextResponse } from 'next/server';

// DEPRECADO (2026-08-11). El flujo viejo vinculaba un telegram_chat_id enviado
// por el body, usando el chat_id como su propia "prueba" — sin prueba de
// posesión, permitía vincular el chat de una víctima (griefing / desvío de
// mensajes). Reemplazado por el flujo con código de un solo uso:
//   1) POST /api/auth/telegram-link-code  → genera el código
//   2) el usuario lo envía al bot          → lib/telegram/bot.ts redeemLinkCode
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Este método de vinculación fue reemplazado. Generá un código en Configuración → Telegram y envialo al bot.',
    },
    { status: 410 }
  );
}
