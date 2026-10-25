import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(), list: vi.fn(), total: vi.fn(), append: vi.fn(), gemini: vi.fn(),
  chat: vi.fn(), download: vi.fn(), handleUpdate: vi.fn(), replies: [] as string[],
}));

// Only Telegraf's transport/dispatcher and data/provider boundaries are doubled.
// All registered application middleware, handlers, catches and replies are real.
vi.mock('telegraf', () => ({
  Telegraf: class {
    private middleware: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> = [];
    private commands: Record<string, (ctx: any) => Promise<void>> = {};
    private handlers: Record<string, (ctx: any) => Promise<void>> = {};
    private errorHandler?: (error: unknown, ctx: any) => Promise<void>;
    use(fn: (ctx: any, next: () => Promise<void>) => Promise<void>) { this.middleware.push(fn); }
    command(name: string, fn: (ctx: any) => Promise<void>) { this.commands[name] = fn; }
    on(name: string, fn: (ctx: any) => Promise<void>) { this.handlers[name] = fn; }
    action() {}
    catch(fn: (error: unknown, ctx: any) => Promise<void>) { this.errorHandler = fn; }
    async handleUpdate(update: any) {
      mocks.handleUpdate(update);
      const ctx = {
        chat: update.message.chat, from: { id: 777 }, message: update.message, update,
        botInfo: { id: 901 }, state: {}, telegram: {},
        reply: async (text: string) => { mocks.replies.push(text); },
      };
      const text = update.message.text ?? '';
      const command = text.startsWith('/') ? text.slice(1) : null;
      const handler = command ? this.commands[command] : this.handlers[update.message.photo ? 'photo' : update.message.voice ? 'voice' : 'text'];
      const next = async (index: number): Promise<void> => {
        if (index < this.middleware.length) return this.middleware[index](ctx, () => next(index + 1));
        await handler?.(ctx);
      };
      try { await next(0); }
      catch (error) { if (this.errorHandler) await this.errorHandler(error, ctx); else throw error; }
    }
  },
  Markup: {},
}));
vi.mock('telegraf/filters', () => ({ message: (name: string) => name }));
vi.mock('@/lib/telegram/download-media', () => ({ downloadTelegramMedia: mocks.download }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from }) }));
vi.mock('@/lib/services/accounts', () => ({ accountsService: { list: mocks.list, getTotalBalance: mocks.total } }));
vi.mock('@/lib/services/transactions', () => ({ transactionsService: {}, excludedCurrenciesNote: vi.fn() }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: {} }));
vi.mock('@/lib/ai/gemini', () => ({ getGeminiForUser: mocks.gemini, GeminiMissingKeyError: class extends Error {} }));
vi.mock('@/lib/ai/prompts', () => ({ sanitizeForPrompt: (value: string) => value }));
vi.mock('@/lib/services/botSessions', () => ({
  appendBotTurn: mocks.append, clearBotSession: vi.fn(), getStoredTurns: async () => [], storedTurnsToGeminiHistory: () => [],
}));
vi.mock('@/lib/services/subscriptions', () => ({ subscriptionsService: { hasOrchestratorAccess: () => true } }));
vi.mock('@/lib/services/internal-ai-chat', () => ({ processInternalAiChatMessage: mocks.chat }));
vi.mock('@/lib/plans/service', () => ({ withPlanQuota: async (_input: unknown, task: () => unknown) => task(), AmbiguousPlanWorkError: class extends Error {} }));
vi.mock('@/lib/notification-schedule', () => ({ buildTelegramSummaryScheduleLines: vi.fn() }));

const CANARY = 'cnf10-error-private-canary';
const FIXTURE_TOKEN = 'cnf10-fixture-transport-token';
const FIXTURE_TEXT = 'cnf10-fixture-private-user-text';
const error = () => Object.assign(new Error(`${CANARY} ${FIXTURE_TOKEN} ${FIXTURE_TEXT}`), {
  request: { token: FIXTURE_TOKEN, text: FIXTURE_TEXT, header: CANARY },
});

