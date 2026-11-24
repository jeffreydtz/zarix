/** Limit vs used vs available. Never label available as the limit. */

export type CreditFacilityInput = {
  credit_limit?: number | string | null;
  balance: number | string;
  is_multicurrency?: boolean | null;
  multicurrency_balance_primary?: number | string | null;
  multicurrency_total_ars_blue?: number | string | null;
  balance_ars_blue?: number | string | null;
};

export type CreditFacilityFigures = {
  /** Contractual credit line (`accounts.credit_limit`). */
  limit: number;
  /** Outstanding debt (absolute). */
  used: number;
  /** Remaining room on the line (`limit - used`). */
  available: number;
};

function num(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function creditFacilityFigures(account: CreditFacilityInput): CreditFacilityFigures {
  const limit = Math.max(0, num(account.credit_limit));
  const used = Math.abs(
    account.is_multicurrency
      ? num(
          account.multicurrency_total_ars_blue ??
            account.balance_ars_blue ??
            account.multicurrency_balance_primary ??
            account.balance
        )
      : num(account.balance)
  );
  return { limit, used, available: limit - used };
}
