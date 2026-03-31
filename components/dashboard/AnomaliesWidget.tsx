'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

interface Anomaly {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  currentAmount: number;
  historicalAvg: number;
  ratio: number | null;
  extraAmount: number;
}

export default function AnomaliesWidget() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/ai/anomalies')
      .then((r) => r.json())
      .then((data) => {
        setAnomalies(data.anomalies || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || anomalies.length === 0) return null;

  const visible = expanded ? anomalies : anomalies.slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="rounded-2xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-lg">
            🚨
          </div>
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              Gastos Inusuales
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-400">
              {anomalies.length} {anomalies.length === 1 ? 'categoría' : 'categorías'} por encima del promedio
            </div>
          </div>
        </div>
        <Link
          href="/analysis"
          className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 font-medium"
        >
          Ver análisis →
        </Link>
      </div>

      {/* Anomalies list */}
      <div className="px-5 pb-4 space-y-2">
        <AnimatePresence>
          {visible.map((anomaly, i) => {
            const ratioText = anomaly.ratio
              ? `${anomaly.ratio.toFixed(1)}x el promedio`
              : 'categoría nueva';
            const severityColor =
              !anomaly.ratio || anomaly.ratio >= 3
                ? 'text-red-500'
                : 'text-amber-500';

            return (
              <motion.div
                key={anomaly.categoryId}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-amber-100 dark:border-amber-800/30"
              >
                <span className="text-xl shrink-0">{anomaly.categoryIcon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
                    {anomaly.categoryName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex gap-1 flex-wrap">
                    <span>${anomaly.currentAmount.toLocaleString('es-AR', { maximumFractionDigits: 0 })} este mes</span>
                    {anomaly.historicalAvg > 0 && (
                      <>
                        <span>·</span>
                        <span>promedio ${anomaly.historicalAvg.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className={`text-xs font-bold shrink-0 ${severityColor}`}>
                  {ratioText}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {anomalies.length > 2 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 py-1 font-medium"
          >
            {expanded ? '▲ Ver menos' : `▼ Ver ${anomalies.length - 2} más`}
          </button>
        )}
      </div>
    </motion.div>
  );
}
