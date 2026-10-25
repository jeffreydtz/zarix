export interface FxStatus {
  fxUnavailable?: boolean;
  fxStale?: boolean;
  fxAsOf?: string | null;
}

/** Los importes originales siguen disponibles aunque falte su conversión. */
export default function FxStatusBanner({ fxUnavailable, fxStale, fxAsOf }: FxStatus) {
  if (!fxUnavailable && !fxStale) return null;
  const date = fxAsOf ? new Date(fxAsOf) : null;
  return (
    <p role="status" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
      {fxUnavailable
        ? 'Cotizaciones no disponibles. Los saldos y movimientos se muestran en su moneda original; los totales convertidos no están disponibles.'
        : date && Number.isFinite(date.getTime())
          ? `Cotización del ${date.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}. Los importes convertidos usan la última cotización disponible.`
          : 'Los importes convertidos usan la última cotización disponible.'}
    </p>
  );
}

export function combinedFxStatus(rows: FxStatus[]): FxStatus {
  const staleDates = rows.filter(row => row.fxStale && row.fxAsOf).map(row => row.fxAsOf!).sort();
  return {
    fxUnavailable: rows.some(row => row.fxUnavailable),
    fxStale: rows.some(row => row.fxStale),
    fxAsOf: staleDates[0] ?? null,
  };
}
