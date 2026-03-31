'use client';

import { motion } from 'framer-motion';

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
  colorClass = 'bg-blue-500',
  height = 'h-2',
  showLabel = false,
  animated = true,
}: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100);

  const getColorClass = () => {
    if (colorClass !== 'bg-blue-500') return colorClass;
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
          initial={animated ? { width: 0 } : { width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={{ 
            duration: animated ? 0.8 : 0, 
            ease: [0.25, 0.46, 0.45, 0.94],
            delay: animated ? 0.2 : 0,
          }}
        />
      </div>
    </div>
  );
}
