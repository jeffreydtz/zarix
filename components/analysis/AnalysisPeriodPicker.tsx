'use client';

import { useRouter } from 'next/navigation';
import { ANALYSIS_PRESETS, type AnalysisPresetId, type ResolvedAnalysisPeriod } from '@/lib/analysis-period';

type Props = {
  period: ResolvedAnalysisPeriod;
};

export default function AnalysisPeriodPicker({ period }: Props) {
  const router = useRouter();

  const push = (next: { preset: AnalysisPresetId; startDate?: string; endDate?: string }) => {
    const params = new URLSearchParams();
    params.set('period', next.preset);
    if (next.preset === 'custom') {
      if (next.startDate) params.set('startDate', next.startDate);
      if (next.endDate) params.set('endDate', next.endDate);
    }
    const qs = params.toString();
    router.push(qs ? `/analysis?${qs}` : '/analysis');
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período</p>
          <p className="text-sm font-medium text-foreground mt-0.5">{period.label}</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {ANALYSIS_PRESETS.map((preset) => {
          const active = period.preset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() =>
                push({
                  preset: preset.id,
                  startDate: period.startYmd,
                  endDate: period.endYmd,
                })
              }
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold min-h-[36px] transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {period.preset === 'custom' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-muted-foreground mb-1">Desde</span>
            <input
              type="date"
              value={period.startYmd}
              max={period.endYmd}
              onChange={(e) =>
                push({
                  preset: 'custom',
                  startDate: e.target.value || period.startYmd,
                  endDate: period.endYmd,
                })
              }
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-muted-foreground mb-1">Hasta</span>
            <input
              type="date"
              value={period.endYmd}
              min={period.startYmd}
              onChange={(e) =>
                push({
                  preset: 'custom',
                  startDate: period.startYmd,
                  endDate: e.target.value || period.endYmd,
                })
              }
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
