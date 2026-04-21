'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface PerformancePoint {
  snapshot_date: string;
  cost_basis_usd: number;
  market_value_usd: number;
  unrealized_pnl_usd: number;
  roi_percent: number;
  blue_ars_per_usd: number;
}

interface PortfolioPerformanceChartProps {
  days?: number;
  /** Cambiar para volver a pedir puntos (ej. tras editar o refresh en vivo). */
  refreshAt?: number;
}

function formatUsd(n: number): string {
  return `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function PortfolioPerformanceChart({
  days = 90,
  refreshAt = 0,
}: PortfolioPerformanceChartProps) {
  const [points, setPoints] = useState<PerformancePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/investments/performance?days=${days}`, { cache: 'no-store' });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Error');
        if (!cancelled) setPoints(Array.isArray(data.points) ? data.points : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, refreshAt]);

  const chartData = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        label: p.snapshot_date,
      })),
    [points]
  );

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
        Cargando historial de rendimiento…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-900/50 p-5 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 text-sm text-slate-600 dark:text-slate-300 space-y-2">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Rendimiento del portafolio</h3>
        <p>
          Todavía no hay puntos en el historial. Se guarda un registro por día cuando consultás el portafolio (con
          capital invertido y ganancia no realizada en USD, usando dólar blue para unificar pesos).
        </p>
        <p className="text-slate-500 dark:text-slate-400">
          Volvé mañana o después de agregar posiciones: el gráfico muestra <strong>ROI %</strong> y{' '}
          <strong>PnL (ganancia no realizada)</strong>, no el valor nominal total — así un aporte nuevo no aparece como
          “subida” de la cartera.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-3">
      <div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Rendimiento (no nominal)</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
          Línea violeta: <strong>ROI %</strong> sobre capital invertido (costo). Línea esmeralda:{' '}
          <strong>ganancia o pérdida no realizada en USD</strong>. Si depositás 3000 USD en una compra al precio de
          mercado, el ROI no salta: sube el costo y el valor a la vez; lo que cambia es el mercado después.
        </p>
      </div>

      <div className="h-72 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-600" />
            <XAxis
              dataKey="snapshot_date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => {
                const d = new Date(String(v) + 'T12:00:00');
                return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-AR', { month: 'short', day: 'numeric' });
              }}
            />
            <YAxis
              yAxisId="roi"
              width={44}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
              label={{ value: 'ROI %', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
            />
            <YAxis
              yAxisId="pnl"
              orientation="right"
              width={56}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${Math.round(Number(v))}`}
              label={{ value: 'PnL USD', angle: 90, position: 'insideRight', style: { fontSize: 11 } }}
            />
            <Tooltip
              contentStyle={{ borderRadius: 12 }}
              formatter={(value: number, name: string) => {
                if (name === 'roi_percent') return [`${value.toFixed(2)}%`, 'ROI'];
                if (name === 'unrealized_pnl_usd') return [formatUsd(value), 'PnL no realizado'];
                if (name === 'cost_basis_usd') return [formatUsd(value), 'Capital invertido'];
                if (name === 'market_value_usd') return [formatUsd(value), 'Valor mercado'];
                return [value, name];
              }}
              labelFormatter={(label) => `Día ${label}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              yAxisId="roi"
              type="monotone"
              dataKey="roi_percent"
              name="ROI %"
              stroke="#7c3aed"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="pnl"
              type="monotone"
              dataKey="unrealized_pnl_usd"
              name="PnL USD"
              stroke="#059669"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
