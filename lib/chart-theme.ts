/**
 * Paleta y estilos compartidos para todos los charts (Recharts).
 * Centralizado: consistencia visual entre vistas y un solo lugar para tunear.
 * Los colores son hex fijos (estables en SSR); el tooltip y los ejes se
 * adaptan a light/dark vía tokens (ver components/ui/ChartTooltip).
 */

// Colores semánticos.
export const chartColors = {
  income: '#22C55E', // verde — mismo valor que --primary (34 197 94)
  expense: '#F43F5E', // rosa/rojo (más suave que el rojo puro)
  accent: '#F59E0B', // ámbar — promedios / líneas de referencia
  roi: '#8B5CF6', // violeta
  pnl: '#22C55E', // mismo verde que income/--primary
} as const;

// Paleta categórica armónica (pies, donuts, breakdowns sin color propio).
export const chartPalette = [
  '#22C55E',
  '#3B82F6',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
  '#F43F5E',
  '#6366F1',
  '#14B8A6',
] as const;

export function paletteColor(i: number): string {
  return chartPalette[i % chartPalette.length];
}

// Ejes: sin líneas duras, ticks sutiles (slate-400 funciona en ambos temas).
export const axisProps = {
  tick: { fontSize: 11, fill: 'rgb(148 163 184)' },
  axisLine: false,
  tickLine: false,
} as const;

// Grilla: punteada, baja opacidad, solo horizontal (menos ruido visual).
export const gridProps = {
  strokeDasharray: '4 4',
  stroke: 'rgb(148 163 184 / 0.16)',
  vertical: false,
} as const;

// Duración de animación consistente; 0 si el usuario pidió menos movimiento.
export function animMs(reduce: boolean, ms = 750): number {
  return reduce ? 0 : ms;
}

// Stops para gradientes verticales de área/barra.
export function areaGradientStops(color: string): { offset: string; color: string; opacity: number }[] {
  return [
    { offset: '0%', color, opacity: 0.35 },
    { offset: '100%', color, opacity: 0 },
  ];
}
