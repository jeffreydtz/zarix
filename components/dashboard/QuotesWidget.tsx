'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { cotizacionesService } from '@/lib/services/cotizaciones';
import { formatFxProviderName } from '@/lib/fx-provider-name';
import FxStatusBanner from '@/components/ui/FxStatusBanner';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

interface QuotesWidgetProps {
  quotes: Awaited<ReturnType<typeof cotizacionesService.getAllQuotes>>;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1 },
};

function QuotesWidget({ quotes }: QuotesWidgetProps) {
  /** Solo en cliente: toLocaleTimeString difiere entre Node (SSR) y el navegador → hidratación #425 */
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  useEffect(() => {
    if (!quotes.timestamp) {
      setLastUpdated(null);
      return;
    }
    setLastUpdated(
      new Date(quotes.timestamp).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  }, [quotes.timestamp]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="card"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Cotizaciones
          </h3>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Consulta realizada: <span className="font-medium text-muted-foreground">{lastUpdated}</span>
            </p>
          )}
        </div>

      </div>
      
      {quotes.dolar.status === 'unavailable' && <FxStatusBanner fxUnavailable />}
      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
      >
        <motion.div 
          variants={item}
          className="p-3 rounded-xl bg-primary/10 border border-primary/20"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">💵</span>
            <span className="text-xs font-medium text-muted-foreground">Blue</span>
          </div>
          <div className="text-xl font-bold text-foreground">
            {quotes.dolar.blue
              ? <AnimatedNumber value={quotes.dolar.blue.sell} prefix="$" decimals={0} />
              : <span className="text-sm text-muted-foreground">No disponible</span>}
            <FxStatusBanner fxStale={quotes.dolar.blue?.stale}
              fxAsOf={quotes.dolar.blue?.asOf ? new Date(String(quotes.dolar.blue.asOf)).toISOString() : null} />
          </div>
          {formatFxProviderName(quotes.dolar.blue?.provider) && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Fuente: {formatFxProviderName(quotes.dolar.blue?.provider)}
            </p>
          )}
        </motion.div>

        <motion.div 
          variants={item}
          className="p-3 rounded-xl bg-secondary border border-border"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">🏦</span>
            <span className="text-xs font-medium text-muted-foreground">Oficial</span>
          </div>
          <div className="text-xl font-bold text-foreground">
            {quotes.dolar.oficial
              ? <AnimatedNumber value={quotes.dolar.oficial.sell} prefix="$" decimals={0} />
              : <span className="text-sm text-muted-foreground">No disponible</span>}
            <FxStatusBanner fxStale={quotes.dolar.oficial?.stale}
              fxAsOf={quotes.dolar.oficial?.asOf ? new Date(String(quotes.dolar.oficial.asOf)).toISOString() : null} />
          </div>
          {formatFxProviderName(quotes.dolar.oficial?.provider) && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Fuente: {formatFxProviderName(quotes.dolar.oficial?.provider)}
            </p>
          )}
        </motion.div>

        <motion.div 
          variants={item}
          className="p-3 rounded-xl bg-info/10 border border-info/20"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">📊</span>
            <span className="text-xs font-medium text-muted-foreground">MEP</span>
          </div>
          <div className="text-xl font-bold text-foreground">
            {quotes.dolar.mep
              ? <AnimatedNumber value={quotes.dolar.mep.sell} prefix="$" decimals={0} />
              : <span className="text-sm text-muted-foreground">No disponible</span>}
            <FxStatusBanner fxStale={quotes.dolar.mep?.stale}
              fxAsOf={quotes.dolar.mep?.asOf ? new Date(String(quotes.dolar.mep.asOf)).toISOString() : null} />
          </div>
          {formatFxProviderName(quotes.dolar.mep?.provider) ? (
            <p className="text-[11px] text-muted-foreground mt-1">
              Fuente: {formatFxProviderName(quotes.dolar.mep?.provider)}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-1">Sin fuente</p>
          )}
        </motion.div>

        <motion.div 
          variants={item}
          className="p-3 rounded-xl bg-accent-invest/10 border border-accent-invest/20"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">🔁</span>
            <span className="text-xs font-medium text-muted-foreground">CCL</span>
          </div>
          <div className="text-xl font-bold text-foreground">
            {quotes.dolar.ccl
              ? <AnimatedNumber value={quotes.dolar.ccl.sell} prefix="$" decimals={0} />
              : <span className="text-sm text-muted-foreground">No disponible</span>}
            <FxStatusBanner fxStale={quotes.dolar.ccl?.stale}
              fxAsOf={quotes.dolar.ccl?.asOf ? new Date(String(quotes.dolar.ccl.asOf)).toISOString() : null} />
          </div>
          {formatFxProviderName(quotes.dolar.ccl?.provider) ? (
            <p className="text-[11px] text-muted-foreground mt-1">
              Fuente: {formatFxProviderName(quotes.dolar.ccl?.provider)}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-1">Sin fuente</p>
          )}
        </motion.div>

        <motion.div 
          variants={item}
          className="p-3 rounded-xl bg-warning/10 border border-warning/20"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">₿</span>
            <span className="text-xs font-medium text-muted-foreground">Bitcoin</span>
          </div>
          <div className="text-xl font-bold text-foreground">
            {quotes.crypto.btc
              ? <AnimatedNumber value={quotes.crypto.btc.priceUSD} prefix="$" decimals={0} />
              : <span className="text-sm text-muted-foreground">No disponible</span>}
          </div>
          {quotes.crypto.btc && <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className={`text-xs font-medium mt-1 flex items-center gap-1 ${
              quotes.crypto.btc.change24h >= 0
                ? 'text-success'
                : 'text-destructive'
            }`}
          >
            <span>{quotes.crypto.btc.change24h >= 0 ? '↑' : '↓'}</span>
            <span>{Math.abs(quotes.crypto.btc.change24h).toFixed(2)}%</span>
          </motion.div>}
        </motion.div>

        <motion.div 
          variants={item}
          className="p-3 rounded-xl bg-accent-invest/10 border border-accent-invest/20"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">💎</span>
            <span className="text-xs font-medium text-muted-foreground">Ethereum</span>
          </div>
          <div className="text-xl font-bold text-foreground">
            {quotes.crypto.eth
              ? <AnimatedNumber value={quotes.crypto.eth.priceUSD} prefix="$" decimals={0} />
              : <span className="text-sm text-muted-foreground">No disponible</span>}
          </div>
          {quotes.crypto.eth && <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className={`text-xs font-medium mt-1 flex items-center gap-1 ${
              quotes.crypto.eth.change24h >= 0
                ? 'text-success'
                : 'text-destructive'
            }`}
          >
            <span>{quotes.crypto.eth.change24h >= 0 ? '↑' : '↓'}</span>
            <span>{Math.abs(quotes.crypto.eth.change24h).toFixed(2)}%</span>
          </motion.div>}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default memo(QuotesWidget);
