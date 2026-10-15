// Server-page rendering with explicit auth/service/component doubles, without a browser or DB.
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  redirect: vi.fn(), user: vi.fn(), categories: vi.fn(), monthly: vi.fn(), daily: vi.fn(),
  top: vi.fn(), accounts: vi.fn(), averages: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth/session', () => ({ getCachedUser: mocks.user }));
vi.mock('@/lib/services/analytics', () => ({ analyticsService: {
  getCategoryBreakdown: mocks.categories, getMonthlyTrend: mocks.monthly,
  getDailyTrend: mocks.daily, getTopExpenses: mocks.top, getAccountBreakdown: mocks.accounts,
  getAveragesFromMonthly: mocks.averages,
} }));
vi.mock('@/components/analysis/ProjectionsWidget', () => ({ default: () => null }));
vi.mock('@/components/analysis/AnalysisPeriodPicker', () => ({ default: () => null }));
vi.mock('@/components/ui/MotionSection', () => ({ default: 'div' }));
vi.mock('@/components/analysis/AnalysisCharts', () => ({
  CategoryDonut: () => null, MonthlyBarChart: () => null, CashFlowChart: () => null,
  TopExpenses: () => null, AccountBreakdownChart: () => null,
}));
import AnalysisPage from '@/app/(authenticated)/analysis/page';

async function render() {
  return renderToStaticMarkup(await AnalysisPage({ searchParams: Promise.resolve({
    period: 'custom', startDate: '2026-10-01', endDate: '2026-10-14',
  }) }));
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: 'U1' });
  for (const service of [mocks.categories, mocks.monthly, mocks.daily, mocks.top, mocks.accounts]) service.mockResolvedValue([]);
  mocks.averages.mockReturnValue({ avgExpenses: 0, avgIncome: 0, avgBalance: 0 });
});

describe('CU003 analysis distinguishes failed reads from a legitimate empty period', () => {
  it.each(['aggregate', 'top-expenses'])('shows unavailable instead of zero totals or partial charts when %s rejects', async failedRead => {
    (failedRead === 'aggregate' ? mocks.categories : mocks.top).mockRejectedValueOnce(new Error('synthetic intermediate page failure'));
    const html = await render();
    expect(html.includes('role="alert"')).toBe(true);
    expect(html).not.toContain('No hay movimientos');
    expect(html).not.toContain('Gastaste más');
    expect(mocks.averages).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it('preserves the normal empty-period state after complete successful reads', async () => {
    const html = await render();
    expect(html).toContain('No hay movimientos');
    expect(html.includes('role="alert"')).toBe(false);
    expect(mocks.averages).toHaveBeenCalledOnce();
  });
  it('preserves totals after successful nonempty reads', async () => {
    mocks.categories.mockResolvedValueOnce([{ name: 'Synthetic', icon: 'X', amount: 1234, count: 1, percent: 100, color: '#000000' }]);
    const html = await render();
    expect(html).toContain('1.234');
    expect(html).not.toContain('No hay movimientos');
    expect(html.includes('role="alert"')).toBe(false);
  });
});
