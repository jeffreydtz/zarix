// Component handlers with explicit React-hook/router/network doubles. No browser.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ values: [] as any[], refs: [] as any[], stateIndex: 0, refIndex: 0, fetch: vi.fn(), refresh: vi.fn() }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState(initial: unknown) {
    const index = mocks.stateIndex++;
    if (!(index in mocks.values)) mocks.values[index] = initial;
    return [mocks.values[index], (value: unknown) => { mocks.values[index] = value; }];
  },
  useRef(initial: unknown) { return mocks.refs[mocks.refIndex++] ??= { current: initial }; },
  useEffect() {},
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import SettingsForm from '@/components/settings/SettingsForm';

const user: any = { id: 'fixture-user', default_currency: 'ARS', net_worth_widget_visible: true,
  status: 'PAST_DUE', current_period_end: null, grace_period_end: null, weekly_summary_enabled: false, monthly_summary_enabled: false };
function render(profile = user) {
  mocks.stateIndex = 0; mocks.refIndex = 0;
  return SettingsForm({ user: profile, geminiConfigured: false, telegramCustomMode: false, webhookSecret: null, appBaseUrl: '' });
}
function text(node: any): string {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return text(node.props?.children);
}
function find(node: any, predicate: (node: any) => boolean): any {
  if (!node) return null;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}
function save(tree: any) { return find(tree, node => node.type === 'button' && text(node) === 'Guardar preferencias'); }
function currency(tree: any) { return find(tree, node => node.props?.id === 'base-currency'); }
function visibility(tree: any) {
  const label = find(tree, node => node.type === 'label' && text(node).includes('Mostrar panel Patrimonio'));
  return find(label, node => node.type === 'input');
}
beforeEach(() => {
  mocks.values.length = 0; mocks.refs.length = 0;
  vi.clearAllMocks(); mocks.fetch.mockReset(); vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('Settings RF14 preference confirmation', () => {
  it('submits only chosen presentation values, refreshes after confirmed persistence and works on Free', async () => {
    currency(render()).props.onChange({ target: { value: 'USD' } });
    visibility(render()).props.onChange({ target: { checked: false } });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ default_currency: 'USD', net_worth_widget_visible: false })));
    await save(render()).props.onClick();
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('/api/user/preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Preferences-Owner': user.id },
      body: JSON.stringify({ default_currency: 'USD', net_worth_widget_visible: false }),
    });
    expect(currency(render()).props.value).toBe('USD');
    expect(visibility(render()).props.checked).toBe(false);
    expect(text(render())).toContain('Preferencias guardadas.');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it('initializes a new component session from saved own values', () => {
    const tree = render({ ...user, default_currency: 'USD', net_worth_widget_visible: false });
    expect(currency(tree).props.value).toBe('USD');
    expect(visibility(tree).props.checked).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('blocks duplicate saves while pending and unlocks without claiming success after failure', async () => {
    let finish!: (response: Response) => void;
    mocks.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const tree = render();
    const first = save(tree).props.onClick();
    await save(tree).props.onClick();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(currency(render()).props.disabled).toBe(true);
    finish(new Response(JSON.stringify({ error: 'Configuración no disponible.' }), { status: 500 }));
    await first;
    expect(text(render())).toContain('Configuración no disponible.');
    expect(text(render())).not.toContain('Preferencias guardadas.');
    expect(save(render()).props.disabled).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
