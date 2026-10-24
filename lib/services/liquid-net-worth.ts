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
  >;
  portfolio: {
    totalCurrentValue?: number;
    totalCurrentValueArsBlue?: number;
    blueReference?: BlueFxReference;
    investments?: unknown[];
  } | null;
  blueRate: number;
}

export function composeLiquidNetWorth(input: LiquidNetWorthInput): NetWorthNow {
  const { balances, portfolio, blueRate } = input;
  const positionsUSD = portfolio?.totalCurrentValue ?? 0;
  const positionsARSBlue = portfolio?.totalCurrentValueArsBlue ?? 0;
  const hasPositions = (portfolio?.investments?.length ?? 0) > 0 || positionsUSD !== 0;

  return {
    ...(balances.valuation ? { valuation: balances.valuation } : {}),
    liquidUSD: balances.liquidUSD,
    investmentsUSD: (balances.investmentsUSD ?? 0) + positionsUSD,
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
