'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BudgetCard from '@/components/budgets/BudgetCard';
import CreateBudgetModal from '@/components/budgets/CreateBudgetModal';

interface Category {
  id: string;
  name: string;
  icon: string;
  type: string;
}

interface BudgetWithStatus {
  id: string;
  category_id: string | null;
  amount: number;
  currency: string;
  rollover_enabled: boolean;
  rollover_amount: number;
  alert_at_percent: number;
  category?: { name: string; icon: string } | null;
  spent_amount?: number;
  percent_used?: number;
  remaining_amount?: number;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function getMonthString(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<BudgetWithStatus[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, any>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const monthStr = getMonthString(viewYear, viewMonth);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [budgetsRes, statusRes, categoriesRes] = await Promise.all([
        fetch(`/api/budgets?month=${monthStr}`),
        fetch(`/api/budgets/status?month=${monthStr}`),
        fetch('/api/categories'),
      ]);

      const [budgetsData, statusData, categoriesData] = await Promise.all([
        budgetsRes.json(),
        statusRes.json(),
        categoriesRes.json(),
      ]);

      // Build status map keyed by category_id (null -> 'general')
      const map: Record<string, any> = {};
      if (Array.isArray(statusData)) {
        statusData.forEach((s: any) => {
          map[s.category_id || 'general'] = s;
        });
      }
      setStatusMap(map);

      // Merge budgets with their status
      const merged = (Array.isArray(budgetsData) ? budgetsData : []).map((b: any) => {
        const key = b.category_id || 'general';
        const status = map[key];
        return {
          ...b,
          spent_amount: status?.spent_amount ?? 0,
          percent_used: status?.percent_used ?? 0,
          remaining_amount: status?.remaining_amount ?? b.amount,
        };
      });

      setBudgets(merged);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    } catch (error) {
      console.error('Error fetching budgets:', error);
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const navigateMonth = (dir: -1 | 1) => {
    let newMonth = viewMonth + dir;
    let newYear = viewYear;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newMonth < 0) { newMonth = 11; newYear--; }
    setViewMonth(newMonth);
    setViewYear(newYear);
  };

  const isCurrentMonth = viewMonth === now.getMonth() && viewYear === now.getFullYear();

  const totalBudgeted = budgets.reduce((sum, b) => sum + Number(b.amount), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + (Number(b.spent_amount) || 0), 0);
  const overBudget = budgets.filter((b) => Number(b.percent_used) >= 100).length;
  const nearBudget = budgets.filter(
    (b) => Number(b.percent_used) >= b.alert_at_percent && Number(b.percent_used) < 100
  ).length;

  const handleDelete = (id: string) => {
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Presupuestos</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Control de gastos por categoría
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-500/20 transition-colors"
          >
            <span>+</span> Nuevo
          </motion.button>
        </div>

        {/* Month Navigator */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => navigateMonth(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            ‹
          </button>
          <div className="text-center">
            <div className="font-bold text-slate-800 dark:text-slate-100">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            {isCurrentMonth && (
              <div className="text-xs text-blue-500 font-medium">Mes actual</div>
            )}
          </div>
          <button
            onClick={() => navigateMonth(1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            ›
          </button>
        </div>

        {/* Summary Cards */}
        {budgets.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700"
            >
              <div className="text-2xl mb-1">🎯</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Presupuestado</div>
              <div className="font-bold text-slate-800 dark:text-slate-100 text-lg">
                ${totalBudgeted.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700"
            >
              <div className="text-2xl mb-1">💸</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Gastado</div>
              <div className="font-bold text-slate-800 dark:text-slate-100 text-lg">
                ${totalSpent.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className={`rounded-2xl p-4 border ${
                overBudget > 0
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="text-2xl mb-1">🔴</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Superados</div>
              <div className={`font-bold text-lg ${overBudget > 0 ? 'text-red-500' : 'text-slate-800 dark:text-slate-100'}`}>
                {overBudget}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className={`rounded-2xl p-4 border ${
                nearBudget > 0
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="text-2xl mb-1">⚠️</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">En alerta</div>
              <div className={`font-bold text-lg ${nearBudget > 0 ? 'text-amber-500' : 'text-slate-800 dark:text-slate-100'}`}>
                {nearBudget}
              </div>
            </motion.div>
          </div>
        )}

        {/* Budget List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-44 rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse"
              />
            ))}
          </div>
        ) : budgets.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20"
          >
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">
              Sin presupuestos este mes
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
              Creá presupuestos por categoría para controlar tus gastos y recibir alertas en Telegram.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowModal(true)}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-colors"
            >
              Crear mi primer presupuesto
            </motion.button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {budgets
                .sort((a, b) => Number(b.percent_used) - Number(a.percent_used))
                .map((budget) => (
                  <BudgetCard
                    key={budget.id}
                    budget={budget}
                    onDelete={handleDelete}
                    onRefresh={fetchData}
                  />
                ))}
            </AnimatePresence>
          </div>
        )}

        {/* Info box */}
        {!loading && (
          <div className="rounded-2xl p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              💡 <strong>Tip:</strong> Las alertas de presupuesto se envían automáticamente al Bot de Telegram cuando alcanzás el umbral configurado (por defecto 80%) y cuando lo superás.
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <CreateBudgetModal
          categories={categories}
          month={monthStr}
          onClose={() => setShowModal(false)}
          onCreated={fetchData}
        />
      )}
    </div>
  );
}
