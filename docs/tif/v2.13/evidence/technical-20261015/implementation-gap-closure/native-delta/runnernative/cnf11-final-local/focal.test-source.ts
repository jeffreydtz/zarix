// Runs only after parent release. @ resolves exclusively to immutable COPY730.
import { it, vi } from 'vitest';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
const adapter = vi.hoisted(() => ({ session: null as any, service: null as any, sender: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => adapter.session,
  createServiceClientSync: () => adapter.service, createServiceClient: async () => adapter.service }));
vi.mock('@/lib/telegram/send', () => ({ sendTelegramDm: adapter.sender }));
import { POST as transactionPOST } from '@/app/api/transactions/route';
import { PATCH as transactionPATCH, DELETE as transactionDELETE } from '@/app/api/transactions/[id]/route';
import { POST as importPOST } from '@/app/api/import/transactions/route';
import { POST as sellPOST } from '@/app/api/investments/[id]/sell/route';
import { GET as cronGET } from '@/app/api/cron/recurring/route';
import { GET as outboxGET } from '@/app/api/cron/notification-outbox/route';
import { POST as paymentPOST } from '@/app/api/webhooks/mercado-pago/route';
import { todayYmdAr } from '@/lib/cron/recurring-schedule';

const ROOT = '/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix';
const PRIVATE = '/tmp/zarix-runtime-20261015/implementation-delta-db3cf513-b7ad-4f2b-abcd-a2a44aeed27b';
const FREEZE = '730767b1723502b495d371e69c44df31eb230b56';
type Check = { name: string; passed: boolean };
type Result = { id: string; status: string; checks: Check[]; details?: Record<string, unknown>; errorType?: string };
const digest = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');

