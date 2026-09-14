import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const quote = vi.hoisted(() => vi.fn());
vi.mock('yahoo-finance2', () => ({ default: class { quote = quote; } }));
beforeEach(() => { vi.resetModules(); quote.mockReset(); });
afterEach(() => vi.useRealTimers());
describe('Yahoo request budget', () => {
  it('does not fan out requests when the batch provider is unavailable', async () => {
    quote.mockRejectedValue(new Error('429'));
    const { fetchYahooStockQuotesMap } = await import('@/lib/yahoo-finance-quotes');
    const tickers = ['^IXIC', 'AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL'];
    const [a, b] = await Promise.all([fetchYahooStockQuotesMap(tickers), fetchYahooStockQuotesMap(tickers)]);
    expect(a.size).toBe(0); expect(b.size).toBe(0);
    expect(quote).toHaveBeenCalledTimes(1);
  });
  it('aborts all work at seven seconds even if an SDK promise ignores cancellation', async () => {
    vi.useFakeTimers();
    quote.mockImplementation(() => new Promise(() => {}));
    const { fetchYahooStockQuotesMap } = await import('@/lib/yahoo-finance-quotes');
    const promise = fetchYahooStockQuotesMap(['AAPL']);
    await vi.advanceTimersByTimeAsync(7000);
    expect((await promise).size).toBe(0);
    expect(quote.mock.calls[0][2].fetchOptions.signal.aborted).toBe(true);
  });
  it('fetches a missing stock once and retains provider quote time', async () => {
    const timestamp = new Date(Date.now() - 100000);
    quote.mockResolvedValueOnce([{ symbol: 'AAPL', regularMarketPrice: 100, regularMarketTime: timestamp }])
      .mockResolvedValueOnce({ symbol: 'MSFT', regularMarketPrice: 200, regularMarketTime: timestamp });
    const { fetchYahooStockQuotesMap } = await import('@/lib/yahoo-finance-quotes');
    const result = await fetchYahooStockQuotesMap(['AAPL', 'MSFT']);
    expect(result.size).toBe(2); expect(quote).toHaveBeenCalledTimes(2);
    expect(result.get('MSFT')?.quotedAt).toBe(timestamp.toISOString());
  });
});
