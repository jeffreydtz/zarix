// Runs only after parent release. @ resolves exclusively to immutable COPY730.
import { it, vi } from 'vitest';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { isDeepStrictEqual, formatWithOptions } from 'node:util';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
const adapter = vi.hoisted(() => ({ session: null as any, service: null as any, sender: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => adapter.session,
  createServiceClientSync: () => adapter.service, createServiceClient: async () => adapter.service }));
vi.mock('@/lib/telegram/send', () => ({ sendTelegramDm: adapter.sender }));
import { POST as transactionPOST } from '@/app/api/transactions/route';
import { GET as cronGET } from '@/app/api/cron/recurring/route';
import { GET as outboxGET } from '@/app/api/cron/notification-outbox/route';
import { POST as paymentPOST } from '@/app/api/webhooks/mercado-pago/route';
import { todayYmdAr } from '@/lib/cron/recurring-schedule';

const ROOT = '/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix';
const PRIVATE = process.env.ZARIX_CNF13_ROBUST_META_DIR ?? '';
const FREEZE = '730767b1723502b495d371e69c44df31eb230b56';
type Check = { name: string; passed: boolean };
type Result = { id: string; status: string; checks: Check[]; details?: Record<string, unknown>; errorType?: string };

it('nine CNF13 paths with calibrated non-enumerable Error console inspection only', async () => {
  if (process.env.ZARIX_DELTA_NATIVE_WINDOW !== 'parent-released-frozen-delta' ||
      process.env.ZARIX_ISOLATED_DATABASE_CONFIRM !== 'synthetic-only') throw new Error('ParentReleaseRequired');
  const output = process.env.ZARIX_CNF13_ROBUST_OUTPUT ?? '';
  if (!/^\/tmp\/zarix-runtime-20261015\/[a-z0-9-]{10,120}$/.test(PRIVATE) || !new RegExp('^' + PRIVATE + '/cnf13-robust-only-attempt-[1-9][0-9]*$').test(output)) throw new Error('OutputPathRejected');
  const consoleText: string[] = [];
  const inspectionOptions = { showHidden: true, depth: null, maxStringLength: Infinity,
    maxArrayLength: Infinity, customInspect: false } as const;
  const methods = Object.getOwnPropertyNames(console).filter(method => !method.startsWith('_') &&
    method !== 'Console' && typeof (console as any)[method] === 'function');
  const spies = methods.map(method =>
    vi.spyOn(console as any, method).mockImplementation((...args: unknown[]) => {
      consoleText.push(formatWithOptions(inspectionOptions, ...args));
    }));
  const clients: SupabaseClient[] = [];
  const privateNeedles: string[] = [];
  const correlations: Result[] = [];
  let checks: Check[] = [];
  let currentDetails: Record<string, unknown> = {};
  let sql: ((query: string) => any) | undefined;
  let originalProfile: Record<string, unknown> | undefined;
  let deferred: Array<{ id: string; available_at: string }> = [];
  let constraint = false;
  let beforeHistory: unknown;
  let beforePreferences: unknown;
  let beforeOriginalRows: unknown;
  const baselineIds: Record<string, string[]> = {};
  let calibration: Record<string, unknown> = { status: 'NOT_RUN' };
  let a: any;
  let b: any;
  let outerFailure = false;
  const cleanup = { profileRestored: false, deferredOutboxRestored: false, controlledConstraintRemoved: true,
    authSessions: null as number | null, authRefreshTokens: null as number | null,
    sdkLogoutResults: [] as Array<{ noError: boolean; errorStatus: number | null }>, historyUnchanged: false,
    preferencesUnchanged: false, existingFinancialRowsUnchanged: false };
  const check = (name: string, actual: unknown, expected: unknown) => {
    const passed = isDeepStrictEqual(actual, expected);
    checks.push({ name, passed });
    if (!passed) throw new Error('FocalAssertionFailure');
  };
  const group = async (list: Result[], id: string, fn: () => Promise<void>) => {
    checks = []; currentDetails = {};
    try { await fn(); list.push({ id, status: 'PASS', checks, details: currentDetails }); }
    catch (error: any) { list.push({ id, status: 'FAIL', checks, details: currentDetails,
      errorType: ['Error', 'SyntaxError', 'TypeError'].includes(error?.name) ? error.name : 'Error' }); }
  };
  const privateFile = async (file: string) => {
    const item = await lstat(file);
    if (item.isSymbolicLink() || (item.mode & 0o077) !== 0) throw new Error('PrivateFileRejected');
    return readFile(file);
  };
  const jsonFile = async (file: string) => JSON.parse((await privateFile(file)).toString());
  const actualFetch = globalThis.fetch.bind(globalThis);
  const localFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !['61321', '61329'].includes(url.port) ||
        url.username || url.password) throw new Error('NonLocalFetchRejected');
    return actualFetch(input, { ...init, redirect: 'error' });
  };
  const observations = () => consoleText.flatMap(text => {
    try { const row = JSON.parse(text); return row.schema === 'zarix.observation.v1' ? [row] : []; }
    catch { return []; }
  });
  const logsFor = (id: string) => observations().filter(row => row.correlationId === id);
  const rows = (query: string) => { if (!sql) throw new Error('SqlNotReady'); return sql(query); };
  const history = () => rows(`SELECT jsonb_build_object(
    'netWorth',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM net_worth_snapshots n),
    'portfolio',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM portfolio_performance_snapshots p))`);
  const existingTables = ['accounts', 'transactions', 'investments', 'investment_sales', 'recurring_rules',
    'notification_outbox', 'net_worth_snapshots', 'portfolio_performance_snapshots', 'transaction_deletion_audit'];
  const preferences = () => rows("SELECT jsonb_agg(jsonb_build_object('id',id,'currency',default_currency,'visible',net_worth_widget_visible) ORDER BY id) FROM users");
  const existingFinancialRows = () => Object.fromEntries(existingTables.map(table => {
    const ids = baselineIds[table] ?? [];
    if (!ids.every(id => /^[0-9a-f-]{36}$/.test(id))) throw new Error('ExistingRowIdentityRejected');
    const filter = ids.length ? `id IN (${ids.map(id => "'" + id + "'").join(',')})` : 'false';
    return [table, rows(`SELECT jsonb_build_object('count',count(*),'digest',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY id),''))) FROM public.${table} t WHERE ${filter}`)];
  }));
  const mutate = async (query: any) => {
    const result = await query;
    if (result.error) throw new Error('NativeFixtureMutationFailed');
    return result.data;
  };
  let meta: any, serviceMeta: any, cookie = '';
  // Synthetic sentinels are not published in reports/logs/image files. The
  // valid movement deliberately retains its synthetic notes in the private DB.
  const sentinels = ['SECRETO', 'SUELDO_PRIVADO', 'IMAGEN'].map(prefix => prefix + '_' + 'CNF13');
  const crc32 = (buffer: Buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind: string, data: Buffer) => {
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const value = Buffer.concat([Buffer.from(kind), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(value));
    return Buffer.concat([size, value, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const image = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('fixture\0' + sentinels[2] + ':' + randomUUID())),
    chunk('IDAT', deflateSync(Buffer.from([0, 30, 90, 180, 255]))), chunk('IEND', Buffer.alloc(0))]);
  const imageBase64 = image.toString('base64');
  const normalized = (value: string) => value.replace(/\s/g, '');
  const imageNeedles = [imageBase64, image.toString('hex'),
    formatWithOptions(inspectionOptions, '%O', image.toString('latin1')),
    image.toJSON().data.join(',')];
  const imageMatches = (corpus: string) => [corpus.includes(imageNeedles[0]), corpus.includes(imageNeedles[1]),
    normalized(corpus).includes(normalized(imageNeedles[2])) || corpus.includes(image.toString('latin1')),
    normalized(corpus).includes(normalized(imageNeedles[3])) || corpus.includes(JSON.stringify(image))];
  const calibrateCapture = () => {
    const cause = new Error(sentinels[1] + ':' + image.toString('hex'));
    cause.stack = 'CANARY_CAUSE_STACK_' + sentinels[1];
    const canary = new Error(sentinels[0] + ':' + imageBase64, { cause });
    canary.stack = 'CANARY_STACK_' + sentinels[2];
    Object.defineProperty(canary, 'imageBytes', { value: image, enumerable: false });
    Object.defineProperty(canary, 'imageLatin1', { value: image.toString('latin1'), enumerable: false });
    console.error(canary);
    const corpus = consoleText.join('\n');
    const proof = { status: 'PASS', errorMessageCaptured: corpus.includes(canary.message),
      errorStackCaptured: corpus.includes(canary.stack), errorCauseMessageCaptured: corpus.includes(cause.message),
      errorCauseStackCaptured: corpus.includes(cause.stack), nonEnumerableErrorFieldsUsed: true,
      literalSentinelCategoriesCaptured: sentinels.filter(value => corpus.includes(value)).length,
      imageRepresentationCategoriesCaptured: imageMatches(corpus).filter(Boolean).length,
      consoleCallsBeforeClear: consoleText.length, consoleCallsAfterClear: 0, performedBeforeAnyAuthOrDatabaseOperation: true };
    const passed = proof.errorMessageCaptured && proof.errorStackCaptured && proof.errorCauseMessageCaptured &&
      proof.errorCauseStackCaptured && proof.literalSentinelCategoriesCaptured === 3 && proof.imageRepresentationCategoriesCaptured === 4;
    consoleText.length = 0;
    proof.consoleCallsAfterClear = consoleText.length;
    proof.status = passed && proof.consoleCallsAfterClear === 0 ? 'PASS' : 'FAIL';
    return proof;
  };
  const request = (route: string, body?: unknown, headers: Record<string, string> = {}, privacy = false) => new NextRequest(
    'http://127.0.0.1:3006' + route, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      headers: { ...headers, ...(privacy ? { 'X-Synthetic-Private': sentinels.join(' ') + ' ' + imageBase64, Cookie: cookie } : {}) } });
  const transaction = async (account: string, requestId: string, amount: number, extra: Record<string, unknown> = {}, correlation?: string) =>
    transactionPOST(request('/api/transactions', { accountId: account, type: 'expense', amount, currency: 'ARS',
      transactionDate: todayYmdAr() + 'T12:00:00.000Z', ...(correlation ? { description: sentinels[1], notes: imageBase64,
        image: { mimeType: 'image/png', data: imageBase64 } } : {}), ...extra },
    { 'Idempotency-Key': requestId, ...(correlation ? { 'X-Correlation-ID': correlation } : {}) }, Boolean(correlation)));
  const parse = async (response: Response) => ({ status: response.status, body: await response.json() });
  const accountSnapshot = (ids: string[]) => rows(`SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM accounts a WHERE id IN (${ids.map(id => "'" + id + "'").join(',')})`);
  const account = async (name: string, currency = 'ARS', initial = 10000, investment = false) => {
    const id = randomUUID();
    await mutate(adapter.service.from('accounts').insert({ id, user_id: a.id, name, type: investment ? 'investment' : 'bank',
      currency, include_in_total: false, include_in_liquid: false }));
    if (initial > 0) await mutate(adapter.service.from('transactions').insert({ user_id: a.id, account_id: id,
      type: 'adjustment', amount: initial, currency, amount_in_account_currency: initial,
      transaction_date: todayYmdAr() + 'T12:00:00.000Z', description: 'Synthetic focal opening' }));
    return id;
  };
  try {
    calibration = calibrateCapture();
    if (calibration.status !== 'PASS') throw new Error('ConsoleCanaryCalibrationFailed');
    meta = await jsonFile(PRIVATE + '/targets.metadata.json');
    serviceMeta = await jsonFile(PRIVATE + '/services.metadata.json');
    if (meta.existingEnvironmentFile !== '/tmp/zarix-runtime-20261015/proof.env' ||
        meta.newDatabaseName !== 'zarix_delta_e4bd026f703549bfa24de940134184b8') throw new Error('MetadataGuardRejected');
    const values = dotenv.parse(await privateFile(meta.existingEnvironmentFile));
    const cronValues = dotenv.parse(await privateFile('/tmp/zarix-runtime-20261015/e2e-app.env'));
    const database = new URL(values.ZARIX_PROOF_DATABASE_URL);
    if (database.hostname !== '127.0.0.1' || database.port !== '58322' || database.pathname !== '/postgres' || database.search || database.hash) throw new Error('DatabaseGuardRejected');
    const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
    Object.assign(pgEnv, { PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: '58322', PGDATABASE: meta.newDatabaseName,
      PGUSER: 'supabase_admin', PGPASSWORD: decodeURIComponent(database.password), PGAPPNAME: 'zarix-cnf13-robust', PGCONNECT_TIMEOUT: '10' });
    sql = query => {
      const child = spawnSync(path.join(meta.pgBin, 'psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
        { cwd: ROOT, env: pgEnv, input: query + '\n', encoding: 'utf8', timeout: 15_000, maxBuffer: 5 * 1024 * 1024 });
      if (child.status !== 0) throw new Error('NativeSqlFailed');
      const value = child.stdout.trim(); return value ? JSON.parse(value) : null;
    };
    if (rows('SELECT to_json(current_database())') !== meta.newDatabaseName ||
        rows('SELECT count(*) FROM auth.sessions') !== 0 || rows('SELECT count(*) FROM auth.refresh_tokens') !== 0) throw new Error('CloneAuthBaselineRejected');
    beforeHistory = history();
    beforePreferences = preferences();
    for (const table of existingTables) baselineIds[table] = rows(`SELECT COALESCE(jsonb_agg(id::text ORDER BY id),'[]') FROM public.${table}`);
    beforeOriginalRows = existingFinancialRows();
    vi.stubGlobal('fetch', localFetch);
    const newClient = (key: string) => createClient('http://127.0.0.1:61321', key,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }, global: { fetch: localFetch } });
    adapter.service = newClient(values.ZARIX_PROOF_SERVICE_ROLE_KEY);
    const users = (await jsonFile(meta.loginFile)).users;
    if (users.length !== 2 || !users.every((user: any) => /^[0-9a-f-]{36}$/.test(user.id) && /^zarix-.+@example\.invalid$/.test(user.email))) throw new Error('ExistingSyntheticIdentitiesRequired');
    [a, b] = users;
    for (const user of users) {
      const client = newClient(values.ZARIX_PROOF_ANON_KEY);
      const result = await client.auth.signInWithPassword({ email: user.email, password: user.password });
      if (result.error || !result.data.session || result.data.user?.id !== user.id) throw new Error('NormalAuthFailed');
      clients.push(client);
      privateNeedles.push(user.password, result.data.session.access_token, result.data.session.refresh_token);
      if (user.id === a.id) { adapter.session = client;
        cookie = 'sb-local-auth-token=' + result.data.session.access_token; privateNeedles.push(cookie); }
    }
    privateNeedles.push(values.ZARIX_PROOF_ANON_KEY, values.ZARIX_PROOF_SERVICE_ROLE_KEY, decodeURIComponent(database.password),
      cronValues.CRON_SECRET, process.env.MP_ACCESS_TOKEN!, process.env.MP_WEBHOOK_SECRET!);
    originalProfile = rows(`SELECT jsonb_build_object('status',status,'current_period_end',current_period_end,
      'grace_period_end',grace_period_end,'mp_preapproval_id',mp_preapproval_id,'telegram_chat_id',telegram_chat_id) FROM users WHERE id='${a.id}'`);
    await mutate(adapter.service.from('users').update({ status: 'ACTIVE', current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
      grace_period_end: null, telegram_chat_id: -8613000013 }).eq('id', a.id));
    const manualId = await account('CNF13 literal expense ' + randomUUID());
    const financialState = () => ({ account: accountSnapshot([manualId]),
      transactions: rows(`SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t WHERE account_id='${manualId}'`),
      receipts: rows(`SELECT count(*) FROM transaction_requests WHERE user_id='${a.id}'`) });
    await group(correlations, 'corr-cnf13-01', async () => {
      const response = await transaction(manualId, randomUUID(), 1500, {}, 'corr-cnf13-01');
      check('Literal expense1500 status201', response.status, 201);
      check('Fixed correlation returned', response.headers.get('x-correlation-id'), 'corr-cnf13-01');
      const row = await response.json();
      check('Balance8500', rows(`SELECT balance FROM accounts WHERE id='${manualId}'`), 8500);
      check('One committed expense1500', rows(`SELECT jsonb_build_object('count',count(*),'sum',sum(amount)) FROM transactions WHERE account_id='${manualId}' AND type='expense'`), { count: 1, sum: 1500 });
      check('Synthetic image remains only in the new private fixture note, never an image file',
        rows(`SELECT count(*) FROM transactions WHERE id='${row.id}' AND notes='${imageBase64}'`), 1);
      check('DB/service linked to exact committed UUID', logsFor('corr-cnf13-01').filter(event => event.referenceId === row.id).map(event => event.component), ['database', 'service']);
      currentDetails = { amount: 1500, initialBalance: 10000, finalBalance: 8500, transactionId: row.id,
        syntheticImageBase64PrivateFixtureNoteRows: 1, imageFileCreated: false };
    });
    await group(correlations, 'corr-cnf13-02', async () => {
      const before = financialState();
      const response = await transaction(manualId, randomUUID(), -1, {}, 'corr-cnf13-02');
      check('Negative amount400', response.status, 400);
      check('Validation correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-02');
      check('Negative amount creates no row or receipt', financialState(), before);
      check('Validation classified', logsFor('corr-cnf13-02').at(-1)?.failureClass, 'validation');
    });
    await group(correlations, 'corr-cnf13-03', async () => {
      const before = financialState();
      rows(`ALTER TABLE transactions ADD CONSTRAINT "${sentinels[0]}" CHECK (account_id <> '${manualId}'::uuid) NOT VALID;`); constraint = true;
      try {
        const response = await transaction(manualId, randomUUID(), 1500, {}, 'corr-cnf13-03');
        check('Real SQL rejection500', response.status, 500);
        check('SQL correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-03');
        check('No partial SQL effect or receipt', financialState(), before);
        check('SQL classified consistency', logsFor('corr-cnf13-03').at(-1)?.failureClass, 'consistency');
        const publicFailure = JSON.stringify(await response.json());
        check('Public failure has no sentinel or image', [...sentinels, ...imageNeedles].some(value => publicFailure.includes(value)), false);
      } finally { rows(`ALTER TABLE transactions DROP CONSTRAINT "${sentinels[0]}";`); constraint = false; }
    });
    let newRecurringId = '', newOutboxId = '';
    await group(correlations, 'corr-cnf13-04', async () => {
      const accountId = await account('CNF13 cron ' + randomUUID()), ruleId = randomUUID();
      await mutate(adapter.service.from('recurring_rules').insert({ id: ruleId, user_id: a.id, account_id: accountId, type: 'expense', amount: 400,
        currency: 'ARS', description: sentinels[1], frequency: 'daily', start_date: todayYmdAr(), notification_enabled: true, is_active: true }));
      const response = await cronGET(request('/api/cron/recurring', undefined,
        { Authorization: 'Bearer ' + cronValues.CRON_SECRET, 'X-Correlation-ID': 'corr-cnf13-04' }, true));
      check('Cron valid200', response.status, 200);
      check('Cron correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-04');
      check('Exactly one new400 occurrence', rows(`SELECT jsonb_build_object('count',count(*),'sum',sum(amount)) FROM transactions WHERE recurring_rule_id='${ruleId}'`), { count: 1, sum: 400 });
      newRecurringId = rows(`SELECT to_json(id) FROM transactions WHERE recurring_rule_id='${ruleId}'`);
      newOutboxId = rows(`SELECT to_json(id) FROM notification_outbox WHERE payload->>'transactionId'='${newRecurringId}'`);
      check('Cron event links committed transaction', logsFor('corr-cnf13-04').some(event => event.referenceId === newRecurringId && event.component === 'database' && event.outcome === 'success'), true);
    });
    await group(correlations, 'corr-cnf13-05', async () => {
      const before = rows('SELECT count(*) FROM transactions');
      const response = await cronGET(request('/api/cron/recurring', undefined,
        { Authorization: 'Bearer invalid-local-fixture', 'X-Correlation-ID': 'corr-cnf13-05' }, true));
      check('Invalid cron token401', response.status, 401);
      check('Invalid cron correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-05');
      check('No new transactions', rows('SELECT count(*) FROM transactions'), before);
      check('Authentication classified', logsFor('corr-cnf13-05').at(-1)?.failureClass, 'authentication');
    });
    await group(correlations, 'corr-cnf13-06', async () => {
      deferred = rows(`SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'available_at',available_at)),'[]') FROM notification_outbox WHERE delivered_at IS NULL AND id<>'${newOutboxId}'`);
      const future = new Date(Date.now() + 86400_000).toISOString();
      for (const row of deferred) await mutate(adapter.service.from('notification_outbox').update({ available_at: future }).eq('id', row.id));
      const financialBefore = rows(`SELECT jsonb_build_object('transactions',(SELECT count(*) FROM transactions),'balance',(SELECT balance FROM accounts WHERE id=(SELECT account_id FROM transactions WHERE id='${newRecurringId}')))`);
      adapter.sender.mockRejectedValue(new Error(sentinels.join(' ') + ' ' + imageBase64));
      const response = await outboxGET(request('/api/cron/notification-outbox', undefined,
        { Authorization: 'Bearer ' + cronValues.CRON_SECRET, 'X-Correlation-ID': 'corr-cnf13-06' }, true));
      check('Dispatcher200 with failure recorded', response.status, 200);
      check('Outbox correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-06');
      const payload = await response.json(); check('Exactly one failure and zero delivery', [payload.delivered, payload.failed], [0, 1]);
      check('Explicit Telegram double called once', adapter.sender.mock.calls.length, 1);
      check('Financial commit retained', rows(`SELECT jsonb_build_object('transactions',(SELECT count(*) FROM transactions),'balance',(SELECT balance FROM accounts WHERE id=(SELECT account_id FROM transactions WHERE id='${newRecurringId}')))`), financialBefore);
      check('Native event remains pending retry with generic error', rows(`SELECT jsonb_build_object('attempts',attempts,'delivered',delivered_at,'error',last_error) FROM notification_outbox WHERE id='${newOutboxId}'`), { attempts: 1, delivered: null, error: 'Entrega no confirmada' });
      check('Outbox log links event and committed transaction', logsFor('corr-cnf13-06').some(event => event.component === 'outbox' && event.outcome === 'error' && event.referenceId === newOutboxId && event.transactionId === newRecurringId && event.failureClass === 'provider'), true);
    });
    const control = await jsonFile(serviceMeta.providerControlFile);
    if (control.purpose !== 'zarix-delta-provider-control' || control.userId !== a.id) throw new Error('ProviderControlRejected');
    const setProvider = (mp: string) => writeFile(serviceMeta.providerControlFile, JSON.stringify({ ...control, mp }) + '\n', { mode: 0o600 });
    const payment = (id: string, forged = false) => {
      const ts = String(Date.now()), requestId = randomUUID();
      const signature = createHmac('sha256', process.env.MP_WEBHOOK_SECRET!).update(`id:${control.resourceId};request-id:${requestId};ts:${ts};`).digest('hex');
      return paymentPOST(request('/api/webhooks/mercado-pago?data.id=' + control.resourceId, { type: 'subscription_preapproval', data: { id: control.resourceId }, notes: sentinels.join(' '), image: imageBase64 },
        { 'X-Correlation-ID': id, 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${forged ? '0'.repeat(64) : signature}` }, true));
    };
    await group(correlations, 'corr-cnf13-07', async () => {
      await setProvider('valid');
      await mutate(adapter.service.from('users').update({ status: 'ACTIVE', mp_preapproval_id: control.resourceId }).eq('id', a.id));
      const response = await payment('corr-cnf13-07');
      check('Valid local fixture webhook200', response.status, 200);
      check('Valid MP correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-07');
      check('Cancellation persists once', rows(`SELECT to_json(status) FROM users WHERE id='${a.id}'`), 'CANCELED');
      check('Database persistence and provider success observed', logsFor('corr-cnf13-07').some(event => event.component === 'database' && event.action === 'persist' && event.outcome === 'success'), true);
    });
    await group(correlations, 'corr-cnf13-08', async () => {
      const before = rows(`SELECT jsonb_build_object('status',status,'mp_preapproval_id',mp_preapproval_id) FROM users WHERE id='${a.id}'`);
      const response = await payment('corr-cnf13-08', true);
      check('Forged webhook401', response.status, 401);
      check('Forged MP correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-08');
      check('No subscription effect', rows(`SELECT jsonb_build_object('status',status,'mp_preapproval_id',mp_preapproval_id) FROM users WHERE id='${a.id}'`), before);
      check('Authentication classified', logsFor('corr-cnf13-08').at(-1)?.failureClass, 'authentication');
    });
    await group(correlations, 'corr-cnf13-09', async () => {
      await mutate(adapter.service.from('users').update({ status: 'ACTIVE' }).eq('id', a.id));
      const before = rows(`SELECT jsonb_build_object('status',status,'mp_preapproval_id',mp_preapproval_id) FROM users WHERE id='${a.id}'`);
      await setProvider('failure');
      try {
        const response = await payment('corr-cnf13-09');
        check('Real provider503 causes webhook500', response.status, 500);
        check('Provider MP correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-09');
        check('No subscription partial write', rows(`SELECT jsonb_build_object('status',status,'mp_preapproval_id',mp_preapproval_id) FROM users WHERE id='${a.id}'`), before);
        const failures = logsFor('corr-cnf13-09').filter(event => event.outcome === 'error');
        check('Provider/service/request share provider failure class', failures.length === 3 && failures.every(event => event.failureClass === 'provider'), true);
      } finally { await setProvider('valid'); }
    });
  } catch { outerFailure = true; }
  finally {
    if (constraint) { try { rows(`ALTER TABLE transactions DROP CONSTRAINT "${sentinels[0]}";`); constraint = false; } catch {} }
    cleanup.controlledConstraintRemoved = !constraint;
    try {
      for (const row of deferred) await mutate(adapter.service.from('notification_outbox').update({ available_at: row.available_at }).eq('id', row.id));
      const restored = deferred.length ? rows(`SELECT jsonb_agg(jsonb_build_object('id',id,'available_at',available_at) ORDER BY id)
        FROM notification_outbox WHERE id IN (${deferred.map(row => "'" + row.id + "'").join(',')})`) : [];
      cleanup.deferredOutboxRestored = isDeepStrictEqual(restored, [...deferred].sort((left, right) => left.id.localeCompare(right.id)));
    } catch {}
    try { if (originalProfile) {
      await mutate(adapter.service.from('users').update(originalProfile).eq('id', a.id));
      cleanup.profileRestored = isDeepStrictEqual(rows(`SELECT jsonb_build_object('status',status,'current_period_end',current_period_end,
        'grace_period_end',grace_period_end,'mp_preapproval_id',mp_preapproval_id,'telegram_chat_id',telegram_chat_id) FROM users WHERE id='${a.id}'`), originalProfile);
    } } catch {}
    for (const client of clients) {
      try { const result = await client.auth.signOut({ scope: 'global' }); cleanup.sdkLogoutResults.push({ noError: !result.error, errorStatus: result.error?.status ?? null }); }
      catch { cleanup.sdkLogoutResults.push({ noError: false, errorStatus: null }); }
    }
    try { if (sql) { cleanup.authSessions = rows('SELECT count(*) FROM auth.sessions'); cleanup.authRefreshTokens = rows('SELECT count(*) FROM auth.refresh_tokens'); cleanup.historyUnchanged = isDeepStrictEqual(history(), beforeHistory);
      cleanup.preferencesUnchanged = isDeepStrictEqual(preferences(), beforePreferences);
      cleanup.existingFinancialRowsUnchanged = isDeepStrictEqual(existingFinancialRows(), beforeOriginalRows); } } catch {}
    vi.unstubAllGlobals();
    for (const spy of spies) spy.mockRestore();
  }
  const captured = consoleText.join('\n');
  const secretHits = privateNeedles.filter(value => typeof value === 'string' && value.length >= 8 && captured.includes(value)).length;
  const sentinelHits = sentinels.filter(value => captured.includes(value)).length;
  const imageHits = imageMatches(captured).filter(Boolean).length;
  const allowed = new Set(['schema', 'timestamp', 'correlationId', 'channel', 'operation', 'job', 'component', 'action', 'outcome',
    'failureClass', 'referenceType', 'referenceId', 'transactionId', 'status', 'metric', 'value']);
  const nine = observations().filter(row => /^corr-cnf13-0[1-9]$/.test(row.correlationId));
  const observationContract = Array.from({ length: 9 }, (_, index) => 'corr-cnf13-' + String(index + 1).padStart(2, '0')).every(id => {
    const events = nine.filter(row => row.correlationId === id);
    return events.filter(row => row.component === 'request').length === 2 && events.every(row =>
      Object.keys(row).every(key => allowed.has(key)) && Number.isFinite(Date.parse(row.timestamp)) &&
      (row.outcome === 'started' || row.metric === 'zarix_operation_total' && row.value === 1));
  });
  const consoleContainsAuthFieldNames = /access_token|refresh_token|authorization|x-signature|cookie|password/i.test(captured);
  const privacyPass = calibration.status === 'PASS' && secretHits === 0 && sentinelHits === 0 && imageHits === 0 && observationContract && !consoleContainsAuthFieldNames;
  const common = { sourceRevision: FREEZE, cloneSchemaRevision: meta?.revision, completedAt: new Date().toISOString(),
    outerFailure, cleanup, browserUsed: false, externalProvidersAccepted: false, rawConsolePersisted: false,
    credentialValuesCopied: false, envFilesCreated: false, sessionsPersisted: false };
  const passed = (list: Result[]) => list.length > 0 && list.every(result => result.status === 'PASS');
  const cleanupPass = cleanup.profileRestored && cleanup.controlledConstraintRemoved && cleanup.deferredOutboxRestored &&
    cleanup.authSessions === 0 && cleanup.authRefreshTokens === 0 && cleanup.historyUnchanged &&
    cleanup.preferencesUnchanged && cleanup.existingFinancialRowsUnchanged;
  const save = (file: string, report: unknown) => writeFile(path.join(output, file), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await save('cnf13-nine-robust.json', { ...common, status: correlations.length === 9 && passed(correlations) && privacyPass && cleanupPass && !outerFailure ? 'PASS' : 'FAIL',
    scope: 'Nine actual COPY730 handler/service/native-DB paths, literal manual1500 fixture and positively calibrated non-enumerable Error console capture. Synthetic PNG is generated in RAM and its base64 may reside in private fixture DB notes, never an image/log file. Telegram transport rejects as a double, quotes/MP actual loopback HTTP fixtures, not external integrations or collector/deployment acceptance.',
    correlations, assertions: correlations.reduce((sum, result) => sum + result.checks.length, 0), observationContract,
    observations: nine.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => allowed.has(key)))), privacyPassed: privacyPass });
  await save('privacy-and-cleanup.json', { ...common, status: privacyPass && cleanupPass && !outerFailure ? 'PASS' : 'FAIL',
    selectedPrivateNeedles: privateNeedles.length, secretHits, sentinelNeedles: sentinels.length, sentinelHits,
    imageRepresentationsCompared: imageNeedles.length, imageHits, capturedConsoleCalls: consoleText.length, consoleCapture: 'node:util.formatWithOptions',
    options: { showHidden: true, depth: null, maxStringLength: 'Infinity', maxArrayLength: 'Infinity', customInspect: false },
    calibration, consoleMethodsCaptured: methods,
    allCapturedConsoleCompared: true, imageFixtureGeneratedInMemory: true, fixtureImageFileSaved: false,
    syntheticImageBase64MayResideInPrivateFixtureNote: true,
    nineCorrelationObservations: nine.length, totalObservations: observations().length, observationContract,
    consoleContainsAuthFieldNames,
    scope: 'Selected config credentials, both existing passwords, newly issued normal sessions, synthetic cookie, literal sentinels and image base64/hex/inspected-latin1/raw-byte representations against every formatted console call, including Error.message/stack/cause. No raw logs, values, images or tokens published. Scope is limited to the specified representations and captured calls.' });
  await save('canary-calibration.json', calibration);
  if (!passed(correlations) || correlations.length !== 9 || !privacyPass || !cleanupPass || outerFailure)
    throw new Error('RobustNineFailedSeeSafeReports');
}, 180_000);
