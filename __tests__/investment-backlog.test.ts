import { describe, expect, it } from 'vitest';
import {
  adaptQuoteToMarketCurrency,
  inferListedCurrency,
  isDollarBoardSymbol,
  listingCandidates,
} from '@/lib/market-data/quote-currency';
import { composeLiquidNetWorth } from '@/lib/services/liquid-net-worth';
import { accountsService, type AccountWithBalance } from '@/lib/services/accounts';
import { parseIolPortfolioCsv } from '@/lib/broker-import/iol-portfolio';
import { findDuplicateCategory } from '@/lib/categories/synonyms';
import { accountCanHoldPosition, priceFactorForType, yahooSymbolFor } from '@/lib/investments/type-meta';
import {
  composeComposition,
  periodChangeFromSnapshots,
  rankGainersLosers,
} from '@/lib/investments/portfolio-analytics';
import { initialsForAsset, logoCandidateUrls } from '@/lib/investments/asset-logo';
import { parseCafciFichaForTest, matchCafciClassForTest } from '@/lib/market-data/cafci-client';

describe('USD quote adaptation for D tickers', () => {
  it('prefers the D board when the position is marked USD', () => {
    expect(listingCandidates('AL30', 'USD', 'bond').symbols[0]).toBe('AL30D');
    expect(listingCandidates('AAPL', 'USD', 'cedear').symbols[0]).toBe('AAPLD');
    expect(listingCandidates('YCAMO', 'USD', 'on').symbols[0]).toBe('YCAMD');
  });

  it('does not treat YPFD as a dollar board when YPF is absent', () => {
    const listed = new Set(['YPFD', 'GGAL']);
    expect(isDollarBoardSymbol('YPFD', listed)).toBe(false);
    expect(isDollarBoardSymbol('AAPLD', new Set(['AAPL', 'AAPLD']))).toBe(true);
    expect(inferListedCurrency('AL30D', new Set(['AL30', 'AL30D']))).toBe('USD');
    expect(inferListedCurrency('AL30', new Set(['AL30', 'AL30D']))).toBe('ARS');
  });

  it('converts an ARS quote to USD with MEP and never stamps ARS onto a USD book', () => {
    const adapted = adaptQuoteToMarketCurrency(
      { price: 130000, changePct: 1, currency: 'ARS', timestamp: null },
      'USD',
      1300
    );
    expect(adapted).toEqual({ price: 100, changePct: 1, currency: 'USD', timestamp: null });
    expect(adaptQuoteToMarketCurrency(
      { price: 91.5, changePct: -0.5, currency: 'USD', timestamp: null },
      'USD',
      1300
    )?.currency).toBe('USD');
  });
});

