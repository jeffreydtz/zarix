import { AnimatePresence, motion } from 'framer-motion';

export interface FeatureItem {
  key: 'quotes' | 'portfolio' | 'telegram' | 'stocks' | 'budget';
  title: string;
}

interface FeatureMockupProps {
  feature: FeatureItem;
}

function QuotesMockup() {
  const quotes = [
    { symbol: 'Blue', value: '$1.085', color: 'text-[#F59E0B]' },
    { symbol: 'MEP', value: '$1.071', color: 'text-blue-400' },
    { symbol: 'CCL', value: '$1.092', color: 'text-blue-300' },
    { symbol: 'BTC', value: '$66.320', color: 'text-[#F59E0B]' },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-[#8B949E]">Cotizaciones en tiempo real</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {quotes.map((quote) => (
          <div key={quote.symbol} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <p className="text-xs text-[#8B949E]">{quote.symbol}</p>
            <p className={`mt-1 text-lg font-semibold ${quote.color}`}>{quote.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioMockup() {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-[#8B949E]">Dashboard multi-moneda</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_0.8fr]">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-sm text-[#8B949E]">Saldo total</p>
          <p className="mt-2 text-2xl font-semibold text-[#F8F9FA]">$2.847.320 ARS</p>
          <p className="text-sm text-[#F59E0B]">USD 2.619</p>
        </div>
        <div className="flex items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="relative h-28 w-28 rounded-full border-8 border-blue-500/50 border-t-blue-300 border-r-blue-400">
            <span className="absolute inset-0 flex items-center justify-center text-xs text-[#8B949E]">Mix</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TelegramMockup() {
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-[#8B949E]">Bot de Telegram</p>
      <div className="rounded-2xl border border-white/[0.08] bg-[#111827]/60 p-4">
        <div className="mb-2 ml-auto max-w-[80%] rounded-xl bg-blue-500/20 px-3 py-2 text-sm text-[#F8F9FA]">
          Gaste 15000 en nafta
        </div>
        <div className="max-w-[85%] rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-[#8B949E]">
          Listo. Cargado en Transporte por -$15.000 ARS.
        </div>
      </div>
    </div>
  );
}

function StocksMockup() {
  const rows = [
    { symbol: 'GGAL', move: '+3.2%', positive: true },
    { symbol: 'YPF', move: '-1.1%', positive: false },
    { symbol: 'AAPL', move: '+0.8%', positive: true },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-[#8B949E]">Inversiones Merval + USA</p>
      <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
        {rows.map((row) => (
          <div key={row.symbol} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2">
            <span className="text-sm font-medium text-[#F8F9FA]">{row.symbol}</span>
            <span className={`text-sm font-semibold ${row.positive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
              {row.move}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetMockup() {
  const rows = [
    { label: 'Supermercado', value: 76 },
    { label: 'Transporte', value: 45 },
    { label: 'Restaurantes', value: 91 },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-[#8B949E]">Presupuestos inteligentes</p>
      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-[#F8F9FA]">{row.label}</span>
              <span className="text-[#8B949E]">{row.value}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className={`h-full rounded-full ${row.value > 85 ? 'bg-[#EF4444]' : 'bg-blue-500'}`}
                style={{ width: `${row.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FeatureMockup({ feature }: FeatureMockupProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={feature.key}
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -18 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-3xl border border-white/[0.08] bg-[#0F1117] p-6"
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
