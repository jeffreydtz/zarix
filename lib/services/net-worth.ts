import { createServiceClientSync } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { investmentsService } from '@/lib/services/investments';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import type { BlueFxComponentReference } from '@/lib/blue-fx-reference';

export interface NetWorthPoint {
  snapshot_date: string;
  liquid_usd: number;
  investments_usd: number;
  total_usd: number;
  total_ars_blue: number;
  blue_ars_per_usd: number;
}

export interface NetWorthNow {
  liquidUSD: number;
  investmentsUSD: number;
  totalUSD: number;
  totalARSBlue: number;
  blueRate: number;
  /** Current components can have different quote samples; no universal source is inferred. */
  blueReferences?: BlueFxComponentReference[];
}

/**
 * Patrimonio total del usuario HOY: cuentas (líquido + cash de cuentas de
 * inversión) + posiciones del portafolio. Misma composición que el dashboard
 * (sin doble conteo: las posiciones son filas aparte del cash del broker).
 */
export async function computeNetWorth(userId: string): Promise<NetWorthNow> {
  const [accounts, portfolio, dolar] = await Promise.all([
    accountsService.list(userId).catch(() => []),
    investmentsService
      .getPortfolioSummary(userId, { skipQuoteRefresh: true, skipDailySnapshot: true })
      .catch(() => null),
    cotizacionesService.getDolarQuotes({ preferCache: true }).catch(() => null),
  ]);

  const balances =
    accounts.length > 0
      ? accountsService.aggregateAccountTotals(accounts)
      : { liquidUSD: 0, investmentsUSD: 0, totalUSD: 0, totalARSBlue: 0 };

  const portfolioUSD = portfolio?.totalCurrentValue ?? 0;
  const portfolioARSBlue = portfolio?.totalCurrentValueArsBlue ?? 0;

  return {
    liquidUSD: balances.liquidUSD,
    investmentsUSD: balances.investmentsUSD + portfolioUSD,
    totalUSD: balances.totalUSD + portfolioUSD,
    totalARSBlue: balances.totalARSBlue + portfolioARSBlue,
    blueRate: dolar?.blue?.sell ?? 0,
    blueReferences: [
      ...('blueReferences' in balances ? balances.blueReferences ?? [] : []).map(reference => ({ component: 'accounts' as const, reference })),
      ...(portfolio?.blueReference && portfolio.investments.length > 0
        ? [{ component: 'portfolio' as const, reference: portfolio.blueReference }] : []),
    ],
  };
}

/**
 * Upsert del snapshot de HOY (idempotente por unique user_id+snapshot_date).
 * Best-effort: los errores no deben tumbar al llamador (dashboard o cron).
 */
export async function recordNetWorthSnapshot(userId: string): Promise<boolean> {
  try {
    const now = await computeNetWorth(userId);
    // Sin cotización no hay conversión confiable: mejor saltear el día que
    // guardar un total en 0 que ensucie el gráfico. Se loguea para que un
    // hueco en la serie sea diagnosticable.
    if (!(now.blueRate > 0)) {
      console.warn('[net-worth] snapshot salteado: sin cotización blue');
      return false;
    }

    const supabase = createServiceClientSync();
    const { error } = await supabase.from('net_worth_snapshots').upsert(
      {
        user_id: userId,
        snapshot_date: new Date().toISOString().split('T')[0],
        liquid_usd: now.liquidUSD,
        investments_usd: now.investmentsUSD,
        total_usd: now.totalUSD,
        total_ars_blue: now.totalARSBlue,
        blue_ars_per_usd: now.blueRate,
      },
      { onConflict: 'user_id,snapshot_date' }
    );
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[net-worth] snapshot error:', e);
    return false;
  }
}

/** Serie histórica ascendente por fecha (hasta `days` días hacia atrás). */
export async function getNetWorthHistory(
  userId: string,
  days = 365
): Promise<NetWorthPoint[]> {
  const supabase = createServiceClientSync();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('net_worth_snapshots')
    .select('snapshot_date, liquid_usd, investments_usd, total_usd, total_ars_blue, blue_ars_per_usd')
    .eq('user_id', userId)
    .gte('snapshot_date', since.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => ({
    snapshot_date: r.snapshot_date as string,
    liquid_usd: Number(r.liquid_usd),
    investments_usd: Number(r.investments_usd),
    total_usd: Number(r.total_usd),
    total_ars_blue: Number(r.total_ars_blue),
    blue_ars_per_usd: Number(r.blue_ars_per_usd),
  }));
}
