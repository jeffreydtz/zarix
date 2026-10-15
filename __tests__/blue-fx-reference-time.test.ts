import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlueFxReferenceDetails from '@/components/ui/BlueFxReferenceDetails';
import { blueFxReference } from '@/lib/blue-fx-reference';

describe('Stored blue FX source time', () => {
  it('shows the original afternoon UTC hour in24h form without changing provenance or datetime', () => {
    const observedAt = '2026-10-06T16:00:00.000Z';
    const reference = blueFxReference({ buy: 1200, sell: 1200, timestamp: observedAt, provider: null, origin: 'persisted' });
    const html = renderToStaticMarkup(createElement(BlueFxReferenceDetails, { reference }));

    expect(reference.observedAt).toBe(observedAt);
    expect(html).toContain('Cotización guardada');
    expect(html).toContain('proveedor original no informado');
    expect(html.match(/<time\b[^>]*\bdatetime=["']([^"']+)["']/i)?.[1]).toBe(observedAt);
    expect(html).toMatch(/>[^<]*16:00:00 UTC<\/time>/);
    expect(html).not.toMatch(/>[^<]*04:00:00 UTC<\/time>/);
  });
});
