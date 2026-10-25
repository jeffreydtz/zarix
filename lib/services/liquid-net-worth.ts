/**
 * Dashboard "Patrimonio total" is liquid money today:
 * cash + bank + digital_wallet (+ other with include_in_liquid) minus credit-card debt.
 *
 * Never includes:
 * - public.investments rows (regardless of the parent account's include_in_total)
 * - balances of investment / crypto (broker) accounts
 * - accounts with include_in_total = false (their BALANCE only; positions are excluded anyway)
 *
 * A negative total is shown as negative (no clamp).
 */

import type { AccountAggregates, CreditCardDebtSlice } from '@/lib/services/accounts';
import type { BlueFxReference } from '@/lib/blue-fx-reference';
import type { NetWorthNow } from '@/lib/services/net-worth';

export interface LiquidNetWorthInput {
  balances: Pick<
    AccountAggregates,
    | 'liquidUSD'
    | 'liquidARSBlue'
    | 'investmentsUSD'
    | 'investmentsARSBlue'
    | 'availableUSD'
    | 'availableARSBlue'
    | 'creditCardDebtUSD'
    | 'creditCardDebtARSBlue'
    | 'creditCards'
    | 'blueReferences'
    | 'valuation'
    | 'fxUnavailable'
    | 'fxStale'
    | 'fxAsOf'
  >;
  portfolio: {
    totalCurrentValue?: number | null;
    totalCurrentValueArsBlue?: number | null;
    blueReference?: BlueFxReference;
    fxUnavailable?: boolean;
    fxStale?: boolean;
    fxAsOf?: string | null;
    investments?: unknown[];
  } | null;
  blueRate: number | null;
}

export function composeLiquidNetWorth(input: LiquidNetWorthInput): NetWorthNow {
  const { balances, portfolio, blueRate } = input;
  const positionsUSD = portfolio?.fxUnavailable ? null : portfolio?.totalCurrentValue ?? 0;
  const positionsARSBlue = portfolio?.fxUnavailable ? null : portfolio?.totalCurrentValueArsBlue ?? 0;
  const hasPositions = (portfolio?.investments?.length ?? 0) > 0 || positionsUSD !== 0;

  return {
    ...(balances.valuation ? { valuation: balances.valuation } : {}),
    fxUnavailable: Boolean(balances.fxUnavailable || blueRate == null),
    fxStale: Boolean(balances.fxStale || portfolio?.fxStale),
    fxAsOf: [balances.fxAsOf, portfolio?.fxAsOf].filter((date): date is string => Boolean(date)).sort()[0] ?? null,
    liquidUSD: balances.liquidUSD,
    investmentsUSD: balances.fxUnavailable || positionsUSD == null ? null : (balances.investmentsUSD ?? 0) + positionsUSD,
    totalUSD: balances.liquidUSD,
    totalARSBlue: balances.liquidARSBlue,
    blueRate,
    availableUSD: balances.availableUSD ?? 0,
    availableARSBlue: balances.availableARSBlue ?? 0,
    creditCardDebtUSD: balances.creditCardDebtUSD ?? 0,
    creditCardDebtARSBlue: balances.creditCardDebtARSBlue ?? 0,
    creditCards: (balances.creditCards ?? []) as CreditCardDebtSlice[],
    brokerCashUSD: balances.investmentsUSD ?? 0,
    positionsUSD,
    positionsARSBlue,
    blueReferences: [
      ...(balances.blueReferences ?? []).map((reference) => ({
        component: 'accounts' as const,
        reference,
      })),
      ...(hasPositions && portfolio?.blueReference
        ? [{ component: 'portfolio' as const, reference: portfolio.blueReference }]
        : []),
    ],
  };
}

/**
 * Historical `total_usd` / `total_ars_blue` included investments. The live
 * hero is liquid-only, so charts and deltas must use `liquid_usd` (and that
 * day's blue rate) instead of rewriting stored snapshot rows.
 */
export function comparableLiquidUsd(point: { liquid_usd?: number | null }): number | null {
  const usd = Number(point.liquid_usd);
  return Number.isFinite(usd) ? usd : null;
}

export function comparableLiquidArsBlue(point: {
  liquid_usd?: number | null;
  blue_ars_per_usd?: number | null;
}): number | null {
  const usd = comparableLiquidUsd(point);
  const rate = Number(point.blue_ars_per_usd);
  if (usd == null || !Number.isFinite(rate) || rate <= 0) return null;
  return usd * rate;
}
