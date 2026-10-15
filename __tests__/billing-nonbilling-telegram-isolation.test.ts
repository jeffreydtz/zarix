import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  replies: [] as string[],
  from: vi.fn(),
  listAccounts: vi.fn().mockResolvedValue([]),
  getTotalBalance: vi.fn().mockResolvedValue({ totalARSBlue: 0, totalUSD: 0 }),
  append: vi.fn(),
  gemini: vi.fn(),
  chat: vi.fn(),
}));

vi.mock('telegraf', () => ({
  Telegraf: class {
    private middleware: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> = [];
    private commands: Record<string, (ctx: any) => Promise<void>> = {};
    private handlers: Record<string, (ctx: any) => Promise<void>> = {};
    use(fn: (ctx: any, next: () => Promise<void>) => Promise<void>) { this.middleware.push(fn); }
    command(name: string, fn: (ctx: any) => Promise<void>) { this.commands[name] = fn; }
    on(name: string, fn: (ctx: any) => Promise<void>) { this.handlers[name] = fn; }
    action() {}
    catch() {}
    async handleUpdate(update: any) {
      const ctx = {
        chat: update.message.chat,
        from: update.message.from,
        message: update.message,
        update,
        botInfo: { id: 901 },
        state: {},
        telegram: { callApi: async () => ({ file_path: 'synthetic-file' }), getFileLink: async () => new URL('https://synthetic.invalid/receipt') },
        reply: async (text: string) => { mocks.replies.push(text); },
      };
      const text = update.message.text ?? '';
      const command = text.startsWith('/') ? text.slice(1) : null;
      const handler = command ? this.commands[command] : this.handlers[update.message.photo ? 'photo' : 'text'];
      const next = async (index: number): Promise<void> => {
        if (index < this.middleware.length) return this.middleware[index](ctx, () => next(index + 1));
        await handler?.(ctx);
      };
      await next(0);
    }
  },
  Markup: {},
}));
vi.mock('telegraf/filters', () => ({ message: (name: string) => name }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from }) }));
vi.mock('@/lib/services/accounts', () => ({
  accountsService: { list: mocks.listAccounts, getTotalBalance: mocks.getTotalBalance },
}));
vi.mock('@/lib/services/transactions', () => ({ transactionsService: {}, excludedCurrenciesNote: vi.fn() }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {} }));
vi.mock('@/lib/ai/gemini', () => ({ getGeminiForUser: mocks.gemini, GeminiMissingKeyError: class extends Error {} }));
vi.mock('@/lib/ai/prompts', () => ({ sanitizeForPrompt: (s: string) => s }));
vi.mock('@/lib/services/botSessions', () => ({
  appendBotTurn: mocks.append, clearBotSession: vi.fn(), getStoredTurns: async () => [], storedTurnsToGeminiHistory: () => [],
}));
vi.mock('@/lib/services/subscriptions', () => ({ subscriptionsService: {
  hasOrchestratorAccess: (user: { status?: string; plan_tier?: string }) => user.status === 'ACTIVE' && user.plan_tier === 'premium',
} }));
vi.mock('@/lib/services/internal-ai-chat', () => ({ processInternalAiChatMessage: mocks.chat }));
vi.mock('@/lib/plans/service', () => ({ withPlanQuota: async (_input: unknown, work: () => unknown) => work(), AmbiguousPlanWorkError: class extends Error {} }));
vi.mock('@/lib/notification-schedule', () => ({ buildTelegramSummaryScheduleLines: vi.fn() }));

