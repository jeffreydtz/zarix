import { describe, expect, it } from 'vitest';
import { budgetRemainderLabel } from '@/lib/budget-display';
import { creditFacilityFigures } from '@/lib/credit-card-display';
import { hasConfirmedMarketQuote, typeBadgeText } from '@/lib/investments/display';
import { logoCandidateUrls } from '@/lib/investments/asset-logo';
import { looksLikeIolFciTicker, searchFciCatalog } from '@/lib/market-data/fci-catalog';
import { moneyAmountFromToken } from '@/lib/money-amount';
import { formatCurrency } from '@/lib/utils/currency';

describe('es-AR money formatter', () => {
  it('formats USD with a comma decimal and a period thousands separator', () => {
    expect(formatCurrency(1127.17, 'USD')).toBe('USD 1.127,17');
  });

  it('formats whole ARS amounts without cents', () => {
    expect(formatCurrency(6210468, 'ARS')).toBe('$ 6.210.468');
  });

  it('keeps a signed P&L prefix without switching to en-US grouping', () => {
    expect(formatCurrency(12.5, 'USD', { signed: true })).toBe('+USD 12,50');
  });
});

describe('investment type badge and FCI catalog', () => {
  it('does not badge an FCI ticker as BTC', () => {
    expect(typeBadgeText('fci', 'IOLCAMA')).toBe('FCI');
    expect(typeBadgeText('crypto', 'BTC')).toBe('BTC');
    expect(typeBadgeText('crypto', 'ETH')).toBe('Cripto');
    expect(typeBadgeText('stock_us', 'AAPL')).toBe('Acción USA');
  });

  it('treats IOLCAMA as an IOL FCI ticker and lists it in search', () => {
    expect(looksLikeIolFciTicker('IOLCAMA')).toBe(true);
    expect(searchFciCatalog('IOLC').map((row) => row.symbol)).toContain('IOLCAMA');
  });

  it('does not fetch crypto logos for FCI tickers', () => {
    const urls = logoCandidateUrls('fci', 'IOLCAMA');
    expect(urls.some((url) => url.includes('cryptocurrency-icons'))).toBe(false);
    expect(logoCandidateUrls('crypto', 'IOLCAMA')).toEqual([]);
  });

  it('hides a 0% P&L when there is no market quote', () => {
    expect(hasConfirmedMarketQuote('purchase_reference')).toBe(false);
    expect(hasConfirmedMarketQuote(undefined)).toBe(false);
    expect(hasConfirmedMarketQuote('cache')).toBe(true);
  });
});

describe('budget remainder copy', () => {
  it('does not say remaining when the budget is exceeded', () => {
    expect(budgetRemainderLabel(-1200)).toBe('Excedido por');
    expect(budgetRemainderLabel(500)).toBe('Te quedan');
  });
});

describe('credit facility labels', () => {
  it('keeps the contractual limit separate from available credit', () => {
    const figures = creditFacilityFigures({ credit_limit: 1_500_000, balance: -661 });
    expect(figures.limit).toBe(1_500_000);
    expect(figures.used).toBe(661);
    expect(figures.available).toBe(1_499_339);
  });

  it('parses an es-AR credit limit of 1.500.000 instead of treating dots as decimals', () => {
    expect(moneyAmountFromToken('1.500.000')).toBe(1_500_000);
    expect(Number.parseFloat('1.500.000'.replace(',', '.'))).not.toBe(1_500_000);
  });
});