function update(kind: 'photo' | 'voice' | 'text' | 'command') {
  return { update_id: 102, message: {
    chat: { id: 731, type: 'private' },
    ...(kind === 'photo' ? { photo: [{ file_id: 'fixture-image', file_unique_id: 'fixture-image-unique' }] }
      : kind === 'voice' ? { voice: { file_id: 'fixture-audio', file_unique_id: 'fixture-audio-unique' } }
        : { text: kind === 'command' ? '/cuentas' : FIXTURE_TEXT }),
  } };
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('TELEGRAM_BOT_TOKEN', FIXTURE_TOKEN);
  mocks.replies.length = 0;
  const user = { id: 'fixture-owner', status: 'ACTIVE', plan_tier: 'premium', telegram_chat_id: 731 };
  mocks.from.mockImplementation((table: string) => {
    const result = { data: table === 'categories' ? [] : user, error: null };
    const query = {
      select: () => query, eq: () => query, or: () => query,
      single: async () => result,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
    };
    return query;
  });
  mocks.list.mockResolvedValue([]);
  mocks.total.mockResolvedValue({ totalARSBlue: 0, totalUSD: 0 });
  mocks.append.mockResolvedValue(undefined);
  mocks.download.mockResolvedValue(new ArrayBuffer(1));
  mocks.gemini.mockResolvedValue({ chatWithImage: async (_prompt: string, _data: string, mime: string) => mime === 'audio/ogg'
    ? 'gasto sintético de prueba'
    : JSON.stringify({ found: true, amount: 100, currency: 'ARS', merchant: 'Fixture shop' }) });
  mocks.chat.mockImplementation(async (input: { prepareMessage?: () => Promise<unknown> }) => {
    await input.prepareMessage?.();
    return { assistant_message: 'Respuesta sintética.', raw_response: 'Respuesta sintética.' };
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('External network is forbidden in these local tests')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function assertSafeErrorLog(label: string) {
  expect(console.error).toHaveBeenCalledWith(label);
  const output = [console.error, console.warn, console.log, console.info]
    .flatMap(spy => vi.mocked(spy).mock.calls).map(call => inspect(call, { depth: 8 })).join('\n');
  for (const value of [CANARY, FIXTURE_TOKEN, FIXTURE_TEXT]) expect(output).not.toContain(value);
  expect(mocks.handleUpdate).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
}

describe('CNF-10 application bot catches omit arbitrary provider/data exceptions', () => {
  it('photo processing failure retains the public reply and logs only its event', async () => {
    mocks.gemini.mockRejectedValue(error());
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update('photo'));
    expect(mocks.replies.at(-1)).toBe('Hubo un error procesando la imagen. ¿Podés intentar con otra foto o escribirme el gasto?');
    assertSafeErrorLog('Photo processing error:');
  });

  it('photo proposal persistence failure retains its no-confirmation reply and omits the exception', async () => {
    mocks.append.mockRejectedValue(error());
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update('photo'));
    expect(mocks.replies.at(-1)).toBe('No pude guardar los datos del ticket para confirmarlos. Todavía no registré el gasto. Mandame de nuevo la foto o escribime los datos completos.');
    expect(mocks.append).toHaveBeenCalledTimes(1);
    assertSafeErrorLog('[telegram] receipt proposal persistence failed');
  });

  it('voice processing failure retains the public reply and omits the exception', async () => {
    mocks.gemini.mockRejectedValue(error());
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update('voice'));
    expect(mocks.replies.at(-1)).toBe('No pude procesar el audio. ¿Podés escribirme el gasto?');
    assertSafeErrorLog('Voice processing error:');
  });

  it('voice memory failure retains its warning and omits raw exception/transcription', async () => {
    mocks.append.mockRejectedValue(error());
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update('voice'));
    expect(mocks.replies.at(-1)).toBe('No pude guardar el contexto de esta conversación. Para el próximo mensaje, escribime los datos completos.');
    assertSafeErrorLog('[telegram] appendBotTurn failed');
  });

  it('text processing failure retains the public reply and omits exception/message', async () => {
    mocks.chat.mockRejectedValue(error());
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update('text'));
    expect(mocks.replies.at(-1)).toBe('Hubo un error procesando tu mensaje. ¿Podés reformularlo? Por ejemplo: "gasté 500 en almacén"');
    assertSafeErrorLog('Bot error:');
  });

  it('does not map arbitrary 404/account substrings onto specialized replies', async () => {
    mocks.chat.mockRejectedValue(new Error('account 404 not found'));
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update('text'));
    expect(mocks.replies.at(-1)).toBe('Hubo un error procesando tu mensaje. ¿Podés reformularlo? Por ejemplo: "gasté 500 en almacén"');
    expect(mocks.replies.at(-1)).not.toMatch(/cuentas|IA no está disponible/i);
    assertSafeErrorLog('Bot error:');
  });

  it('text memory failure retains its warning and omits raw exception/message', async () => {
    mocks.append.mockRejectedValue(error());
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update('text'));
    expect(mocks.replies.at(-1)).toBe('No pude guardar el contexto de esta conversación. Para el próximo mensaje, escribime los datos completos.');
    assertSafeErrorLog('[telegram] appendBotTurn failed');
  });

  it('the global application catch retains its public reply and omits raw errors', async () => {
    mocks.list.mockRejectedValue(error());
    const { handleTelegramUpdate } = await import('@/lib/telegram/bot');
    await handleTelegramUpdate(update('command'));
    expect(mocks.replies.at(-1)).toBe('Uy, algo falló de mi lado. Probá de nuevo en un toque.');
    assertSafeErrorLog('Telegram handler error:');
  });
});
