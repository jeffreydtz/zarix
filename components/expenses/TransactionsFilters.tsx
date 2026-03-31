'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface TransactionsFiltersProps {
  accounts: Array<{ id: string; name: string; currency: string }>;
  categories: Array<{ id: string; name: string; icon: string; type: string }>;
}

export default function TransactionsFilters({
  accounts,
  categories,
}: TransactionsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    router.push(`/expenses?${params.toString()}`);
  };

  return (
    <div className="card">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Tipo</label>
          <select
            value={searchParams.get('type') || ''}
            onChange={(e) => handleFilterChange('type', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
          >
            <option value="">Todos</option>
            <option value="expense">Gastos</option>
            <option value="income">Ingresos</option>
            <option value="transfer">Transferencias</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Cuenta</label>
          <select
            value={searchParams.get('accountId') || ''}
            onChange={(e) => handleFilterChange('accountId', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
          >
            <option value="">Todas</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Categoría</label>
          <select
            value={searchParams.get('categoryId') || ''}
            onChange={(e) => handleFilterChange('categoryId', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
          >
            <option value="">Todas</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Período</label>
          <select
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'month') {
                const start = new Date();
                start.setDate(1);
                const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
                handleFilterChange('startDate', start.toISOString().split('T')[0]);
                handleFilterChange('endDate', end.toISOString().split('T')[0]);
              } else if (value === 'week') {
                const start = new Date();
                start.setDate(start.getDate() - 7);
                handleFilterChange('startDate', start.toISOString().split('T')[0]);
                handleFilterChange('endDate', new Date().toISOString().split('T')[0]);
              } else {
                handleFilterChange('startDate', '');
                handleFilterChange('endDate', '');
              }
            }}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
          >
            <option value="">Todo</option>
            <option value="week">Última semana</option>
            <option value="month">Este mes</option>
          </select>
        </div>
      </div>
    </div>
  );
}
