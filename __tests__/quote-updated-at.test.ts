import { describe, expect, it } from 'vitest';
import { formatQuoteUpdatedAtLabel } from '@/lib/investments/quote-updated-at';

describe('formatQuoteUpdatedAtLabel', () => {
  const now = Date.parse('2026-10-24T18:30:00.000Z');

  it('shows sin fecha only when the stored timestamp is truly missing', () => {
    expect(formatQuoteUpdatedAtLabel(null, now)).toBe('sin fecha');
    expect(formatQuoteUpdatedAtLabel(undefined, now)).toBe('sin fecha');
    expect(formatQuoteUpdatedAtLabel('', now)).toBe('sin fecha');
    expect(formatQuoteUpdatedAtLabel('   ', now)).toBe('sin fecha');
    expect(formatQuoteUpdatedAtLabel('not-a-date', now)).toBe('sin fecha');
  });

  it('uses relative labels for recent UTC timestamps', () => {
    expect(formatQuoteUpdatedAtLabel('2026-10-24T18:30:00.000Z', now)).toBe('recién');
    expect(formatQuoteUpdatedAtLabel('2026-10-24T18:10:00.000Z', now)).toBe('hace 20 min');
  });

  it('renders older timestamps in Argentina time rather than UTC calendar date', () => {
    const label = formatQuoteUpdatedAtLabel('2026-10-02T02:00:00.000Z', now);
    expect(label).not.toBe('sin fecha');
    expect(label.toLowerCase()).toMatch(/1/);
    expect(label.toLowerCase()).toMatch(/oct/);
    expect(label.toLowerCase()).not.toMatch(/2\s*oct|oct\.?\s*2/);
  });
});
