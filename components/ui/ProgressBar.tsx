'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

interface ProgressBarProps {
  value: number;
  max?: number;
  colorClass?: string;
  height?: string;
  showLabel?: boolean;
  animated?: boolean;
}

export default function ProgressBar({
  value,
  max = 100,
  colorClass = 'bg-emerald-500',
  height = 'h-2',
  showLabel = false,
  animated = true,
}: ProgressBarProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const percentage = Math.min((value / max) * 100, 100);

  const getColorClass = () => {
    if (colorClass !== 'bg-emerald-500') return colorClass;
    if (percentage > 80) return 'bg-gradient-to-r from-red-500 to-red-600';
    if (percentage > 50) return 'bg-gradient-to-r from-yellow-500 to-orange-500';
    return 'bg-gradient-to-r from-green-500 to-emerald-500';
  };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
          <span>{value.toLocaleString('es-AR')}</span>
          <span>{percentage.toFixed(0)}%</span>
        </div>
      )}
      <div className={`w-full bg-slate-200 dark:bg-slate-700 rounded-full ${height} overflow-hidden`}>
        <motion.div
          className={`${height} rounded-full ${getColorClass()}`}
          style={{ transformOrigin: '0% 50%' }}
          initial={animated && !shouldReduceMotion ? { scaleX: 0 } : { scaleX: percentage / 100 }}
          animate={{ scaleX: percentage / 100 }}
          transition={maybeReduceTransition(shouldReduceMotion, animated ? {
            ...motionTransition.smooth,
            duration: 0.75,
            delay: 0.08,
          } : motionTransition.instant)}
        />
      </div>
    </div>
  );
}
