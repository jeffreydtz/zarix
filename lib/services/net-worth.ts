import { createServiceClientSync } from '@/lib/supabase/server';
import {
  accountsService,
  type CreditCardDebtSlice,
  type PartialAccountValuation,
} from '@/lib/services/accounts';
import { investmentsService } from '@/lib/services/investments';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import type { BlueFxComponentReference } from '@/lib/blue-fx-reference';
import { composeLiquidNetWorth } from '@/lib/services/liquid-net-worth';
import { isExecutableDolarQuote } from '@/lib/executable-fx';

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
  investmentsUSD: number | null;
  totalUSD: number;
  totalARSBlue: number;
  blueRate: number | null;
  fxUnavailable?: boolean;
  fxStale?: boolean;
  fxAsOf?: string | null;
  availableUSD?: number;
  availableARSBlue?: number;
  creditCardDebtUSD?: number;
  creditCardDebtARSBlue?: number;
  creditCards?: CreditCardDebtSlice[];
  brokerCashUSD?: number;
  positionsUSD?: number | null;
  positionsARSBlue?: number | null;
  /** Current components can have different quote samples; no universal source is inferred. */
  blueReferences?: BlueFxComponentReference[];
  valuation?: PartialAccountValuation;
}

const EMPTY_BALANCES = {
  liquidUSD: 0,
  liquidARSBlue: 0,
  investmentsUSD: 0,
  investmentsARSBlue: 0,
  availableUSD: 0,
  availableARSBlue: 0,
  creditCardDebtUSD: 0,
  creditCardDebtARSBlue: 0,
  creditCards: [] as CreditCardDebtSlice[],
  totalUSD: 0,
  totalARSBlue: 0,
  blueReferences: [] as NonNullable<ReturnType<typeof accountsService.aggregateAccountTotals>['blueReferences']>,
  valuation: undefined as PartialAccountValuation | undefined,
};

/**
 * Patrimonio total HOY = solo dinero líquido (efectivo/bancos/billeteras menos
 * deuda de tarjetas). Las posiciones de `public.investments` y el cash de
 * cuentas investment/crypto NO entran, aunque include_in_total sea true.
 */
function blueRateFromConvertedAccounts(
  balances: { blueReferences?: Array<{ rate: number }> },
  accounts: Array<{ blueReference?: { rate: number } }>
): number | null {
  const fromTotals = balances.blueReferences?.find((reference) => reference.rate > 0)?.rate;
  if (fromTotals && fromTotals > 0) return fromTotals;
  const fromRow = accounts.find((account) => (account.blueReference?.rate ?? 0) > 0)?.blueReference?.rate;
  return fromRow && fromRow > 0 ? fromRow : null;
}

export async function computeNetWorth(userId: string): Promise<NetWorthNow> {
  const [accounts, portfolio] = await Promise.all([
    accountsService.list(userId, { allowPartialValuation: true }),
    investmentsService
      .getPortfolioSummary(userId, { skipQuoteRefresh: true, skipDailySnapshot: true }),
  ]);

  const balances =
    accounts.length > 0
      ? accountsService.aggregateAccountTotals(accounts)
      : EMPTY_BALANCES;

  let blueRate = blueRateFromConvertedAccounts(balances, accounts);
  let fallbackFx: { fxStale?: boolean; fxAsOf?: string | null } = {};
  if (blueRate == null) {
    const dolar = await cotizacionesService.getDolarQuotes({ require: ['blue'] }).catch(() => null);
    blueRate = dolar?.blue?.sell ?? null;
    fallbackFx = { fxStale: dolar?.blue?.stale,
      fxAsOf: (dolar?.blue?.asOf ?? dolar?.blue?.timestamp)?.toISOString() ?? null };
  }

  return composeLiquidNetWorth({
    balances: { ...balances, ...fallbackFx },
    portfolio,
    blueRate,
  });
}

/**
 * Upsert del snapshot de HOY (idempotente por unique user_id+snapshot_date).
 * Best-effort: los errores no deben tumbar al llamador (dashboard o cron).
 */
export async function recordNetWorthSnapshot(userId: string): Promise<boolean> {
  try {
    const now = await computeNetWorth(userId);
    if (now.valuation?.status === 'partial' || now.fxUnavailable || now.fxStale || now.investmentsUSD == null) {
      console.warn('[net-worth] snapshot salteado: valoración parcial');
      return false;
    }
    // Sin cotización no hay conversión confiable: mejor saltear el día que
    // guardar un total en 0 que ensucie el gráfico. Se loguea para que un
    // hueco en la serie sea diagnosticable.
    if (now.blueRate == null || !(now.blueRate > 0)) {
      console.warn('[net-worth] snapshot salteado: sin cotización blue');
      return false;
    }

    // Validate the source times again at the write boundary, including every
    // component sample. Display flags alone cannot authorize a persisted total.
    const references = now.blueReferences?.length ? now.blueReferences.map(({ reference }) => reference)
      : [{ rate: now.blueRate, observedAt: now.fxAsOf }];
    if (references.some(reference => !isExecutableDolarQuote({
      type: 'blue', buy: reference.rate, sell: reference.rate,
      timestamp: new Date(reference.observedAt ?? Number.NaN),
    }))) {
      console.warn('[net-worth] snapshot salteado: cotización blue vencida o sin fecha');
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
