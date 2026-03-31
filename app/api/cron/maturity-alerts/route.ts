import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const INVESTMENT_TYPE_LABELS: Record<string, string> = {
  plazo_fijo: 'Plazo Fijo',
  caucion: 'Caución',
  bond: 'Bono',
  fci: 'FCI',
  stock_arg: 'Acción ARG',
  cedear: 'CEDEAR',
  stock_us: 'Acción USA',
  etf: 'ETF',
  crypto: 'Crypto',
  real_estate: 'Inmueble',
  other: 'Otro',
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClientSync();

  const today = new Date();
  const in3Days = new Date(today);
  in3Days.setDate(in3Days.getDate() + 3);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayStr = today.toISOString().split('T')[0];
  const in3DaysStr = in3Days.toISOString().split('T')[0];

  // Get investments with maturity dates in the next 3 days
  const { data: investments, error } = await supabase
    .from('investments')
    .select('*, user:users(telegram_chat_id)')
    .eq('is_active', true)
    .not('maturity_date', 'is', null)
    .gte('maturity_date', todayStr)
    .lte('maturity_date', in3DaysStr);

  if (error) {
    console.error('Error fetching maturing investments:', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  if (!investments || investments.length === 0) {
    return NextResponse.json({ message: 'No upcoming maturities', notified: 0 });
  }

  let notified = 0;

  for (const inv of investments) {
    const user = inv.user as any;
    if (!user?.telegram_chat_id) continue;

    const maturityDate = new Date(inv.maturity_date + 'T00:00:00');
    const daysUntilMaturity = Math.round((maturityDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    const typeLabel = INVESTMENT_TYPE_LABELS[inv.type] || inv.type;
    
    let daysText = '';
    if (daysUntilMaturity === 0) {
      daysText = '⚡ ¡*VENCE HOY!*';
    } else if (daysUntilMaturity === 1) {
      daysText = '⚠️ Vence *mañana*';
    } else {
      daysText = `🔔 Vence en *${daysUntilMaturity} días*`;
    }

    const totalValue = Number(inv.quantity) * Number(inv.purchase_price);
    let returnAmount = 0;
    if (inv.interest_rate) {
      const daysDuration = inv.purchase_date 
        ? Math.round((maturityDate.getTime() - new Date(inv.purchase_date).getTime()) / (1000 * 60 * 60 * 24))
        : 30;
      returnAmount = totalValue * (Number(inv.interest_rate) / 100) * (daysDuration / 365);
    }

    const message =
      `📅 *VENCIMIENTO DE INVERSIÓN*\n\n` +
      `${daysText}\n\n` +
      `📌 *${inv.name}*${inv.ticker ? ` (${inv.ticker})` : ''}\n` +
      `🏷️ Tipo: ${typeLabel}\n` +
      `💰 Capital: $${totalValue.toLocaleString('es-AR')} ${inv.purchase_currency}\n` +
      (inv.interest_rate ? `📈 TNA: ${Number(inv.interest_rate).toFixed(2)}%\n` : '') +
      (returnAmount > 0 ? `💵 Retorno estimado: +$${returnAmount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}\n` : '') +
      `📅 Fecha: ${maturityDate.toLocaleDateString('es-AR')}\n\n` +
      `¿Renovás o retirás? Avisame para actualizar tu portafolio.`;

    try {
      await bot.telegram.sendMessage(user.telegram_chat_id, message, {
        parse_mode: 'Markdown',
      });
      notified++;
    } catch (e) {
      console.error(`Error notifying user ${inv.user_id}:`, e);
    }
  }

  return NextResponse.json({
    success: true,
    upcoming: investments.length,
    notified,
  });
}
