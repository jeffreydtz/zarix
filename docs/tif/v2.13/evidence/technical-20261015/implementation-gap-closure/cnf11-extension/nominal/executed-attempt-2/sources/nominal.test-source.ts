// Prepared only. Product imports resolve to the exact f5f362 immutable source copy.
import { it, vi } from 'vitest';
import { readFile, writeFile, appendFile, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { formatWithOptions, isDeepStrictEqual } from 'node:util';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { holdCommittedAcknowledgement, type AcknowledgementAudit } from './held-acknowledgement';

// The sole application adapter replaces Next's request-cookie bridge with real
// normal-Auth clients; the service adapter also returns a real local client.
const adapter = vi.hoisted(() => ({ session: null as any, service: null as any }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => adapter.session,
  createServiceClientSync: () => adapter.service, createServiceClient: async () => adapter.service }));
import { POST as transactionPOST } from '@/app/api/transactions/route';
import { POST as importPOST } from '@/app/api/import/transactions/route';
import { POST as sellPOST } from '@/app/api/investments/[id]/sell/route';
import { GET as cronGET } from '@/app/api/cron/recurring/route';
import { POST as paymentPOST } from '@/app/api/webhooks/mercado-pago/route';
import { todayYmdAr, shouldExecuteToday } from '@/lib/cron/recurring-schedule';
import { effectivePlan } from '@/lib/plans/rules';

const ROOT = '/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix';
const FREEZE = 'f5f362ee9dbb81da5268049cab41b357d90eccf1';
const DATABASE = 'zarix_delta_e4bd026f703549bfa24de940134184b8';
const PLAN_FIELDS = ['status', 'current_period_end', 'grace_period_end', 'mp_preapproval_id'] as const;
const FINANCIAL_TABLES = ['accounts', 'transactions', 'transaction_requests', 'import_batches',
  'investments', 'investment_sales', 'investment_sale_requests', 'recurring_rules',
  'notification_outbox', 'net_worth_snapshots', 'portfolio_performance_snapshots', 'transaction_deletion_audit'];
type Check = { name: string; passed: boolean };
type Protocol = { id: string; status: 'PASS' | 'FAIL'; checks: Check[]; details: Record<string, unknown>; errorType?: string };
type JsonRow = Record<string, any>;
const digest = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');

