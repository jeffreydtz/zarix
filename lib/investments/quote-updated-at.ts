const AR_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function isBlankQuoteTimestamp(iso: string | null | undefined): boolean {
  return iso == null || String(iso).trim() === '';
}

/**
 * Last-updated label for a stored UTC timestamp. "sin fecha" only when the
 * value is truly missing; calendar dates are shown in Argentina time.
 */
export function formatQuoteUpdatedAtLabel(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (isBlankQuoteTimestamp(iso)) return 'sin fecha';
  const ts = new Date(iso as string).getTime();
  if (!Number.isFinite(ts)) return 'sin fecha';
  const diffMs = nowMs - ts;
  if (diffMs < 0) return 'recién';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `hace ${day} d`;
  return new Date(iso as string).toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: AR_TIME_ZONE,
  });
}
