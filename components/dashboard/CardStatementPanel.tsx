'use client';

import Amount from '@/components/ui/Amount';
import {
  formatMonthLabel,
  labeledTotalsAmount,
  totalsAreEmpty,
  type CardStatementProjection,
  type CurrencyTotals,
} from '@/lib/card-statement';

function formatCivil(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function CurrencyStack({
  totals,
  primaryCurrency,
  className = '',
}: {
  totals: CurrencyTotals;
  primaryCurrency: string;
  className?: string;
}) {
  const entries = Object.entries(totals).filter(([, amount]) => Math.abs(amount) >= 0.005);
  if (entries.length === 0) {
    return <span className={`text-sm text-muted-foreground ${className}`}>$0</span>;
  }
  const ordered = entries.sort(([a], [b]) => {
    if (a === primaryCurrency) return -1;
    if (b === primaryCurrency) return 1;
    return a.localeCompare(b);
  });
  return (
    <span className={`inline-flex flex-col items-end gap-0.5 ${className}`}>
      {ordered.map(([currency, amount]) => (
        <Amount
          key={currency}
          value={amount}
          currency={currency === 'USD' ? 'USD' : currency === 'EUR' ? 'EUR' : 'ARS'}
          decimals={currency === 'USD' || currency === 'EUR' ? 2 : 0}
          className="text-sm font-semibold text-foreground"
        />
      ))}
    </span>
  );
}

export default function CardStatementPanel({
  statement,
  compact = false,
}: {
  statement: CardStatementProjection;
  compact?: boolean;
}) {
  const upcomingCycles = statement.cycles.slice(0, compact ? 3 : 6);
  const pendingMonths = statement.pendingByMonth.slice(0, compact ? 4 : 12);
  const nextAmount = labeledTotalsAmount(statement.nextStatementTotals, statement.primaryCurrency);

  return (
    <div className="mt-4 pt-3 border-t border-border space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Próximo cierre</p>
          <p className="font-semibold text-foreground">
            {formatCivil(statement.nextClosingISO)}
            {nextAmount ? (
              <>
                {' · '}
                <Amount
                  value={nextAmount.amount}
                  currency={nextAmount.currency === 'USD' ? 'USD' : nextAmount.currency === 'EUR' ? 'EUR' : 'ARS'}
                  decimals={nextAmount.currency === 'USD' || nextAmount.currency === 'EUR' ? 2 : 0}
                  className="font-semibold"
                />
              </>
            ) : null}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Vencimiento</p>
          <p className="font-semibold text-foreground">{formatCivil(statement.nextDueISO)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Deuda futura (cuotas)</p>
          <CurrencyStack
            totals={statement.futureDebtTotals}
            primaryCurrency={statement.primaryCurrency}
            className="items-start"
          />
        </div>
      </div>

      {!totalsAreEmpty(statement.nextStatementTotals) && (
        <p className="text-[11px] text-muted-foreground">
          El vencimiento estima el total de este resumen (cargos del ciclo menos pagos), no el
          mínimo ni el saldo de cuenta — ese saldo ya incluye cuotas futuras.
        </p>
      )}

      {pendingMonths.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Cuotas pendientes</p>
          <ul className="space-y-1">
            {pendingMonths.map((row) => (
              <li key={row.month} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{formatMonthLabel(row.month)}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {row.items
                      .map((item) => {
                        const cuota =
                          item.installmentNumber && item.installmentTotal
                            ? ` (${item.installmentNumber}/${item.installmentTotal})`
                            : '';
                        return `${item.description || 'Cuota'}${cuota}`;
                      })
                      .join(' · ')}
                  </span>
                </span>
                <CurrencyStack totals={row.totals} primaryCurrency={statement.primaryCurrency} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {upcomingCycles.length > 0 && statement.closingDay && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            {compact ? 'Próximos cierres' : 'Resúmenes proyectados'}
          </p>
          <ul className="space-y-1">
            {upcomingCycles.map((cycle) => (
              <li key={cycle.closingISO} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  Cierre {formatCivil(cycle.closingISO)}
                  {cycle.dueISO ? ` · vence ${formatCivil(cycle.dueISO)}` : ''}
                </span>
                <CurrencyStack totals={cycle.totals} primaryCurrency={statement.primaryCurrency} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
