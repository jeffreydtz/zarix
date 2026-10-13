// Runs the actual form handlers with hook doubles; browser/API/DB acceptance is separate.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvestmentWithPnL } from '@/lib/services/investments';

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0, hidden: false }));
vi.mock('react', async original => ({ ...await original<Record<string, unknown>>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.states[index], (value: unknown) => { hooks.states[index] = value; }];
  },
}));
vi.mock('@/lib/hooks/use-investments-privacy', () => ({
  PRIVACY_MASK: '••••', useInvestmentsPrivacy: () => ({ hidden: hooks.hidden }),
}));
import InvestmentSimulationPanel from '@/components/investments/InvestmentSimulationPanel';

const investment = Object.freeze({
  id: 'test-position', type: 'stock_us', ticker: 'SYNTH', name: 'Synthetic position',
  quantity: 6, current_price: 110, market_price_currency: 'USD',
  valuation_price_source: 'manual', current_price_updated_at: '2026-10-13T12:00:00Z',
}) as InvestmentWithPnL;
interface ElementNode { type?: unknown; props?: Record<string, any> }
function find(node: unknown, predicate: (node: ElementNode) => boolean): ElementNode | null {
  if (Array.isArray(node)) {
    for (const child of node) { const match = find(child, predicate); if (match) return match; }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const element = node as ElementNode;
  return predicate(element) ? element : find(element.props?.children, predicate);
}
function render(canSimulate = true, investments = [investment]) {
  hooks.index = 0;
  return InvestmentSimulationPanel({ investments, canSimulate });
}
function inputValue(value: string) {
  find(render(), node => node.type === 'input')!.props!.onChange({ target: { value } });
}
function submit() {
  find(render(), node => node.type === 'form')!.props!.onSubmit({ preventDefault: vi.fn() });
}
beforeEach(() => {
  hooks.states = [true, '', '', null, null];
  hooks.hidden = false;
  vi.stubGlobal('fetch', vi.fn());
});

describe('CU004 simulation form', () => {
  it('compares +10% and closing clears the scenario with no network requests or reference mutation', () => {
    inputValue('10'); submit();
    const hypothetical = find(render(), node => node.props?.['data-testid'] === 'simulation-hypothetical-value');
    expect(hypothetical!.props!.children).toBe('USD 726,00');
    expect(find(render(), node => node.props?.['data-testid'] === 'simulation-current-value')!.props!.children).toBe('USD 660,00');
    find(render(), node => node.type === 'button' && node.props?.['aria-controls'])!.props!.onClick();
    expect(find(render(), node => node.type === 'form')).toBeNull();
    expect(hooks.states[3]).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(investment.quantity).toBe(6); expect(investment.current_price).toBe(110);
  });
  it.each(['-100.01', 'NaN', 'Infinity', ''])('rejects %s visibly without writes', value => {
    inputValue(value); submit();
    expect(find(render(), node => node.props?.role === 'alert')).not.toBeNull();
    expect(find(render(), node => node.props?.['data-testid'] === 'investment-simulation-result')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('allows -100% and exposes a zero hypothetical value', () => {
    inputValue('-100'); submit();
    expect(find(render(), node => node.props?.['data-testid'] === 'simulation-hypothetical-value')!.props!.children).toBe('USD 0,00');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps the original reference metadata when the workspace receives a new quote', () => {
    inputValue('10'); submit();
    render(true, [{ ...investment, current_price: 500, valuation_price_source: 'live', current_price_updated_at: null }]);
    expect(hooks.states[3]).toMatchObject({ currentPrice: 110, currentValue: 660, source: 'manual', referenceAt: '2026-10-13T12:00:00Z' });
  });
  it('keeps history readable while disabling simulation after downgrade', () => {
    const panel = render(false);
    expect(find(panel, node => node.type === 'button')!.props!.disabled).toBe(true);
    expect(find(panel, node => node.type === 'form')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a position identifier absent from the authenticated portfolio', () => {
    hooks.states[1] = 'foreign-position';
    inputValue('10'); submit();
    expect(find(render(), node => node.props?.role === 'alert')!.props!.children).toBe('Elegí una posición para simular.');
    expect(hooks.states[3]).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('respects the investment privacy setting for current and hypothetical money', () => {
    hooks.hidden = true;
    inputValue('10'); submit();
    expect(find(render(), node => node.props?.['data-testid'] === 'simulation-current-value')!.props!.children).toBe('••••');
    expect(find(render(), node => node.props?.['data-testid'] === 'simulation-hypothetical-value')!.props!.children).toBe('••••');
  });
});
