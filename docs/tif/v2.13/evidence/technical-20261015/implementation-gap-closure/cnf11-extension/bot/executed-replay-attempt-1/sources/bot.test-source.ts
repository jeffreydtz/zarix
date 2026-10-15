// Release-gated integration worker. @ resolves only to the verified frozen copy.
import { it, vi } from 'vitest';
import { readFile, open, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { formatWithOptions, isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const boundary = vi.hoisted(() => ({ session: null as any, service: null as any,
  gemini: null as any, download: null as any, reply: null as any }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => boundary.session,
  createServiceClientSync: () => boundary.service, createServiceClient: async () => boundary.service }));
vi.mock('@/lib/ai/gemini', () => ({ getGeminiForUser: async (...args: any[]) => boundary.gemini(...args),
  GeminiMissingKeyError: class extends Error {} }));
vi.mock('@/lib/telegram/download-media', () => ({ downloadTelegramMedia: async (...args: any[]) => boundary.download(...args) }));
vi.mock('telegraf/filters', () => ({ message: (kind: string) => kind }));
vi.mock('telegraf', () => ({ Telegraf: class {
  middleware: any[] = []; handlers: Record<string, any> = {}; commands: Record<string, any> = {}; errorHandler: any;
  constructor(_token: string) {} // token never sent to Telegram or persisted
  use(fn: any) { this.middleware.push(fn); }
  command(name: string, fn: any) { this.commands[name] = fn; }
  on(name: string, fn: any) { this.handlers[name] = fn; }
  action() {}
  catch(fn: any) { this.errorHandler = fn; }
  async handleUpdate(update: any) {
    const ctx = { chat: update.message.chat, from: update.message.from, message: update.message,
      update, botInfo: { id: 772115, username: 'synthetic_cnf11_bot' }, state: {}, telegram: {},
      reply: async (text: string) => boundary.reply(update.update_id, text) };
    const kind = update.message.photo ? 'photo' : 'text';
    const handler = update.message.text?.startsWith('/') ? this.commands[update.message.text.slice(1)] : this.handlers[kind];
    const next = async (index: number): Promise<void> => {
      if (index < this.middleware.length) return this.middleware[index](ctx, () => next(index + 1));
      await handler?.(ctx);
    };
    try { await next(0); } catch (error) {
      if (this.errorHandler) await this.errorHandler(error, ctx); else throw error;
    }
  }
}, Markup: { inlineKeyboard: (value: unknown) => ({ reply_markup: value }), button: { callback: (text: string, data: string) => ({ text, data }) } } }));

import { handleCustomTelegramUpdate } from '@/lib/telegram/bot';
import { GET as exportGET } from '@/app/api/export/transactions/route';

const REVISION = 'f5f362ee9dbb81da5268049cab41b357d90eccf1';
const DATABASE = 'zarix_delta_e4bd026f703549bfa24de940134184b8';
const ROOT = '/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix';
type Check = { name: string; passed: boolean; actual?: unknown; expected?: unknown };
type Fixture = { id: string; kind: 'expense' | 'transfer' | 'photo' | 'ambiguous'; chatId: number;
  accounts: Array<{ id: string; name: string; opening: number }>; update: any; photo?: any;
  args: Record<string, unknown>; requestKey: string; financialKey: string; ocrKey?: string;
  transactionId?: string; finalSnapshotSha256?: string };

it('CNF11 bot monetary deduplication with real local quota, ledger and process replay', async () => {
  if (process.env.ZARIX_CNF11_EXTENSION_WINDOW !== 'parent-released-cnf11-extension' ||
      process.env.ZARIX_ISOLATED_DATABASE_CONFIRM !== 'synthetic-only') throw new Error('ParentReleaseRequired');
  const targetPath = process.env.ZARIX_CNF11_BOT_TARGET ?? '';
  const output = process.env.ZARIX_CNF11_BOT_OUTPUT ?? '';
  const phase = process.env.ZARIX_CNF11_BOT_PHASE;
  if (!['prepare', 'replay'].includes(phase ?? '') || !/^\/tmp\/zarix-runtime-20261015\/cnf11-extension-[0-9a-f-]{36}\/targets\.metadata\.json$/.test(targetPath) ||
      !new RegExp('^' + path.dirname(targetPath) + '/bot-' + phase + '-attempt-[1-9][0-9]*$').test(output)) throw new Error('WorkerTargetRejected');
  const consoleText: string[] = [], needles: string[] = [], checks: Check[] = [], results: any[] = [];
  const inspection = { showHidden: true, depth: null, maxStringLength: Infinity, maxArrayLength: Infinity, customInspect: false } as const;
  const spies = Object.getOwnPropertyNames(console).filter(name => !name.startsWith('_') && name !== 'Console' && typeof (console as any)[name] === 'function')
    .map(name => vi.spyOn(console as any, name).mockImplementation((...args: unknown[]) => consoleText.push(formatWithOptions(inspection, ...args))));
  const canaries = ['CNF11_PRIVATE_MESSAGE', 'CNF11_PRIVATE_STACK', 'CNF11_PRIVATE_CAUSE'].map(text => text + '_' + randomUUID());
  const cause = new Error(canaries[2]); cause.stack = canaries[2] + '_stack';
  const canary = new Error(canaries[0], { cause }); canary.stack = canaries[1];
  console.error(canary);
  const calibration = { errorMessage: consoleText.join('\n').includes(canary.message), errorStack: consoleText.join('\n').includes(canary.stack),
    causeMessage: consoleText.join('\n').includes(cause.message), causeStack: consoleText.join('\n').includes(cause.stack),
    callsBeforeClear: consoleText.length, callsAfterClear: 0, beforeAuthAndSql: true };
  consoleText.length = 0;
  const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const check = (name: string, actual: unknown, expected: unknown) => {
    const passed = isDeepStrictEqual(actual, expected); checks.push({ name, passed, actual, expected });
    if (!passed) throw new Error('FocalAssertionFailure');
  };
  const privateFile = async (file: string) => {
    const stat = await lstat(file);
    if (stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('PrivateFileRejected');
    return readFile(file);
  };
  const jsonFile = async (file: string) => JSON.parse((await privateFile(file)).toString());
  const save = async (name: string, value: unknown) => {
    const file = await open(path.join(output, name), 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
  };
  const sqlQuote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const idsSql = (ids: string[]) => ids.length ? ids.map(sqlQuote).join(',') : "'00000000-0000-0000-0000-000000000000'";
  const clients: SupabaseClient[] = [], fixtures: Fixture[] = [];
  let sql: (query: string) => any = () => { throw new Error('SqlNotReady'); };
  let a: any, b: any, originalProfiles: any, baselineRows: any, beforeRows: any;
  let savedReplay: any;
  let originalPlan: any, profileMutationAttempted = false, failure = false;
  const baselineTables = ['accounts', 'transactions', 'investments', 'investment_sales', 'recurring_rules', 'notification_outbox',
    'net_worth_snapshots', 'portfolio_performance_snapshots', 'transaction_deletion_audit', 'bot_sessions', 'categories'];
  const cleanup: any = { ownAccountsArchived: false, profilePlanFieldsRestored: false, allOtherProfileColumnsUnchanged: false,
    existingRowsUnchanged: false, authSessions: null, authRefreshTokens: null, sdkLogout: [] };
  const counters = { resolver: 0, mediaDownload: 0, imageWork: 0, chatWork: 0, toolWork: 0, ackLosses: 0, updates: 0 };
  const replies: Array<{ updateId: number; text: string; delivered: boolean }> = [];
  const acknowledgementTimeouts: Array<Record<string, unknown>> = [];
  const concurrencyWaves: Array<Record<string, unknown>> = [];
  const rpcCounts: Record<string, number> = {};
  let current: Fixture | undefined;
  const lostAck = new Set<number>();
  const actualFetch = globalThis.fetch.bind(globalThis);
  const localFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    if (!['http://127.0.0.1:61321', 'http://127.0.0.1:61329'].includes(url.origin) || url.username || url.password) throw new Error('NonLocalFetchRejected');
    const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname)?.[1];
    if (rpc) rpcCounts[rpc] = (rpcCounts[rpc] ?? 0) + 1;
    return actualFetch(input, { ...init, redirect: 'error' });
  };
  const profile = () => sql("SELECT COALESCE(jsonb_agg(to_jsonb(u) ORDER BY id),'[]') FROM public.users u");
  const profileWithoutPlan = (profiles: any[]) => profiles.map(({ status: _status, current_period_end: _period, grace_period_end: _grace, updated_at: _updated, ...rest }) => rest);
  const existingRows = () => Object.fromEntries(baselineTables.map(table => [table, sql(`SELECT jsonb_build_object('count',count(*),'sha256',encode(extensions.digest(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY id),''),'sha256'),'hex')) FROM public.${table} t WHERE id IN (${idsSql(baselineRows[table])})`)]));
  const snapshot = (fixture: Fixture) => ({
    accounts: sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.accounts t WHERE id IN (${idsSql(fixture.accounts.map(account => account.id))})`),
    ledger: sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.transactions t WHERE account_id IN (${idsSql(fixture.accounts.map(account => account.id))}) OR destination_account_id IN (${idsSql(fixture.accounts.map(account => account.id))})`),
    receipts: sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY request_id),'[]') FROM public.transaction_requests t WHERE user_id=${sqlQuote(a.id)} AND request_id LIKE ${sqlQuote(fixture.financialKey.slice(0, -1) + '%')}`),
    quota: sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY feature,request_key),'[]') FROM public.plan_usage_requests t WHERE user_id=${sqlQuote(a.id)} AND request_key IN (${[fixture.requestKey, fixture.ocrKey].filter(Boolean).map(value => sqlQuote(value!)).join(',')})`),
  });
  const mutate = async (query: any) => { const response = await query; if (response.error) throw new Error('FixtureMutationFailed'); return response.data; };
  const refresh = async (client: SupabaseClient, user: any) => {
    const session = await client.auth.getSession();
    if (!session.data.session || (session.data.session.expires_at ?? 0) * 1000 < Date.now() + 20_000) {
      const next = await client.auth.refreshSession();
      if (next.error || next.data.user?.id !== user.id) throw new Error('NormalSessionRefreshFailed');
      if (next.data.session) needles.push(next.data.session.access_token, next.data.session.refresh_token);
    }
    const verified = await client.auth.getUser(); if (verified.error || verified.data.user?.id !== user.id) throw new Error('NormalUserVerificationFailed');
  };
  const ownerReads = async (fixture: Fixture) => {
    await refresh(clients[0], a); await refresh(clients[1], b);
    const mine = await clients[0].from('transactions').select('id,amount,type').eq('id', fixture.transactionId!);
    check(fixture.id + ': normal A reads one own movement', mine.error ? null : mine.data?.map(row => ({ id: row.id, amount: Number(row.amount), type: row.type })),
      [{ id: fixture.transactionId, amount: 1500, type: fixture.kind === 'transfer' ? 'transfer' : 'expense' }]);
    const other = await clients[1].from('transactions').select('id').eq('id', fixture.transactionId!);
    check(fixture.id + ': normal B cannot read A movement', other.error ? null : other.data, []);
    boundary.session = clients[0];
    const response = await exportGET(new NextRequest('http://127.0.0.1:61321/api/export/transactions?format=json&accountId=' + fixture.accounts[0].id));
    check(fixture.id + ': real export handler succeeds with normal A session', response.status, 200);
    const body = await response.json();
    check(fixture.id + ': exported movement exactly once', body.filter((row: any) => row.id === fixture.transactionId).map((row: any) => ({ id: row.id, amount: Number(row.amount) })), [{ id: fixture.transactionId, amount: 1500 }]);
  };
  const oracle = (fixture: Fixture) => {
    const state = snapshot(fixture);
    const economic = state.ledger.filter((row: any) => row.type !== 'adjustment');
    check(fixture.id + ': one economic ledger row', economic.length, 1);
    check(fixture.id + ': monetary amount exact', economic[0].amount, 1500);
    check(fixture.id + ': owner matches', economic[0].user_id, a.id);
    check(fixture.id + ': one durable ordinal zero receipt', state.receipts.map((row: any) => row.request_id), [fixture.financialKey]);
    check(fixture.id + ': source balance exact', Number(state.accounts.find((row: any) => row.id === fixture.accounts[0].id)?.balance), 8500);
    if (fixture.kind === 'transfer') {
      check(fixture.id + ': destination balance exact', Number(state.accounts.find((row: any) => row.id === fixture.accounts[1].id)?.balance), 3500);
      check(fixture.id + ': transfer total preserved', state.accounts.reduce((sum: number, row: any) => sum + Number(row.balance), 0), 12000);
      check(fixture.id + ': destination linked', economic[0].destination_account_id, fixture.accounts[1].id);
    }
    const ai = state.quota.find((row: any) => row.feature === 'ai');
    check(fixture.id + ': durable quota state', ai?.state, fixture.kind === 'ambiguous' ? 'reserved' : 'completed');
    check(fixture.id + ': durable quota result presence', ai?.result != null, fixture.kind !== 'ambiguous');
    if (fixture.kind === 'photo') check(fixture.id + ': durable OCR quota completed', state.quota.find((row: any) => row.feature === 'ocr')?.state, 'completed');
    fixture.transactionId = economic[0].id;
    return state;
  };
  const deliver = async (fixture: Fixture, update = fixture.update) => {
    current = fixture; counters.updates++;
    await handleCustomTelegramUpdate(structuredClone(update), token, { userId: a.id, chatId: fixture.chatId });
  };
  const replayWave = async (fixture: Fixture) => {
    const before = snapshot(fixture), work = { chat: counters.chatWork, tool: counters.toolWork, image: counters.imageWork };
    const replyStart = replies.length, reserveStart = rpcCounts.reserve_plan_usage ?? 0;
    await deliver(fixture); await deliver(fixture);
    let release!: () => void, ready = 0, inFlight = 0, peak = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const individual: Array<Record<string, unknown>> = [];
    const pending = Array.from({ length: 10 }, async (_unused, index) => {
      ready++; await gate;
      const startedAtMs = performance.now(); inFlight++; peak = Math.max(peak, inFlight);
      try { await deliver(fixture); individual.push({ index, status: 'fulfilled', startedAtMs, finishedAtMs: performance.now() }); }
      catch { individual.push({ index, status: 'rejected', startedAtMs, finishedAtMs: performance.now() }); throw new Error('ReplayDeliveryFailed'); }
      finally { inFlight--; }
    });
    check(fixture.id + ': ten contenders ready at common replay barrier', ready, 10);
    const releasedAtMs = performance.now(); release();
    const concurrent = await Promise.allSettled(pending);
    concurrencyWaves.push({ fixtureId: fixture.id, postCommitOnly: true, readyAtRelease: ready, releasedAtMs, peakInFlight: peak,
      individual: individual.sort((a, b) => Number(a.index) - Number(b.index)) });
    check(fixture.id + ': concurrent replay handlers actually overlap', peak >= 2, true);
    check(fixture.id + ': ten concurrent redeliveries returned', concurrent.map(result => result.status), Array(10).fill('fulfilled'));
    check(fixture.id + ': no additional provider or tool work', { chat: counters.chatWork, tool: counters.toolWork, image: counters.imageWork }, work);
    check(fixture.id + ': ledger receipt quota account snapshot stable across 2+10 replays', sha(snapshot(fixture)), sha(before));
    check(fixture.id + ': all 2+10 text replays reached durable reservation RPC', (rpcCounts.reserve_plan_usage ?? 0) - reserveStart, 12);
    const waveReplies = replies.slice(replyStart).filter(reply => reply.updateId === fixture.update.update_id);
    check(fixture.id + ': each replay produces one delivered bot response', waveReplies.length, 12);
    check(fixture.id + ': all replay responses delivered by transport double', waveReplies.every(reply => reply.delivered), true);
    if (fixture.kind === 'ambiguous') check(fixture.id + ': bot indicates pending request on each repeat', waveReplies.every(reply => reply.text.includes('en proceso')), true);
    else check(fixture.id + ': replay responds with exact durable completed result', waveReplies.map(reply => reply.text), Array(12).fill(before.quota.find((row: any) => row.feature === 'ai')?.result?.assistant_message));
  };
  const token = randomBytes(32).toString('hex'); needles.push(token, ...canaries);
  boundary.reply = async (updateId: number, text: string) => {
    const lose = phase === 'prepare' && current?.kind !== 'ambiguous' && updateId === current?.update.update_id && !lostAck.has(updateId);
    replies.push({ updateId, text, delivered: !lose });
    if (lose && current) {
      const persisted = snapshot(current), committedAt = performance.now();
      check(current.id + ': ledger exists before held acknowledgement timeout', persisted.ledger.filter((row: any) => row.type !== 'adjustment').length, 1);
      check(current.id + ': receipt exists before held acknowledgement timeout', persisted.receipts.length, 1);
      check(current.id + ': AI quota completed before held acknowledgement timeout', persisted.quota.find((row: any) => row.feature === 'ai')?.state, 'completed');
      lostAck.add(updateId); counters.ackLosses++;
      const timeoutStartedAt = performance.now(), signal = AbortSignal.timeout(40);
      try { await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); }
      catch (error: any) {
        acknowledgementTimeouts.push({ id: current.id, updateId, committedBeforeTimeout: committedAt <= timeoutStartedAt,
          timeoutStartedAtMonotonicMs: timeoutStartedAt, elapsedMs: performance.now() - timeoutStartedAt,
          signalAborted: signal.aborted, errorName: error?.name === 'TimeoutError' ? 'TimeoutError' : 'Other',
          acknowledgementDelivered: false, transportDouble: true, newSocketOrProvider: false });
        throw error;
      }
    }
    return { message_id: 1 };
  };
  boundary.download = async () => { counters.mediaDownload++; return new Uint8Array([83, 89, 78, 84, 72]).buffer; };
  boundary.gemini = async () => { counters.resolver++; return {
    chatWithImage: async () => { counters.imageWork++; if (!current || current.kind !== 'photo') throw new Error('UnexpectedImageWork');
      return JSON.stringify({ found: true, amount: 1500, currency: 'ARS', merchant: 'Synthetic store', confidence: 'high',
        suggestedAccount: current.accounts[0].name, description: 'CNF11 synthetic receipt', date: '2026-10-06' }); },
    chatWithTools: async (message: string, options: any) => {
      counters.chatWork++; if (!current || message !== current.update.message.text) throw new Error('UnexpectedAiMessage');
      if (current.kind === 'photo' && !JSON.stringify(options.history).includes('monto 1500 ARS')) throw new Error('PersistedProposalMissingFromRealHistory');
      counters.toolWork++;
      const result = await options.onToolCall('create_transaction', current.args);
      if (result?.success !== true) throw new Error('RealToolDidNotCommit');
      if (current.kind === 'ambiguous') { const failure = new Error(canaries[0], { cause: new Error(canaries[2]) }); failure.stack = canaries[1]; throw failure; }
      return { text: 'Movimiento sintético confirmado.', toolsUsed: ['create_transaction'] };
    },
  }; };
  try {
    check('Robust non-enumerable Error capture calibrated before Auth/SQL', Object.values(calibration).slice(0, 4), [true, true, true, true]);
    const target = await jsonFile(targetPath);
    if (target.purpose !== 'zarix-cnf11-extension' || target.newDatabaseName !== DATABASE || target.sourceRevision !== REVISION || target.apiOrigin !== 'http://127.0.0.1:61321' ||
        target.databaseHost !== '127.0.0.1' || Number(target.databasePort) !== 58322 || target.existingEnvironmentFile !== '/tmp/zarix-runtime-20261015/proof.env') throw new Error('MetadataGuardRejected');
    const values = dotenv.parse(await privateFile(target.existingEnvironmentFile));
    const database = new URL(values.ZARIX_PROOF_DATABASE_URL);
    if (database.hostname !== '127.0.0.1' || database.port !== '58322' || database.pathname !== '/postgres' || database.search || database.hash) throw new Error('DatabaseGuardRejected');
    const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
    Object.assign(pgEnv, { PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: '58322', PGDATABASE: target.newDatabaseName,
      PGUSER: 'supabase_admin', PGPASSWORD: decodeURIComponent(database.password), PGAPPNAME: 'zarix-cnf11-bot-' + phase, PGCONNECT_TIMEOUT: '10', PGOPTIONS: '-c statement_timeout=12000 -c lock_timeout=3000' });
    sql = query => { const child = spawnSync(path.join(target.pgBin, 'psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { cwd: ROOT, env: pgEnv,
      input: query + '\n', encoding: 'utf8', timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
      if (child.status !== 0) throw new Error('NativeSqlFailed'); const result = child.stdout.trim(); return result ? JSON.parse(result) : null; };
    check('Exact owned database', sql('SELECT to_json(current_database())'), DATABASE);
    check('No existing Auth sessions', sql('SELECT count(*) FROM auth.sessions'), 0);
    check('No existing refresh grants', sql('SELECT count(*) FROM auth.refresh_tokens'), 0);
    originalProfiles = profile();
    if (phase === 'replay') {
      const replayFile = process.env.ZARIX_CNF11_BOT_REPLAY_FIXTURE ?? '';
      if (!new RegExp('^' + path.dirname(targetPath) + '/bot-prepare-attempt-[1-9][0-9]*/replay-fixture.json$').test(replayFile)) throw new Error('ReplayFixturePathRejected');
      savedReplay = await jsonFile(replayFile);
      if (savedReplay.purpose !== 'cnf11-bot-sanitized-process-replay' || savedReplay.sourceRevision !== REVISION || savedReplay.database !== DATABASE || savedReplay.fixtures.length !== 4 || savedReplay.containsCredentials !== false ||
          !savedReplay.fixtures.every((fixture: any) => Number.isSafeInteger(fixture.chatId) && fixture.chatId >= 1_000_000_000)) throw new Error('ReplayFixtureRejected');
    }
    const replayChats = savedReplay?.fixtures.map((fixture: Fixture) => fixture.chatId) ?? [];
    baselineRows = Object.fromEntries(baselineTables.map(table => [table, sql(`SELECT COALESCE(jsonb_agg(id::text ORDER BY id),'[]') FROM public.${table}${table === 'bot_sessions' && replayChats.length ? ` WHERE telegram_chat_id NOT IN (${replayChats.join(',')})` : ''}`)]));
    beforeRows = existingRows();
    const users = (await jsonFile(target.loginFile)).users;
    if (users.length !== 2 || !users.every((user: any) => /^[0-9a-f-]{36}$/.test(user.id) && /^zarix-.+@example\.invalid$/.test(user.email))) throw new Error('ExistingTwoSyntheticIdentitiesRequired');
    [a, b] = users;
    vi.stubGlobal('fetch', localFetch);
    const newClient = (key: string) => createClient(target.apiOrigin, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }, global: { fetch: localFetch } });
    boundary.service = newClient(values.ZARIX_PROOF_SERVICE_ROLE_KEY);
    needles.push(values.ZARIX_PROOF_ANON_KEY, values.ZARIX_PROOF_SERVICE_ROLE_KEY, decodeURIComponent(database.password), ...users.map((user: any) => user.password));
    for (const user of users) {
      const client = newClient(values.ZARIX_PROOF_ANON_KEY); clients.push(client);
      client.auth.onAuthStateChange((_event, session) => { if (session) needles.push(session.access_token, session.refresh_token); });
      const signed = await client.auth.signInWithPassword({ email: user.email, password: user.password });
      if (signed.error || signed.data.user?.id !== user.id || !signed.data.session) throw new Error('NormalAuthFailed');
      needles.push(signed.data.session.access_token, signed.data.session.refresh_token);
      await refresh(client, user);
    }
    originalPlan = originalProfiles.find((user: any) => user.id === a.id);
    await save('profile-restore.private.json', { purpose: 'restore-only-own-synthetic-plan', ownerId: a.id,
      status: originalPlan.status, current_period_end: originalPlan.current_period_end, grace_period_end: originalPlan.grace_period_end,
      allOtherProfileColumnsSha256: sha(profileWithoutPlan(originalProfiles)) });
    const limit = sql(`SELECT public.plan_account_limit(${sqlQuote(a.id)})`);
    if (limit !== 20) { profileMutationAttempted = true;
      await mutate(boundary.service.from('users').update({ status: 'ACTIVE', current_period_end: '2099-12-31T00:00:00.000Z', grace_period_end: null }).eq('id', a.id)); }
    check('All non-plan profile columns preserved while preparing fixture', sha(profileWithoutPlan(profile())), sha(profileWithoutPlan(originalProfiles)));
    const active = sql(`SELECT count(*) FROM accounts WHERE user_id=${sqlQuote(a.id)} AND is_active AND movement_enabled`);
    if (active > 18) throw new Error('FixtureBlockedByExistingAccountCap');
    if (phase === 'prepare') {
      for (let index = 0; index < 4; index++) {
        const kind = (['expense', 'transfer', 'photo', 'ambiguous'] as const)[index];
        const uuid = randomUUID(); const chatId = 1_000_000_000 + randomBytes(4).readUInt32BE() % 1_000_000_000;
        check('New synthetic chat has no existing session before any fixture write', sql(`SELECT count(*) FROM bot_sessions WHERE telegram_chat_id=${chatId}`), 0);
        const updateId = 1_000_000_000 + randomBytes(4).readUInt32BE() % 1_000_000_000;
        const accounts = Array.from({ length: kind === 'transfer' ? 2 : 1 }, (_, accountIndex) => ({ id: randomUUID(), name: 'C11-' + uuid + '-' + accountIndex, opening: accountIndex ? 2000 : 10000 }));
        const requestKey = `telegram:772115:${updateId}:chat`;
        const update = { update_id: updateId, message: { message_id: updateId, date: 1791288000,
          from: { id: chatId, is_bot: false, first_name: 'Synthetic' }, chat: { id: chatId, type: 'private' },
          text: kind === 'photo' ? 'sí' : `CNF11 ${kind} 1500 ${uuid}` } };
        const fixture: Fixture = { id: 'bot-' + kind, kind, chatId, accounts, update, requestKey,
          financialKey: `ai:${a.id}:${createHash('sha256').update(requestKey).digest('hex')}:0`,
          args: { type: kind === 'transfer' ? 'transfer' : 'expense', amount: 1500, currency: 'ARS', account: accounts[0].name,
            ...(kind === 'transfer' ? { destinationAccount: accounts[1].name } : {}), description: 'CNF11 synthetic ' + kind, transactionDate: '2026-10-06' } };
        if (kind === 'photo') { fixture.photo = structuredClone(update); fixture.photo.update_id = updateId - 1;
          delete fixture.photo.message.text; fixture.photo.message.photo = [{ file_id: 'cnf11-media-' + uuid, file_unique_id: 'cnf11-unique-' + uuid }];
          fixture.ocrKey = `telegram:772115:${updateId - 1}:ocr`; }
        fixtures.push(fixture); // register cleanup before the first fixture write
        await save(fixture.id + '-cleanup.private.json', { purpose: 'own-fixture-cleanup-only', sourceRevision: REVISION, ownerA: a.id,
          fixtureId: fixture.id, accounts, chatId, updateId, requestKey, financialKey: fixture.financialKey,
          instruction: 'Archive only these UUID accounts; preserve ledger, receipts, quota and bot history. No credentials in this journal.' });
        for (const account of accounts) {
          await mutate(boundary.service.from('accounts').insert({ id: account.id, user_id: a.id, name: account.name, type: 'bank', currency: 'ARS', include_in_total: false, include_in_liquid: false }));
          await mutate(boundary.service.from('transactions').insert({ user_id: a.id, account_id: account.id, type: 'adjustment', amount: account.opening,
            currency: 'ARS', amount_in_account_currency: account.opening, transaction_date: '2026-10-06T12:00:00.000Z', description: 'CNF11 synthetic opening' }));
        }
        const start = checks.length, counterBefore = { ...counters };
        current = fixture;
        if (fixture.photo) {
          await deliver(fixture, fixture.photo);
          const beforeConfirm = snapshot(fixture);
          check(fixture.id + ': photo proposal creates no economic movement', beforeConfirm.ledger.filter((row: any) => row.type !== 'adjustment').length, 0);
          check(fixture.id + ': photo proposal creates no financial receipt', beforeConfirm.receipts.length, 0);
          const stored = sql(`SELECT COALESCE(jsonb_agg(context),'[]') FROM bot_sessions WHERE user_id=${sqlQuote(a.id)} AND telegram_chat_id=${chatId}`);
          check(fixture.id + ': real proposal persisted before confirmation', JSON.stringify(stored).includes('monto 1500 ARS') && JSON.stringify(stored).includes(accounts[0].name), true);
        }
        await deliver(fixture);
        oracle(fixture);
        await replayWave(fixture);
        await ownerReads(fixture);
        check(fixture.id + ': provider tool called exactly once', counters.toolWork - counterBefore.toolWork, 1);
        check(fixture.id + ': Gemini chat work exactly once', counters.chatWork - counterBefore.chatWork, 1);
        check(fixture.id + ': image provider work once only for photo', counters.imageWork - counterBefore.imageWork, kind === 'photo' ? 1 : 0);
        if (kind !== 'ambiguous') check(fixture.id + ': one final ack deliberately lost after quota completion', lostAck.has(updateId), true);
        await mutate(boundary.service.from('accounts').update({ is_active: false, movement_enabled: false }).in('id', accounts.map(account => account.id)).eq('user_id', a.id));
        fixture.finalSnapshotSha256 = sha(snapshot(fixture));
        results.push({ id: fixture.id, status: 'PASS', checks: checks.slice(start), details: { updateId, chatId, requestKey, financialKey: fixture.financialKey,
          transactionId: fixture.transactionId, accounts, finalSnapshotSha256: fixture.finalSnapshotSha256, counterDelta: Object.fromEntries(Object.keys(counters).map(key => [key, (counters as any)[key] - (counterBefore as any)[key]])),
          ackBoundary: kind === 'ambiguous' ? 'Gemini throws after successful tool commit; quota remains reserved, automatic ack recovery unproven' : 'transport double throws after durable quota completion', historyByteIdentityRequired: false } });
      }
      check('All three nominal held acknowledgements produce real TimeoutError after commit', acknowledgementTimeouts.map(event => ({ committedBeforeTimeout: event.committedBeforeTimeout, signalAborted: event.signalAborted, errorName: event.errorName, acknowledgementDelivered: event.acknowledgementDelivered })),
        Array.from({ length: 3 }, () => ({ committedBeforeTimeout: true, signalAborted: true, errorName: 'TimeoutError', acknowledgementDelivered: false })));
      await save('replay-fixture.json', { purpose: 'cnf11-bot-sanitized-process-replay', sourceRevision: REVISION, database: DATABASE, ownerA: a.id, ownerB: b.id,
        sourceManifestSha256: '6c108712a7d338b4c6c1d14dca798921637abc9e5f2aa3009318fdf7b24e3a29', fixtures, containsCredentials: false });
    } else {
      if (savedReplay.ownerA !== a.id || savedReplay.ownerB !== b.id) throw new Error('ReplayOwnerRejected');
      fixtures.push(...savedReplay.fixtures);
      for (const fixture of fixtures) {
        const start = checks.length;
        check(fixture.id + ': persisted financial snapshot before new-process replay', sha(snapshot(fixture)), fixture.finalSnapshotSha256);
        current = fixture;
        if (fixture.photo) {
          const replyStart = replies.length, reserveStart = rpcCounts.reserve_plan_usage ?? 0;
          await deliver(fixture, fixture.photo);
          check(fixture.id + ': second-process photo reached durable OCR reservation', (rpcCounts.reserve_plan_usage ?? 0) - reserveStart, 1);
          const photoReplies = replies.slice(replyStart);
          check(fixture.id + ': OCR replay returns analysis notice and proposal', photoReplies.length, 2);
          check(fixture.id + ': OCR replay proposal preserves amount and account', photoReplies[1]?.text.includes('1.500') && photoReplies[1]?.text.includes(fixture.accounts[0].name), true);
        }
        const replyStart = replies.length, reserveStart = rpcCounts.reserve_plan_usage ?? 0;
        await deliver(fixture);
        check(fixture.id + ': first new-process text replay reaches durable reservation', (rpcCounts.reserve_plan_usage ?? 0) - reserveStart, 1);
        const coldReplies = replies.slice(replyStart);
        check(fixture.id + ': first new-process text replay returns one response', coldReplies.length, 1);
        const durableResult = snapshot(fixture).quota.find((row: any) => row.feature === 'ai')?.result?.assistant_message;
        check(fixture.id + ': first new-process response matches durable result or reserved fence', fixture.kind === 'ambiguous' ? coldReplies[0]?.text.includes('en proceso') : coldReplies[0]?.text, fixture.kind === 'ambiguous' ? true : durableResult);
        oracle(fixture); await replayWave(fixture); await ownerReads(fixture);
        check(fixture.id + ': same archived account ledger receipt quota after new-process replay', sha(snapshot(fixture)), fixture.finalSnapshotSha256);
        results.push({ id: fixture.id, status: 'PASS', checks: checks.slice(start), details: { sameEventAndRequestKey: true, noReseed: true, archivedFixtureRemainsReadable: true,
          finalSnapshotSha256: sha(snapshot(fixture)), reservedAckRecoveryClaimed: false } });
      }
      check('Second process performs zero Gemini chat/tool/image work', [counters.chatWork, counters.toolWork, counters.imageWork], [0, 0, 0]);
    }
  } catch (error: any) { failure = true; results.push({ id: current?.id ?? 'preflight', status: error?.message === 'FixtureBlockedByExistingAccountCap' ? 'BLOCKED' : 'FAIL',
    errorType: ['Error', 'SyntaxError', 'TypeError'].includes(error?.name) ? error.name : 'Error',
    reason: error?.message === 'FixtureBlockedByExistingAccountCap' ? 'Existing active movement accounts exceed fixture capacity; no prior account changed' : 'Safe diagnostic only; inspect failed check and private retained state', failedChecks: checks.filter(check => !check.passed) }); }
  finally {
    if (a && baselineRows) {
      try {
        if (phase === 'prepare') for (const fixture of fixtures) await mutate(boundary.service.from('accounts').update({ is_active: false, movement_enabled: false }).in('id', fixture.accounts.map(account => account.id)).eq('user_id', a.id).or('is_active.eq.true,movement_enabled.eq.true'));
        cleanup.ownAccountsArchived = fixtures.every(fixture => sql(`SELECT count(*) FROM accounts WHERE id IN (${idsSql(fixture.accounts.map(account => account.id))}) AND (is_active OR movement_enabled)`) === 0);
        if (profileMutationAttempted) await mutate(boundary.service.from('users').update({ status: originalPlan.status, current_period_end: originalPlan.current_period_end, grace_period_end: originalPlan.grace_period_end }).eq('id', a.id));
        const afterProfiles = profile(); const afterA = afterProfiles.find((user: any) => user.id === a.id);
        cleanup.profilePlanFieldsRestored = ['status', 'current_period_end', 'grace_period_end'].every(key => isDeepStrictEqual(afterA?.[key], originalPlan?.[key]));
        cleanup.ownerAOtherColumnsUnchanged = isDeepStrictEqual(profileWithoutPlan([afterA]), profileWithoutPlan([originalPlan]));
        cleanup.ownerBCompleteProfileUnchanged = isDeepStrictEqual(afterProfiles.find((user: any) => user.id === b.id), originalProfiles.find((user: any) => user.id === b.id));
        cleanup.allOtherProfileColumnsUnchanged = cleanup.ownerAOtherColumnsUnchanged && cleanup.ownerBCompleteProfileUnchanged;
        cleanup.ownerAUpdatedAtDelta = { before: originalPlan.updated_at, after: afterA?.updated_at, changed: originalPlan.updated_at !== afterA?.updated_at,
          automaticPlanUpdatePerformed: profileMutationAttempted, unchangedIfNoPlanUpdate: profileMutationAttempted || isDeepStrictEqual(originalPlan.updated_at, afterA?.updated_at) };
        cleanup.existingRowsUnchanged = isDeepStrictEqual(existingRows(), beforeRows);
      } catch { cleanup.fixtureCleanupFailed = true; }
    }
    for (const client of clients) { try { const logout = await client.auth.signOut({ scope: 'local' }); cleanup.sdkLogout.push({ noError: !logout.error, status: logout.error?.status ?? null }); } catch { cleanup.sdkLogout.push({ noError: false }); } }
    try { cleanup.authSessions = sql('SELECT count(*) FROM auth.sessions'); cleanup.authRefreshTokens = sql('SELECT count(*) FROM auth.refresh_tokens'); } catch { cleanup.authCountFailed = true; }
    vi.unstubAllGlobals();
    for (const spy of spies) spy.mockRestore();
  }
  const corpus = consoleText.join('\n');
  const privacy = { inspectedWith: 'formatWithOptions(showHidden:true,depth:null,maxArrayLength:Infinity,maxStringLength:Infinity,customInspect:false)',
    calibration, selectedSecretCount: new Set(needles.filter(Boolean)).size, exactSelectedSecretHits: [...new Set(needles.filter(Boolean))].filter(value => corpus.includes(value)).length,
    syntheticErrorCanaryHits: canaries.filter(value => corpus.includes(value)).length, consoleCalls: consoleText.length, rawConsolePersisted: false, tokenOrSessionFilesCreated: false };
  const cleanupPass = cleanup.ownAccountsArchived && cleanup.profilePlanFieldsRestored && cleanup.allOtherProfileColumnsUnchanged && cleanup.ownerAUpdatedAtDelta?.unchangedIfNoPlanUpdate && cleanup.existingRowsUnchanged && cleanup.authSessions === 0 && cleanup.authRefreshTokens === 0;
  const pass = !failure && results.length === 4 && results.every(result => result.status === 'PASS') && cleanupPass && privacy.exactSelectedSecretHits === 0 && privacy.syntheticErrorCanaryHits === 0;
  await save('bot-verification.json', { status: pass ? 'PASS' : 'FAIL', phase, sourceRevision: REVISION, cases: results, acknowledgementTimeouts, concurrencyWaves,
    checks, counters, rpcCounts, cleanup, privacy, existingBotHistoryProtection: { priorUnrelatedChatRowsProtected: true, replayOwnChatRowsAllowedToAppend: savedReplay?.fixtures.map((fixture: Fixture) => fixture.chatId) ?? [] }, scope: { real: ['application handlers/middleware', 'quota and tool execution', 'monetary services/RPC', 'Auth', 'PostgREST', 'PostgreSQL', 'owner RLS read', 'export handler'],
      doubled: ['Telegraf dispatcher/transport', 'Gemini provider', 'media download'], browserOrTelegramProviderTested: false, automaticReservedAckRecoveryClaimed: false, externalCredentialsCreated: 0, newIdentities: 0,
      completedReplayBoundary: '2 sequential + 10 concurrent after first durable completion', processRestartScope: phase === 'replay' ? 'new worker, same persistent database and event IDs' : 'prepare process only' } });
  await save('privacy.json', privacy);
  if (!pass) throw new Error('BotSupplementFailedSeeSanitizedReport');
});