it('six committed-state acknowledgement timeouts, durable replays and payment SQL rollback', async () => {
  if (process.env.ZARIX_CNF11_EXTENSION_WINDOW !== 'parent-released-cnf11-extension' ||
      process.env.ZARIX_ISOLATED_DATABASE_CONFIRM !== 'synthetic-only') throw new Error('ParentReleaseRequired');
  const targetFile = process.env.ZARIX_CNF11_NOMINAL_TARGET ?? '';
  const output = process.env.ZARIX_CNF11_NOMINAL_OUTPUT ?? '';
  const privateDirectory = path.dirname(targetFile);
  if (!/^\/tmp\/zarix-runtime-20261015\/cnf11-extension-[0-9a-f-]{36}$/.test(privateDirectory) ||
      path.basename(targetFile) !== 'targets.metadata.json' ||
      !new RegExp('^' + privateDirectory + '/nominal-attempt-[1-9][0-9]*$').test(output)) throw new Error('PathGuardRejected');
  const consoleText: string[] = [];
  const consoleMethods = ['assert', 'clear', 'count', 'countReset', 'debug', 'dir', 'dirxml', 'error',
    'group', 'groupCollapsed', 'groupEnd', 'info', 'log', 'table', 'time', 'timeEnd', 'timeLog', 'trace', 'warn'] as const;
  const spies = consoleMethods.map(method => vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    consoleText.push(formatWithOptions({ showHidden: true, depth: null, maxStringLength: Infinity,
      maxArrayLength: Infinity, customInspect: false }, ...args));
  }));
  const privateNeedles: string[] = [];
  const clients: SupabaseClient[] = [];
  const protocols: Protocol[] = [], paymentRollback: Protocol[] = [];
  const fixtures = { accounts: [] as string[], rules: [] as string[], positions: [] as string[] };
  const calls = { transaction: 0, transfer: 0, import: 0, cron: 0, sale: 0, payment: 0, paymentRollback: 0 };
  let checks: Check[] = [], details: Record<string, unknown> = {};
  let a: JsonRow, b: JsonRow, meta: JsonRow;
  let sql: ((query: string) => any) | undefined;
  let originalProfile: JsonRow | undefined, originalB: JsonRow | undefined;
  let originalFinancial: Record<string, JsonRow[]> | undefined;
  let originalHistory: unknown;
  let originalPreferences: unknown;
  let constraintName: string | undefined;
  let fixtureProfileTouched = false;
  let outerFailure = false;
  const cleanup = { planFieldsRestoredExactly: false, allOtherProfileColumnsCompared: false,
    nonPlanColumnsChanged: [] as string[], onlyAutomaticUpdatedAtDelta: false,
    otherUserProfileUnchanged: false, originalFinancialRowsUnchanged: false, historyUnchanged: false,
    preferencesUnchanged: false, newAccountsArchived: false, newRecurringRulesDisabled: false,
    sqlConstraintRemoved: true, authSessions: null as number | null, authRefreshTokens: null as number | null,
    sdkLogoutResults: [] as Array<{ noError: boolean; errorStatus: number | null }> };
  const privateFile = async (file: string) => {
    const stat = await lstat(file);
    if (stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('PrivateFileRejected');
    return readFile(file);
  };
  const privateJson = async (file: string) => JSON.parse((await privateFile(file)).toString());
  const rows = (query: string) => { if (!sql) throw new Error('SqlNotReady'); return sql(query); };
  const check = (name: string, actual: unknown, expected: unknown) => {
    const passed = isDeepStrictEqual(actual, expected);
    checks.push({ name, passed });
    if (!passed) throw new Error('NominalAssertionFailure');
  };
  const group = async (list: Protocol[], id: string, run: () => Promise<void>) => {
    checks = []; details = {};
    try { await run(); list.push({ id, status: 'PASS', checks, details }); }
    catch (error: any) { list.push({ id, status: 'FAIL', checks, details,
      errorType: ['Error', 'SyntaxError', 'TypeError', 'TimeoutError'].includes(error?.name) ? error.name : 'Error' }); }
  };
  const mutate = async (query: any) => {
    const result = await query;
    if (result.error) throw new Error('RealFixtureWriteFailed');
    return result.data;
  };
  const actualFetch = globalThis.fetch.bind(globalThis);
  const localFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !['61321', '61329'].includes(url.port) ||
        url.username || url.password) throw new Error('NonLocalFetchRejected');
    return actualFetch(input, { ...init, redirect: 'error' });
  };
  const request = (route: string, body?: unknown, headers: Record<string, string> = {}) => new NextRequest(
    'http://127.0.0.1:61321' + route, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), headers });
  const transaction = (accountId: string, requestId: string, amount: number, extra: JsonRow = {}) =>
    transactionPOST(request('/api/transactions', { accountId, type: 'expense', amount, currency: 'ARS',
      transactionDate: todayYmdAr() + 'T12:00:00.000Z', description: 'Synthetic CNF11 extension', ...extra },
    { 'Idempotency-Key': requestId }));
  const parse = async (response: Response) => ({ status: response.status, body: await response.json() });
  const history = () => rows(`SELECT jsonb_build_object(
    'netWorth',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM net_worth_snapshots n),
    'portfolio',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM portfolio_performance_snapshots p))`);
  const preferences = () => rows("SELECT jsonb_agg(jsonb_build_object('id',id,'currency',default_currency,'visible',net_worth_widget_visible) ORDER BY id) FROM users");
  const financial = (): Record<string, JsonRow[]> => Object.fromEntries(FINANCIAL_TABLES.map(table =>
    [table, rows(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM public.${table} t`)]));
  const originalRowsStillEqual = (before: Record<string, JsonRow[]>, after: Record<string, JsonRow[]>) =>
    FINANCIAL_TABLES.every(table => {
      const counts = (list: JsonRow[]) => list.reduce<Record<string, number>>((result, row) => {
        const hash = digest(row); result[hash] = (result[hash] ?? 0) + 1; return result;
      }, {});
      const wanted = counts(before[table]), actual = counts(after[table]);
      return Object.entries(wanted).every(([hash, count]) => actual[hash] === count);
    });
  const accountSnapshot = (ids: string[]) => rows(`SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM accounts a
    WHERE id IN (${ids.map(id => "'" + id + "'").join(',')})`);
  const snapshot = (ids: string[], extra: string) => ({ accounts: accountSnapshot(ids),
    transactions: rows(`SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t
      WHERE account_id IN (${ids.map(id => "'" + id + "'").join(',')})`), extra: rows(extra) });
  const profile = () => rows(`SELECT to_jsonb(u) FROM users u WHERE id='${a.id}'`);
  const journal = async (kind: string, id: string) => {
    if (!['account', 'rule', 'position', 'constraint'].includes(kind) || !/^[a-z0-9_-]{1,80}$/.test(id)) throw new Error('FixtureJournalValueRejected');
    await appendFile(path.join(output, 'fixture-identities.jsonl'), JSON.stringify({ kind, id,
      ownerId: a.id, sourceRevision: FREEZE, recordedBeforeMutation: true }) + '\n', { mode: 0o600 });
  };
  const account = async (name: string, currency = 'ARS', initial = 10000, investment = false) => {
    const id = randomUUID();
    fixtures.accounts.push(id);
    await journal('account', id);
    await mutate(adapter.service.from('accounts').insert({ id, user_id: a.id, name,
      type: investment ? 'investment' : 'bank', currency, include_in_total: false, include_in_liquid: false }));
    if (initial > 0) await mutate(adapter.service.from('transactions').insert({ user_id: a.id, account_id: id,
      type: 'adjustment', amount: initial, currency, amount_in_account_currency: initial,
      transaction_date: todayYmdAr() + 'T12:00:00.000Z', description: 'Synthetic CNF11 extension opening' }));
    return id;
  };
  const archive = async (ids: string[]) => {
    for (const id of ids) await mutate(adapter.service.from('accounts').update({ is_active: false }).eq('id', id).eq('user_id', a.id));
  };
  const repeatAfterTimeout = async (command: () => Promise<Response>, expectedStatus: number,
    verifyCommitted: () => void, state: () => unknown, sameReply = true, noOp = false) => {
    const audit: AcknowledgementAudit = { scope: 'in-process-handler-consumer-boundary',
      stage: noOp ? 'no-op-confirmed' : 'mutation-committed', responseForwardedToConsumer: false, commitOracleConfirmed: false };
    details.acknowledgement = audit;
    let caught: unknown;
    try {
      await holdCommittedAcknowledgement(command, response => {
        check('Upstream handler returned expected status before retention', response.status, expectedStatus);
        verifyCommitted();
      }, audit, 40);
    } catch (error) { caught = error; }
    check('Consumer observed a native DOMException TimeoutError', caught instanceof DOMException && caught.name === 'TimeoutError', true);
    check('Deadline was armed only after the committed-state SQL oracle', Boolean(audit.commitOracleConfirmed &&
      audit.handlerResolvedAtMs! <= audit.sqlOracleConfirmedAtMs! && audit.sqlOracleConfirmedAtMs! <= audit.timeoutStartedAtMs! &&
      audit.timeoutStartedAtMs! <= audit.timeoutFiredAtMs!), true);
    check('Native abort signal supplied the rejected timeout reason', [audit.nativeDomException, audit.nativeSignalAborted, audit.rejectedWithSignalReason], [true, true, true]);
    check('Measured native deadline elapsed after SQL confirmation', audit.timeoutFiredAtMs! - audit.timeoutStartedAtMs! >= audit.deadlineMs! - 1, true);
    check('Retained initial response was never forwarded to consumer', audit.responseForwardedToConsumer, false);
    const afterCommit = state();
    let originalReply: unknown;
    const outcomes: JsonRow[] = [{ phase: 'initial', consumerOutcome: 'TimeoutError', upstreamStatus: audit.upstreamStatus }];
    for (let index = 1; index <= 2; index++) {
      const result = await parse(await command());
      check('Sequential replay returned expected status', result.status, expectedStatus);
      if (index === 1) originalReply = result.body;
      else if (sameReply) check('Sequential replay returned the durable original', result.body, originalReply);
      check('Sequential replay left committed state unchanged', state(), afterCommit);
      outcomes.push({ phase: 'sequential-replay', index, status: result.status });
    }
    const concurrentStartedAtMs = performance.now();
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>(resolve => { releaseBarrier = resolve; });
    let arrivals = 0, inFlight = 0, peakInFlight = 0;
    const concurrentTiming: Array<{ index: number; startedAtMs: number; finishedAtMs?: number }> = [];
    const concurrent = await Promise.all(Array.from({ length: 10 }, async (_unused, index) => {
      arrivals++;
      if (arrivals === 10) releaseBarrier();
      await barrier;
      const timing = { index, startedAtMs: performance.now(), finishedAtMs: undefined as number | undefined };
      concurrentTiming.push(timing);
      inFlight++; peakInFlight = Math.max(peakInFlight, inFlight);
      try { return await command().then(parse); }
      finally { timing.finishedAtMs = performance.now(); inFlight--; }
    }));
    check('Ten replay calls reached the common start barrier', arrivals, 10);
    check('Replay handler calls actually overlapped in process', peakInFlight >= 2, true);
    for (const [index, result] of concurrent.entries()) {
      check('Concurrent replay returned expected status', result.status, expectedStatus);
      if (sameReply) check('Concurrent replay returned the durable original', result.body, originalReply);
      outcomes.push({ phase: 'concurrent-replay', index, status: result.status });
    }
    check('Ten concurrent replays left committed state unchanged', state(), afterCommit);
    verifyCommitted();
    Object.assign(details, { invocations: 13, sequentialReplays: 2, concurrentReplays: 10,
      concurrentStartedAfterTimeout: concurrentStartedAtMs > audit.timeoutFiredAtMs!,
      concurrentStartBarrierArrivals: arrivals, peakInFlightHandlerCalls: peakInFlight, concurrentTiming,
      stateAfterCommitSha256: digest(afterCommit), stateAfterReplaysSha256: digest(state()),
      outcomes, initialBodyParsedOrDiscardedByConsumer: false, physicalNetworkFailure: false,
      firstCommitConcurrencyTested: false, sameReplyRequired: sameReply, stateTransition: noOp ? 'NOOP' : 'COMMITTED' });
    return originalReply as JsonRow;
  };
  try {
    meta = await privateJson(targetFile);
    const serviceMeta = await privateJson(privateDirectory + '/services.metadata.json');
    if (meta.purpose !== 'zarix-cnf11-extension' || meta.newDatabaseName !== DATABASE ||
        meta.sourceRevision !== FREEZE || meta.executionRevision !== FREEZE ||
        meta.sourceCopyRoot !== process.env.ZARIX_CNF11_SOURCE_COPY || meta.apiOrigin !== 'http://127.0.0.1:61321' ||
        meta.providerOrigin !== 'http://127.0.0.1:61329' || serviceMeta.providerOrigin !== meta.providerOrigin ||
        meta.existingEnvironmentFile !== '/tmp/zarix-runtime-20261015/proof.env' ||
        meta.existingCronEnvironmentFile !== '/tmp/zarix-runtime-20261015/e2e-app.env') throw new Error('MetadataGuardRejected');
    const values = dotenv.parse(await privateFile(meta.existingEnvironmentFile));
    const cronValues = dotenv.parse(await privateFile(meta.existingCronEnvironmentFile));
    const database = new URL(values.ZARIX_PROOF_DATABASE_URL);
    if (database.hostname !== '127.0.0.1' || database.port !== '58322' || database.pathname !== '/postgres' ||
        database.search || database.hash || meta.databaseHost !== '127.0.0.1' || meta.databasePort !== 58322) throw new Error('DatabaseGuardRejected');
    const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
    Object.assign(pgEnv, { PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: '58322', PGDATABASE: DATABASE,
      PGUSER: 'supabase_admin', PGPASSWORD: decodeURIComponent(database.password), PGAPPNAME: 'zarix-cnf11-extension-nominal', PGCONNECT_TIMEOUT: '10' });
    sql = query => {
      const child = spawnSync(path.join(meta.pgBin, 'psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
        { cwd: ROOT, env: pgEnv, input: query + '\n', encoding: 'utf8', timeout: 15_000, maxBuffer: 10 * 1024 * 1024 });
      if (child.status !== 0) throw new Error('RealSqlFailed');
      return child.stdout.trim() ? JSON.parse(child.stdout.trim()) : null;
    };
    if (rows('SELECT to_json(current_database())') !== DATABASE || rows('SELECT count(*) FROM auth.sessions') !== 0 ||
        rows('SELECT count(*) FROM auth.refresh_tokens') !== 0) throw new Error('CloneOrAuthBaselineRejected');
    originalHistory = history(); originalPreferences = preferences(); originalFinancial = financial();
    vi.stubGlobal('fetch', localFetch);
    const newClient = (key: string) => createClient(meta.apiOrigin, key,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }, global: { fetch: localFetch } });
    adapter.service = newClient(values.ZARIX_PROOF_SERVICE_ROLE_KEY);
    const users = (await privateJson(meta.loginFile)).users;
    if (users.length !== 2 || !users.every((u: JsonRow) => /^[0-9a-f-]{36}$/.test(u.id) && /^zarix-.+@example\.invalid$/.test(u.email))) throw new Error('ExistingSyntheticIdentitiesRequired');
    [a, b] = users;
    for (const user of users) {
      const client = newClient(values.ZARIX_PROOF_ANON_KEY);
      clients.push(client);
      const result = await client.auth.signInWithPassword({ email: user.email, password: user.password });
      if (result.error || !result.data.session || result.data.user?.id !== user.id) throw new Error('NormalAuthFailed');
      privateNeedles.push(user.password, result.data.session.access_token, result.data.session.refresh_token,
        'sb-local-auth-token=' + result.data.session.access_token);
      if (user.id === a.id) adapter.session = client;
    }
    privateNeedles.push(values.ZARIX_PROOF_ANON_KEY, values.ZARIX_PROOF_SERVICE_ROLE_KEY, decodeURIComponent(database.password),
      cronValues.CRON_SECRET, process.env.MP_ACCESS_TOKEN!, process.env.MP_WEBHOOK_SECRET!);
    originalProfile = profile(); originalB = rows(`SELECT to_jsonb(u) FROM users u WHERE id='${b.id}'`);
    if (rows(`SELECT count(*) FROM accounts WHERE user_id='${a.id}' AND is_active AND movement_enabled`) > 18) throw new Error('InsufficientExistingPlanCapacity');
    // A safe recovery checkpoint precedes the first plan UPDATE. Its four
    // allowlisted restore fields include the resource ID, never Auth secrets.
    await writeFile(path.join(output, 'profile-plan-checkpoint.json'), JSON.stringify({
      purpose: 'cnf11-extension-safe-plan-checkpoint', sourceRevision: FREEZE, database: DATABASE,
      recoveryOwner: 'root; stop sequential writers and inspect SQL before any cleanup',
      userId: a.id, allowedPlanFields: { status: originalProfile.status,
        current_period_end: originalProfile.current_period_end, grace_period_end: originalProfile.grace_period_end,
        mp_preapproval_id: originalProfile.mp_preapproval_id },
      allOtherProfileColumnsSha256: digest(Object.fromEntries(Object.entries(originalProfile).filter(([key]) =>
        !PLAN_FIELDS.includes(key as any)))),
      otherUserProfileSha256: digest(originalB), originalFinancialRowsSha256: digest(originalFinancial),
      exceptionalRecoveryOwner: 'root; private checkpoint restores only the four allowlisted fields after writers stop',
      containsCredentialValues: false, containsMpAssociationValue: originalProfile.mp_preapproval_id !== null,
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fixtureProfileTouched = true;
    await mutate(adapter.service.from('users').update({ status: 'ACTIVE', current_period_end: '2026-11-06T12:00:00.000Z',
      grace_period_end: null }).eq('id', a.id));

    await group(protocols, 'manual-expense-1500', async () => {
      const id = await account('CNF11 extension expense ' + randomUUID()), key = randomUUID();
      try {
        const state = () => snapshot([id], `SELECT jsonb_agg(to_jsonb(r)) FROM transaction_requests r WHERE user_id='${a.id}' AND request_id='${key}'`);
        const oracle = () => check('Exactly one expense1500, one receipt and balance8500', rows(`SELECT jsonb_build_object(
          'rows',(SELECT count(*) FROM transactions WHERE account_id='${id}' AND type='expense'),
          'amount',(SELECT sum(amount) FROM transactions WHERE account_id='${id}' AND type='expense'),
          'balance',(SELECT balance FROM accounts WHERE id='${id}'),
          'receipts',(SELECT count(*) FROM transaction_requests WHERE user_id='${a.id}' AND request_id='${key}'))`),
        { rows: 1, amount: 1500, balance: 8500, receipts: 1 });
        const reply = await repeatAfterTimeout(() => { calls.transaction++; return transaction(id, key, 1500); }, 201, oracle, state);
        check('Durable expense receipt points to returned transaction', rows(`SELECT count(*) FROM transaction_requests WHERE user_id='${a.id}' AND request_id='${key}' AND response->>'id'='${reply.id}'`), 1);
        details.oracle = { expenseRows: 1, amount: 1500, receiptRows: 1, balance: 8500 };
        details.fixtures = { accountId: id, requestId: key };
      } finally { await archive([id]); }
    });
    await group(protocols, 'transfer-1500', async () => {
      const source = await account('CNF11 extension source ' + randomUUID());
      const destination = await account('CNF11 extension destination ' + randomUUID(), 'ARS', 2000), key = randomUUID();
      try {
        const state = () => snapshot([source, destination], `SELECT jsonb_agg(to_jsonb(r)) FROM transaction_requests r WHERE user_id='${a.id}' AND request_id='${key}'`);
        const oracle = () => check('One transfer, receipt and exact debit/credit totals', rows(`SELECT jsonb_build_object(
          'rows',(SELECT count(*) FROM transactions WHERE account_id='${source}' AND destination_account_id='${destination}' AND type='transfer' AND amount=1500),
          'receipts',(SELECT count(*) FROM transaction_requests WHERE user_id='${a.id}' AND request_id='${key}'),
          'source',(SELECT balance FROM accounts WHERE id='${source}'),'destination',(SELECT balance FROM accounts WHERE id='${destination}'),
          'total',(SELECT sum(balance) FROM accounts WHERE id IN ('${source}','${destination}')))`),
        { rows: 1, receipts: 1, source: 8500, destination: 3500, total: 12000 });
        await repeatAfterTimeout(() => { calls.transfer++; return transaction(source, key, 1500, { type: 'transfer', destinationAccountId: destination }); }, 201, oracle, state);
        details.oracle = { transferRows: 1, receiptRows: 1, source: 8500, destination: 3500, total: 12000 };
        details.fixtures = { sourceAccountId: source, destinationAccountId: destination, requestId: key };
        details.rollbackEditDeleteComposition = 'prior-focal-transfer-1500';
      } finally { await archive([source, destination]); }
    });
    await group(protocols, 'import-200-plus-300', async () => {
      const name = 'CNF11 extension import ' + randomUUID(), id = await account(name), batch = randomUUID();
      const csv = `Fecha,Tipo,Monto,Moneda,Cuenta,Descripción\n${todayYmdAr()},gasto,200,ARS,${name},Synthetic first\n${todayYmdAr()},gasto,300,ARS,${name},Synthetic second\n`;
      try {
        const command = () => {
          calls.import++;
          const form = new FormData(); form.set('file', new File([csv], 'synthetic.csv', { type: 'text/csv' }));
          form.set('mode', 'import'); form.set('batchId', batch); form.set('ownerId', a.id);
          return importPOST(new NextRequest('http://127.0.0.1:61321/api/import/transactions', { method: 'POST', body: form }));
        };
        const state = () => snapshot([id], `SELECT jsonb_build_object(
          'batch',(SELECT jsonb_agg(to_jsonb(b)) FROM import_batches b WHERE user_id='${a.id}' AND batch_id='${batch}'),
          'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY request_id) FROM transaction_requests r WHERE user_id='${a.id}' AND request_id LIKE 'import:${batch}:%'))`);
        const oracle = () => check('Two expenses500, one batch, two row receipts and balance9500', rows(`SELECT jsonb_build_object(
          'rows',(SELECT count(*) FROM transactions WHERE account_id='${id}' AND type='expense'),
          'amount',(SELECT sum(amount) FROM transactions WHERE account_id='${id}' AND type='expense'),
          'balance',(SELECT balance FROM accounts WHERE id='${id}'),
          'batches',(SELECT count(*) FROM import_batches WHERE user_id='${a.id}' AND batch_id='${batch}'),
          'receipts',(SELECT count(*) FROM transaction_requests WHERE user_id='${a.id}' AND request_id LIKE 'import:${batch}:%'))`),
        { rows: 2, amount: 500, balance: 9500, batches: 1, receipts: 2 });
        const reply = await repeatAfterTimeout(command, 200, oracle, state);
        check('Import reports two imported rows and zero skipped or pending', [reply.imported, reply.skipped, reply.pending], [2, 0, 0]);
        details.oracle = { expenseRows: 2, amount: 500, balance: 9500, batchRows: 1, perRowReceipts: 2 };
        details.fixtures = { accountId: id, batchId: batch, csvSha256: createHash('sha256').update(csv).digest('hex') };
      } finally { await archive([id]); }
    });
    await group(protocols, 'cron-400', async () => {
      // The actual job scans all rules. Refuse to run if an old fixture would
      // expire or execute today; do not mask or alter an existing rule.
      const active = rows(`SELECT COALESCE(jsonb_agg(jsonb_build_object('rule',to_jsonb(r),'account',to_jsonb(a),'user',to_jsonb(u))),'[]')
        FROM recurring_rules r JOIN accounts a ON a.id=r.account_id JOIN users u ON u.id=r.user_id WHERE r.is_active`);
      const oldWork = active.filter((item: JsonRow) => (item.rule.end_date && item.rule.end_date < todayYmdAr()) ||
        (effectivePlan(item.user) === 'premium' && item.account.is_active !== false && item.account.movement_enabled !== false && shouldExecuteToday(item.rule)));
      check('No previous recurring fixture can be expired or executed by this job', oldWork.length, 0);
      const id = await account('CNF11 extension recurring ' + randomUUID()), rule = randomUUID();
      const occurrence = `recurring:${rule}:${todayYmdAr()}`;
      try {
        fixtures.rules.push(rule);
        await journal('rule', rule);
        await mutate(adapter.service.from('recurring_rules').insert({ id: rule, user_id: a.id, account_id: id, type: 'expense', amount: 400,
          currency: 'ARS', description: 'Synthetic CNF11 extension recurring', frequency: 'daily', start_date: todayYmdAr(), notification_enabled: true, is_active: true }));
        const state = () => snapshot([id], `SELECT jsonb_build_object(
          'rule',(SELECT to_jsonb(r) FROM recurring_rules r WHERE id='${rule}'),
          'receipts',(SELECT jsonb_agg(to_jsonb(t)) FROM transaction_requests t WHERE user_id='${a.id}' AND request_id='${occurrence}'),
          'outbox',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM notification_outbox n WHERE payload->>'transactionId' IN (SELECT id::text FROM transactions WHERE recurring_rule_id='${rule}')))`);
        const oracle = () => check('One occurrence400, receipt, durable undelivered outbox and balance9600', rows(`SELECT jsonb_build_object(
          'rows',(SELECT count(*) FROM transactions WHERE recurring_rule_id='${rule}' AND amount=400),
          'balance',(SELECT balance FROM accounts WHERE id='${id}'),
          'receipts',(SELECT count(*) FROM transaction_requests WHERE user_id='${a.id}' AND request_id='${occurrence}'),
          'outbox',(SELECT count(*) FROM notification_outbox WHERE delivered_at IS NULL AND attempts=0 AND payload->>'transactionId' IN (SELECT id::text FROM transactions WHERE recurring_rule_id='${rule}')),
          'executed',(SELECT last_executed_date FROM recurring_rules WHERE id='${rule}'))`),
        { rows: 1, balance: 9600, receipts: 1, outbox: 1, executed: todayYmdAr() });
        await repeatAfterTimeout(() => { calls.cron++; return cronGET(request('/api/cron/recurring', undefined,
          { Authorization: 'Bearer ' + cronValues.CRON_SECRET })); }, 200, oracle, state, false);
        details.oracle = { occurrenceRows: 1, amount: 400, balance: 9600, receiptRows: 1, outboxRows: 1, outboxAttempts: 0 };
        details.fixtures = { accountId: id, ruleId: rule, occurrenceId: occurrence };
        details.outboxDeliveryInvoked = false; details.chatMappingCreated = false;
      } finally {
        if (fixtures.rules.includes(rule)) await mutate(adapter.service.from('recurring_rules').update({ is_active: false }).eq('id', rule).eq('user_id', a.id));
        await archive([id]);
      }
    });
    await group(protocols, 'investment-sale-4x120-from10x100', async () => {
      const id = await account('CNF11 extension sale ' + randomUUID(), 'USD', 0, true), position = randomUUID(), key = randomUUID();
      try {
        fixtures.positions.push(position);
        await journal('position', position);
        await mutate(adapter.service.from('investments').insert({ id: position, user_id: a.id, account_id: id, type: 'stock_us', name: 'Synthetic CNF11 extension lot',
          quantity: 10, purchase_price: 100, purchase_currency: 'USD', purchase_date: todayYmdAr(), is_active: true,
          is_manual_price: true, current_price: 120, market_currency: 'USD' }));
        const state = () => snapshot([id], `SELECT jsonb_build_object(
          'position',(SELECT to_jsonb(i) FROM investments i WHERE id='${position}'),
          'sales',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM investment_sales s WHERE investment_id='${position}'),
          'receipt',(SELECT jsonb_agg(to_jsonb(r)) FROM investment_sale_requests r WHERE user_id='${a.id}' AND request_id='${key}'))`);
        const oracle = () => check('One sale4, realizedUSD80, quantity6, one receipt and no invented cash credit', rows(`SELECT jsonb_build_object(
          'sales',(SELECT count(*) FROM investment_sales WHERE investment_id='${position}'),
          'sold',(SELECT sum(quantity) FROM investment_sales WHERE investment_id='${position}'),
          'realized',(SELECT sum(realized_pnl_usd) FROM investment_sales WHERE investment_id='${position}'),
          'remaining',(SELECT quantity FROM investments WHERE id='${position}'),
          'receipts',(SELECT count(*) FROM investment_sale_requests WHERE user_id='${a.id}' AND request_id='${key}'),
          'cash',(SELECT balance FROM accounts WHERE id='${id}'))`), { sales: 1, sold: 4, realized: 80, remaining: 6, receipts: 1, cash: 0 });
        await repeatAfterTimeout(() => { calls.sale++; return sellPOST(request('/api/investments/' + position + '/sell',
          { quantity: 4, price: 120, currency: 'USD', soldAt: todayYmdAr() }, { 'Idempotency-Key': key }),
        { params: Promise.resolve({ id: position }) }); }, 201, oracle, state);
        details.oracle = { saleRows: 1, sold: 4, realizedUSD: 80, remainingQuantity: 6, receiptRows: 1, cashBalance: 0 };
        details.fixtures = { accountId: id, positionId: position, requestId: key };
        details.oversellComposition = 'prior-focal-investment-sale-4x120-from10x100';
      } finally { await archive([id]); }
    });
    const signedPayment = (resource: string) => {
      const timestamp = String(Date.now()), key = randomUUID();
      const signature = createHmac('sha256', process.env.MP_WEBHOOK_SECRET!).update(`id:${resource};request-id:${key};ts:${timestamp};`).digest('hex');
      return { requestId: key, execute: () => paymentPOST(request('/api/webhooks/mercado-pago?data.id=' + resource,
        { type: 'subscription_preapproval', data: { id: resource } },
        { 'x-request-id': key, 'x-signature': `ts=${timestamp},v1=${signature}` })) };
    };
    await group(protocols, 'payment-authorized-same-active-fixed-period-noop', async () => {
      const resource = 'zarix-cnf11-extension-nominal', fixed = '2026-11-06T12:00:00+00:00';
      await mutate(adapter.service.from('users').update({ status: 'ACTIVE', mp_preapproval_id: resource,
        current_period_end: fixed, grace_period_end: null }).eq('id', a.id));
      const before = profile(), beforeFinances = financial();
      const signed = signedPayment(resource);
      const state = () => ({ profile: profile(), financial: financial() });
      const oracle = () => {
        check('Authorized nominal preapproval is a complete profile NOOP', profile(), before);
        check('Authorized preapproval creates no financial row, receipt or outbox', financial(), beforeFinances);
        check('Preexisting paid period remains fixed without renewal',
          { status: profile().status, current_period_end: profile().current_period_end, grace_period_end: profile().grace_period_end },
          { status: 'ACTIVE', current_period_end: fixed, grace_period_end: null });
      };
      await repeatAfterTimeout(() => { calls.payment++; return signed.execute(); }, 200, oracle, state, true, true);
      details.oracle = { stateTransition: 'NOOP', status: 'ACTIVE', existingPeriod: fixed,
        providerNextPaymentDate: '2026-11-06T12:00:00.000Z', renewedPeriod: false,
        durableReceiptPolicy: 'no-mutation-no-receipt', externalProviderAcceptanceProved: false };
      details.fixtures = { resourceId: resource, requestId: signed.requestId };
    });
    await group(paymentRollback, 'payment-valid-signed-cancelled-state-write-fails', async () => {
      const resource = 'zarix-cnf11-extension-db-failure';
      await mutate(adapter.service.from('users').update({ status: 'ACTIVE', mp_preapproval_id: resource,
        current_period_end: '2026-11-06T12:00:00.000Z', grace_period_end: null }).eq('id', a.id));
      const before = profile(), beforeFinances = financial();
      constraintName = 'zarix_cnf11_payment_' + randomUUID().replaceAll('-', '');
      await journal('constraint', constraintName);
      rows(`ALTER TABLE public.users ADD CONSTRAINT ${constraintName} CHECK (id <> '${a.id}'::uuid OR status <> 'CANCELED') NOT VALID;`);
      cleanup.sqlConstraintRemoved = false;
      try {
        const signed = signedPayment(resource);
        calls.paymentRollback++;
        const response = await signed.execute();
        check('Valid provider lookup reaches SQL update and returns500', response.status, 500);
        check('All profile fields including updated_at survive SQL rollback exactly', profile(), before);
        check('Payment SQL failure changes no ledger, receipt, outbox or history', financial(), beforeFinances);
        const observations = consoleText.flatMap(text => { try { const row = JSON.parse(text); return row.schema === 'zarix.observation.v1' ? [row] : []; } catch { return []; } });
        const correlationId = response.headers.get('x-correlation-id');
        check('Valid synthetic HTTP provider lookup completed successfully', observations.some(row => row.correlationId === correlationId &&
          row.component === 'provider' && row.action === 'lookup' && row.outcome === 'success'), true);
        check('Actual database persist step records a consistency error', observations.some(row => row.correlationId === correlationId &&
          row.component === 'database' && row.action === 'persist' && row.outcome === 'error' && row.failureClass === 'consistency'), true);
        details.oracle = { status: 500, fullProfileIncludingUpdatedAtUnchanged: true, financesUnchanged: true,
          fixtureScopedCheck: true, triggersDisabled: false, validSyntheticProviderHttp: true, externalProviderAcceptanceProved: false };
      } finally {
        rows(`ALTER TABLE public.users DROP CONSTRAINT ${constraintName};`);
        constraintName = undefined; cleanup.sqlConstraintRemoved = true;
      }
    });
  } catch { outerFailure = true; }
  finally {
    if (sql && constraintName) {
      try { rows(`ALTER TABLE public.users DROP CONSTRAINT ${constraintName};`); constraintName = undefined; cleanup.sqlConstraintRemoved = true; } catch {}
    }
    try {
      if (adapter.service && a) {
        for (const rule of fixtures.rules) await mutate(adapter.service.from('recurring_rules').update({ is_active: false }).eq('id', rule).eq('user_id', a.id));
        await archive(fixtures.accounts);
        cleanup.newAccountsArchived = fixtures.accounts.every(id => [null, false].includes(rows(`SELECT to_json(is_active) FROM accounts WHERE id='${id}'`)));
        cleanup.newRecurringRulesDisabled = fixtures.rules.every(id => [null, false].includes(rows(`SELECT to_json(is_active) FROM recurring_rules WHERE id='${id}'`)));
      }
    } catch {}
    try {
      if (originalProfile && fixtureProfileTouched) {
        const restore = Object.fromEntries(PLAN_FIELDS.map(field => [field, originalProfile![field]]));
        await mutate(adapter.service.from('users').update(restore).eq('id', a.id));
        const after = profile();
        cleanup.planFieldsRestoredExactly = PLAN_FIELDS.every(field => isDeepStrictEqual(after[field], originalProfile![field]));
        const keys = [...new Set([...Object.keys(after), ...Object.keys(originalProfile)])];
        cleanup.nonPlanColumnsChanged = keys.filter(key => !PLAN_FIELDS.includes(key as any) && !isDeepStrictEqual(after[key], originalProfile![key])).sort();
        cleanup.allOtherProfileColumnsCompared = true;
        cleanup.onlyAutomaticUpdatedAtDelta = cleanup.nonPlanColumnsChanged.every(key => key === 'updated_at');
        cleanup.otherUserProfileUnchanged = isDeepStrictEqual(rows(`SELECT to_jsonb(u) FROM users u WHERE id='${b.id}'`), originalB);
      }
    } catch {}
    for (const client of clients) {
      try { const result = await client.auth.signOut({ scope: 'global' });
        cleanup.sdkLogoutResults.push({ noError: !result.error, errorStatus: result.error?.status ?? null }); }
      catch { cleanup.sdkLogoutResults.push({ noError: false, errorStatus: null }); }
    }
    try {
      if (sql) {
        cleanup.authSessions = rows('SELECT count(*) FROM auth.sessions');
        cleanup.authRefreshTokens = rows('SELECT count(*) FROM auth.refresh_tokens');
        cleanup.originalFinancialRowsUnchanged = Boolean(originalFinancial && originalRowsStillEqual(originalFinancial, financial()));
        cleanup.historyUnchanged = isDeepStrictEqual(history(), originalHistory);
        cleanup.preferencesUnchanged = isDeepStrictEqual(preferences(), originalPreferences);
      }
    } catch {}
    vi.unstubAllGlobals();
    for (const spy of spies) spy.mockRestore();
  }
  const needles = [...new Set(privateNeedles.filter(value => typeof value === 'string' && value.length > 0))];
  const privateHits = needles.map(value => consoleText.reduce((count, text) => count + Number(text.includes(value)), 0));
  const privacy = { capture: 'node:util.formatWithOptions', consoleMethods: [...consoleMethods],
    callsCaptured: consoleText.length, privateNeedles: needles.length,
    secretOrSessionHitCount: privateHits.reduce((total, count) => total + count, 0), rawConsolePersisted: false,
    options: { showHidden: true, depth: null, maxStringLength: 'Infinity', maxArrayLength: 'Infinity', customInspect: false },
    scope: 'all captured public-console arguments with the specified formatter; no universal serialization claim' };
  const cleanupPass = cleanup.planFieldsRestoredExactly && cleanup.allOtherProfileColumnsCompared && cleanup.onlyAutomaticUpdatedAtDelta &&
    cleanup.otherUserProfileUnchanged && cleanup.originalFinancialRowsUnchanged && cleanup.historyUnchanged && cleanup.preferencesUnchanged &&
    cleanup.newAccountsArchived && cleanup.newRecurringRulesDisabled && cleanup.sqlConstraintRemoved && cleanup.authSessions === 0 &&
    cleanup.authRefreshTokens === 0 && cleanup.sdkLogoutResults.length === 2 && cleanup.sdkLogoutResults.every(result => result.noError);
  const nominalPass = protocols.length === 6 && protocols.every(row => row.status === 'PASS');
  const rollbackPass = paymentRollback.length === 1 && paymentRollback[0].status === 'PASS';
  const status = nominalPass && rollbackPass && cleanupPass && privacy.secretOrSessionHitCount === 0 && !outerFailure ? 'PASS' : 'FAIL';
  const report = { status, sourceRevision: FREEZE, sourceCopyRoot: process.env.ZARIX_CNF11_SOURCE_COPY,
    commandScope: 'real imported handlers in process; real local Auth, REST and PostgreSQL',
    protocols, paymentRollback, checks: [...protocols, ...paymentRollback].reduce((sum, row) => sum + row.checks.length, 0),
    channelCalls: calls, totalHandlerInvocations: Object.values(calls).reduce((sum, count) => sum + count, 0),
    normalAuthIdentitiesReused: 2, cleanup, privacy, outerFailure,
    syntheticHttpProvider: true, externalProviderAcceptanceProved: false, physicalNetworkLossProved: false,
    browserOrUiUsed: false, firstCommitConcurrencyProved: false, newPersistentAccessCreated: false,
    fixtureFinancialHistoryRetained: true, fixtures };
  // Only allowlisted checkpoint fields, fixture IDs, hashes and observations
  // are exported. Full profiles, diagnostic arguments and tokens stay in RAM.
  await writeFile(path.join(output, 'nominal-six-and-payment-rollback.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (status !== 'PASS') throw new Error('NominalExtensionFailedSeeSanitizedReport');
});
