'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import type {
  CryptoQuote,
  MarketDataClient,
  StockQuote,
} from '@/lib/market-data-types';
import { loadMarketDataFromLocal, saveMarketDataToLocal } from '@/lib/market-data-local-cache';
import { mergeMarketWithLocalSnapshot } from '@/lib/market-data-merge-local';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

function ChangeBadge({ value }: { value: number }) {
  const pos = value >= 0;
  return (
    <span
      className={`text-xs font-semibold tabular-nums ${
        pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
      }`}
    >
      {pos ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-2.5 w-14 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      </div>
      <div className="space-y-1 text-right">
        <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-2.5 w-10 bg-slate-100 dark:bg-slate-800 rounded animate-pulse ml-auto" />
      </div>
    </div>
  );
}

function CryptoRow({
  coin,
  index,
  shouldReduceMotion,
}: {
  coin: CryptoQuote;
  index: number;
  shouldReduceMotion: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={maybeReduceTransition(shouldReduceMotion, {
        ...motionTransition.smooth,
        delay: index * 0.04,
        duration: 0.22,
      })}
      whileHover={shouldReduceMotion ? undefined : { x: 2 }}
      className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0 rounded-control px-2 hover:bg-surface-soft/75 transition-colors"
    >
      {coin.image ? (
        <Image
          src={coin.image}
          alt={coin.name}
          width={28}
          height={28}
          className="rounded-full"
          unoptimized
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold">
          {coin.symbol[0]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">{coin.symbol}</div>
        <div className="text-xs text-slate-400 truncate">{coin.name}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
          ${coin.price >= 1
            ? coin.price.toLocaleString('en-US', { maximumFractionDigits: 2 })
            : coin.price.toFixed(6)}
        </div>
        <ChangeBadge value={coin.change24h} />
      </div>
    </motion.div>
  );
}

function StockRow({
  stock,
  index,
  shouldReduceMotion,
}: {
  stock: StockQuote;
  index: number;
  shouldReduceMotion: boolean;
}) {
  /** EQUITY desactiva “índice” para ^IXIC vía Stooq/QQQ (precio en USD, no puntos). */
  const isIndex =
    stock.instrumentType === 'INDEX' ||
    (stock.ticker.startsWith('^') && stock.instrumentType !== 'EQUITY');
  const isArg = stock.currency === 'ARS';
  const isPts = stock.currency === 'PTS';

  let priceStr: string;
  if (isIndex && isPts) {
    priceStr = `${stock.price.toLocaleString('es-AR', { maximumFractionDigits: 0 })} pts`;
  } else if (isIndex) {
    priceStr = `${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pts`;
  } else if (isArg) {
    priceStr = `$${stock.price.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS`;
  } else {
    priceStr = `$${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const displayTicker = stock.ticker.replace('.BA', '').replace(/^\^/, '');
  const iconLetter = isIndex
    ? stock.ticker === '^MERV'
      ? 'M'
      : stock.ticker === '^IXIC'
        ? 'N'
        : displayTicker.slice(0, 1)
    : displayTicker.slice(0, 3);

  const iconClass = isIndex
    ? 'rounded-lg bg-violet-100 dark:bg-violet-900/35 text-violet-800 dark:text-violet-200'
    : 'rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';

  return (
    <motion.div
      initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={maybeReduceTransition(shouldReduceMotion, {
        ...motionTransition.smooth,
        delay: index * 0.04,
        duration: 0.22,
      })}
      whileHover={shouldReduceMotion ? undefined : { x: 2 }}
      className={`flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0 ${
        isIndex ? 'bg-violet-50/60 dark:bg-violet-950/20 -mx-4 px-4 border-slate-200/80 dark:border-violet-900/30' : 'rounded-control px-2 hover:bg-surface-soft/75 transition-colors'
      }`}
    >
      {stock.logoUrl ? (
        <Image
          src={stock.logoUrl}
          alt=""
          width={28}
          height={28}
          className="w-7 h-7 shrink-0 rounded-lg object-contain bg-white dark:bg-slate-900 ring-1 ring-slate-200/90 dark:ring-slate-600"
          unoptimized
        />
      ) : (
        <div
          className={`w-7 h-7 flex items-center justify-center text-[10px] font-bold shrink-0 ${iconClass}`}
        >
          {iconLetter}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
            {isIndex || stock.ticker.startsWith('^') ? stock.name : displayTicker}
          </span>
          {isIndex && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 shrink-0">
              índice
            </span>
          )}
        </div>
        <div className="text-xs text-slate-400 truncate">
          {isIndex ? stock.ticker : stock.ticker.startsWith('^') ? stock.ticker : stock.name}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{priceStr}</div>
        <ChangeBadge value={stock.changePct} />
      </div>
    </motion.div>
  );
}

function formatSnapshotLabel(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MarketSection({
  title,
  marketTag,
  children,
  loading,
  stale,
  snapshotAt,
}: {
  title: string;
  marketTag: string;
  children: React.ReactNode;
  loading: boolean;
  stale?: boolean;
  snapshotAt?: string;
}) {
  const snap = formatSnapshotLabel(snapshotAt);
  return (
    <div className="zx-panel overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="badge badge-primary uppercase tracking-wide">{marketTag}</span>
          <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{title}</span>
        </div>
        <div className="flex flex-col items-end text-right shrink-0">
          <span
            className={
              stale
                ? 'text-[10px] font-medium text-amber-600 dark:text-amber-400'
                : 'text-[11px] text-emerald-600 dark:text-emerald-300'
            }
          >
            {stale ? 'Última cotización guardada' : 'Tiempo real'}
          </span>
          {stale && snap && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">{snap}</span>
          )}
        </div>
      </div>
      <div className="px-4 divide-y divide-slate-100 dark:divide-slate-700/50">
        {loading ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />) : children}
      </div>
    </div>
  );
}

export default function MarketDataWidget() {
  const shouldReduceMotion = useReducedMotion();
  const [data, setData] = useState<MarketDataClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const fetchData = useCallback(async (opts?: { showLoading?: boolean; forceRefresh?: boolean }) => {
    const local = loadMarketDataFromLocal();
    if (opts?.showLoading) setLoading(true);
    try {
      const q = opts?.forceRefresh ? '?refresh=1' : '';
      const res = await fetch(`/api/market-data${q}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed');
      const json = (await res.json()) as MarketDataClient;
      const merged = mergeMarketWithLocalSnapshot(json, local);
      setData(merged);
      saveMarketDataToLocal(merged);
      setFetchError(false);
    } catch {
      if (local) {
        setData(local);
        setFetchError(true);
      } else {
        setData(null);
        setFetchError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const local = loadMarketDataFromLocal();
    if (local) {
      setData(local);
      setLoading(false);
    }
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const lastUpdated = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const st = data?.stale;
  const times = data?.sectionTimes;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Mercados</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Índices Nasdaq Composite y MERVAL, acciones líderes y las cinco mayores cripto por capitalización.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="story-chip">Pulso global: cripto + USA + AR</span>
            <span className="story-chip-strong">Uso táctico: detectar momentum diario</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 sm:pb-0.5">
          {lastUpdated && (
            <span className="text-xs text-slate-400 hidden sm:inline">Respuesta API {lastUpdated}</span>
          )}
          <button
            type="button"
            onClick={() => {
              void fetchData({ showLoading: true, forceRefresh: true });
            }}
            className="text-xs text-emerald-600 dark:text-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-200 font-medium px-2 py-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
          >
            Actualizar
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <span aria-hidden>ℹ️</span>
          <span>
            No se pudo actualizar desde la red. Mostramos la última información guardada en este dispositivo
            {data?.fetchedAt
              ? ` (${formatSnapshotLabel(data.fetchedAt) ?? ''})`
              : '.'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        <MarketSection
          title="Top Crypto"
          marketTag="CRYPTO"
          loading={loading && !data?.crypto?.length}
          stale={st?.crypto}
          snapshotAt={times?.crypto}
        >
          {(data?.crypto || []).map((coin, i) => (
            <CryptoRow key={coin.id} coin={coin} index={i} shouldReduceMotion={shouldReduceMotion} />
          ))}
          {!loading && !(data?.crypto || []).length && (
            <div className="py-6 text-sm text-slate-500 dark:text-slate-400">Sin datos de crypto.</div>
          )}
        </MarketSection>

        <MarketSection
          title="USA · Nasdaq & acciones"
          marketTag="USA"
          loading={loading && !data?.usStocks?.length}
          stale={st?.usStocks}
          snapshotAt={times?.usStocks}
        >
          {(data?.usStocks || []).length > 0 ? (
            (data?.usStocks || []).map((stock, i) => (
              <StockRow key={stock.ticker} stock={stock} index={i} shouldReduceMotion={shouldReduceMotion} />
            ))
          ) : (
            <div className="py-6 text-sm text-slate-500 dark:text-slate-400">
              Sin datos del mercado USA (índice Nasdaq y acciones) en este momento.
            </div>
          )}
        </MarketSection>

        <MarketSection
          title="Argentina · MERVAL & panel"
          marketTag="AR"
          loading={loading && !data?.argStocks?.length}
          stale={st?.argStocks}
          snapshotAt={times?.argStocks}
        >
          {(data?.argStocks || []).length > 0 ? (
            (data?.argStocks || []).map((stock, i) => (
              <StockRow key={stock.ticker} stock={stock} index={i} shouldReduceMotion={shouldReduceMotion} />
            ))
          ) : (
            <div className="py-6 text-sm text-slate-500 dark:text-slate-400">
              Sin datos de Argentina (índice MERVAL y acciones) en este momento.
            </div>
          )}
        </MarketSection>
      </div>
    </div>
  );
}
