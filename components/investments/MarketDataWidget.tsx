'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface StockQuote {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  currency: string;
}

interface CryptoQuote {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  image: string;
}

interface MarketData {
  crypto: CryptoQuote[];
  usStocks: StockQuote[];
  argStocks: StockQuote[];
  fetchedAt: string;
}

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

function CryptoRow({ coin, index }: { coin: CryptoQuote; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0"
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
        <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">
          {coin.symbol}
        </div>
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

function StockRow({ stock, index }: { stock: StockQuote; index: number }) {
  const isArg = stock.currency === 'ARS';
  const priceStr = isArg
    ? `$${stock.price.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS`
    : `$${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0"
    >
      <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300 shrink-0">
        {stock.ticker.replace('.BA', '').slice(0, 3)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
          {stock.ticker.replace('.BA', '')}
        </div>
        <div className="text-xs text-slate-400 truncate">{stock.name}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
          {priceStr}
        </div>
        <ChangeBadge value={stock.changePct} />
      </div>
    </motion.div>
  );
}

function MarketSection({
  title,
  icon,
  children,
  loading,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{title}</span>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">Tiempo real</span>
      </div>
      <div className="px-4 divide-y divide-slate-100 dark:divide-slate-700/50">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          : children}
      </div>
    </div>
  );
}

export default function MarketDataWidget() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/market-data');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const lastUpdated = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Mercados
        </h2>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-slate-400">
              Actualizado {lastUpdated}
            </span>
          )}
          <button
            onClick={fetchData}
            className="text-xs text-blue-500 hover:text-blue-600 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            ↻ Refrescar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <span>⚠️</span>
          <span>No se pudieron cargar los datos de mercado. Intentá refrescar.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MarketSection title="Top Crypto" icon="₿" loading={loading}>
          {(data?.crypto || []).map((coin, i) => (
            <CryptoRow key={coin.id} coin={coin} index={i} />
          ))}
        </MarketSection>

        <MarketSection title="USA · Top Acciones" icon="🇺🇸" loading={loading}>
          {(data?.usStocks || []).length > 0 ? (
            (data?.usStocks || []).map((stock, i) => (
              <StockRow key={stock.ticker} stock={stock} index={i} />
            ))
          ) : (
            <div className="py-6 text-sm text-slate-500 dark:text-slate-400">
              Sin datos de USA en este momento.
            </div>
          )}
        </MarketSection>

        <MarketSection title="Argentina · Merval" icon="🇦🇷" loading={loading}>
          {(data?.argStocks || []).length > 0 ? (
            (data?.argStocks || []).map((stock, i) => (
              <StockRow key={stock.ticker} stock={stock} index={i} />
            ))
          ) : (
            <div className="py-6 text-sm text-slate-500 dark:text-slate-400">
              Sin datos de Merval en este momento.
            </div>
          )}
        </MarketSection>
      </div>
    </div>
  );
}
