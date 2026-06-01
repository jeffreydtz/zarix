interface DashboardHeroStatsProps {
  liquidARSBlue: number;
  investmentsARSBlue: number;
  /** Variación del día del portafolio en %. NULL si no hay datos. */
  dailyPct: number | null;
}

function fmtArs(v: number): string {
  return `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function Chip({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'pos' | 'neg' | 'muted';
}) {
  const toneClass =
    tone === 'pos'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'neg'
        ? 'text-red-500 dark:text-red-400'
        : tone === 'muted'
          ? 'text-muted-foreground'
          : 'text-foreground';
  return (
    <div className="rounded-card border border-border bg-surface-soft/70 px-3 py-2 min-w-[7rem]">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${toneClass}`}>
        {value}
        {sub ? <span className="ml-1 text-xs font-normal text-muted-foreground">{sub}</span> : null}
      </p>
    </div>
  );
}

export default function DashboardHeroStats({
  liquidARSBlue,
  investmentsARSBlue,
  dailyPct,
}: DashboardHeroStatsProps) {
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <Chip label="Líquido" value={fmtArs(liquidARSBlue)} sub="ARS" />
      <Chip label="Inversiones" value={fmtArs(investmentsARSBlue)} sub="ARS" />
      <Chip
        label="Inversiones hoy"
        value={dailyPct == null ? '—' : `${dailyPct >= 0 ? '+' : ''}${dailyPct.toFixed(2)}%`}
        tone={dailyPct == null ? 'muted' : dailyPct >= 0 ? 'pos' : 'neg'}
      />
    </div>
  );
}