describe('liquid net worth excludes positions and broker cash', () => {
  const bank = (id: string, usd: number): AccountWithBalance => ({
    id, user_id: 'U', name: id, type: 'bank', currency: 'USD', balance: usd,
    icon: null, color: '#000', is_debt: false, include_in_total: true, include_in_liquid: true,
    min_balance: null, credit_limit: null, closing_day: null, due_day: null, last_4_digits: null,
    is_multicurrency: false, secondary_currency: null, sort_order: 0, is_active: true,
    created_at: '2026-01-01', updated_at: '2026-01-01', balance_usd: usd, balance_ars_blue: usd * 1000,
  });

  it('never adds public.investments rows to the dashboard total', () => {
    const balances = accountsService.aggregateAccountTotals([bank('cash', 80)]);
    const now = composeLiquidNetWorth({
      balances,
      portfolio: { totalCurrentValue: 500, totalCurrentValueArsBlue: 500000, investments: [{ id: 'pos' }] },
      blueRate: 1000,
    });
    expect(now.totalUSD).toBe(80);
    expect(now.totalARSBlue).toBe(80000);
    expect(now.positionsUSD).toBe(500);
    expect(now.investmentsUSD).toBe(500);
    expect(now.totalUSD).toBeLessThan(now.investmentsUSD);
  });

  it('excludes broker and crypto account balances from the liquid total', () => {
    const broker: AccountWithBalance = { ...bank('broker', 40), type: 'investment', name: 'IOL' };
    const crypto: AccountWithBalance = { ...bank('crypto', 25), type: 'crypto', name: 'Exchange' };
    const card: AccountWithBalance = {
      ...bank('visa', -30),
      type: 'credit_card',
      name: 'Visa',
      last_4_digits: '1111',
      is_debt: true,
      credit_limit: 100,
    };
    const totals = accountsService.aggregateAccountTotals([bank('cash', 100), broker, crypto, card]);
    expect(totals.availableUSD).toBe(100);
    expect(totals.liquidUSD).toBe(70);
    expect(totals.totalUSD).toBe(70);
    expect(totals.investmentsUSD).toBe(65);
    expect(totals.creditCards).toHaveLength(1);
    expect(totals.creditCardDebtUSD).toBe(30);
  });

  it('include_in_total=false drops that account BALANCE only; positions still stay out of total', () => {
    const hiddenBank = { ...bank('hidden', 90), include_in_total: false };
    const hiddenBroker: AccountWithBalance = {
      ...bank('broker-hidden', 200), type: 'investment', include_in_total: false,
    };
    const visibleBroker: AccountWithBalance = { ...bank('broker', 40), type: 'investment' };
    const totals = accountsService.aggregateAccountTotals([
      bank('cash', 10), hiddenBank, hiddenBroker, visibleBroker,
    ]);
    const now = composeLiquidNetWorth({
      balances: totals,
      portfolio: { totalCurrentValue: 1000, totalCurrentValueArsBlue: 1_000_000, investments: [{ id: 'x' }] },
      blueRate: 1000,
    });
    expect(totals.investmentsUSD).toBe(40);
    expect(now.totalUSD).toBe(10);
    expect(now.positionsUSD).toBe(1000);
    expect(now.brokerCashUSD).toBe(40);
    expect(now.investmentsUSD).toBe(1040);
    expect(now.totalUSD).not.toBe(now.investmentsUSD);
  });

  it('lets crypto accounts hold crypto positions but not stocks', () => {
    expect(accountCanHoldPosition('crypto', 'crypto')).toBe(true);
    expect(accountCanHoldPosition('investment', 'crypto')).toBe(true);
    expect(accountCanHoldPosition('investment', 'cedear')).toBe(true);
    expect(accountCanHoldPosition('crypto', 'cedear')).toBe(false);
    expect(accountCanHoldPosition('bank', 'crypto')).toBe(false);
  });

  it('keeps a negative liquid total instead of clamping', () => {
    const card: AccountWithBalance = {
      ...bank('visa', -150),
      type: 'credit_card',
      name: 'Visa',
      is_debt: true,
      credit_limit: 200,
    };
    const totals = accountsService.aggregateAccountTotals([bank('cash', 20), card]);
    expect(totals.totalUSD).toBe(-130);
    expect(totals.liquidUSD).toBe(-130);
  });
});

describe('ON / Yahoo / CAFCI helpers', () => {
  it('uses VN 100 for ONs and .BA on Yahoo', () => {
    expect(priceFactorForType('on')).toBe(100);
    expect(priceFactorForType('bond')).toBe(100);
    expect(yahooSymbolFor('on', 'YCAMD')).toBe('YCAMD.BA');
    expect(yahooSymbolFor('fci', 'COME')).toBe('COME.BA');
  });

  it('parses a CAFCI ficha payload', () => {
    expect(parseCafciFichaForTest({ valorCuotaparte: 12.5, moneda: 'Pesos', fecha: '2026-10-20' })).toMatchObject({
      price: 12.5, currency: 'ARS',
    });
    expect(matchCafciClassForTest('ALPHA', [{ fondoId: '1', claseId: '2', keys: ['ALPHA'] }])).toEqual({
      fondoId: '1', claseId: '2', keys: ['ALPHA'],
    });
  });
});

