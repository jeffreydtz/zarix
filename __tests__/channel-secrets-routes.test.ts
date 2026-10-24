import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  shared: vi.fn(), custom: vi.fn(), client: vi.fn(), from: vi.fn(),
  select: vi.fn(), eq: vi.fn(), read: vi.fn(), execute: vi.fn(), alert: vi.fn(),
}));
vi.mock('@/lib/telegram/bot', () => ({
  handleTelegramUpdate: mocks.shared, handleCustomTelegramUpdate: mocks.custom,
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: mocks.client }));
vi.mock('@/lib/observability/alert', () => ({ alertAdmin: mocks.alert }));

import { POST as sharedWebhook } from '@/app/api/telegram/webhook/route';
import { POST as customWebhook } from '@/app/api/telegram/webhook/u/[secret]/route';
import { deriveCustomWebhookHeaderSecret } from '@/lib/telegram/webhook-auth';
import { CronJob } from '@/lib/cron/cron-job';

// All credentials and updates below are test doubles, not real provider/session credentials.
const CRON_SECRET = 'cnf10-fixture-cron-only';
const WEBHOOK_SECRET = 'cnf10-fixture-header-only';
const USER_BEARER = 'cnf10-fixture-ordinary-user-token';
const PATH_SECRET = 'cnf10-fixture-custom-path-0123456789abcdef';
const BOT_TOKEN = 'cnf10-fixture-bot-token-only';
const OWNER = '9b6e4340-803a-4a89-9866-516456d19b58';
const UPDATE = { update_id: 101, message: { chat: { id: 731, type: 'private' }, text: '/cuentas' } };

class FixtureCron extends CronJob {
  readonly name = 'recurring';
  protected async execute() { return mocks.execute(); }
}

function request(path: string, header?: string, authorization?: string, body: unknown = UPDATE) {
  return new NextRequest(`http://localhost${path}`, {
    method: path.startsWith('/api/cron/') ? 'GET' : 'POST',
    headers: {
      ...(header === undefined ? {} : { 'x-telegram-bot-api-secret-token': header }),
      ...(authorization === undefined ? {} : { authorization }),
      ...(path.startsWith('/api/cron/') ? {} : { 'content-type': 'application/json' }),
    },
    ...(path.startsWith('/api/cron/') ? {} : { body: JSON.stringify(body) }),
  });
}

