'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MonthlyTrendProps {
  current: {
    totalExpenses: number;
    totalIncome: number;
  };
  previous: {
    totalExpenses: number;
    totalIncome: number;
  };
}

export default function MonthlyTrend({ current, previous }: MonthlyTrendProps) {
  const data = [
    {
      name: 'Mes Anterior',
      Gastos: previous.totalExpenses,
      Ingresos: previous.totalIncome,
    },
    {
      name: 'Mes Actual',
      Gastos: current.totalExpenses,
      Ingresos: current.totalIncome,
    },
  ];

  const expenseChange = current.totalExpenses - previous.totalExpenses;
  const expenseChangePercent = (expenseChange / previous.totalExpenses) * 100;

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Comparativa Mensual</h3>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip
            formatter={(value: number) =>
              `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
            }
          />
          <Legend />
          <Bar dataKey="Gastos" fill="#EF4444" />
          <Bar dataKey="Ingresos" fill="#10B981" />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-sm text-gray-500">Variación en Gastos</div>
          <div
            className={`text-lg font-bold ${
              expenseChange >= 0 ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {expenseChange >= 0 ? '+' : ''}
            {expenseChangePercent.toFixed(1)}%
          </div>
        </div>

        <div className="text-center">
          <div className="text-sm text-gray-500">Ahorro del Mes</div>
          <div
            className={`text-lg font-bold ${
              current.totalIncome - current.totalExpenses >= 0
                ? 'text-green-600'
                : 'text-red-600'
            }`}
          >
            ${(current.totalIncome - current.totalExpenses).toLocaleString('es-AR')}
          </div>
        </div>
      </div>
    </div>
  );
}
