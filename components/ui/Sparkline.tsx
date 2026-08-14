/**
 * Sparkline SVG puro (sin lib de charts): momentum de un vistazo en tarjetas.
 * ~40×120, sin ejes ni labels; gradiente de relleno al 10%. Server-safe.
 */
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Clase de color del trazo (ej. "text-success"); el fill hereda via currentColor. */
  className?: string;
  strokeWidth?: number;
}

export default function Sparkline({
  data,
  width = 120,
  height = 40,
  className = 'text-primary',
  strokeWidth = 2,
}: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = strokeWidth;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const area = `${path} L${points[points.length - 1][0].toFixed(1)} ${height} L${points[0][0].toFixed(1)} ${height} Z`;
  // Id único por instancia para que los gradientes no colisionen en la página
  const gid = `spark-${Math.abs(data.length * 31 + Math.round(data[0] * 100) + Math.round(data[data.length - 1] * 7))}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
