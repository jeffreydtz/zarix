import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ quote: vi.fn() }));

vi.mock('yahoo-finance2', () => ({
  default: class YahooFinance {
    constructor() { /* test double */ }
    quote = mocks.quote;
  },
}));

import { fetchYahooStockQuotesMap, resolveYahooQuoteCurrency } from '@/lib/yahoo-finance-quotes';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Yahoo quote deadline abort', () => {
  it('aborts an in-flight quote when the deadline elapses', async () => {
    mocks.quote.mockImplementation((_symbols: string[], _opts: unknown, moduleOpts: { fetchOptions?: { signal?: AbortSignal } }) => (
      new Promise((_resolve, reject) => {
        const signal = moduleOpts?.fetchOptions?.signal;
        if (!signal) return;
        if (signal.aborted) {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          return;
        }
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      })
    ));

    const pending = fetchYahooStockQuotesMap(['AAPL'], { deadlineAt: Date.now() + 20_000 });
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(pending).resolves.toEqual(new Map());
    expect(mocks.quote).toHaveBeenCalled();
    const moduleOpts = mocks.quote.mock.calls[0][2] as { fetchOptions?: { signal?: AbortSignal } };
    expect(moduleOpts.fetchOptions?.signal?.aborted).toBe(true);
  });

  it('treats Yahoo currency=USD as confirmation for GLD and does not infer from the D suffix', async () => {
    mocks.quote.mockResolvedValue({
      symbol: 'GLD',
      regularMarketPrice: 380.12,
      regularMarketChangePercent: 0.4,
      currency: 'USD',
      shortName: 'SPDR Gold Shares',
    });
    const map = await fetchYahooStockQuotesMap(['GLD']);
    expect(map.get('GLD')?.currency).toBe('USD');
    expect(resolveYahooQuoteCurrency('GLD', 'USD')).toBe('USD');
    expect(resolveYahooQuoteCurrency('GLD', undefined)).toBe('');
    expect(resolveYahooQuoteCurrency('GGAL.BA', undefined)).toBe('');
  });
});
