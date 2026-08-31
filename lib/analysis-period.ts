import {
  addDaysYmd,
  addMonthsYmd,
  civilTodayYmd,
  daysInclusive,
  endOfMonthYmd,
  isCivilYmd,
  monthKeysInclusive,
  startOfMonthYmd,
  startOfYearYmd,
} from '@/lib/transaction-date';

export const ANALYSIS_PRESETS = [
  { id: 'this_month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes anterior' },
  { id: 'last_7_days', label: 'Últimos 7 días' },
  { id: 'last_30_days', label: 'Últimos 30 días' },
  { id: 'last_90_days', label: 'Últimos 90 días' },
  { id: 'last_3_months', label: 'Últimos 3 meses' },
  { id: 'last_6_months', label: 'Últimos 6 meses' },
  { id: 'this_year', label: 'Este año' },
  { id: 'custom', label: 'Personalizado' },
] as const;

export type AnalysisPresetId = (typeof ANALYSIS_PRESETS)[number]['id'];

export type ResolvedAnalysisPeriod = {
  preset: AnalysisPresetId;
  startYmd: string;
  endYmd: string;
  prevStartYmd: string;
  prevEndYmd: string;
  label: string;
  shortLabel: string;
  dayCount: number;
};

const PRESET_IDS = new Set<string>(ANALYSIS_PRESETS.map((p) => p.id));

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function swapIfNeeded(startYmd: string, endYmd: string): { startYmd: string; endYmd: string } {
  if (startYmd <= endYmd) return { startYmd, endYmd };
  return { startYmd: endYmd, endYmd: startYmd };
}

function formatRangeLabel(startYmd: string, endYmd: string): string {
  const fmt = (ymd: string) => {
    const d = Number(ymd.slice(8, 10));
    const m = Number(ymd.slice(5, 7));
    const y = ymd.slice(0, 4);
    return `${d} ${MONTH_NAMES[m - 1].slice(0, 3).toLowerCase()} ${y}`;
  };
  if (startYmd === endYmd) return fmt(startYmd);
  if (startYmd.slice(0, 7) === endYmd.slice(0, 7) && startYmd.endsWith('-01') && endYmd === endOfMonthYmd(startYmd)) {
    const m = Number(startYmd.slice(5, 7));
    return `${MONTH_NAMES[m - 1]} ${startYmd.slice(0, 4)}`;
  }
  return `${fmt(startYmd)} – ${fmt(endYmd)}`;
}

function previousEqualLength(startYmd: string, endYmd: string): { prevStartYmd: string; prevEndYmd: string } {
  const count = daysInclusive(startYmd, endYmd);
  const prevEndYmd = addDaysYmd(startYmd, -1);
  const prevStartYmd = addDaysYmd(prevEndYmd, -(count - 1));
  return { prevStartYmd, prevEndYmd };
}

function previousCalendarMonth(monthYmd: string): { prevStartYmd: string; prevEndYmd: string } {
  const prev = addMonthsYmd(startOfMonthYmd(monthYmd), -1);
  return { prevStartYmd: startOfMonthYmd(prev), prevEndYmd: endOfMonthYmd(prev) };
}