it('six local CNF11 protocols, nine literal CNF13 paths and normal-user JWT cron rejection', async () => {
  if (process.env.ZARIX_DELTA_NATIVE_WINDOW !== 'parent-released-frozen-delta' ||
      process.env.ZARIX_ISOLATED_DATABASE_CONFIRM !== 'synthetic-only') throw new Error('ParentReleaseRequired');
  const output = process.env.ZARIX_FOCAL_OUTPUT ?? '';
  if (!new RegExp('^' + PRIVATE + '/cnf11-final-local-attempt-[1-9][0-9]*$').test(output)) throw new Error('OutputPathRejected');
  const rawConsole: unknown[][] = [];
  const spies = ['info', 'warn', 'error', 'log'].map(method =>
    vi.spyOn(console, method as 'info').mockImplementation((...args: unknown[]) => { rawConsole.push(args); }));
  const clients: SupabaseClient[] = [];
  const privateNeedles: string[] = [];
  const channels: Result[] = [], correlations: Result[] = [], cronSecurity: Result[] = [];
  let checks: Check[] = [];
  let currentDetails: Record<string, unknown> = {};
  let sql: ((query: string) => any) | undefined;
  let originalProfile: Record<string, unknown> | undefined;
  let deferred: Array<{ id: string; available_at: string }> = [];
  let constraint = false;
  let creditConstraint = false;
  const oversellRequestIds = new Set<string>();
  let oversellArrivals = 0;
  let releaseOversell: (() => void) | undefined;
  let oversellGate: Promise<void> | undefined;
  let beforeHistory: unknown;
  let a: any;
  let b: any;
  let outerFailure = false;
  const cleanup = { profileRestored: false, deferredOutboxRestored: false, controlledConstraintRemoved: true,
    authSessions: null as number | null, authRefreshTokens: null as number | null,
    sdkLogoutResults: [] as Array<{ noError: boolean; errorStatus: number | null }>, historyUnchanged: false };
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
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !['61321', '61329', '61339'].includes(url.port) ||
        url.username || url.password) throw new Error('NonLocalFetchRejected');
    if (url.pathname.endsWith('/rpc/sell_investment_once') && typeof init?.body === 'string') {
      let requestId: unknown;
      try { requestId = JSON.parse(init.body).p_request_id; } catch {}
      if (typeof requestId === 'string' && oversellRequestIds.has(requestId)) {
        oversellArrivals++;
        if (oversellArrivals === 2) releaseOversell?.();
        await oversellGate;
      }
    }
    return actualFetch(input, { ...init, redirect: 'error' });
  };
  const observations = () => rawConsole.flatMap(call => {
    if (call.length !== 1 || typeof call[0] !== 'string') return [];
    try { const row = JSON.parse(call[0]); return row.schema === 'zarix.observation.v1' ? [row] : []; }
    catch { return []; }
  });
  const logsFor = (id: string) => observations().filter(row => row.correlationId === id);
  const rows = (query: string) => { if (!sql) throw new Error('SqlNotReady'); return sql(query); };
  const history = () => rows(`SELECT jsonb_build_object(
    'netWorth',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM net_worth_snapshots n),
    'portfolio',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM portfolio_performance_snapshots p))`);
  const mutate = async (query: any) => {
    const result = await query;
    if (result.error) throw new Error('NativeFixtureMutationFailed');
    return result.data;
  };
  let meta: any, serviceMeta: any, cookie = '', userJWT = '';
  // Literal sentinels exist only at runtime, never in published rows/logs/images.
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
  const imageNeedles = [imageBase64, image.toString('hex'), JSON.stringify(image), image.toString('latin1')];
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
  const channelSnapshot = (ids: string[], extras = '') => ({ accounts: accountSnapshot(ids),
    transactions: rows(`SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t WHERE account_id IN (${ids.map(id => "'" + id + "'").join(',')})`),
    ...(extras ? { extra: rows(extras) } : {}) });
  const repeat = async (command: () => Promise<Response>, expectedStatus: number, snapshot: () => unknown, sameReply = true, discardInitialReply = false) => {
    const responses: Array<Record<string, unknown>> = [];
    const firstResponse = await command();
    const first = { status: firstResponse.status, body: discardInitialReply ? undefined : await firstResponse.json() };
    check('Initial command status', first.status, expectedStatus);
    responses.push({ phase: 'initial', index: 0, status: first.status });
    const state = snapshot();
    for (let index = 1; index <= 2; index++) {
      const response = await parse(await command());
      check('Sequential replay status', response.status, expectedStatus);
      if (discardInitialReply && first.body === undefined) first.body = response.body;
      if (sameReply) check('Sequential reply is the durable original', response.body, first.body);
      check('Sequential replay has no new financial effect', snapshot(), state);
      responses.push({ phase: 'sequential-replay', index, status: response.status, sameReply: isDeepStrictEqual(response.body, first.body) });
    }
    const concurrent = await Promise.all(Array.from({ length: 10 }, () => command().then(parse)));
    for (const [index, response] of concurrent.entries()) {
      check('Concurrent replay status', response.status, expectedStatus);
      if (sameReply) check('Concurrent reply is the durable original', response.body, first.body);
      responses.push({ phase: 'concurrent-replay', index, status: response.status, sameReply: isDeepStrictEqual(response.body, first.body) });
    }
    check('Ten concurrent replays have no new financial effect', snapshot(), state);
    currentDetails = { invocations: 13, sequentialReplays: 2, concurrentReplays: 10, concurrentPhaseStartsAfterInitialCommit: true,
      initialReplyDeliberatelyDiscardedByConsumer: discardInitialReply, networkResponseLossInjected: false,
      outcomes: responses, snapshotAfterInitialSha256: digest(state), snapshotAfterReplaysSha256: digest(snapshot()) };
    return first.body;
  };
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
    meta = await jsonFile(PRIVATE + '/targets.metadata.json');
    serviceMeta = await jsonFile(PRIVATE + '/services.metadata.json');
    if (meta.existingEnvironmentFile !== '/tmp/zarix-runtime-20261015/proof.env' ||
        !/^zarix_delta_[0-9a-f]{32}$/.test(meta.newDatabaseName)) throw new Error('MetadataGuardRejected');
    const values = dotenv.parse(await privateFile(meta.existingEnvironmentFile));
    const cronValues = dotenv.parse(await privateFile('/tmp/zarix-runtime-20261015/e2e-app.env'));
    const database = new URL(values.ZARIX_PROOF_DATABASE_URL);
    if (database.hostname !== '127.0.0.1' || database.port !== '58322' || database.pathname !== '/postgres' || database.search || database.hash) throw new Error('DatabaseGuardRejected');
    const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
    Object.assign(pgEnv, { PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: '58322', PGDATABASE: meta.newDatabaseName,
      PGUSER: 'supabase_admin', PGPASSWORD: decodeURIComponent(database.password), PGAPPNAME: 'zarix-cnf11-focal', PGCONNECT_TIMEOUT: '10' });
    sql = query => {
      const child = spawnSync(path.join(meta.pgBin, 'psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
        { cwd: ROOT, env: pgEnv, input: query + '\n', encoding: 'utf8', timeout: 15_000, maxBuffer: 5 * 1024 * 1024 });
      if (child.status !== 0) throw new Error('NativeSqlFailed');
      const value = child.stdout.trim(); return value ? JSON.parse(value) : null;
    };
    if (rows('SELECT to_json(current_database())') !== meta.newDatabaseName ||
        rows('SELECT count(*) FROM auth.sessions') !== 0 || rows('SELECT count(*) FROM auth.refresh_tokens') !== 0) throw new Error('CloneAuthBaselineRejected');
    beforeHistory = history();
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
      if (user.id === a.id) { adapter.session = client; userJWT = result.data.session.access_token;
        cookie = 'sb-local-auth-token=' + result.data.session.access_token; privateNeedles.push(cookie); }
    }
    privateNeedles.push(values.ZARIX_PROOF_ANON_KEY, values.ZARIX_PROOF_SERVICE_ROLE_KEY, decodeURIComponent(database.password),
      cronValues.CRON_SECRET, process.env.MP_ACCESS_TOKEN!, process.env.MP_WEBHOOK_SECRET!);
    originalProfile = rows(`SELECT jsonb_build_object('status',status,'current_period_end',current_period_end,
      'grace_period_end',grace_period_end,'mp_preapproval_id',mp_preapproval_id,'telegram_chat_id',telegram_chat_id) FROM users WHERE id='${a.id}'`);
    await mutate(adapter.service.from('users').update({ status: 'ACTIVE', current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
      grace_period_end: null, telegram_chat_id: -8613000013 }).eq('id', a.id));
    await group(channels, 'manual-expense-1500', async () => {
      const id = await account('CNF11 expense ' + randomUUID()), requestId = randomUUID();
      const snapshot = () => channelSnapshot([id], `SELECT jsonb_agg(to_jsonb(r) ORDER BY request_id) FROM transaction_requests r WHERE user_id='${a.id}' AND request_id='${requestId}'`);
      const response = await repeat(() => transaction(id, requestId, 1500), 201, snapshot, true, true);
      check('One expense with amount1500', rows(`SELECT jsonb_build_object('count',count(*),'sum',sum(amount)) FROM transactions WHERE account_id='${id}' AND type='expense'`), { count: 1, sum: 1500 });
      check('Balance8500', rows(`SELECT balance FROM accounts WHERE id='${id}'`), 8500);
      check('Exactly one durable receipt points to expense', rows(`SELECT count(*) FROM transaction_requests WHERE user_id='${a.id}' AND request_id='${requestId}' AND response->>'id'='${response.id}'`), 1);
      currentDetails.oracle = { transactionRows: 1, receiptRows: 1, amount: 1500, balance: 8500 };
    });
    await group(channels, 'transfer-1500', async () => {
      const source = await account('CNF11 transfer source ' + randomUUID()), destination = await account('CNF11 transfer destination ' + randomUUID(), 'ARS', 2000), requestId = randomUUID();
      const snapshot = () => channelSnapshot([source, destination], `SELECT jsonb_agg(to_jsonb(r)) FROM transaction_requests r WHERE user_id='${a.id}' AND request_id='${requestId}'`);
      const original = await repeat(() => transaction(source, requestId, 1500, { type: 'transfer', destinationAccountId: destination }), 201, snapshot);
      check('Source8500 destination3500 total12000', rows(`SELECT jsonb_build_object('source',(SELECT balance FROM accounts WHERE id='${source}'),'destination',(SELECT balance FROM accounts WHERE id='${destination}'),'total',(SELECT sum(balance) FROM accounts WHERE id IN ('${source}','${destination}')))`), { source: 8500, destination: 3500, total: 12000 });
      check('One transfer one receipt', rows(`SELECT jsonb_build_object('rows',(SELECT count(*) FROM transactions WHERE account_id='${source}' AND type='transfer'),'receipts',(SELECT count(*) FROM transaction_requests WHERE user_id='${a.id}' AND request_id='${requestId}'))`), { rows: 1, receipts: 1 });
      currentDetails.oracle = { source: 8500, destination: 3500, total: 12000, transferRows: 1, receiptRows: 1 };
      const update = await transactionPATCH(request('/api/transactions/' + original.id,
        { account_id: source, destination_account_id: destination, amount: 2000, currency: 'ARS', type: 'transfer' }),
      { params: Promise.resolve({ id: original.id }) });
      check('Transfer amount edit2000 succeeds', update.status, 200);
      check('Edited legs8000/4000 preserve12000', rows(`SELECT jsonb_build_object('source',(SELECT balance FROM accounts WHERE id='${source}'),'destination',(SELECT balance FROM accounts WHERE id='${destination}'),'total',(SELECT sum(balance) FROM accounts WHERE id IN ('${source}','${destination}')))`), { source: 8000, destination: 4000, total: 12000 });
      check('Updated authoritative account equivalents both2000', rows(`SELECT jsonb_build_object('source',amount_in_account_currency,'destination',destination_amount_in_account_currency) FROM transactions WHERE id='${original.id}'`), { source: 2000, destination: 2000 });
      const deletion = await transactionDELETE(request('/api/transactions/' + original.id), { params: Promise.resolve({ id: original.id }) });
      check('Transfer delete204', deletion.status, 204);
      check('DELETE restores10000/2000 and total12000', rows(`SELECT jsonb_build_object('source',(SELECT balance FROM accounts WHERE id='${source}'),'destination',(SELECT balance FROM accounts WHERE id='${destination}'),'total',(SELECT sum(balance) FROM accounts WHERE id IN ('${source}','${destination}')))`), { source: 10000, destination: 2000, total: 12000 });
      check('Transfer removed but original durable receipt retained', rows(`SELECT jsonb_build_object('rows',(SELECT count(*) FROM transactions WHERE id='${original.id}'),'receipts',(SELECT count(*) FROM transaction_requests WHERE user_id='${a.id}' AND request_id='${requestId}'))`), { rows: 0, receipts: 1 });
      const rollbackSource = await account('CNF11 rollback source ' + randomUUID()), rollbackDestination = await account('CNF11 rollback destination ' + randomUUID(), 'ARS', 2000), rollbackId = randomUUID();
      const rollbackSnapshot = () => channelSnapshot([rollbackSource, rollbackDestination], `SELECT jsonb_agg(to_jsonb(r)) FROM transaction_requests r WHERE user_id='${a.id}' AND request_id='${rollbackId}'`);
      const beforeRollback = rollbackSnapshot();
      rows(`ALTER TABLE accounts ADD CONSTRAINT zarix_cnf11_credit_guard CHECK (id <> '${rollbackDestination}'::uuid OR balance <= 2000) NOT VALID;`); creditConstraint = true;
      try {
        const failed = await transaction(rollbackSource, rollbackId, 1500, { type: 'transfer', destinationAccountId: rollbackDestination });
        check('Destination credit CHECK aborts transfer500', failed.status, 500);
        check('Debit/credit/ledger/receipt all rolled back', rollbackSnapshot(), beforeRollback);
        check('Rollback account sums remain12000', rows(`SELECT sum(balance) FROM accounts WHERE id IN ('${rollbackSource}','${rollbackDestination}')`), 12000);
      } finally { rows('ALTER TABLE accounts DROP CONSTRAINT zarix_cnf11_credit_guard;'); creditConstraint = false; }
      currentDetails.transferMutationAndRollback = { edit: { source: 8000, destination: 4000 }, deleted: { source: 10000, destination: 2000 },
        controlledCreditFailure: true, rollbackLedgerAndReceiptAbsent: true, noTriggerDisabled: true };
    });
    await group(channels, 'import-200-plus-300', async () => {
      const name = 'CNF11 import ' + randomUUID(), id = await account(name), batchId = randomUUID();
      const csv = `Fecha,Tipo,Monto,Moneda,Cuenta,Descripción\n${todayYmdAr()},gasto,200,ARS,${name},Synthetic first\n${todayYmdAr()},gasto,300,ARS,${name},Synthetic second\n`;
      const command = () => {
        const form = new FormData(); form.set('file', new File([csv], 'synthetic.csv', { type: 'text/csv' }));
        form.set('mode', 'import'); form.set('batchId', batchId); form.set('ownerId', a.id);
        return importPOST(new NextRequest('http://127.0.0.1:3006/api/import/transactions', { method: 'POST', body: form }));
      };
      const snapshot = () => channelSnapshot([id], `SELECT jsonb_build_object('batch',(SELECT jsonb_agg(to_jsonb(b)) FROM import_batches b WHERE user_id='${a.id}' AND batch_id='${batchId}'),'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY request_id) FROM transaction_requests r WHERE user_id='${a.id}' AND request_id LIKE 'import:${batchId}:%'))`);
      const response = await repeat(command, 200, snapshot);
      check('Import acknowledges exactly two rows', [response.imported, response.skipped, response.pending], [2, 0, 0]);
      check('Two expenses totaling500 and balance9500', rows(`SELECT jsonb_build_object('rows',(SELECT count(*) FROM transactions WHERE account_id='${id}' AND type='expense'),'amount',(SELECT sum(amount) FROM transactions WHERE account_id='${id}' AND type='expense'),'balance',(SELECT balance FROM accounts WHERE id='${id}'))`), { rows: 2, amount: 500, balance: 9500 });
      check('One batch and exactly two per-row receipts', rows(`SELECT jsonb_build_object('batch',(SELECT count(*) FROM import_batches WHERE user_id='${a.id}' AND batch_id='${batchId}'),'receipts',(SELECT count(*) FROM transaction_requests WHERE user_id='${a.id}' AND request_id LIKE 'import:${batchId}:%'))`), { batch: 1, receipts: 2 });
      currentDetails.oracle = { rows: 2, amount: 500, balance: 9500, batchRows: 1, perRowReceipts: 2 };
    });
    await group(channels, 'cron-400', async () => {
      const id = await account('CNF11 cron ' + randomUUID()), ruleId = randomUUID(), occurrenceId = `recurring:${ruleId}:${todayYmdAr()}`;
      await mutate(adapter.service.from('recurring_rules').insert({ id: ruleId, user_id: a.id, account_id: id, type: 'expense', amount: 400,
        currency: 'ARS', description: 'Synthetic CNF11 recurring', frequency: 'daily', start_date: todayYmdAr(), notification_enabled: true, is_active: true }));
      const snapshot = () => channelSnapshot([id], `SELECT jsonb_build_object('rule',(SELECT to_jsonb(r) FROM recurring_rules r WHERE id='${ruleId}'),'receipts',(SELECT jsonb_agg(to_jsonb(t)) FROM transaction_requests t WHERE user_id='${a.id}' AND request_id='${occurrenceId}'),'outbox',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM notification_outbox n WHERE payload->>'transactionId' IN (SELECT id::text FROM transactions WHERE recurring_rule_id='${ruleId}')))`);
      await repeat(() => cronGET(request('/api/cron/recurring', undefined, { Authorization: 'Bearer ' + cronValues.CRON_SECRET })), 200, snapshot, false);
      check('Exactly one occurrence and balance9600', rows(`SELECT jsonb_build_object('rows',(SELECT count(*) FROM transactions WHERE recurring_rule_id='${ruleId}'),'balance',(SELECT balance FROM accounts WHERE id='${id}'),'receipts',(SELECT count(*) FROM transaction_requests WHERE user_id='${a.id}' AND request_id='${occurrenceId}'),'outbox',(SELECT count(*) FROM notification_outbox WHERE payload->>'transactionId' IN (SELECT id::text FROM transactions WHERE recurring_rule_id='${ruleId}')))`), { rows: 1, balance: 9600, receipts: 1, outbox: 1 });
      currentDetails.oracle = { rows: 1, balance: 9600, receipts: 1, outbox: 1, recurringFinancialIdentity: occurrenceId };
    });
    await group(channels, 'investment-sale-4x120-from10x100', async () => {
      const accountId = await account('CNF11 sale ' + randomUUID(), 'USD', 0, true), positionId = randomUUID(), requestId = randomUUID();
      await mutate(adapter.service.from('investments').insert({ id: positionId, user_id: a.id, account_id: accountId, type: 'stock_us', name: 'Synthetic CNF11 lot',
        quantity: 10, purchase_price: 100, purchase_currency: 'USD', purchase_date: todayYmdAr(), is_active: true, is_manual_price: true, current_price: 120, market_currency: 'USD' }));
      const snapshot = () => channelSnapshot([accountId], `SELECT jsonb_build_object('position',(SELECT to_jsonb(i) FROM investments i WHERE id='${positionId}'),'sales',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM investment_sales s WHERE investment_id='${positionId}'),'receipt',(SELECT jsonb_agg(to_jsonb(r)) FROM investment_sale_requests r WHERE user_id='${a.id}' AND request_id='${requestId}'))`);
      await repeat(() => sellPOST(request('/api/investments/' + positionId + '/sell', { quantity: 4, price: 120, currency: 'USD', soldAt: todayYmdAr() },
        { 'Idempotency-Key': requestId }), { params: Promise.resolve({ id: positionId }) }), 201, snapshot);
      check('One sale quantity4 and realizedUSD80, remaining6', rows(`SELECT jsonb_build_object('sales',(SELECT count(*) FROM investment_sales WHERE investment_id='${positionId}'),'sold',(SELECT sum(quantity) FROM investment_sales WHERE investment_id='${positionId}'),'realized',(SELECT sum(realized_pnl_usd) FROM investment_sales WHERE investment_id='${positionId}'),'remaining',(SELECT quantity FROM investments WHERE id='${positionId}'),'receipts',(SELECT count(*) FROM investment_sale_requests WHERE user_id='${a.id}' AND request_id='${requestId}'))`), { sales: 1, sold: 4, realized: 80, remaining: 6, receipts: 1 });
      check('Sale does not invent a cash ledger movement', rows(`SELECT balance FROM accounts WHERE id='${accountId}'`), 0);
      currentDetails.oracle = { saleRows: 1, sold: 4, realizedUSD: 80, remaining: 6, receiptRows: 1, cashBalance: 0 };
      const racePositionId = randomUUID(), raceIds = [randomUUID(), randomUUID()];
      await mutate(adapter.service.from('investments').insert({ id: racePositionId, user_id: a.id, account_id: accountId, type: 'stock_us', name: 'Synthetic oversell lot',
        quantity: 10, purchase_price: 100, purchase_currency: 'USD', purchase_date: todayYmdAr(), is_active: true, is_manual_price: true, current_price: 120, market_currency: 'USD' }));
      oversellGate = new Promise<void>(resolve => { releaseOversell = resolve; });
      for (const id of raceIds) oversellRequestIds.add(id);
      const deadline = setTimeout(() => releaseOversell?.(), 10_000);
      let saleRace: Array<{ status: number; body: any }>;
      try {
        saleRace = await Promise.all(raceIds.map(requestId => sellPOST(request('/api/investments/' + racePositionId + '/sell',
          { quantity: 6, price: 120, currency: 'USD', soldAt: todayYmdAr() }, { 'Idempotency-Key': requestId }),
        { params: Promise.resolve({ id: racePositionId }) }).then(parse)));
      } finally { clearTimeout(deadline); releaseOversell?.(); oversellRequestIds.clear(); }
      check('Both distinct-ID real sale RPCs reached the scheduling barrier', oversellArrivals, 2);
      check('Exactly one six-unit sale accepted and other rejected', saleRace.map(result => result.status).sort(), [201, 400]);
      check('Race leaves quantity4, one sale and one receipt, never negative', rows(`SELECT jsonb_build_object('remaining',(SELECT quantity FROM investments WHERE id='${racePositionId}'),'sales',(SELECT count(*) FROM investment_sales WHERE investment_id='${racePositionId}'),'receipts',(SELECT count(*) FROM investment_sale_requests WHERE user_id='${a.id}' AND request_id IN ('${raceIds[0]}','${raceIds[1]}')))`), { remaining: 4, sales: 1, receipts: 1 });
      currentDetails.oversellRace = { distinctCommands: 2, eachQuantity: 6, initialQuantity: 10, remainingQuantity: 4,
        accepted: 1, denied: 1, realRpcRequestsAtBarrier: oversellArrivals, actualDatabaseAndProviderResponses: true };
    });
    await group(channels, 'payment-same-active-preapproval-fixed-period', async () => {
      const resourceId = 'zarix-delta-preapproval-nominal', fixedPeriod = '2026-11-06T12:00:00+00:00';
      await mutate(adapter.service.from('users').update({ status: 'ACTIVE', mp_preapproval_id: resourceId,
        current_period_end: fixedPeriod, grace_period_end: null }).eq('id', a.id));
      const resourceSnapshot = () => rows(`SELECT jsonb_build_object('status',status,'period',current_period_end,'grace',grace_period_end,'resource',mp_preapproval_id) FROM users WHERE id='${a.id}'`);
      const ts = String(Date.now()), requestId = randomUUID();
      const signature = createHmac('sha256', process.env.MP_WEBHOOK_SECRET!).update(`id:${resourceId};request-id:${requestId};ts:${ts};`).digest('hex');
      const command = () => paymentPOST(request('/api/webhooks/mercado-pago?data.id=' + resourceId,
        { type: 'subscription_preapproval', data: { id: resourceId } },
        { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` }));
      const before = resourceSnapshot();
      const beforeTransactions = rows('SELECT count(*) FROM transactions');
      const previousBase = process.env.MP_API_BASE_URL;
      process.env.MP_API_BASE_URL = 'http://127.0.0.1:61339';
      try {
        await repeat(command, 200, resourceSnapshot);
        check('Authorized preapproval does not create paid time', resourceSnapshot(), before);
        check('Existing fixed paid period remains unchanged', resourceSnapshot(),
          { status: 'ACTIVE', period: fixedPeriod, grace: null, resource: resourceId });
        check('No financial ledger side effect', rows('SELECT count(*) FROM transactions'), beforeTransactions);
        currentDetails.oracle = { status: 'ACTIVE', preexistingCurrentPeriodEnd: fixedPeriod,
          nextPaymentDateOnlyDidNotExtendPeriod: true, externalMercadoPagoAccepted: false, syntheticHttpFixturePort: 61339 };
      } finally { process.env.MP_API_BASE_URL = previousBase; }
    });
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
      check('DB/service linked to exact committed UUID', logsFor('corr-cnf13-01').filter(event => event.referenceId === row.id).map(event => event.component), ['database', 'service']);
      currentDetails = { amount: 1500, initialBalance: 10000, finalBalance: 8500, transactionId: row.id };
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
    await group(cronSecurity, 'CNF10-normal-user-JWT-denied', async () => {
      const before = rows(`SELECT jsonb_build_object('transactions',(SELECT count(*) FROM transactions),'receipts',(SELECT count(*) FROM transaction_requests),'outbox',(SELECT count(*) FROM notification_outbox),'rules',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM recurring_rules r))`);
      const response = await cronGET(request('/api/cron/recurring', undefined,
        { Authorization: 'Bearer ' + userJWT, 'X-Correlation-ID': 'corr-cnf10-user-jwt' }, true));
      check('A real ordinary Auth JWT cannot authenticate a cron401', response.status, 401);
      check('Real user JWT rejection has no DB effect', rows(`SELECT jsonb_build_object('transactions',(SELECT count(*) FROM transactions),'receipts',(SELECT count(*) FROM transaction_requests),'outbox',(SELECT count(*) FROM notification_outbox),'rules',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM recurring_rules r))`), before);
      check('Only request observations, authentication classification', logsFor('corr-cnf10-user-jwt').length === 2 && logsFor('corr-cnf10-user-jwt').every(event => event.component === 'request') && logsFor('corr-cnf10-user-jwt').at(-1)?.failureClass === 'authentication', true);
    });
  } catch { outerFailure = true; }
  finally {
    if (creditConstraint) { try { rows('ALTER TABLE accounts DROP CONSTRAINT zarix_cnf11_credit_guard;'); creditConstraint = false; } catch {} }
    if (constraint) { try { rows(`ALTER TABLE transactions DROP CONSTRAINT "${sentinels[0]}";`); constraint = false; } catch {} }
    cleanup.controlledConstraintRemoved = !constraint && !creditConstraint;
    try {
      for (const row of deferred) await mutate(adapter.service.from('notification_outbox').update({ available_at: row.available_at }).eq('id', row.id));
      cleanup.deferredOutboxRestored = true;
    } catch {}
    try { if (originalProfile) { await mutate(adapter.service.from('users').update(originalProfile).eq('id', a.id)); cleanup.profileRestored = true; } } catch {}
    for (const client of clients) {
      try { const result = await client.auth.signOut({ scope: 'global' }); cleanup.sdkLogoutResults.push({ noError: !result.error, errorStatus: result.error?.status ?? null }); }
      catch { cleanup.sdkLogoutResults.push({ noError: false, errorStatus: null }); }
    }
    try { if (sql) { cleanup.authSessions = rows('SELECT count(*) FROM auth.sessions'); cleanup.authRefreshTokens = rows('SELECT count(*) FROM auth.refresh_tokens'); cleanup.historyUnchanged = isDeepStrictEqual(history(), beforeHistory); } } catch {}
    vi.unstubAllGlobals();
    for (const spy of spies) spy.mockRestore();
  }
  const captured = JSON.stringify(rawConsole);
  const secretHits = privateNeedles.filter(value => typeof value === 'string' && value.length >= 8 && captured.includes(value)).length;
  const sentinelHits = sentinels.filter(value => captured.includes(value)).length;
  const imageHits = imageNeedles.filter(value => captured.includes(value)).length;
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
  const privacyPass = secretHits === 0 && sentinelHits === 0 && imageHits === 0 && observationContract && !consoleContainsAuthFieldNames;
  const common = { sourceRevision: FREEZE, cloneSchemaRevision: meta?.revision, completedAt: new Date().toISOString(),
    outerFailure, cleanup, browserUsed: false, externalProvidersAccepted: false, rawConsolePersisted: false,
    credentialValuesCopied: false, envFilesCreated: false, sessionsPersisted: false };
  const passed = (list: Result[]) => list.length > 0 && list.every(result => result.status === 'PASS');
  const cleanupPass = cleanup.profileRestored && cleanup.controlledConstraintRemoved && cleanup.deferredOutboxRestored &&
    cleanup.authSessions === 0 && cleanup.authRefreshTokens === 0 && cleanup.historyUnchanged;
  const save = (file: string, report: unknown) => writeFile(path.join(output, file), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await save('cnf11-six-local.json', { ...common, status: channels.length === 6 && passed(channels) && cleanupPass && !outerFailure ? 'PASS' : 'FAIL',
    scope: 'Six local source-handler/API/native-DB replay protocols, explicit local MP fixture, transfer edit/delete and destination-credit CHECK rollback, and a two-command native oversell race. Initial commits precede replay waves. Expense acknowledgement is deliberately discarded by the consumer; no real network-response-loss/restart injected here. No universal RNF06, external provider, UI/load or all-channel first-commit contention acceptance.',
    channels, assertions: channels.reduce((sum, result) => sum + result.checks.length, 0), fullCNF11Status: 'BLOCKED' });
  await save('cnf13-nine-literal.json', { ...common, status: correlations.length === 9 && passed(correlations) && privacyPass && cleanupPass && !outerFailure ? 'PASS' : 'FAIL',
    scope: 'Nine actual COPY730 handler/service/native-DB paths, literal manual1500 fixture, synthetic privacy sentinels and PNG only in RAM. Telegram transport rejects as a double, quotes/MP actual loopback HTTP fixtures, not external integrations or collector/deployment acceptance.',
    correlations, assertions: correlations.reduce((sum, result) => sum + result.checks.length, 0), observationContract,
    observations: nine.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => allowed.has(key)))), privacyPassed: privacyPass });
  await save('cnf10-user-jwt.json', { ...common, status: cronSecurity.length === 1 && passed(cronSecurity) && cleanupPass && secretHits === 0 && !outerFailure ? 'PASS' : 'FAIL',
    scope: 'Actual COPY730 cron handler denies the normal GoTrue user JWT as a cron bearer. No protected cron execution or separate token double.', results: cronSecurity });
  await save('privacy-and-cleanup.json', { ...common, status: privacyPass && cleanupPass && !outerFailure ? 'PASS' : 'FAIL',
    selectedPrivateNeedles: privateNeedles.length, secretHits, sentinelNeedles: sentinels.length, sentinelHits,
    imageRepresentationsCompared: imageNeedles.length, imageHits, capturedConsoleCalls: rawConsole.length,
    allCapturedConsoleCompared: true, imageFixtureGeneratedInMemory: true, fixtureImageSaved: false,
    nineCorrelationObservations: nine.length, totalObservations: observations().length, observationContract,
    consoleContainsAuthFieldNames,
    scope: 'Selected config credentials, both existing passwords, newly issued normal sessions, synthetic cookie, literal sentinel strings and image raw/base64/hex/BufferJSON against all captured console only. No raw logs, values, images or tokens published; not a universal secret-absence claim.' });
  if (!passed(channels) || channels.length !== 6 || !passed(correlations) || correlations.length !== 9 ||
      !passed(cronSecurity) || !privacyPass || !cleanupPass || outerFailure) throw new Error('FocalFailedSeeSafeReports');
}, 180_000);