function update(chatId: number, text = '/cuentas', type = 'private') {
  return { update_id: 42, message: { chat: { id: chatId, type }, from: { id: 777 }, text } };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'synthetic-shared-token');
  mocks.replies.length = 0;
  mocks.append.mockResolvedValue(undefined);
  mocks.gemini.mockResolvedValue({ chatWithImage: async () => JSON.stringify({ found: true, amount: 100, currency: 'ARS', merchant: 'Synthetic shop' }) });
  mocks.chat.mockResolvedValue({ assistant_message: 'Registré el gasto.', raw_response: 'Registré el gasto.' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('synthetic-image')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.users = [
    { id: 'owner-A', status: 'ACTIVE', plan_tier: 'premium', telegram_chat_id: null, telegram_link_code: 'A1A1A1A1' },
    { id: 'user-B', status: 'ACTIVE', plan_tier: 'premium', telegram_chat_id: 222, telegram_link_code: 'B2B2B2B2' },
  ];
  mocks.from.mockImplementation(() => {
    const filters: Array<[string, unknown]> = [];
    let changes: Record<string, unknown> | undefined;
    const matches = () => mocks.users.filter(row => filters.every(([key, value]) => row[key] === value));
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      gt: () => query,
      or: () => query,
      update: (value: Record<string, unknown>) => { changes = value; return query; },
      single: async () => ({ data: matches()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
      then: (resolve: (result: { error: null }) => unknown) => {
        if (changes) matches().forEach(row => Object.assign(row, changes));
        return Promise.resolve(resolve({ error: null }));
      },
    };
    return query;
  });
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Telegram owner and private-chat isolation', () => {
  it('does not inherit another linked user in an unlinked custom bot', async () => {
    const { handleCustomTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleCustomTelegramUpdate(update(222), 'synthetic-custom', { userId: 'owner-A', chatId: null });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.listAccounts).not.toHaveBeenCalled();
    expect(mocks.replies).toEqual(['No estás vinculado. Usá /start primero.']);
  });

  it('rejects another user’s linking code in an unlinked custom bot', async () => {
    const { handleCustomTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleCustomTelegramUpdate(update(333, 'B2B2B2B2'), 'synthetic-custom', { userId: 'owner-A', chatId: null });
    expect(mocks.users[1].telegram_chat_id).toBe(222);
    expect(mocks.replies[0]).toContain('Código inválido');
  });

  it('allows the owner’s linking code in an unlinked custom bot', async () => {
    const { handleCustomTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleCustomTelegramUpdate(update(333, 'A1A1A1A1'), 'synthetic-custom', { userId: 'owner-A', chatId: null });
    expect(mocks.users[0].telegram_chat_id).toBe(333);
    expect(mocks.users[0].telegram_link_code).toBeNull();
    expect(mocks.replies[0]).toContain('Tu cuenta quedó vinculada');
  });

  it('serves only its linked owner in a custom bot', async () => {
    const { handleCustomTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleCustomTelegramUpdate(update(111), 'synthetic-custom', { userId: 'owner-A', chatId: 111 });
    expect(mocks.listAccounts).toHaveBeenCalledWith('owner-A');
    mocks.listAccounts.mockClear();
    await handleCustomTelegramUpdate(update(222), 'synthetic-custom', { userId: 'owner-A', chatId: 111 });
    expect(mocks.listAccounts).not.toHaveBeenCalled();
  });

  it.each(['group', 'supergroup', 'channel'])('never reads finances from a shared %s chat', async (type) => {
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update(222, '/cuentas', type));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.listAccounts).not.toHaveBeenCalled();
    expect(mocks.replies).toEqual([]);
  });

  it('never redeems linking codes from group chats', async () => {
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update(-333, 'A1A1A1A1', 'group'));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.users[0].telegram_chat_id).toBeNull();
  });

  it('blocks a custom bot previously linked to a group', async () => {
    const { handleCustomTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleCustomTelegramUpdate(update(-333, '/cuentas', 'group'), 'synthetic-custom', { userId: 'owner-A', chatId: -333 });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.listAccounts).not.toHaveBeenCalled();
  });

  it('preserves the linked private-chat flow in the shared bot', async () => {
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update(222));
    expect(mocks.listAccounts).toHaveBeenCalledWith('user-B');
  });

  it('does not ask to confirm a receipt whose proposal could not be persisted', async () => {
    mocks.append.mockRejectedValue(new Error('synthetic session write failure'));
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate({ update_id: 43, message: { chat: { id: 222, type: 'private' }, photo: [{ file_id: 'synthetic-file', file_unique_id: 'synthetic-unique' }] } });
    expect(mocks.append).toHaveBeenCalledOnce();
    expect(mocks.replies.some(text => text.includes('¿Lo registro?'))).toBe(false);
    expect(mocks.replies.at(-1)).toContain('Todavía no registré el gasto');
  });

  it('confirms a receipt only after its proposal was persisted', async () => {
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate({ update_id: 44, message: { chat: { id: 222, type: 'private' }, photo: [{ file_id: 'synthetic-file', file_unique_id: 'synthetic-unique' }] } });
    expect(mocks.append).toHaveBeenCalledOnce();
    expect(mocks.replies.at(-1)).toContain('¿Lo registro?');
  });

  it('preserves a completed operation’s reply and warns when its history cannot be saved', async () => {
    mocks.append.mockRejectedValue(new Error('synthetic session write failure'));
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update(222, 'gasté 100'));
    expect(mocks.chat).toHaveBeenCalledOnce();
    expect(mocks.replies).toContain('Registré el gasto.');
    expect(mocks.replies.at(-1)).toContain('No pude guardar el contexto');
  });
});
