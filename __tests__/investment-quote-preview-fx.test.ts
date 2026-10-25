// Exercise the component's quote handler and render state with hook doubles.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/types/database';

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));
vi.mock('react', async original => ({ ...await original<Record<string, unknown>>(),
  useEffect: () => undefined,
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.states[index], (value: unknown) => { hooks.states[index] = value; }];
  },
}));
vi.mock('framer-motion', () => ({ motion: { form: 'form' }, AnimatePresence: 'div' }));
vi.mock('@/lib/hooks/useFinancialOperation', () => ({ useFinancialOperation: () => ({ submit: vi.fn() }) }));
import AddInvestmentPanel from '@/components/investments/AddInvestmentPanel';

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
function render() {
  hooks.index = 0;
  return AddInvestmentPanel({ investmentAccounts: [{ id: 'fixture-account', type: 'investment' } as Account] });
}
async function verifyQuote() {
  const button = find(render(), node => node.type === 'button' &&
    Array.isArray(node.props?.children) && node.props?.children.includes('Verificar cotización'));
  expect(button).not.toBeNull();
  button!.props!.onClick();
  await vi.waitFor(() => {
    expect(find(render(), node => node.props?.role === 'status')!.props!.children.at(-1))
      .not.toBe('Consultando cotización…');
  });
  return find(render(), node => node.props?.role === 'status')!.props!;
}

beforeEach(() => {
  hooks.states = [true, 'fixture-account', 'fci', 'CONIOLA', 'Fondo de prueba', '10', '0.135', 'USD',
    '2026-10-22', '', '', 'USD', false, '', '', [], false, false, null, { status: 'idle', message: null }];
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('investment preview FX provenance', () => {
  it('labels a stale FX conversion as an estimate with its source date and warning presentation', async () => {
    const provider = vi.fn().mockResolvedValue({ json: async () => ({
      ok: true, currency: 'USD', price: 179.598 / 1300, changePct: 0.1,
      fxStale: true, fxAsOf: '2026-10-22T12:00:00Z',
    }) });
    vi.stubGlobal('fetch', provider);
    const status = await verifyQuote();
    expect(provider).toHaveBeenCalledWith('/api/investments/quote?symbol=CONIOLA&type=fci&currency=USD');
    const message = status.children.at(-1);
    expect(message).toContain('Valor estimado USD 0,138152');
    expect(message).toContain('FX del 22/10/2026');
    expect(message).toContain('última cotización disponible');
    expect(message).not.toContain('hoy');
    expect(status.className).toContain('text-warning');
    expect(status.className).not.toContain('text-success');
  });

  it.each([null, 'invalid date'])('keeps a stale estimate explicit if its FX date is %s', async fxAsOf => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({
      ok: true, currency: 'USD', price: 0.138, fxStale: true, fxAsOf,
    }) }));
    const status = await verifyQuote();
    expect(status.children.at(-1)).toContain('Valor estimado USD');
    expect(status.children.at(-1)).toContain('fecha de FX no disponible');
    expect(status.className).toContain('text-warning');
  });

  it('preserves the current quote presentation for a live conversion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({
      ok: true, currency: 'USD', price: 0.138, changePct: 0.1, fxStale: false, fxAsOf: null,
    }) }));
    const status = await verifyQuote();
    expect(status.children.at(-1)).toBe('Cotización USD 0,138 · +0.10% hoy');
    expect(status.className).toContain('text-success');
  });
});
