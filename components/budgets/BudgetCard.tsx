'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CategoryIcon } from '@/lib/category-icons';
import { useConfirm } from '@/components/ui/ConfirmDialog';

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

// Umbrales sobre tokens semánticos (ver DESIGN.md): success → warning → destructive.
function getProgressColor(percent: number, remaining: number): string {
  if (remaining < 0) return 'rgb(var(--destructive))';
  if (percent >= 80 || remaining === 0) return 'rgb(var(--warning))';
  return 'rgb(var(--success))';
}

function getProgressBg(percent: number, remaining: number): string {
  if (remaining < 0) return 'bg-destructive/10 dark:bg-destructive/20';
  if (percent >= 80 || remaining === 0) return 'bg-warning/10 dark:bg-warning/20';
  return 'bg-primary/10 dark:bg-primary/20';
}

export default function BudgetCard({ budget, onDelete, onRefresh }: BudgetCardProps) {
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  const percent = Math.min(Number(budget.percent_used) || 0, 100);
  const spent = Number(budget.spent_amount) || 0;
  const totalAmount = Number(budget.amount);
  const reportedRemaining = budget.remaining_amount == null ? NaN : Number(budget.remaining_amount);
  const remaining = Number.isFinite(reportedRemaining) ? reportedRemaining : totalAmount - spent;
  const progressColor = getProgressColor(percent, remaining);
  const realPercent = Number(budget.percent_used) || 0;

  const categoryName = budget.category?.name || 'General';
  const categoryIcon = budget.category?.icon || '🎯';

  const handleDelete = async () => {
    const ok = await confirm({
      title: `¿Eliminar el presupuesto de "${categoryName}"?`,
      danger: true,
    });
    if (!ok) return;
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
        remaining < 0
          ? 'border-destructive/30 bg-destructive/10'
          : realPercent >= 80 || remaining === 0
          ? 'border-warning/30 bg-warning/10'
          : 'border-border bg-card'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${getProgressBg(realPercent, remaining)}`}>
            <CategoryIcon icon={categoryIcon} className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-foreground">{categoryName}</div>
            <div className="text-xs text-muted-foreground">
              {budget.currency} · alerta al {budget.alert_at_percent}%
              {budget.rollover_enabled && ' · con rollover'}
            </div>
          </div>
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors text-sm"
          title="Eliminar presupuesto"
        >
          {deleting ? '...' : '🗑️'}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-3 bg-secondary rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
            className="h-full rounded-full"
            style={{ backgroundColor: progressColor }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-muted-foreground">
            ${spent.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} gastado
          </span>
          <span className="font-semibold" style={{ color: progressColor }}>
            {realPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3 bg-secondary">
          <div className="text-xs text-muted-foreground mb-0.5">Presupuesto</div>
          <div className="font-bold text-foreground">
            ${totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-muted-foreground">{budget.currency}</div>
        </div>
        <div className={`rounded-xl p-3 ${remaining < 0 ? 'bg-destructive/10' : 'bg-secondary'}`}>
          <div className="text-xs text-muted-foreground mb-0.5">
            {remaining < 0 ? 'Excedido' : 'Restante'}
          </div>
          <div className={`font-bold ${remaining < 0 ? 'text-destructive' : 'text-success'}`}>
            ${Math.abs(remaining).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-muted-foreground">{budget.currency}</div>
        </div>
      </div>

      {/* Alert badges */}
      {remaining < 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-destructive">
          <span>🔴</span> Presupuesto superado
        </div>
      )}
      {remaining === 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-warning">
          <span>⚠️</span> Presupuesto en el límite
        </div>
      )}
      {remaining > 0 && realPercent >= budget.alert_at_percent && (
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-warning">
          <span>⚠️</span> Cerca del límite ({budget.alert_at_percent}%)
        </div>
      )}
    </motion.div>
  );
}
