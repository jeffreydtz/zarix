import {
  addDaysYmd,
  addMonthsYmd,
  civilTodayYmd,
  endOfMonthYmd,
  startOfMonthYmd,
  startOfYearYmd,
  ymdToQueryExclusiveEndIso,
  ymdToQueryStartIso,
} from '@/lib/transaction-date';

export type ResolvedToolPeriod = {
  startYmd: string;
  endYmd: string;
  startIso: string;
  exclusiveEndIso: string;
  label: string;
};

function weekdayUtc(ymd: string): number {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function bounds(startYmd: string, endYmd: string, label: string): ResolvedToolPeriod {
  return {
    startYmd,
    endYmd,
    startIso: ymdToQueryStartIso(startYmd),
    exclusiveEndIso: ymdToQueryExclusiveEndIso(endYmd),
    label,
  };
}

/** Córdoba civil period for tools. End is inclusive as a civil day; queries use exclusiveEndIso. */
export function resolveToolPeriod(
  period?: string,
  todayYmd: string = civilTodayYmd()
): ResolvedToolPeriod {
  switch ((period || 'this_month').toLowerCase()) {
    case 'last_month': {
      const startYmd = startOfMonthYmd(addMonthsYmd(todayYmd, -1));
      return bounds(startYmd, endOfMonthYmd(startYmd), 'el mes pasado');
    }
    case 'this_week': {
      const dow = weekdayUtc(todayYmd);
      const backToMonday = dow === 0 ? 6 : dow - 1;
      return bounds(addDaysYmd(todayYmd, -backToMonday), todayYmd, 'esta semana');
    }
    case 'last_7_days':
      return bounds(addDaysYmd(todayYmd, -6), todayYmd, 'los últimos 7 días');
    case 'last_30_days':
      return bounds(addDaysYmd(todayYmd, -29), todayYmd, 'los últimos 30 días');
    case 'this_year':
      return bounds(startOfYearYmd(todayYmd), todayYmd, 'este año');
    case 'this_month':
    default:
      return bounds(startOfMonthYmd(todayYmd), todayYmd, 'este mes');
  }
}
