/**
 * Placeholder mientras un chart (lazy-loaded vía next/dynamic) baja su chunk.
 * Mantiene el alto para evitar saltos de layout.
 */
export default function ChartSkeleton({ height = 256 }: { height?: number }) {
  return (
    <div
      className="card flex items-center justify-center animate-pulse"
      style={{ height }}
      aria-busy="true"
      aria-label="Cargando gráfico"
    >
      <div className="h-2/3 w-11/12 rounded-xl bg-surface-soft" />
    </div>
  );
}
