'use client';

/**
 * Tooltip compartido para charts de Recharts. Reemplaza los `contentStyle`
 * inline (que quedaban siempre oscuros). Usa tokens → se adapta a light/dark.
 * Uso: <Tooltip content={<ChartTooltip formatter={fn} />} />
 */

type FormatterOut = [string, string] | string;
type Formatter = (value: number, name: string) => FormatterOut;

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name?: string; dataKey?: string; color?: string; fill?: string; stroke?: string }>;
  label?: string | number;
  formatter?: Formatter;
  labelFormatter?: (label: string | number) => string;
  hideLabel?: boolean;
}

export default function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
  hideLabel,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface-glass/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      {!hideLabel && label != null && (
        <p className="mb-1.5 font-medium text-foreground/65">
          {labelFormatter ? labelFormatter(label) : String(label)}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => {
          const raw = formatter
            ? formatter(p.value, (p.name ?? p.dataKey) as string)
            : ([String(p.value), p.name] as FormatterOut);
          const [val, name] = Array.isArray(raw) ? raw : [raw, p.name];
          return (
            <div key={i} className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: p.color || p.fill || p.stroke }}
              />
              {name && <span className="text-foreground/55">{name}</span>}
              <span className="ml-auto font-semibold tabular-nums text-foreground">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
