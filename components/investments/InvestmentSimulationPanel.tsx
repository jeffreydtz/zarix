'use client';

import { useState } from 'react';
import type { InvestmentWithPnL } from '@/lib/services/investments';
import { simulateInvestment, type InvestmentSimulationResult } from '@/lib/investment-simulation';
import { PRIVACY_MASK, useInvestmentsPrivacy } from '@/lib/hooks/use-investments-privacy';

interface InvestmentSimulationPanelProps {
  investments: InvestmentWithPnL[];
  canSimulate: boolean;
}

interface SimulationScenario extends InvestmentSimulationResult {
  source: InvestmentWithPnL['valuation_price_source'];
  referenceAt: string | null;
  type: InvestmentWithPnL['type'];
}

const SOURCE_LABELS: Record<InvestmentWithPnL['valuation_price_source'], string> = {
  live: 'Cotización de mercado',
  manual: 'Precio ingresado manualmente',
  cache: 'Última cotización guardada',
  purchase_reference: 'Referencia de compra · sin cotización',
};

export default function InvestmentSimulationPanel({ investments, canSimulate }: InvestmentSimulationPanelProps) {
  const { hidden } = useInvestmentsPrivacy();
  const [open, setOpen] = useState(false);
  const [investmentId, setInvestmentId] = useState('');
  const [variation, setVariation] = useState('');
  const [result, setResult] = useState<SimulationScenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const investment = investmentId ? investments.find(item => item.id === investmentId) : investments[0];

  const clearScenario = () => {
    setResult(null);
    setError(null);
  };
  const close = () => {
    setOpen(false);
    setVariation('');
    clearScenario();
  };
  const simulate = (event: React.FormEvent) => {
    event.preventDefault();
    clearScenario();
    if (!canSimulate) {
      setError('La simulación requiere Premium vigente.');
      return;
    }
    try {
      if (!investment) throw new Error('Elegí una posición para simular.');
      if (!variation.trim()) throw new Error('Ingresá una variación porcentual.');
      const calculated = simulateInvestment({
        quantity: investment.quantity,
        price: investment.current_price,
        type: investment.type,
        currency: investment.market_price_currency,
      }, Number(variation));
      setResult({ ...calculated, source: investment.valuation_price_source,
        referenceAt: investment.current_price_updated_at, type: investment.type });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo calcular la simulación.');
    }
  };
  const amount = (value: number) => hidden ? PRIVACY_MASK : `${result?.currency} ${value.toLocaleString('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
  const date = result?.referenceAt;
  const dateLabel = date && Number.isFinite(Date.parse(date))
    ? new Date(date).toLocaleString('es-AR') : 'Fecha de cotización no disponible';

  return (
    <section className="zx-panel p-4 md:p-5" aria-label="Simulación de inversiones">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Simulación</h2>
          <p className="text-sm text-muted-foreground">Compará una variación hipotética del precio con la posición actual.</p>
        </div>
        <button type="button" className="btn btn-secondary" disabled={!canSimulate || investments.length === 0}
          aria-expanded={open && canSimulate} aria-controls="investment-simulation-form"
          onClick={() => open ? close() : setOpen(true)}>
          {open && canSimulate ? 'Cerrar simulación' : 'Simular escenario'}
        </button>
      </div>
      {!canSimulate ? <p className="mt-3 text-sm text-muted-foreground">La simulación requiere Premium vigente. Tu historial se conserva.</p> : null}
      {canSimulate && investments.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Registrá una posición para simular.</p> : null}
      {open && canSimulate ? (
        <form id="investment-simulation-form" className="mt-4 space-y-4" onSubmit={simulate}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-foreground">
              Posición a simular
              <select className="input mt-1 w-full" value={investment?.id ?? ''}
                onChange={event => { setInvestmentId(event.target.value); clearScenario(); }}>
                {investments.map(item => <option key={item.id} value={item.id}>{item.ticker || item.name} · {item.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-foreground">
              Variación del precio (%)
              <input className="input mt-1 w-full" type="text" inputMode="decimal" value={variation}
                aria-invalid={error !== null} aria-describedby="investment-simulation-help"
                placeholder="Ej.: 10 o -100"
                onChange={event => { setVariation(event.target.value); clearScenario(); }} />
            </label>
          </div>
          <p id="investment-simulation-help" className="text-xs text-muted-foreground">
            Mínimo -100%. Se mantienen cantidad y moneda; los bonos usan precio por VN 100.
            {' '}El escenario no cambia posiciones, saldos ni ventas y no ejecuta operaciones reales.
          </p>
          <button type="submit" className="btn btn-primary">Simular</button>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {result ? (
            <div role="status" className="space-y-3 rounded-control border border-border p-3" data-testid="investment-simulation-result">
              <dl className="grid gap-3 sm:grid-cols-2 tabular-nums">
                <div><dt className="text-sm text-muted-foreground">Valor actual</dt><dd className="font-semibold" data-testid="simulation-current-value">{amount(result.currentValue)}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Valor hipotético</dt><dd className="font-semibold" data-testid="simulation-hypothetical-value">{amount(result.hypotheticalValue)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Precio de referencia{result.type === 'bond' ? ' / VN 100' : ''}</dt><dd className="text-sm">{amount(result.currentPrice)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Precio hipotético{result.type === 'bond' ? ' / VN 100' : ''}</dt><dd className="text-sm">{amount(result.hypotheticalPrice)}</dd></div>
              </dl>
              <p className="text-xs text-muted-foreground">{SOURCE_LABELS[result.source]} · {dateLabel}. Variación supuesta: {result.variationPercent}%.</p>
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
