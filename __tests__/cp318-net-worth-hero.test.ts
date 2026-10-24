// CP3-18 regression for current partial values and complete history.
// NetWorthHero, Amount, usePrivacy and AreaChart are real. This checkout has
// no PrivacyProvider: the real usePrivacy hook starts with hidden=false in SSR.
// Only ResponsiveContainer's browser measurement is replaced by a fixed size.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetWorthNow, NetWorthPoint } from '@/lib/services/net-worth';

const chartProbe = vi.hoisted(() => ({
  series: undefined as Array<{ date: string; value: number }> | undefined,
}));

vi.mock('recharts', async importOriginal => {
  const actual = await importOriginal<typeof import('recharts')>();
  const react = await import('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: import('react').ReactNode }) => {
      if (!react.isValidElement<{
        data?: Array<{ date: string; value: number }>; width?: number; height?: number;
      }>(children)) throw new Error('Expected the real chart child');
      chartProbe.series = children.props.data;
      return react.cloneElement(children, { width: 640, height: 240 });
    },
  };
});

import NetWorthHero from '@/components/dashboard/NetWorthHero';

const completeNow: NetWorthNow = {
  liquidUSD: 100, investmentsUSD: 0, totalUSD: 100,
  totalARSBlue: 120000, blueRate: 1200, blueReferences: [],
};
const partialNow: NetWorthNow & {
  valuation: {
    status: 'partial';
    excludedAccounts: Array<{
      accountId: string; name: string; currency: string; balance: number;
      currencies: string[]; reason: 'unsupported_currency';
    }>;
  };
} = {
  ...completeNow,
  valuation: {
    status: 'partial',
    excludedAccounts: [{
      accountId: 'synthetic-zzz-account', name: 'Cuenta sin cruce',
      currency: 'ZZZ', balance: 10, currencies: ['ZZZ'], reason: 'unsupported_currency',
    }],
  },
};

// Actual historic totals were complete. Today's known subtotal must not be
// interpreted as an ARS80000 loss or persisted/added as a complete chart point.
const history: NetWorthPoint[] = ['2026-10-13', '2026-10-14'].map(snapshot_date => ({
  snapshot_date, liquid_usd: 200000 / 1200, investments_usd: 0,
  total_usd: 200000 / 1200, total_ars_blue: 200000, blue_ars_per_usd: 1200,
}));
history.forEach(point => Object.freeze(point));
Object.freeze(history);

function render(now: NetWorthNow) {
  const html = renderToStaticMarkup(createElement(NetWorthHero, {
    now, history, inflacion: [],
  }));
  return {
    html,
    text: html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    amounts: [...html.matchAll(/<data\b[^>]*\bvalue="([^"]*)"/g)]
      .map(match => Number(match[1])),
  };
}

beforeEach(() => {
  // Date only: neither asynchronous animation timers nor app clocks are run.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
  chartProbe.series = undefined;
});
afterEach(() => vi.useRealTimers());

describe('CP3-18 partial net worth, actual SSR', () => {
  it('keeps the literal heading and explains which original money was excluded', () => {
    const { html, text, amounts } = render(partialNow);

    expect(html).toMatch(/<h2\b[^>]*>\s*Patrimonio total\s*<\/h2>/);
    expect(html).toMatch(/role="(?:alert|status)"/);
    expect(text).toContain('Total parcial');
    expect(text).toContain('Cuenta sin cruce');
    expect(text).toMatch(/10(?:,0+)?\s+ZZZ/);
    expect(text).toMatch(/excluid[ao]/i);
    expect(text).toMatch(/sin (?:cotización|conversión)|no soportad[ao]/i);
    expect(text).not.toMatch(/(?:NaN|Infinity|undefined|unsupported_currency)/);
    // The main SSR numeral currently starts at0 pending client count-up. Its
    // precision/initial state is a separate change; do not make it an oracle.
    expect(amounts).not.toContain(80000);
    expect(text).not.toContain('80.000');
    expect(text).not.toContain('-40.0%');
    expect(text).not.toContain('▼');
  });

  it('keeps only the two supplied complete snapshots and fabricates no point for today', () => {
    render(partialNow);

    expect(chartProbe.series).toEqual([
      { date: '2026-10-13', value: 200000 },
      { date: '2026-10-14', value: 200000 },
    ]);
    expect(chartProbe.series?.some(point => point.date === '2026-10-15')).toBe(false);
    expect(chartProbe.series?.some(point => point.value === 120000)).toBe(false);
    expect(history.map(point => point.snapshot_date)).toEqual(['2026-10-13', '2026-10-14']);
  });

  it('still exposes a real ARS80000 decline when the current valuation is complete', () => {
    const { text, amounts } = render(completeNow);

    expect(amounts).toContain(80000);
    expect(text).toContain('80.000');
    expect(text).toContain('-40.0%');
    expect(text).toContain('▼');
    expect(text).not.toContain('Total parcial');
    expect(text).not.toContain('ZZZ');
  });

  it('does not show a fake 90% drop against old totals that included investments', () => {
    const html = renderToStaticMarkup(createElement(NetWorthHero, {
      now: {
        liquidUSD: 1000, investmentsUSD: 9000, totalUSD: 1000,
        totalARSBlue: 1_000_000, blueRate: 1000, blueReferences: [],
      },
      history: [
        {
          snapshot_date: '2026-10-13', liquid_usd: 1000, investments_usd: 9000,
          total_usd: 10000, total_ars_blue: 10_000_000, blue_ars_per_usd: 1000,
        },
        {
          snapshot_date: '2026-10-14', liquid_usd: 1000, investments_usd: 9000,
          total_usd: 10000, total_ars_blue: 10_000_000, blue_ars_per_usd: 1000,
        },
      ],
      inflacion: [],
    }));
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(text).not.toContain('-90');
    expect(text).not.toContain('▼');
    expect(chartProbe.series).toEqual([
      { date: '2026-10-13', value: 1_000_000 },
      { date: '2026-10-14', value: 1_000_000 },
    ]);
  });
});
