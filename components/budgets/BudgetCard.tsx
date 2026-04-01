'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CategoryIcon } from '@/lib/category-icons';

interface BudgetWithStatus {
  id: string;
  category_id: string | null;
  amount: number;
  currency: string;
  rollover_enabled: boolean;
  rollover_amount: number;
  alert_at_percent: number;
  category?: { name: string; icon: string } | null;
  // From status join
  spent_amount?: number;
  percent_used?: number;
  remaining_amount?: number;
}

interface BudgetCardProps {
  budget: BudgetWithStatus;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

function getProgressColor(percent: number): string {
  if (percent >= 100) return '#EF4444'; // red-500
  if (percent >= 80) return '#F59E0B'; // amber-500
  if (percent >= 60) return '#3B82F6'; // blue-500
  return '#10B981'; // emerald-500
}

function getProgressBg(percent: number): string {
  if (percent >= 100) return 'bg-red-100 dark:bg-red-900/20';
  if (percent >= 80) return 'bg-amber-100 dark:bg-amber-900/20';
  return 'bg-emerald-100 dark:bg-emerald-900/20';
}

export default function BudgetCard({ budget, onDelete, onRefresh }: BudgetCardProps) {
  const [deleting, setDeleting] = useState(false);

  const percent = Math.min(Number(budget.percent_used) || 0, 100);
  const spent = Number(budget.spent_amount) || 0;
  const remaining = Number(budget.remaining_amount) ?? (budget.amount - spent);
  const totalAmount = Number(budget.amount);
  const progressColor = getProgressColor(percent);
  const realPercent = Number(budget.percent_used) || 0;

  const categoryName = budget.category?.name || 'General';
  const categoryIcon = budget.category?.icon || '🎯';

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar el presupuesto de "${categoryName}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/budgets/${budget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al eliminar el presupuesto');
      }
      onDelete(budget.id);
    } catch (e: any) {
      console.error('Delete error:', e);
      alert(e.message || 'Error al eliminar el presupuesto');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`rounded-2xl p-5 border ${
        realPercent >= 100
          ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
          : realPercent >= 80
          ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${getProgressBg(realPercent)}`}>
            <CategoryIcon icon={categoryIcon} className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-100">{categoryName}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {budget.currency} · alerta al {budget.alert_at_percent}%
              {budget.rollover_enabled && ' · con rollover'}
            </div>
          </div>
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm"
          title="Eliminar presupuesto"
        >
          {deleting ? '...' : '🗑️'}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
            className="h-full rounded-full"
            style={{ backgroundColor: progressColor }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-slate-500 dark:text-slate-400">
            ${spent.toLocaleString('es-AR', { maximumFractionDigits: 0 })} gastado
          </span>
          <span className="font-semibold" style={{ color: progressColor }}>
            {realPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3 bg-slate-50 dark:bg-slate-700/50">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Presupuesto</div>
          <div className="font-bold text-slate-800 dark:text-slate-100">
            ${totalAmount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-xs text-slate-400">{budget.currency}</div>
        </div>
        <div className={`rounded-xl p-3 ${remaining < 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-slate-50 dark:bg-slate-700/50'}`}>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
            {remaining < 0 ? 'Excedido' : 'Restante'}
          </div>
          <div className={`font-bold ${remaining < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
            ${Math.abs(remaining).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-xs text-slate-400">{budget.currency}</div>
        </div>
      </div>

      {/* Alert badges */}
      {realPercent >= 100 && (
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
          <span>🔴</span> Presupuesto superado
        </div>
      )}
      {realPercent >= budget.alert_at_percent && realPercent < 100 && (
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <span>⚠️</span> Cerca del límite ({budget.alert_at_percent}%)
        </div>
      )}
    </motion.div>
  );
}
