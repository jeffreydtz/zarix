// Component handler tests with explicit React-hook/browser/network doubles.
// These verify cancellation state/races; they are not a real browser layout test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ values: [] as any[], refs: [] as any[], effects: [] as Array<() => void>, stateIndex: 0, refIndex: 0, confirm: vi.fn(), fetch: vi.fn(), refresh: vi.fn() }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState(initial: unknown) {
    const index = mocks.stateIndex++;
    if (!(index in mocks.values)) mocks.values[index] = initial;
    return [mocks.values[index], (value: unknown) => { mocks.values[index] = value; }];
  },
  useRef(initial: unknown) {
    const index = mocks.refIndex++;
    return mocks.refs[index] ??= { current: initial };
  },
  useEffect(fn: () => void) { mocks.effects.push(fn); },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import * as React from 'react';
import SettingsForm from '@/components/settings/SettingsForm';
const user: any = { id: 'fixture-user', status: 'ACTIVE', mp_preapproval_id: 'fixture-mp', current_period_end: '2026-11-01T00:00:00Z', grace_period_end: null, weekly_summary_enabled: false, monthly_summary_enabled: false };
function render() {
  mocks.stateIndex = 0; mocks.refIndex = 0;
  return SettingsForm({ user, geminiConfigured: false, telegramCustomMode: false, webhookSecret: null, appBaseUrl: 'https://zarix.example.test' });
}
function text(node: any): string {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return text(node.props?.children);
}
function button(node: any, label: string): any {
  if (!node) return null;
  if (Array.isArray(node)) return node.map(item => button(item, label)).find(Boolean);
  if (node.type === 'button' && text(node) === label) return node;
  return button(node.props?.children, label);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T03:00:00Z'));
  mocks.values.length = 0; mocks.refs.length = 0; mocks.effects.length = 0;
  vi.clearAllMocks(); mocks.fetch.mockReset(); mocks.confirm.mockReturnValue(true);
  vi.stubGlobal('React', React);
  vi.stubGlobal('window', { confirm: mocks.confirm, location: { href: '' } });
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Settings cancellation confirmation and repeat/interrupted actions', () => {
  it('dismisses confirmation without a provider request', async () => {
    mocks.confirm.mockReturnValue(false);
    await button(render(), 'Cancelar renovación').props.onClick();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(text(render())).not.toContain('Renovación cancelada.');
  });
  it('blocks repeated clicks and checkout while cancellation is pending', async () => {
    let finish!: (value: Response) => void;
    mocks.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const tree = render();
    const first = button(tree, 'Cancelar renovación').props.onClick();
    await button(tree, 'Cancelar renovación').props.onClick();
    await button(tree, 'Abrir checkout').props.onClick();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('/api/billing/cancel', { method: 'POST' });
    finish(new Response(JSON.stringify({ status: 'CANCELED', current_period_end: user.current_period_end })));
    await first;
    expect(text(render())).toContain('Renovación cancelada. Conservás Premium hasta');
    expect(text(render())).not.toContain('Bot de IA bloqueado');
    expect(button(render(), 'Cancelar renovación')).toBeFalsy();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it('shows provider errors, preserves access/state, and unlocks retry', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Proveedor no disponible' }), { status: 502 }));
    await button(render(), 'Cancelar renovación').props.onClick();
    expect(text(render())).toContain('Proveedor no disponible');
    expect(button(render(), 'Cancelar renovación').props.disabled).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('does not overwrite successful cancellation with a late initial subscription fetch', async () => {
    let finishInitial!: (value: Response) => void;
    mocks.fetch.mockImplementation((url: string) => url === '/api/user/subscription'
      ? new Promise(resolve => { finishInitial = resolve; })
      : Promise.resolve(new Response(JSON.stringify({ status: 'CANCELED', current_period_end: user.current_period_end }))));
    const tree = render();
    mocks.effects[2]();
    await button(tree, 'Cancelar renovación').props.onClick();
    finishInitial(new Response(JSON.stringify(user)));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(button(render(), 'Cancelar renovación')).toBeFalsy();
    expect(text(render())).toContain('Renovación cancelada. Conservás Premium hasta');
  });
});