function resolvePreset(preset: AnalysisPresetId, todayYmd: string): Omit<ResolvedAnalysisPeriod, 'preset'> {
  switch (preset) {
    case 'last_month': {
      const startYmd = startOfMonthYmd(addMonthsYmd(todayYmd, -1));
      const endYmd = endOfMonthYmd(startYmd);
      const prev = previousCalendarMonth(startYmd);
      return {
        startYmd,
        endYmd,
        ...prev,
        label: formatRangeLabel(startYmd, endYmd),
        shortLabel: 'mes anterior',
        dayCount: daysInclusive(startYmd, endYmd),
      };
    }
    case 'last_7_days': {
      const endYmd = todayYmd;
      const startYmd = addDaysYmd(todayYmd, -6);
      return {
        startYmd,
        endYmd,
        ...previousEqualLength(startYmd, endYmd),
        label: formatRangeLabel(startYmd, endYmd),
        shortLabel: 'últimos 7 días',
        dayCount: 7,
      };
    }
    case 'last_30_days': {
      const endYmd = todayYmd;
      const startYmd = addDaysYmd(todayYmd, -29);
      return {
        startYmd,
        endYmd,
        ...previousEqualLength(startYmd, endYmd),
        label: formatRangeLabel(startYmd, endYmd),
        shortLabel: 'últimos 30 días',
        dayCount: 30,
      };
    }
    case 'last_90_days': {
      const endYmd = todayYmd;
      const startYmd = addDaysYmd(todayYmd, -89);
      return {
        startYmd,
        endYmd,
        ...previousEqualLength(startYmd, endYmd),
        label: formatRangeLabel(startYmd, endYmd),
        shortLabel: 'últimos 90 días',
        dayCount: 90,
      };
    }
    case 'last_3_months': {
      const endYmd = todayYmd;
      const startYmd = startOfMonthYmd(addMonthsYmd(todayYmd, -2));
      return {
        startYmd,
        endYmd,
        ...previousEqualLength(startYmd, endYmd),
        label: formatRangeLabel(startYmd, endYmd),
        shortLabel: 'últimos 3 meses',
        dayCount: daysInclusive(startYmd, endYmd),
      };
    }
    case 'last_6_months': {
      const endYmd = todayYmd;
      const startYmd = startOfMonthYmd(addMonthsYmd(todayYmd, -5));
      return {
        startYmd,
        endYmd,
        ...previousEqualLength(startYmd, endYmd),
        label: formatRangeLabel(startYmd, endYmd),
        shortLabel: 'últimos 6 meses',
        dayCount: daysInclusive(startYmd, endYmd),
      };
    }
    case 'this_year': {
      const startYmd = startOfYearYmd(todayYmd);
      const endYmd = todayYmd;
      const prevYear = String(Number(todayYmd.slice(0, 4)) - 1);
      return {
        startYmd,
        endYmd,
        prevStartYmd: `${prevYear}-01-01`,
        prevEndYmd: `${prevYear}-12-31`,
        label: formatRangeLabel(startYmd, endYmd),
        shortLabel: `año ${todayYmd.slice(0, 4)}`,
        dayCount: daysInclusive(startYmd, endYmd),
      };
    }
    case 'custom':
    case 'this_month':
    default: {
      const startYmd = startOfMonthYmd(todayYmd);
      const endYmd = todayYmd;
      const prevStartYmd = startOfMonthYmd(addMonthsYmd(todayYmd, -1));
      const prevEndYmd = addMonthsYmd(todayYmd, -1);
      return {
        startYmd,
        endYmd,
        prevStartYmd,
        prevEndYmd,
        label: formatRangeLabel(startYmd, endOfMonthYmd(todayYmd)),
        shortLabel: 'este mes',
        dayCount: daysInclusive(startYmd, endYmd),
      };
    }
  }
}

export function resolveCustomRange(startRaw: string, endRaw: string): Omit<ResolvedAnalysisPeriod, 'preset'> {
  const { startYmd, endYmd } = swapIfNeeded(startRaw, endRaw);
  return {
    startYmd,
    endYmd,
    ...previousEqualLength(startYmd, endYmd),
    label: formatRangeLabel(startYmd, endYmd),
    shortLabel: 'rango elegido',
    dayCount: daysInclusive(startYmd, endYmd),
  };
}

export function resolveAnalysisPeriod(
  search: { period?: string; startDate?: string; endDate?: string },
  todayYmd: string = civilTodayYmd()
): ResolvedAnalysisPeriod {
  const rawPeriod = (search.period || '').trim();
  const startDate = (search.startDate || '').trim();
  const endDate = (search.endDate || '').trim();

  const customRequested =
    rawPeriod === 'custom' || ((!rawPeriod || rawPeriod === 'custom') && isCivilYmd(startDate) && isCivilYmd(endDate));

  if (customRequested && isCivilYmd(startDate) && isCivilYmd(endDate)) {
    return { preset: 'custom', ...resolveCustomRange(startDate, endDate) };
  }

  const preset: AnalysisPresetId = PRESET_IDS.has(rawPeriod) && rawPeriod !== 'custom' ? (rawPeriod as AnalysisPresetId) : 'this_month';
  return { preset, ...resolvePreset(preset, todayYmd) };
}

/** Ventana de evolución mensual: si el período es corto, se muestran 6 meses de contexto. */
export function monthlyTrendWindow(period: ResolvedAnalysisPeriod): { startYmd: string; endYmd: string } {
  const monthCount = monthKeysInclusive(period.startYmd, period.endYmd).length;
  if (monthCount <= 2) {
    const endMonth = startOfMonthYmd(period.endYmd);
    return {
      startYmd: startOfMonthYmd(addMonthsYmd(endMonth, -5)),
      endYmd: endOfMonthYmd(period.endYmd),
    };
  }
  return {
    startYmd: startOfMonthYmd(period.startYmd),
    endYmd: endOfMonthYmd(period.endYmd),
  };
}

export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
