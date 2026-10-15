// Real React/NetWorthHero/Amount SSR. Browser effects/animation are not executed.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import NetWorthHero from '@/components/dashboard/NetWorthHero';
import type { NetWorthPoint } from '@/lib/services/net-worth';

const probe = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('recharts', async importOriginal => {
  const original = await importOriginal<typeof import('recharts')>();
  const react = await import('react');
  return { ...original, ResponsiveContainer: ({ children }: { children: import('react').ReactNode }) => {
    if (!react.isValidElement<{ data?: unknown; width?: number; height?: number }>(children)) throw new Error('Missing real chart');
    probe.data = children.props.data;
    return react.cloneElement(children, { width: 640, height: 240 });
  } };
});

const now = Object.freeze({ liquidUSD: 200, investmentsUSD: 0, totalUSD: 200, totalARSBlue: 240000, blueRate: 1200 });
const history: NetWorthPoint[] = ['2026-10-05', '2026-10-06'].map(snapshot_date => Object.freeze({
  snapshot_date, liquid_usd: 200, investments_usd: 0, total_usd: 200, total_ars_blue: 240000, blue_ars_per_usd: 1200,
}));
Object.freeze(history);
function render(baseCurrency: 'ARS' | 'USD') {
  return renderToStaticMarkup(createElement(NetWorthHero, { now, history, inflacion: [], baseCurrency }));
}
describe('RF14 persisted base initializes real Hero without global browser preference', () => {
  it('selects saved USD on the first SSR and re-expresses the existing200USD history without mutating it', () => {
    const before = JSON.stringify({ now, history });
    const html = render('USD');
    expect(html).toMatch(/aria-pressed="true"[^>]*>USD blue<\/button>/);
    expect(probe.data).toEqual(history.map(point => ({ date: point.snapshot_date, value: 200 })));
    expect(html).toContain('≈');
    expect(html).toContain('240.000');
    expect(JSON.stringify({ now, history })).toBe(before);
  });
  it('a different user saved in ARS stays in ARS, including after a prior USD render', () => {
    render('USD');
    const html = render('ARS');
    expect(html).toMatch(/aria-pressed="true"[^>]*>ARS<\/button>/);
    expect(html).toContain('US$ 200');
    expect(probe.data).toEqual(history.map(point => ({ date: point.snapshot_date, value: 240000 })));
  });
});
