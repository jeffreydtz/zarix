// Runs the actual component handler with hook doubles; no DOM/browser QA claim.
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ states: [] as any[], stateIndex: 0, submit: vi.fn() }));
vi.mock('react', async original => ({ ...await original<any>(), useEffect: () => undefined,
  useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
  useState: (initial: any) => { const i = mocks.stateIndex++; if (!(i in mocks.states)) mocks.states[i] = typeof initial === 'function' ? initial() : initial;
    return [mocks.states[i], (next: any) => { mocks.states[i] = typeof next === 'function' ? next(mocks.states[i]) : next; }]; },
}));
vi.mock('framer-motion', () => ({ motion: new Proxy({}, { get: (_, key) => String(key) }), AnimatePresence: 'div' }));
vi.mock('@/lib/hooks/useFinancialOperation', () => ({ useFinancialOperation: () => ({ submit: mocks.submit }) }));
import AddInvestmentPanel from '@/components/investments/AddInvestmentPanel';
function find(node: any, predicate: (node: any) => boolean): any {
  if (!node) return null;
  if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } return null; }
  if (typeof node !== 'object') return null;
  return predicate(node) ? node : find(node.props?.children, predicate);
}
function render(onCreated: () => void) {
  mocks.stateIndex = 0;
  return AddInvestmentPanel({ investmentAccounts: [{ id: 'account' } as any], onCreated });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.states = [true, 'account', 'stock_us', 'AAPL', 'Apple', '10', '100', 'USD', '2026-10-09', '', '', '', false, '', '', [], false, false, null, { status: 'idle', message: null }];
});
it.each(['timeout', 'HTTP 403', 'local storage failure'])('retains the lot draft after %s and clears only after durable confirmation', async error => {
  const onCreated = vi.fn();
  mocks.submit.mockResolvedValueOnce({ state: 'pending', error }).mockResolvedValueOnce({ state: 'confirmed', receipt: { id: 'investment' } });
  await find(render(onCreated), node => !!node.props?.onSubmit).props.onSubmit({ preventDefault() {} });
  expect(mocks.submit).toHaveBeenCalledWith('/api/investments', expect.objectContaining({ name: 'Apple', quantity: 10, purchasePrice: 100 }));
  expect(mocks.states[0]).toBe(true); expect(mocks.states[4]).toBe('Apple'); expect(mocks.states[18]).toBe(error); expect(onCreated).not.toHaveBeenCalled();
  await find(render(onCreated), node => !!node.props?.onSubmit).props.onSubmit({ preventDefault() {} });
  expect(mocks.submit.mock.calls[1]).toEqual(mocks.submit.mock.calls[0]);
  expect(mocks.states[0]).toBe(false); expect(mocks.states[4]).toBe(''); expect(onCreated).toHaveBeenCalledOnce();
});
it('leaves the form unchanged when a duplicate click is ignored by the submission guard', async () => {
  const onCreated = vi.fn(); mocks.submit.mockResolvedValue(null);
  await find(render(onCreated), node => !!node.props?.onSubmit).props.onSubmit({ preventDefault() {} });
  expect(mocks.states[0]).toBe(true); expect(mocks.states[4]).toBe('Apple'); expect(onCreated).not.toHaveBeenCalled();
});
