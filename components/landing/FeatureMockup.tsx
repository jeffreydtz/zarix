import { AnimatePresence, motion } from 'framer-motion';

export interface FeatureItem {
  key: 'quotes' | 'portfolio' | 'telegram' | 'stocks' | 'budget';
  title: string;
}

interface FeatureMockupProps {
  feature: FeatureItem;
}

const MOCKUP_MIN_HEIGHT = 340;

function Frame({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-4"
      style={{ minHeight: MOCKUP_MIN_HEIGHT }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          {tag}
        </span>
        <span className="h-px flex-1 bg-white/[0.06]" />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function StatRow({
  label,
  value,
  trail,
  trailTone,
}: {
  label: string;
  value: string;
  trail?: string;
  trailTone?: 'positive' | 'negative' | 'neutral';
}) {
  const tone =
    trailTone === 'positive'
      ? 'text-emerald-400'
      : trailTone === 'negative'
        ? 'text-red-400'
        : 'text-muted-foreground';
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-white/[0.02] px-3.5 py-2.5">
      <span className="text-sm font-medium text-[#E6E8EC]">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="tabular-nums text-sm font-semibold text-foreground">{value}</span>
        {trail ? <span className={`tabular-nums text-xs ${tone}`}>{trail}</span> : null}
      </div>
    </div>
  );
}

function QuotesMockup() {
  const quotes = [
    { symbol: 'Dólar blue', value: '$1.085', trail: '+0.4%', tone: 'positive' as const },
    { symbol: 'Dólar MEP', value: '$1.071', trail: '+0.2%', tone: 'positive' as const },
    { symbol: 'Dólar CCL', value: '$1.092', trail: '−0.1%', tone: 'negative' as const },
    { symbol: 'Bitcoin', value: '$66.320', trail: '+1.8%', tone: 'positive' as const },
  ];

  return (
    <Frame tag="Cotizaciones en vivo">
      <div className="space-y-2">
        {quotes.map((q) => (
          <StatRow key={q.symbol} label={q.symbol} value={q.value} trail={q.trail} trailTone={q.tone} />
        ))}
      </div>
    </Frame>
  );
}

function PortfolioMockup() {
  const slices = [
    { label: 'Pesos ARS', value: 42, color: 'bg-primary' },
    { label: 'USD MEP / blue', value: 33, color: 'bg-primary/70' },
    { label: 'Inversiones', value: 18, color: 'bg-primary/45' },
    { label: 'Cripto', value: 7, color: 'bg-primary/25' },
  ];

  return (
    <Frame tag="Patrimonio multi-moneda">
      <div className="rounded-2xl border border-border/60 bg-white/[0.02] p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Saldo total</p>
            <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">$2.847.320 ARS</p>
            <p className="text-sm text-primary tabular-nums">≈ USD 2.619</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {slices.map((s) => (
            <div key={s.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[#E6E8EC]">{s.label}</span>
                <span className="text-muted-foreground tabular-nums">{s.value}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className={`h-full ${s.color}`} style={{ width: `${s.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function TelegramMockup() {
  return (
    <Frame tag="Bot personal en Telegram">
      <div className="rounded-2xl border border-border/60 bg-white/[0.02] p-4">
        <div className="space-y-2.5">
          <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-primary/20 px-3.5 py-2 text-sm text-foreground">
            Gasté 15.000 en nafta
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border/70 bg-white/[0.04] px-3.5 py-2 text-sm text-[#E6E8EC]">
            Cargado en <span className="font-semibold text-primary">Transporte</span> por
            <span className="ml-1 tabular-nums text-foreground">−$15.000 ARS</span>
          </div>
          <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-primary/20 px-3.5 py-2 text-sm text-foreground">
            📎 ticket-super.jpg
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border/70 bg-white/[0.04] px-3.5 py-2 text-sm text-[#E6E8EC]">
            Leí el ticket: <span className="font-semibold text-primary">Supermercado</span> por
            <span className="ml-1 tabular-nums text-foreground">−$48.720 ARS</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function StocksMockup() {
  const rows = [
    { symbol: 'GGAL', name: 'Galicia', value: '$8.420', trail: '+3.2%', tone: 'positive' as const },
    { symbol: 'YPF', name: 'YPF', value: '$11.150', trail: '−1.1%', tone: 'negative' as const },
    { symbol: 'AAPL', name: 'Apple (CEDEAR)', value: '$23.000', trail: '+0.8%', tone: 'positive' as const },
    { symbol: 'AL30', name: 'Bonar 2030', value: '$91.980', trail: '+0.5%', tone: 'positive' as const },
  ];

  return (
    <Frame tag="Portafolio Merval + USA + bonos">
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.symbol}
            className="flex items-center justify-between rounded-xl border border-border/60 bg-white/[0.02] px-3.5 py-2.5"
          >
            <div className="flex flex-col">
              <span className="font-mono text-sm font-semibold text-foreground">{r.symbol}</span>
              <span className="text-[11px] text-muted-foreground">{r.name}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="tabular-nums text-sm font-semibold text-foreground">{r.value}</span>
              <span
                className={`tabular-nums text-[11px] font-medium ${
                  r.tone === 'positive' ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {r.trail}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function BudgetMockup() {
  const rows = [
    { label: 'Supermercado', amount: '$152.000', limit: '$200.000', pct: 76 },
    { label: 'Transporte', amount: '$22.500', limit: '$50.000', pct: 45 },
    { label: 'Restaurantes', amount: '$45.500', limit: '$50.000', pct: 91 },
  ];

  return (
    <Frame tag="Presupuestos con alertas">
      <div className="space-y-3">
        {rows.map((r) => {
          const danger = r.pct >= 85;
          return (
            <div
              key={r.label}
              className="rounded-xl border border-border/60 bg-white/[0.02] px-3.5 py-3"
            >
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium text-[#E6E8EC]">{r.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {r.amount} <span className="opacity-60">/ {r.limit}</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full ${danger ? 'bg-red-400' : 'bg-primary'}`}
                  style={{ width: `${r.pct}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className={`tabular-nums ${danger ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {r.pct}%
                </span>
                {danger ? (
                  <span className="text-red-400">Alerta enviada</span>
                ) : (
                  <span className="text-muted-foreground">En rango</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

export default function FeatureMockup({ feature }: FeatureMockupProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={feature.key}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -14 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-3xl border border-border/70 bg-card p-5 sm:p-6 shadow-[0_30px_80px_-40px_rgba(34,197,94,0.4)]"
      >
        {feature.key === 'quotes' ? <QuotesMockup /> : null}
        {feature.key === 'portfolio' ? <PortfolioMockup /> : null}
        {feature.key === 'telegram' ? <TelegramMockup /> : null}
        {feature.key === 'stocks' ? <StocksMockup /> : null}
        {feature.key === 'budget' ? <BudgetMockup /> : null}
      </motion.div>
    </AnimatePresence>
  );
}
