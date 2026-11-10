'use client';

import { useMemo, useState } from 'react';
import {
  REAL_RETURN_PERIODS,
  type Comparison,
  type RealReturnPeriodId,
  type RealReturnsPeriodReport,
  type RealReturnsReport,
  type RealReturnsSubject,
} from '@/lib/real-returns';

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
}

function fmtPctClass(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'text-muted-foreground';
  if (value > 0.05) return 'text-success';
  if (value < -0.05) return 'text-destructive';
  return 'text-foreground';
}

function SourceLine({ item }: { item: Comparison }) {
  return (
    <p className="text-[11px] text-muted-foreground">
      Fuente: {item.source}
      {item.asOf ? ` · Fecha: ${item.asOf}` : ''}
      {item.status === 'unavailable' && item.reason ? ` · ${item.reason}` : ''}
    </p>
  );
}

function SubjectBlock({ subject }: { subject: RealReturnsSubject }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{subject.label}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Nominal</dt>
        <dd className={`text-right font-semibold tabular-nums ${fmtPctClass(subject.nominalPct)}`}>
          {fmtPct(subject.nominalPct)}
        </dd>
        <dt className="text-muted-foreground">Real vs IPC</dt>
        <dd className={`text-right font-semibold tabular-nums ${fmtPctClass(subject.realVsInflationPct)}`}>
          {fmtPct(subject.realVsInflationPct)}
        </dd>
        <dt className="text-muted-foreground">vs MEP</dt>
        <dd className={`text-right font-semibold tabular-nums ${fmtPctClass(subject.vsMepPct)}`}>
          {fmtPct(subject.vsMepPct)}
        </dd>
        <dt className="text-muted-foreground">vs CCL</dt>
        <dd className={`text-right font-semibold tabular-nums ${fmtPctClass(subject.vsCclPct)}`}>
          {fmtPct(subject.vsCclPct)}
        </dd>
      </dl>
    </div>
  );
}

function BenchmarkCell({ item }: { item: Comparison }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{item.label}</p>
      <p className={`text-sm font-semibold tabular-nums ${fmtPctClass(item.pct)}`}>
        {item.status === 'available' ? fmtPct(item.pct) : 'No disponible'}
      </p>
      <SourceLine item={item} />
    </div>
  );
}

export default function RealReturnsPanel({ report }: { report: RealReturnsReport }) {
  const [period, setPeriod] = useState<RealReturnPeriodId>('year');
  const current: RealReturnsPeriodReport | undefined = useMemo(
    () => report.periods.find((p) => p.period === period) ?? report.periods[0],
    [report.periods, period]
  );

  if (!current) {
    return (
      <section className="card p-4">
        <h3 className="text-lg font-semibold text-foreground">Rendimiento real</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Todavía no hay snapshots suficientes para armar un período.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Rendimiento real</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{report.disclaimer}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {REAL_RETURN_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                current.period === p.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Período {current.startISO} → {current.endISO} ({current.days} días). IPC:{' '}
        {report.inflationSource.source}
        {report.inflationSource.lastFecha ? ` · ${report.inflationSource.lastFecha}` : ''}.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SubjectBlock subject={current.liquid} />
        <SubjectBlock subject={current.investments} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2 border-t border-border">
        <BenchmarkCell item={current.inflation} />
        <BenchmarkCell item={current.mep} />
        <BenchmarkCell item={current.ccl} />
        <BenchmarkCell item={current.plazoFijo} />
        <BenchmarkCell item={current.caucion} />
        <BenchmarkCell item={current.fciMm} />
      </div>
    </section>
  );
}
