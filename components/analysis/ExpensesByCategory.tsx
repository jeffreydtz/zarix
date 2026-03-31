'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface ExpensesByCategoryProps {
  categories: Array<{
    name: string;
    icon: string;
    amount: number;
  }>;
}

const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

export default function ExpensesByCategory({ categories }: ExpensesByCategoryProps) {
  if (categories.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">No hay gastos este mes</p>
      </div>
    );
  }

  const data = categories.map((cat) => ({
    name: `${cat.icon} ${cat.name}`,
    value: cat.amount,
  }));

  const total = categories.reduce((sum, cat) => sum + cat.amount, 0);

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Gastos por Categoría</h3>

      <div className="grid md:grid-cols-2 gap-6">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) =>
                `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
              }
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="space-y-2">
          {categories.map((cat, index) => {
            const percent = (cat.amount / total) * 100;
            return (
              <div key={cat.name} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm">
                    {cat.icon} {cat.name}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    ${cat.amount.toLocaleString('es-AR')}
                  </div>
                  <div className="text-xs text-gray-500">{percent.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
