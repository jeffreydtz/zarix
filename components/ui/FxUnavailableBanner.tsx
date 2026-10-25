function formatAsOf(asOf?: string | null): string | null {
  if (!asOf) return null;
  const date = new Date(asOf);
  if (!Number.isFinite(date.getTime())) return asOf;
  return date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export function fxUnavailableMessage(asOf?: string | null): string {
  const when = formatAsOf(asOf);
  return when
    ? `Cotizaciones no disponibles / última cotización del ${when}`
    : 'Cotizaciones no disponibles';
}

/** Banner when FX is missing or last-known. Never implies a 0 rate. */
export default function FxUnavailableBanner({ asOf }: { asOf?: string | null }) {
  return (
    <p role="status" className="card p-4 text-muted-foreground">
      {fxUnavailableMessage(asOf)}
    </p>
  );
}
