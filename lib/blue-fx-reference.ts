/** The exact USD/ARS sample used by a calculation, independent of asset-price metadata. */
export interface BlueFxReference {
  type: 'blue';
  side: 'sell' | 'buy';
  rate: number;
  observedAt: string | null;
  provider: string | null;
  origin: 'provider' | 'persisted' | 'unknown';
}

export interface BlueFxComponentReference {
  component: 'accounts' | 'portfolio';
  reference: BlueFxReference;
}

export function blueFxReference(quote: {
  buy: number; sell: number; timestamp?: Date | string;
  provider?: string | null; origin?: 'provider' | 'persisted';
}, side: BlueFxReference['side'] = 'sell'): BlueFxReference {
  const date = quote.timestamp instanceof Date ? quote.timestamp
    : typeof quote.timestamp === 'string' ? new Date(quote.timestamp) : null;
  return {
    type: 'blue', side, rate: quote[side],
    observedAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
    // Provider identity cannot be reconstructed from a market name or cache key.
    provider: quote.provider?.trim() || null,
    origin: quote.origin ?? 'unknown',
  };
}

export function uniqueBlueFxReferences(references: Array<BlueFxReference | undefined>): BlueFxReference[] {
  const unique = new Map<string, BlueFxReference>();
  for (const reference of references) {
    if (reference) unique.set(JSON.stringify(reference), reference);
  }
  return [...unique.values()];
}
