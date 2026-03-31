'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

interface QuotesWidgetProps {
  quotes: {
    dolar: Record<
      string,
      {
        type: string;
        buy: number;
        sell: number;
      }
    >;
    crypto: {
      btc: { priceUSD: number; change24h: number };
      eth: { priceUSD: number; change24h: number };
      usdt: { priceUSD: number };
    };
  };
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
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="card"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          Cotizaciones
        </h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          En vivo
        </span>
      </div>
      
      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <motion.div 
          variants={item}
          className="p-3 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-100 dark:border-green-900/50"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">💵</span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Blue</span>
          </div>
          <div className="text-xl font-bold text-slate-800 dark:text-slate-100">
            <AnimatedNumber value={quotes.dolar.blue.sell} prefix="$" decimals={0} />
          </div>
        </motion.div>

        <motion.div 
          variants={item}
          className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/50"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">📊</span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">MEP</span>
          </div>
          <div className="text-xl font-bold text-slate-800 dark:text-slate-100">
            <AnimatedNumber value={quotes.dolar.mep.sell} prefix="$" decimals={0} />
          </div>
        </motion.div>

        <motion.div 
          variants={item}
          className="p-3 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border border-orange-100 dark:border-orange-900/50"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">₿</span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Bitcoin</span>
          </div>
          <div className="text-xl font-bold text-slate-800 dark:text-slate-100">
            <AnimatedNumber value={quotes.crypto.btc.priceUSD} prefix="$" decimals={0} />
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className={`text-xs font-medium mt-1 flex items-center gap-1 ${
              quotes.crypto.btc.change24h >= 0 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            <span>{quotes.crypto.btc.change24h >= 0 ? '↑' : '↓'}</span>
            <span>{Math.abs(quotes.crypto.btc.change24h).toFixed(2)}%</span>
          </motion.div>
        </motion.div>

        <motion.div 
          variants={item}
          className="p-3 rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 border border-purple-100 dark:border-purple-900/50"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-base">💎</span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Ethereum</span>
          </div>
          <div className="text-xl font-bold text-slate-800 dark:text-slate-100">
            <AnimatedNumber value={quotes.crypto.eth.priceUSD} prefix="$" decimals={0} />
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className={`text-xs font-medium mt-1 flex items-center gap-1 ${
              quotes.crypto.eth.change24h >= 0 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            <span>{quotes.crypto.eth.change24h >= 0 ? '↑' : '↓'}</span>
            <span>{Math.abs(quotes.crypto.eth.change24h).toFixed(2)}%</span>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default memo(QuotesWidget);