const customParams = (secret = PATH_SECRET) => ({ params: Promise.resolve({ secret }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', WEBHOOK_SECRET);
  mocks.shared.mockResolvedValue(undefined);
  mocks.custom.mockResolvedValue(undefined);
  mocks.execute.mockResolvedValue({ processed: 1 });
  mocks.alert.mockResolvedValue(undefined);
  const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.read };
  mocks.client.mockReturnValue({ from: mocks.from, rpc: vi.fn().mockResolvedValue({ data: null, error: null }) });
  mocks.from.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.read.mockResolvedValue({ data: {
    id: OWNER, telegram_chat_id: 731, telegram_bot_token: BOT_TOKEN, telegram_bot_token_enc: null, telegram_webhook_secret: PATH_SECRET,
  }, error: null });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('External network is forbidden in these local tests')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function expectNoSensitiveLogs() {
  const output = [console.error, console.warn, console.log, console.info]
    .flatMap(spy => vi.mocked(spy).mock.calls)
    .map(call => inspect(call, { depth: 8 })).join('\n');
  for (const marker of [CRON_SECRET, WEBHOOK_SECRET, USER_BEARER, PATH_SECRET, BOT_TOKEN, 'cnf10-error-canary']) {
    expect(output).not.toContain(marker);
  }
  expect(fetch).not.toHaveBeenCalled();
}

describe('CNF-10 local authenticated channel matrix (bot/DB/provider doubles)', () => {
  it.each([
    ['missing authorization', undefined],
    ['ordinary user bearer', `Bearer ${USER_BEARER}`],
    ['wrong cron secret', 'Bearer cnf10-wrong-cron'],
  ])('cron denies %s before creating a DB client or executing work', async (_label, bearer) => {
    const result = await new FixtureCron().run(request('/api/cron/recurring', undefined, bearer));
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.shared).not.toHaveBeenCalled();
    expect(mocks.custom).not.toHaveBeenCalled();
    expectNoSensitiveLogs();
  });

  it('cron valid bearer runs only its defined work once', async () => {
    const result = await new FixtureCron().run(request('/api/cron/recurring', undefined, `Bearer ${CRON_SECRET}`));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ success: true, job: 'recurring', processed: 1 });
    expect(mocks.client).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.shared).not.toHaveBeenCalled();
    expect(mocks.custom).not.toHaveBeenCalled();
    expectNoSensitiveLogs();
  });

  it.each([undefined, 'cnf10-wrong-header', CRON_SECRET])('shared webhook denies an absent/wrong/cross-channel header (%s) before bot/DB', async header => {
    const result = await sharedWebhook(request('/api/telegram/webhook', header, `Bearer ${USER_BEARER}`));
    expect(result.status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.shared).not.toHaveBeenCalled();
    expect(mocks.custom).not.toHaveBeenCalled();
    expectNoSensitiveLogs();
  });

  it('shared webhook fails closed when its configured secret is missing', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '');
    const result = await sharedWebhook(request('/api/telegram/webhook', WEBHOOK_SECRET));
    expect(result.status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.shared).not.toHaveBeenCalled();
    expectNoSensitiveLogs();
  });

  it('shared valid header dispatches the exact update only to the shared bot', async () => {
    const result = await sharedWebhook(request('/api/telegram/webhook', WEBHOOK_SECRET));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(mocks.shared).toHaveBeenCalledExactlyOnceWith(UPDATE);
    expect(mocks.custom).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
    expectNoSensitiveLogs();
  });

  it('shared authenticated failure keeps its acknowledgement and omits raw exceptions from logs', async () => {
    mocks.shared.mockRejectedValue(Object.assign(new Error(`cnf10-error-canary ${WEBHOOK_SECRET}`), {
      request: { token: BOT_TOKEN, authorization: USER_BEARER, url: PATH_SECRET },
    }));
    const result = await sharedWebhook(request('/api/telegram/webhook', WEBHOOK_SECRET));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(mocks.shared).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expectNoSensitiveLogs();
  });

  it.each([undefined, 'cnf10-wrong-header', WEBHOOK_SECRET])('custom webhook denies absent/wrong/shared-channel header (%s) before DB or bot', async header => {
    const result = await customWebhook(request(`/api/telegram/webhook/u/${PATH_SECRET}`, header), customParams());
    expect(result.status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.custom).not.toHaveBeenCalled();
    expect(mocks.shared).not.toHaveBeenCalled();
    expectNoSensitiveLogs();
  });

  it('custom webhook rejects a short capability before DB or bot', async () => {
    const result = await customWebhook(request('/api/telegram/webhook/u/short', WEBHOOK_SECRET), customParams('short'));
    expect(result.status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.custom).not.toHaveBeenCalled();
    expectNoSensitiveLogs();
  });

  it.each(['absent', 'revoked', 'mismatched'] as const)('custom matching header with %s stored capability does one read and never dispatches', async condition => {
    mocks.read.mockResolvedValue({ data: condition === 'absent' ? null : {
      id: OWNER, telegram_chat_id: 731,
      telegram_bot_token: condition === 'revoked' ? null : BOT_TOKEN,
      telegram_webhook_secret: condition === 'mismatched' ? 'different-stored-capability' : PATH_SECRET,
    }, error: null });
    const header = deriveCustomWebhookHeaderSecret(PATH_SECRET);
    const result = await customWebhook(request(`/api/telegram/webhook/u/${PATH_SECRET}`, header), customParams());
    expect(result.status).toBe(401);
    expect(mocks.client).toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledWith('users');
    expect(mocks.custom).not.toHaveBeenCalled();
    expect(mocks.shared).not.toHaveBeenCalled();
    expectNoSensitiveLogs();
  });

  it('custom valid header dispatches once with the stored owner, rather than the untrusted payload identity', async () => {
    const untrustedUpdate = { ...UPDATE, message: { ...UPDATE.message, userId: 'another-owner', chat: { id: 998, type: 'private' } } };
    const result = await customWebhook(request(`/api/telegram/webhook/u/${PATH_SECRET}`, deriveCustomWebhookHeaderSecret(PATH_SECRET), undefined, untrustedUpdate), customParams());
    expect(result.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('users');
    expect(mocks.eq).toHaveBeenCalledWith('telegram_webhook_secret', PATH_SECRET);
    expect(mocks.custom).toHaveBeenCalledExactlyOnceWith(untrustedUpdate, BOT_TOKEN, { userId: OWNER, chatId: 731 });
    expect(mocks.shared).not.toHaveBeenCalled();
    expectNoSensitiveLogs();
  });

  it('custom authenticated failure keeps its acknowledgement and omits exception/provider credentials from logs', async () => {
    mocks.custom.mockRejectedValue(Object.assign(new Error(`cnf10-error-canary ${BOT_TOKEN}`), {
      request: { secret: PATH_SECRET, authorization: USER_BEARER, header: WEBHOOK_SECRET },
    }));
    const result = await customWebhook(request(`/api/telegram/webhook/u/${PATH_SECRET}`, deriveCustomWebhookHeaderSecret(PATH_SECRET)), customParams());
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(mocks.custom).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expectNoSensitiveLogs();
  });

  it('custom webhook uses the user bot after plaintext is nulled (Vault pointer)', async () => {
    const enc = 'vault:v1:00000000-0000-4000-8000-000000000001';
    const rpc = vi.fn().mockResolvedValue({ data: BOT_TOKEN, error: null });
    mocks.client.mockReturnValue({ from: mocks.from, rpc });
    mocks.read.mockResolvedValue({
      data: {
        id: OWNER,
        telegram_chat_id: 731,
        telegram_bot_token: null,
        telegram_bot_token_enc: enc,
        telegram_webhook_secret: PATH_SECRET,
      },
      error: null,
    });
    const result = await customWebhook(
      request(`/api/telegram/webhook/u/${PATH_SECRET}`, deriveCustomWebhookHeaderSecret(PATH_SECRET)),
      customParams()
    );
    expect(result.status).toBe(200);
    expect(rpc).toHaveBeenCalled();
    expect(mocks.custom).toHaveBeenCalledExactlyOnceWith(UPDATE, BOT_TOKEN, { userId: OWNER, chatId: 731 });
    expectNoSensitiveLogs();
  });
});
