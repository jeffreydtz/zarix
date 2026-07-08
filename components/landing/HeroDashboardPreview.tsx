/**
 * Static dashboard preview for the hero: a light browser frame with the dark
 * Zarix dashboard inside (the `.dark` wrapper re-applies dark tokens within
 * the light hero). CSS/SVG only — loads nothing.
 */
const NAV_ITEMS = ['Dashboard', 'Movimientos', 'Inversiones', 'Presupuestos', 'Compartidos'];

const KPIS = [
  { label: 'Patrimonio total', value: '$ 48.930.114', trail: '+2,4% este mes', tone: 'up' },
  { label: 'Disponible en USD', value: 'US$ 6.240', trail: 'MEP $ 1.318', tone: 'muted' },
  { label: 'Gastos del mes', value: '$ 1.264.500', trail: '68% del presupuesto', tone: 'warn' },
] as const;

const ROWS = [
  { name: 'Supermercado Coto', cat: 'Comida', amount: '-$ 84.300' },
  { name: 'Compra MEP — AL30', cat: 'Inversiones', amount: '+US$ 500' },
  { name: 'Alquiler julio', cat: 'Vivienda', amount: '-$ 720.000' },
] as const;

export default function HeroDashboardPreview() {
  return (
    <div className="mx-auto w-full max-w-5xl rounded-t-3xl border border-b-0 border-border/70 bg-card/80 p-2 shadow-2xl backdrop-blur">
      {/* browser chrome (light) */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
        </div>
        <div className="flex-1 rounded-full border border-border/70 bg-surface-soft px-4 py-1 text-center text-xs text-muted-foreground">
          zarix.app/dashboard
        </div>
      </div>

      {/* dark app inside */}
      <div className="dark overflow-hidden rounded-t-2xl border border-b-0 border-border/70 bg-background text-foreground">
        <div className="grid grid-cols-[9.5rem_1fr] max-sm:grid-cols-1">
          {/* sidebar */}
          <aside className="hidden border-r border-border/60 bg-surface p-3 sm:block">
            <p className="px-2 pb-3 pt-1 text-sm font-bold tracking-tight">Zarix</p>
            <nav className="space-y-1">
              {NAV_ITEMS.map((item, i) => (
                <p
                  key={item}
                  className={
                    i === 0
                      ? 'rounded-lg bg-primary/15 px-2 py-1.5 text-xs font-semibold text-primary'
                      : 'rounded-lg px-2 py-1.5 text-xs text-muted-foreground'
                  }
                >
                  {item}
                </p>
              ))}
            </nav>
          </aside>

          {/* main panel */}
          <div className="space-y-3 p-3 sm:p-4">
            <div className="grid gap-2.5 sm:grid-cols-3">
              {KPIS.map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-border/60 bg-card p-3">
                  <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                  <p className="zx-num pt-0.5 text-base font-semibold sm:text-lg">{kpi.value}</p>
                  <p
                    className={
                      kpi.tone === 'up'
                        ? 'pt-0.5 text-[11px] font-medium text-primary'
                        : kpi.tone === 'warn'
                          ? 'pt-0.5 text-[11px] font-medium text-warning'
                          : 'pt-0.5 text-[11px] text-muted-foreground'
                    }
                  >
                    {kpi.trail}
                  </p>
                </div>
              ))}
            </div>

            {/* net-worth area chart */}
            <div className="rounded-xl border border-border/60 bg-card p-3">
              <div className="flex items-baseline justify-between">
                <p className="text-[11px] text-muted-foreground">Evolución del patrimonio</p>
                <p className="text-[11px] font-medium text-primary">12 meses</p>
              </div>
              <svg viewBox="0 0 560 120" className="mt-2 h-24 w-full sm:h-28" role="presentation" aria-hidden>
                <defs>
                  <linearGradient id="zx-hero-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--primary))" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="rgb(var(--primary))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 96 C 40 90 70 78 110 80 C 150 82 180 60 220 58 C 260 56 290 68 330 54 C 370 40 400 46 440 32 C 480 18 520 24 560 12 L 560 120 L 0 120 Z"
                  fill="url(#zx-hero-area)"
                />
                <path
                  d="M0 96 C 40 90 70 78 110 80 C 150 82 180 60 220 58 C 260 56 290 68 330 54 C 370 40 400 46 440 32 C 480 18 520 24 560 12"
                  fill="none"
                  stroke="rgb(var(--primary))"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* last movements */}
            <div className="rounded-xl border border-border/60 bg-card">
              {ROWS.map((row, i) => (
                <div
                  key={row.name}
                  className={`flex items-center justify-between px-3 py-2 ${i > 0 ? 'border-t border-border/50' : ''}`}
                >
                  <div>
                    <p className="text-xs font-medium">{row.name}</p>
                    <p className="text-[11px] text-muted-foreground">{row.cat}</p>
                  </div>
                  <p
                    className={`zx-num text-xs font-semibold ${row.amount.startsWith('+') ? 'text-primary' : 'text-foreground'}`}
                  >
                    {row.amount}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
