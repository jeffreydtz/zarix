'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import { subDays } from 'date-fns';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Amount from '@/components/ui/Amount';
import ChartTooltip from '@/components/ui/ChartTooltip';
import { axisProps } from '@/lib/chart-theme';
import { usePrivacy, PRIVACY_MASK } from '@/lib/hooks/use-privacy';
import { deflatorToToday, type InflacionMes } from '@/lib/services/inflacion';
import type { NetWorthNow, NetWorthPoint } from '@/lib/services/net-worth';
import BlueFxReferenceDetails from '@/components/ui/BlueFxReferenceDetails';
import type { PresentationCurrency } from '@/lib/presentation-preferences';

type ViewMode = 'ars' | 'usd' | 'real';
type TimeframeId = '1m' | '3m' | '1y' | 'max';
type Currency = 'ARS' | 'USD';

interface NetWorthHeroProps {
  now: NetWorthNow;
  history: NetWorthPoint[];
  inflacion: InflacionMes[];
  baseCurrency?: PresentationCurrency;
}

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'ars', label: 'ARS' },
  { id: 'usd', label: 'USD blue' },
  { id: 'real', label: 'ARS reales' },
];

const TIMEFRAMES: { id: TimeframeId; label: string; days: number | null }[] = [
  { id: '1m', label: '1M', days: 30 },
  { id: '3m', label: '3M', days: 90 },
  { id: '1y', label: '1A', days: 365 },
  { id: 'max', label: 'Max', days: null },
];

function currencyForView(view: ViewMode): Currency {
  return view === 'usd' ? 'USD' : 'ARS';
}

function fmtDateShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function fmtDateFull(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Ticks compactos del eje Y, ej. "$1,2M" / "US$850K". */
function formatCompactValue(value: number, currency: Currency): string {
  const symbol = currency === 'USD' ? 'US$' : '$';
  const abs = Math.abs(value);
  let num = value;
  let suffix = '';
  if (abs >= 1_000_000) {
    num = value / 1_000_000;
    suffix = 'M';
  } else if (abs >= 1_000) {
    num = value / 1_000;
    suffix = 'K';
  }
  const formatted = num.toLocaleString('es-AR', { maximumFractionDigits: suffix ? 1 : 0 });
  return `${symbol}${formatted}${suffix}`;
}

function moneyDecimals(value: number, currency: Currency): number {
  return currency === 'USD' && !Number.isInteger(value) ? 2 : 0;
}

function formatMoney(value: number, currency: Currency): string {
  const symbol = currency === 'USD' ? 'US$' : '$';
  const decimals = moneyDecimals(value, currency);
  return `${symbol} ${value.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden="true">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.36 5.42A10.6 10.6 0 0 1 12 5c7 0 10.5 7 10.5 7a13.6 13.6 0 0 1-3.1 3.9M6.6 6.6C3.36 8.5 1.5 12 1.5 12s3.5 7 10.5 7a10.6 10.6 0 0 0 3.4-.56"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Widget hero del dashboard: patrimonio total con 3 vistas conmutables
 * (ARS nominal / USD blue / ARS reales via inflación) y un AreaChart ancla
 * con timeframes. Único gran número animado (count-up al montar); el resto
 * de la UI es estática para no competir por atención.
 */
export default function NetWorthHero({ now, history, inflacion, baseCurrency = 'ARS' }: NetWorthHeroProps) {
  const { hidden, toggle } = usePrivacy();
  const gradientId = useId();

  const [view, setView] = useState<ViewMode>(baseCurrency === 'USD' ? 'usd' : 'ars');
  const [timeframe, setTimeframe] = useState<TimeframeId>('3m');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setView(baseCurrency === 'USD' ? 'usd' : 'ars');
    setMounted(true);
  }, [baseCurrency]);

  function selectView(next: ViewMode) {
    setView(next);
  }

  // Valor de HOY: viene de `now` (en vivo), no del historial. En la vista
  // "reales" el valor de hoy es igual al nominal (deflator de hoy = 1).
  const heroValue = view === 'usd' ? now.totalUSD : now.totalARSBlue;
  const partial = now.valuation?.status === 'partial';
  const currency = currencyForView(view);

  // --- Count-up: SOLO en el montaje, una única vez. ---
  const hasAnimatedRef = useRef(false);
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (hasAnimatedRef.current) {
      // Ya animamos una vez: cambios posteriores (switch de vista) son instantáneos.
      setDisplayValue(heroValue);
    }
  }, [heroValue]);

  useEffect(() => {
    if (!mounted || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;
    const controls = animate(0, heroValue, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => setDisplayValue(v),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // --- Delta vs snapshot anterior ---
  const pointViewValue = useCallback(
    (p: NetWorthPoint, v: ViewMode): number => {
      if (v === 'usd') return p.total_usd;
      if (v === 'real') return p.total_ars_blue * deflatorToToday(inflacion, p.snapshot_date);
      return p.total_ars_blue;
    },
    [inflacion]
  );

  // Sin memo: barato por render y evita quedar clavado en la fecha de ayer
  // si la pestaña queda abierta cruzando la medianoche.
  const todayISO = new Date().toISOString().slice(0, 10);

  const priorPoint = useMemo(() => {
    if (history.length === 0) return null;
    const last = history[history.length - 1];
    if (last.snapshot_date === todayISO) {
      return history.length >= 2 ? history[history.length - 2] : null;
    }
    return last;
  }, [history, todayISO]);

  const delta = useMemo(() => {
    if (!priorPoint || partial) return null;
    const prev = pointViewValue(priorPoint, view);
    const diff = heroValue - prev;
    const pct = prev !== 0 ? (diff / prev) * 100 : null;
    return { diff, pct };
  }, [priorPoint, view, heroValue, pointViewValue, partial]);

  // --- Serie del gráfico ancla, re-expresada por vista ---
  const seriesByView = useMemo(
    () =>
      history.map((p) => ({
        date: p.snapshot_date,
        ars: p.total_ars_blue,
        usd: p.total_usd,
        real: p.total_ars_blue * deflatorToToday(inflacion, p.snapshot_date),
      })),
    [history, inflacion]
  );

  const timeframeCfg = TIMEFRAMES.find((t) => t.id === timeframe) ?? TIMEFRAMES[1];

  const filteredSeries = useMemo(() => {
    if (timeframeCfg.days == null) return seriesByView;
    const cutoff = subDays(new Date(), timeframeCfg.days);
    const filtered = seriesByView.filter((p) => new Date(`${p.date}T00:00:00`) >= cutoff);
    // Si el recorte deja muy pocos puntos (datos aún escasos), mostramos todo
    // lo que haya en vez de un gráfico casi vacío.
    return filtered.length >= 2 ? filtered : seriesByView;
  }, [seriesByView, timeframeCfg]);

  const chartData = useMemo(
    () => filteredSeries.map((p) => ({ date: p.date, value: p[view] })),
    [filteredSeries, view]
  );

  const hasChart = history.length >= 2;

  return (
    <section className="card space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Patrimonio total</h2>
          <button
            type="button"
            onClick={toggle}
            aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
            aria-pressed={hidden}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {hidden ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>

        <div
          role="group"
          aria-label="Vista de patrimonio"
          className="inline-flex items-center gap-1 rounded-control border border-border bg-secondary/60 p-1"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => selectView(v.id)}
              className={`rounded-[calc(var(--radius-control)-0.25rem)] px-3 py-1.5 text-xs font-medium transition-colors ${
                view === v.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        {now.valuation && <div role="status" className="text-sm text-warning mb-3">
          <p>Total parcial: subtotal de los componentes con valoración disponible.</p>
          <ul>{now.valuation.excludedAccounts.map(account => (
            <li key={account.accountId}>
              {account.name}: {hidden ? PRIVACY_MASK : account.balance.toLocaleString('es-AR')} {account.currency}
              {account.secondaryCurrency && account.secondaryBalance !== undefined
                ? `; ${hidden ? PRIVACY_MASK : account.secondaryBalance.toLocaleString('es-AR')} ${account.secondaryCurrency}` : ''}.
              {' '}Excluida: sin cotización compatible para {account.currencies.join(', ')}.
            </li>
          ))}</ul>
        </div>}
        <Amount
          value={displayValue}
          currency={currency}
          decimals={moneyDecimals(heroValue, currency)}
          className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
        />

        <p className="mt-1.5 text-sm text-muted-foreground">
          {view === 'ars' && <Amount value={now.totalUSD} currency="USD" decimals={moneyDecimals(now.totalUSD, 'USD')} prefix="≈ " />}
          {view === 'usd' && <Amount value={now.totalARSBlue} currency="ARS" prefix="≈ " />}
          {view === 'real' && 'en pesos de hoy'}
        </p>

        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {now.blueReferences?.length ? now.blueReferences.map(({ component, reference }, index) => (
            <BlueFxReferenceDetails key={`${component}-${index}`} reference={reference}
              label={component === 'accounts' ? 'Cuentas · tramo USD/ARS' : 'Posiciones · tramo USD/ARS'} />
          )) : <BlueFxReferenceDetails />}
          {now.blueReferences && now.blueReferences.length > 1 ? (
            <p>Cada componente conserva su referencia. Los cruces de otras monedas no están incluidos; el historial no conserva la fuente ni la fecha de la cotización.</p>
          ) : null}
        </div>

        {delta && (
          <p
            className={`mt-2 inline-flex items-center gap-1 text-sm font-medium ${
              delta.diff >= 0 ? 'text-success' : 'text-destructive'
            }`}
          >
            <span aria-hidden="true">{delta.diff >= 0 ? '▲' : '▼'}</span>
            <Amount value={Math.abs(delta.diff)} currency={currency} decimals={moneyDecimals(delta.diff, currency)} className="font-medium" />
            {delta.pct != null && (
              <span className="font-normal text-muted-foreground">
                ({delta.pct >= 0 ? '+' : ''}
                {delta.pct.toFixed(1)}%)
              </span>
            )}
          </p>
        )}
      </div>

      {!hasChart ? (
        <p className="text-xs text-muted-foreground">
          El gráfico se construye día a día a partir de hoy.
        </p>
      ) : (
        <div>
          <div role="group" aria-label="Rango del gráfico" className="mb-2 flex justify-end gap-3">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                type="button"
                aria-pressed={timeframe === tf.id}
                onClick={() => setTimeframe(tf.id)}
                className={`text-xs transition-colors ${
                  timeframe === tf.id ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div className="h-[130px] w-full md:h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="rgb(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  {...axisProps}
                  interval="preserveStartEnd"
                  minTickGap={32}
                  dy={4}
                  tickFormatter={fmtDateShort}
                />
                <YAxis
                  width={44}
                  {...axisProps}
                  tickCount={3}
                  allowDecimals={false}
                  tickFormatter={(v) => formatCompactValue(Number(v), currency)}
                />
                <Tooltip
                  cursor={{ stroke: 'rgb(var(--primary))', strokeOpacity: 0.3 }}
                  content={
                    <ChartTooltip
                      labelFormatter={(label) => fmtDateFull(String(label))}
                      formatter={(value) => [
                        hidden ? PRIVACY_MASK : formatMoney(Number(value), currency),
                        'Patrimonio',
                      ]}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="rgb(var(--primary))"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