describe('IOL Mi Portafolio CSV', () => {
  it('maps dollar-board tickers to USD market currency without inventing a purchase date', () => {
    const csv = [
      'Simbolo,Descripcion,Cantidad,PPC,Ultimo,Moneda,Tipo',
      'AL30D,BONO AL30D,1000,91.5,92,USD,Bono',
      'AAPLD,CEDEAR APPLE D,10,"1.234,50",1300,ARS,CEDEAR',
    ].join('\n');
    const parsed = parseIolPortfolioCsv(csv);
    expect(parsed.holdings).toHaveLength(2);
    expect(parsed.holdings[0]).toMatchObject({
      ticker: 'AL30D', type: 'bond', marketCurrency: 'USD', purchaseDate: null, quantity: 1000,
    });
    expect(parsed.holdings[1]).toMatchObject({ ticker: 'AAPLD', type: 'cedear', quantity: 10, purchasePrice: 1234.5 });
  });

  it('maps ON without treating "Bono" as an obligación negociable', () => {
    const csv = [
      'Simbolo,Descripcion,Cantidad,PPC,Ultimo,Moneda,Tipo',
      'AL30,BONO AL30,100,90,91,ARS,Bono',
      'YCAMO,YPF ON,50,100,101,USD,ON',
    ].join('\n');
    const parsed = parseIolPortfolioCsv(csv);
    expect(parsed.holdings[0]).toMatchObject({ ticker: 'AL30', type: 'bond' });
    expect(parsed.holdings[1]).toMatchObject({ ticker: 'YCAMO', type: 'on' });
  });
});

describe('category synonyms for new data', () => {
  it('detects Other/Otros as the same identity without mutating existing rows', () => {
    const existing = [{ id: '1', name: 'Otros', type: 'expense' }];
    expect(findDuplicateCategory('Other', 'expense', existing)?.id).toBe('1');
    expect(findDuplicateCategory('Food', 'expense', existing)).toBeNull();
  });
});

describe('investments dashboard analytics', () => {
  const pos = (id: string, type: 'cedear' | 'on' | 'crypto', usd: number, pnlPct: number, ccy: string) => ({
    id, name: id, ticker: id, type, market_price_currency: ccy,
    market_value_usd: usd, profit_loss_usd: usd * pnlPct / 100, profit_loss_percent_usd: pnlPct,
    daily_change_pct: 1, daily_pnl_usd: 1,
  });

  it('splits composition by type and currency and ranks gainers', () => {
    const rows = [
      pos('AAPL', 'cedear', 60, 20, 'USD'),
      pos('YCAMD', 'on', 30, -10, 'USD'),
      pos('BTC', 'crypto', 10, 50, 'USD'),
    ];
    const byType = composeComposition(rows, 'type');
    expect(byType[0]).toMatchObject({ key: 'cedear', percent: 60 });
    expect(composeComposition(rows, 'currency')[0].key).toBe('USD');
    const ranked = rankGainersLosers(rows, 2);
    expect(ranked.gainers[0].ticker).toBe('BTC');
    expect(ranked.losers[0].ticker).toBe('YCAMD');
  });

  it('computes week/month change from snapshots', () => {
    const snapshots = [
      { snapshot_date: '2026-09-20', market_value_usd: 80 },
      { snapshot_date: '2026-10-17', market_value_usd: 90 },
    ];
    const week = periodChangeFromSnapshots(snapshots, 100, 7, new Date('2026-10-24T12:00:00Z'));
    expect(week?.abs).toBe(10);
    expect(week?.pct).toBeCloseTo(100 / 9, 8);
  });

  it('builds free logo candidates and initials fallback', () => {
    expect(logoCandidateUrls('crypto', 'BTC')[0]).toContain('cryptocurrency-icons');
    expect(logoCandidateUrls('cedear', 'AAPLD')[0]).toContain('AAPL');
    expect(initialsForAsset('Apple Inc', 'AAPL')).toBe('AA');
  });
});
