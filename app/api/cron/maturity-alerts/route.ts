import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { sendTelegramDm } from '@/lib/telegram/send';

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

class MaturityAlertsJob extends IterativeCronJob<any> {
  readonly name = 'maturity-alerts';

  private today = new Date();

  protected async fetchItems(supabase: ServiceClient): Promise<any[]> {
    const in3Days = new Date(this.today);
    in3Days.setDate(in3Days.getDate() + 3);

    const todayStr = this.today.toISOString().split('T')[0];
    const in3DaysStr = in3Days.toISOString().split('T')[0];

    // Get investments with maturity dates in the next 3 days
    const { data: investments, error } = await supabase
      .from('investments')
      .select('*, user:users(telegram_chat_id, telegram_bot_token)')
      .eq('is_active', true)
      .not('maturity_date', 'is', null)
      .gte('maturity_date', todayStr)
      .lte('maturity_date', in3DaysStr);

    if (error) throw error;
    return investments || [];
  }

  protected shouldProcess(inv: any): boolean {
    const user = inv.user as any;
    return Boolean(user?.telegram_chat_id);
  }

  protected async processItem(_supabase: ServiceClient, inv: any): Promise<void> {
    const user = inv.user as any;

    const maturityDate = new Date(inv.maturity_date + 'T00:00:00');
    const daysUntilMaturity = Math.round((maturityDate.getTime() - this.today.getTime()) / (1000 * 60 * 60 * 24));

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

    await sendTelegramDm(user.telegram_chat_id, message, {
      parse_mode: 'Markdown',
      botToken: user.telegram_bot_token,
    });
  }

  protected emptyMessage(): string {
    return 'No upcoming maturities';
  }
}

export async function GET(request: NextRequest) {
  return new MaturityAlertsJob().run(request);
}
