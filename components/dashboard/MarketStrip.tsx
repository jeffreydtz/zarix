import Link from 'next/link';
import Sparkline from '@/components/ui/Sparkline';
import type { MarketSparklines } from '@/lib/services/market-history';

import type { cotizacionesService } from '@/lib/services/cotizaciones';
type MarketStripQuotes = Awaited<ReturnType<typeof cotizacionesService.getAllQuotes>>;

export interface MarketStripHolding {
  ticker: string;
  name: string;
  valueUSD: number;
  dailyPct: number;
}

interface MarketStripProps {
  quotes: MarketStripQuotes;
  sparklines: MarketSparklines;
  topHoldings: MarketStripHolding[];
}

function formatARS(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function formatUSD(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Color del sparkline: éxito si cierra igual o arriba del inicio, neutro si no
 * (un movimiento de mercado a la baja no es una alarma → nunca destructive). */
function sparkColor(series: number[]): string {
  if (series.length < 2) return 'text-muted-foreground';
  return series[series.length - 1] >= series[0] ? 'text-success' : 'text-muted-foreground';
}

function DeltaPct({ value }: { value: number }) {
  const isUp = value >= 0;
  return (
    <span
      className={`text-xs font-medium tabular-nums ${isUp ? 'text-success' : 'text-destructive'}`}
    >
      {isUp ? '↑' : '↓'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function TickerCard({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href="/investments"
      aria-label={ariaLabel}
      className="flex-shrink-0 w-40 snap-start card block p-3 no-underline transition-[box-shadow,transform] duration-200 hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {children}
    </Link>
  );
}

/**
 * Strip "Mercado hoy": fila horizontal scrolleable de tarjetas ticker
 * compactas (dólar blue/MEP, BTC/ETH, top posiciones del usuario). Server
 * component: todos los datos llegan por props, sin fetch propio.
 */
export default function MarketStrip({ quotes, sparklines, topHoldings }: MarketStripProps) {
  const blue = quotes.dolar.blue;
  const mep = quotes.dolar.mep;
  const { btc, eth } = quotes.crypto;
  const holdings = topHoldings.slice(0, 2);

  return (
    <div className="card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Mercado hoy</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cotizaciones en vivo y tus principales posiciones
        </p>
      </div>

      <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 hide-scrollbar -mx-1 px-1">
        <TickerCard ariaLabel="Dólar blue, compra y venta. Ver inversiones">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">💵</span>
            <span className="text-xs font-medium text-muted-foreground">Blue</span>
          </div>
          <div className="text-sm text-foreground tabular-nums leading-tight">
            <div className="text-muted-foreground">{blue ? `C: $${formatARS(blue.buy)}` : 'No disponible'}</div>
            {blue && <div className="font-semibold">V: ${formatARS(blue.sell)}</div>}
          </div>
          {sparklines.blue.length >= 2 && (
            <div className="mt-2">
              <Sparkline
                data={sparklines.blue}
                width={128}
                height={32}
                className={sparkColor(sparklines.blue)}
              />
            </div>
          )}
        </TickerCard>

        <TickerCard ariaLabel="Dólar MEP, compra y venta. Ver inversiones">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">📊</span>
            <span className="text-xs font-medium text-muted-foreground">MEP</span>
          </div>
          <div className="text-sm text-foreground tabular-nums leading-tight">
            <div className="text-muted-foreground">{mep ? `C: $${formatARS(mep.buy)}` : 'No disponible'}</div>
            {mep && <div className="font-semibold">V: ${formatARS(mep.sell)}</div>}
          </div>
        </TickerCard>

        {btc && <TickerCard ariaLabel={`Bitcoin, US$${formatUSD(btc.priceUSD)}. Ver inversiones`}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">₿</span>
            <span className="text-xs font-medium text-muted-foreground">BTC</span>
          </div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            US${formatUSD(btc.priceUSD)}
          </div>
          <div className="mt-0.5">
            <DeltaPct value={btc.change24h} />
          </div>
          {sparklines.btc.length >= 2 && (
            <div className="mt-2">
              <Sparkline
                data={sparklines.btc}
                width={128}
                height={32}
                className={sparkColor(sparklines.btc)}
              />
            </div>
          )}
        </TickerCard>}

        {eth && <TickerCard ariaLabel={`Ethereum, US$${formatUSD(eth.priceUSD)}. Ver inversiones`}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">💎</span>
            <span className="text-xs font-medium text-muted-foreground">ETH</span>
          </div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            US${formatUSD(eth.priceUSD)}
          </div>
          <div className="mt-0.5">
            <DeltaPct value={eth.change24h} />
          </div>
          {sparklines.eth.length >= 2 && (
            <div className="mt-2">
              <Sparkline
                data={sparklines.eth}
                width={128}
                height={32}
                className={sparkColor(sparklines.eth)}
              />
            </div>
          )}
        </TickerCard>}

        {holdings.map((holding) => (
          <TickerCard
            key={holding.ticker}
            ariaLabel={`${holding.name}, tu posición. Ver inversiones`}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-base">📈</span>
              <span className="text-xs font-medium text-muted-foreground truncate">
                {holding.ticker}
              </span>
            </div>
            <div className="text-sm font-semibold text-foreground tabular-nums">
              US${formatUSD(holding.valueUSD, 2)}
            </div>
            <div className="mt-0.5">
              <DeltaPct value={holding.dailyPct} />
            </div>
          </TickerCard>
        ))}
      </div>
    </div>
  );
}
