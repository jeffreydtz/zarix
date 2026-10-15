// PREPARED_NOT_EXECUTED. Real installed handlers/services -> real local
// GoTrue/PostgREST/PostgreSQL. Only the Next cookie adapter and Telegram
// transport are replaced; provider HTTP61329 is an explicit local fixture.
import { it, vi } from 'vitest';
import { readFile, lstat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import dotenv from 'dotenv';

const adapters = vi.hoisted(() => ({ session: null as any, service: null as any, send: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => adapters.session,
  createServiceClientSync: () => adapters.service,
  createServiceClient: async () => adapters.service,
}));
vi.mock('@/lib/telegram/send', () => ({ sendTelegramDm: adapters.send }));
import { GET as readPreferences, PUT as savePreferences } from '@/app/api/user/preferences/route';
import { POST as createTransaction } from '@/app/api/transactions/route';
import { DELETE as deleteTransaction } from '@/app/api/transactions/[id]/route';
import { GET as runRecurring } from '@/app/api/cron/recurring/route';
import { GET as runOutbox } from '@/app/api/cron/notification-outbox/route';
import { POST as paymentWebhook } from '@/app/api/webhooks/mercado-pago/route';
import { GET as readInvestment } from '@/app/api/investments/[id]/route';
import { computeNetWorth } from '@/lib/services/net-worth';
import { getPresentationPreferences } from '@/lib/services/presentation-preferences';
import { todayYmdAr } from '@/lib/cron/recurring-schedule';

type Check = { name: string; passed: boolean };
type Result = { id: string; status: string; scope: string; checks: Check[]; errorType?: string; sqlState?: string };
type Login = { id: string; email: string; password: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const repo = '/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix';

it('focal delta uses normal Auth sessions, native grants/RLS, current route/service sources and nine independent correlations', async () => {
  const results: Result[] = [];
  const rawConsole: unknown[][] = [];
  const clients: SupabaseClient[] = [];
  const privateValues: string[] = [];
  let checks: Check[] = [];
  let config: any;
  let services: any;
  let sql: (query: string) => any;
  let unsafeConstraintPresent = false;
  let reportPath = '';
  let originalProfiles: any[] = [];
  let fixtures: Record<string, string> = {};
  let cleanup = { authSessionsClosed: false, authRefreshGrantsClosed: false, controlledConstraintRemoved: true,
    profileFixtureRestored: false, logoutStatuses: [] as number[] };
  const check = (name: string, actual: unknown, expected: unknown) => {
    const passed = isDeepStrictEqual(actual, expected);
    checks.push({ name, passed });
    if (!passed) throw new Error('FocalAssertionFailure');
  };
  const group = async (id: string, scope: string, task: () => Promise<void>) => {
    checks = [];
    try {
      await task();
      results.push({ id, status: 'PASS', scope, checks });
      return true;
    } catch (error: any) {
      results.push({ id, status: 'FAIL', scope, checks,
        errorType: ['Error', 'TypeError', 'SyntaxError'].includes(error?.name) ? error.name : 'Error',
        ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlState: error.code } : {}) });
      return false;
    }
  };
  const requirePrivate = async (file: string) => {
    const item = await lstat(file);
    if (item.isSymbolicLink() || (item.mode & 0o077) !== 0) throw new Error('PrivateFilePermissions');
    return JSON.parse(await readFile(file, 'utf8'));
  };
  const fixedFetch = globalThis.fetch.bind(globalThis);
  const safeFetch: typeof fetch = async (input, init) => {
    const value = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
        !['61321', '61329'].includes(url.port) || url.username || url.password) {
      throw new Error('NonLocalFetchRejected');
    }
    return fixedFetch(input, { ...init, redirect: 'error' });
  };
  const observation = () => rawConsole.flatMap(call => {
    if (call.length !== 1 || typeof call[0] !== 'string') return [];
    try {
      const row = JSON.parse(call[0]);
      return row.schema === 'zarix.observation.v1' ? [row] : [];
    } catch { return []; }
  });
  const observationsFor = (id: string) => observation().filter(row => row.correlationId === id);
  const consoleSpies = ['info', 'error', 'warn', 'log'].map(method =>
    vi.spyOn(console, method as 'info').mockImplementation((...args: unknown[]) => { rawConsole.push(args); }));
  const newClient = (key: string) => createClient(config.apiOrigin, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: safeFetch },
  });
  const signIn = async (login: Login) => {
    const client = newClient(config.anonKey);
    const { data, error } = await client.auth.signInWithPassword({ email: login.email, password: login.password });
    if (error || !data.user || !data.session || data.user.id !== login.id) throw new Error('NormalAuthLoginFailed');
    privateValues.push(login.password, data.session.access_token, data.session.refresh_token);
    clients.push(client);
    return client;
  };
  const responseJson = async (response: Response) => JSON.parse(await response.text());
  const next = (route: string, body?: unknown, headers: Record<string, string> = {}) => new NextRequest(
    config.appOrigin + route, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), headers });
  const preferenceRequest = (body?: unknown, owner?: string) => new Request(config.appOrigin + '/api/user/preferences', {
    ...(body === undefined ? {} : { method: 'PUT', body: JSON.stringify(body) }),
    headers: owner ? { 'X-Preferences-Owner': owner } : {},
  });
  const financialFingerprint = () => sql(`SELECT jsonb_build_object(
    'accounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM accounts a),
    'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t),
    'investments',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM investments i),
    'sales',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM investment_sales s),
    'history',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM net_worth_snapshots n),
    'rules',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM recurring_rules r))`);
  const queryRows = async (client: SupabaseClient, table: string, columns: string, field: string, value: string) => {
    const result = await client.from(table).select(columns).eq(field, value);
    if (result.error) throw new Error('NativeReadFailed');
    return result.data;
  };
  const nativeMutation = async (query: any) => {
    const result = await query;
    if (result.error) throw new Error('NativeFixtureWriteFailed');
    return result.data;
  };
  let outerFailure: string | undefined;
  try {
    if (process.env.ZARIX_DELTA_NATIVE_WINDOW !== 'parent-released-frozen-delta' ||
        process.env.ZARIX_ISOLATED_DATABASE_CONFIRM !== 'synthetic-only') throw new Error('ReleaseRequired');
    const configPath = process.env.ZARIX_DELTA_NATIVE_TARGET ?? '';
    if (!/^\/tmp\/zarix-runtime-20261015\/implementation-delta-[0-9a-f-]{36}\/targets\.metadata\.json$/.test(configPath)) throw new Error('PrivateTargetPathRejected');
    const metadata = await requirePrivate(configPath);
    const serviceMetadata = await requirePrivate(path.join(path.dirname(configPath), 'services.metadata.json'));
    if (metadata.existingEnvironmentFile !== '/tmp/zarix-runtime-20261015/proof.env' ||
        metadata.databaseHost !== '127.0.0.1' || metadata.databasePort !== 58322) throw new Error('ExistingRuntimeGuardRejected');
    for (const file of [metadata.existingEnvironmentFile, '/tmp/zarix-runtime-20261015/e2e-app.env']) {
      const item = await lstat(file);
      if (item.isSymbolicLink() || (item.mode & 0o077) !== 0) throw new Error('PrivateEnvironmentPermissions');
    }
    const values = dotenv.parse(await readFile(metadata.existingEnvironmentFile));
    const cronValues = dotenv.parse(await readFile('/tmp/zarix-runtime-20261015/e2e-app.env'));
    const originalDatabase = new URL(values.ZARIX_PROOF_DATABASE_URL);
    if (originalDatabase.hostname !== '127.0.0.1' || originalDatabase.port !== '58322' ||
        originalDatabase.pathname !== '/postgres' || originalDatabase.search || originalDatabase.hash) throw new Error('ExistingDatabaseGuardRejected');
    originalDatabase.pathname = '/' + metadata.newDatabaseName;
    originalDatabase.username = 'supabase_admin';
    const expectedRevision = process.env.ZARIX_DELTA_EXPECTED_REVISION;
    if (!expectedRevision || !/^[0-9a-f]{40}$/.test(expectedRevision)) throw new Error('ExpectedRevisionRequired');
    // Derived configuration exists only in memory. Never serialize this object,
    // process.env, Auth sessions, cookies, secret values or credential hashes.
    config = { ...metadata, revision: expectedRevision, cloneSchemaRevision: metadata.revision,
      apiOrigin: metadata.plannedApiOrigin, appOrigin: metadata.plannedAppOrigin,
      databaseUrl: originalDatabase.toString(), anonKey: values.ZARIX_PROOF_ANON_KEY,
      serviceRoleKey: values.ZARIX_PROOF_SERVICE_ROLE_KEY };
    services = { ...serviceMetadata, cronSecret: cronValues.CRON_SECRET,
      mpWebhookSecret: createHash('sha256').update('zarix-delta-mp-webhook:' + metadata.run).digest('hex'),
      mpAccessToken: createHash('sha256').update('zarix-delta-mp-access:' + metadata.run).digest('hex') };
    if (process.env.CRON_SECRET !== services.cronSecret || process.env.MP_WEBHOOK_SECRET !== services.mpWebhookSecret ||
        process.env.MP_ACCESS_TOKEN !== services.mpAccessToken) throw new Error('MemoryOnlyServiceConfigurationMismatch');
    reportPath = process.env.ZARIX_DELTA_NATIVE_OUTPUT ?? '';
    if (reportPath !== path.join(path.dirname(configPath), 'native-cases-result.private.json')) throw new Error('OutputPathRejected');
    if (config.purpose !== 'zarix-implementation-delta' || !/^[0-9a-f]{40}$/.test(config.revision) ||
        !/^zarix_delta_[0-9a-f]{32}$/.test(config.newDatabaseName) ||
        config.apiOrigin !== 'http://127.0.0.1:61321' || config.appOrigin !== 'http://127.0.0.1:3006' ||
        services.providerOrigin !== 'http://127.0.0.1:61329') throw new Error('TargetGuardRejected');
    const dbUrl = new URL(config.databaseUrl);
    if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '58322' || dbUrl.pathname !== '/' + config.newDatabaseName ||
        dbUrl.search || dbUrl.hash || !['postgres:', 'postgresql:'].includes(dbUrl.protocol)) throw new Error('DatabaseGuardRejected');
    if (!path.resolve(config.pgBin).startsWith('/tmp/zarix-runtime-20261015/home/cache/')) throw new Error('PostgresBinaryRejected');
    if (config.loginFile !== '/tmp/zarix-runtime-20261015/proof-logins.json') throw new Error('LoginFileRejected');
    const logins: Login[] = (await requirePrivate(config.loginFile)).users;
    if (logins.length !== 2 || new Set(logins.map(item => item.id)).size !== 2 ||
        !logins.every(item => uuid.test(item.id) && /^zarix-.+@example\.invalid$/.test(item.email))) throw new Error('TwoExistingSyntheticIdentitiesRequired');
    const [a, b] = logins;
    for (const key of ['anonKey', 'serviceRoleKey']) privateValues.push(config[key]);
    for (const key of ['cronSecret', 'mpWebhookSecret', 'mpAccessToken']) privateValues.push(services[key]);
    privateValues.push(...logins.map(login => login.password));
    const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
    Object.assign(pgEnv, { PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: '58322',
      PGUSER: decodeURIComponent(dbUrl.username), PGPASSWORD: decodeURIComponent(dbUrl.password),
      PGDATABASE: config.newDatabaseName, PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'zarix-focal-native-delta' });
    privateValues.push(decodeURIComponent(dbUrl.password));
    sql = (query: string) => {
      const child = spawnSync(path.join(config.pgBin, 'psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
        cwd: repo, env: pgEnv, input: query + '\n', encoding: 'utf8', timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
      if (child.status !== 0) throw new Error('NativeSqlCommandFailed');
      const output = child.stdout.trim();
      return output ? JSON.parse(output) : null;
    };
    if (sql('SELECT to_json(current_database())') !== config.newDatabaseName) throw new Error('WrongDatabase');
    if (sql('SELECT count(*) FROM accounts') !== 0 || sql('SELECT count(*) FROM transactions') !== 0 ||
        sql('SELECT count(*) FROM auth.sessions') !== 0) throw new Error('FreshFinancialAndSessionCloneRequired');
    vi.stubGlobal('fetch', safeFetch);
    adapters.service = newClient(config.serviceRoleKey);
    const clientA = await signIn(a);
    const clientASecond = await signIn(a);
    const clientB = await signIn(b);
    adapters.session = clientA;
    const id = { ars: randomUUID(), usd: randomUUID(), audit: randomUUID(), manual: randomUUID(), cron: randomUUID(),
      snapshot: randomUUID(), rule: randomUUID() };
    fixtures = { userAId: a.id, userBId: b.id, ...id };
    originalProfiles = sql(`SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'current_period_end',current_period_end,
      'grace_period_end',grace_period_end,'mp_preapproval_id',mp_preapproval_id,'telegram_chat_id',telegram_chat_id,
      'telegram_bot_token',telegram_bot_token,'default_currency',default_currency,'net_worth_widget_visible',net_worth_widget_visible) ORDER BY id) FROM users`);
    const fixtureUntil = new Date(Date.now() + 30 * 86400_000).toISOString();
    sql(`UPDATE users SET status='ACTIVE',current_period_end='${fixtureUntil}',grace_period_end=NULL,
      mp_preapproval_id=NULL,telegram_chat_id=-8613000013,telegram_bot_token=NULL,
      default_currency='ARS',net_worth_widget_visible=true WHERE id='${a.id}';`);
    sql(`UPDATE users SET default_currency='ARS',net_worth_widget_visible=true WHERE id='${b.id}';`);
    for (const [key, currency, initial, included] of [
      ['ars', 'ARS', 120000, true], ['usd', 'USD', 100, true], ['audit', 'ARS', 10000, false],
      ['manual', 'ARS', 10000, false], ['cron', 'ARS', 10000, false],
    ] as const) {
      await nativeMutation(adapters.service.from('accounts').insert({ id: id[key], user_id: a.id,
        name: `Delta ${key} synthetic`, type: 'bank', currency, include_in_total: included, include_in_liquid: included }));
      await nativeMutation(adapters.service.from('transactions').insert({ user_id: a.id, account_id: id[key],
        type: 'adjustment', amount: initial, currency, amount_in_account_currency: initial,
        description: 'Synthetic opening ledger', transaction_date: new Date().toISOString() }));
    }
    await nativeMutation(adapters.service.from('net_worth_snapshots').insert({ id: id.snapshot, user_id: a.id,
      snapshot_date: todayYmdAr(), liquid_usd: 200, investments_usd: 0, total_usd: 200,
      total_ars_blue: 240000, blue_ars_per_usd: 1200 }));
    const beforePreferences = financialFingerprint();
    const beforeB = await queryRows(clientB, 'users', 'id,default_currency,net_worth_widget_visible', 'id', b.id);
    await group('CP2-11/CP3-17', 'Real GET/PUT handlers, two distinct normal GoTrue sessions A and real native preferences/history; no browser or new session cookie adapter acceptance.', async () => {
      check('Normal sessions are independent', (await clientA.auth.getSession()).data.session?.access_token ===
        (await clientASecond.auth.getSession()).data.session?.access_token, false);
      check('Initial real GET', await responseJson(await readPreferences(preferenceRequest())),
        { default_currency: 'ARS', net_worth_widget_visible: true });
      const hidden = await savePreferences(preferenceRequest({ default_currency: 'USD', net_worth_widget_visible: false }, a.id));
      check('PUT persists complete USD hidden state', hidden.status, 200);
      check('PUT returned persisted settings', await responseJson(hidden), { default_currency: 'USD', net_worth_widget_visible: false });
      adapters.session = clientASecond;
      check('Second normal Auth session reads saved state', await responseJson(await readPreferences(preferenceRequest())),
        { default_currency: 'USD', net_worth_widget_visible: false });
      check('Real preference service uses saved owner setting', await getPresentationPreferences(a.id),
        { default_currency: 'USD', net_worth_widget_visible: false });
      const netWorth = await computeNetWorth(a.id);
      check('Real accounts/portfolio/cotizaciones services produce USD200', netWorth.totalUSD, 200);
      check('Local HTTP quote is ARS1200 per USD', netWorth.blueRate, 1200);
      check('ARS presentation equivalent is 240000', netWorth.totalARSBlue, 240000);
      check('Preferences did not alter financial/history rows', financialFingerprint(), beforePreferences);
      const shown = await savePreferences(preferenceRequest({ default_currency: 'ARS', net_worth_widget_visible: true }));
      check('Show widget and ARS persist', shown.status, 200);
      adapters.session = clientA;
      check('First session reload sees restored visible state', await responseJson(await readPreferences(preferenceRequest())),
        { default_currency: 'ARS', net_worth_widget_visible: true });
      check('Financial/history rows remain exact after show', financialFingerprint(), beforePreferences);
    });
    await group('CP2-12', 'Actual owner RLS and column grants through normal Auth/PostgREST, strict PUT schema and stale-form owner guard; no Auth/DB doubles.', async () => {
      const beforeProfiles = sql('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u');
      for (const body of [
        { default_currency: 'ZZZ', net_worth_widget_visible: false },
        { default_currency: 'USD', net_worth_widget_visible: false, user_id: b.id },
        { default_currency: 'ARS', net_worth_widget_visible: true, id: b.id },
        { default_currency: 'USD' }, { net_worth_widget_visible: false },
      ]) check('Strict route rejects invalid or manipulated preference body', (await savePreferences(preferenceRequest(body))).status, 400);
      check('Invalid route input is atomic for both profiles', sql('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u'), beforeProfiles);
      check('B cannot read A presentation fields', await queryRows(clientB, 'users', 'default_currency,net_worth_widget_visible', 'id', a.id), []);
      const foreignWrite = await clientB.from('users').update({ default_currency: 'USD', net_worth_widget_visible: false }).eq('id', a.id).select('id');
      check('B foreign write returns no SQL error', foreignWrite.error, null);
      check('B foreign write affects zero rows under RLS', foreignWrite.data, []);
      const badCurrency = await clientA.from('users').update({ default_currency: 'ZZZ' }).eq('id', a.id);
      check('Direct authenticated invalid currency fails SQL trigger', badCurrency.error?.code, '23514');
      adapters.session = clientB;
      check('B real GET reads only B defaults', await responseJson(await readPreferences(preferenceRequest())),
        { default_currency: 'ARS', net_worth_widget_visible: true });
      check('Stale A form cannot update after switch to B', (await savePreferences(
        preferenceRequest({ default_currency: 'USD', net_worth_widget_visible: false }, a.id))).status, 403);
      check('B profile unchanged', await queryRows(clientB, 'users', 'id,default_currency,net_worth_widget_visible', 'id', b.id), beforeB);
      check('All financial/history rows exact', financialFingerprint(), beforePreferences);
      adapters.session = clientA;
    });
    await group('CP1-08', 'Actual POST and normal-session DELETE handlers -> real PostgREST/native trigger; exact OLD JSONB and actor; operational deletion with balance reversal.', async () => {
      const created = await createTransaction(next('/api/transactions', { accountId: id.audit, type: 'expense', amount: 1500,
        currency: 'ARS', description: 'CNF13_PRIVATE_DESCRIPTION_AUDIT', notes: 'CNF13_PRIVATE_NOTE', tags: ['synthetic-delta'] },
      { 'Idempotency-Key': randomUUID() }));
      check('Actual create handler returns 201', created.status, 201);
      const movement = await responseJson(created);
      check('Created row has a real UUID', uuid.test(movement.id), true);
      const old = sql(`SELECT to_jsonb(t) FROM transactions t WHERE id='${movement.id}'`);
      check('Expense1500 yields8500', sql(`SELECT balance FROM accounts WHERE id='${id.audit}'`), 8500);
      adapters.session = clientB;
      check('Foreign DELETE reveals no row', (await deleteTransaction(next('/api/transactions/' + movement.id),
        { params: Promise.resolve({ id: movement.id }) })).status, 204);
      check('Foreign DELETE preserves original movement', sql(`SELECT count(*) FROM transactions WHERE id='${movement.id}'`), 1);
      check('Foreign DELETE creates no audit', sql(`SELECT count(*) FROM transaction_deletion_audit WHERE transaction_id='${movement.id}'`), 0);
      adapters.session = clientA;
      check('Owner DELETE returns204', (await deleteTransaction(next('/api/transactions/' + movement.id),
        { params: Promise.resolve({ id: movement.id }) })).status, 204);
      check('Deletion restores10000', sql(`SELECT balance FROM accounts WHERE id='${id.audit}'`), 10000);
      check('Operational movement absent', sql(`SELECT count(*) FROM transactions WHERE id='${movement.id}'`), 0);
      const audit = await queryRows(clientA, 'transaction_deletion_audit', '*', 'transaction_id', movement.id);
      check('Exactly one owner-readable event', audit?.length, 1);
      check('Exact prior JSONB retained', audit?.[0].previous_row, old);
      check('Original owner retained', audit?.[0].user_id, a.id);
      check('Actual normal session actor retained', audit?.[0].actor_id, a.id);
      check('Actual SQL authenticated role retained', audit?.[0].actor_role, 'authenticated');
      check('B cannot read A audit', await queryRows(clientB, 'transaction_deletion_audit', '*', 'transaction_id', movement.id), []);
      const forged = await clientA.from('transaction_deletion_audit').insert({ transaction_id: randomUUID(), user_id: a.id,
        actor_role: 'forged', previous_row: {} });
      check('Normal owner cannot fabricate audit', forged.error?.code, '42501');
      await deleteTransaction(next('/api/transactions/' + movement.id), { params: Promise.resolve({ id: movement.id }) });
      check('DELETE retry does not duplicate audit', sql(`SELECT count(*) FROM transaction_deletion_audit WHERE transaction_id='${movement.id}'`), 1);
    });
    await group('CU004-read-position', 'Actual position GET with normal native JWT/RLS, own archived position readable, foreign404 and malformed400; no quote refresh or browser acceptance.', async () => {
      const accountId = randomUUID(), positionId = randomUUID();
      fixtures.investmentAccountId = accountId;
      fixtures.positionId = positionId;
      await nativeMutation(adapters.service.from('accounts').insert({ id: accountId, user_id: a.id,
        name: 'Delta archived investment synthetic', type: 'investment', currency: 'USD', include_in_total: false }));
      await nativeMutation(adapters.service.from('investments').insert({ id: positionId, user_id: a.id, account_id: accountId,
        name: 'Synthetic archived position', type: 'stock_us', quantity: 2, purchase_price: 10,
        purchase_currency: 'USD', purchase_date: todayYmdAr(), is_active: false,
        is_manual_price: true, current_price: 12, market_currency: 'USD' }));
      const before = financialFingerprint();
      adapters.session = clientA;
      const own = await readInvestment(next('/api/investments/' + positionId), { params: Promise.resolve({ id: positionId }) });
      check('Owner reads archived position200', own.status, 200);
      check('Owner receives exact position UUID', (await responseJson(own)).id, positionId);
      check('Position GET disables HTTP caching', own.headers.get('cache-control'), 'no-store');
      adapters.session = clientB;
      check('Other owner position is404', (await readInvestment(next('/api/investments/' + positionId),
        { params: Promise.resolve({ id: positionId }) })).status, 404);
      check('Malformed position ID400', (await readInvestment(next('/api/investments/invalid'),
        { params: Promise.resolve({ id: 'invalid' }) })).status, 400);
      check('Read has no financial/history mutation', financialFingerprint(), before);
      adapters.session = clientA;
    });
    let successfulManualId = '';
    await group('corr-cnf13-01', 'Real manual handler/service/idempotency RPC writes native transaction; fixed request/service/database observations.', async () => {
      adapters.session = clientA;
      const response = await createTransaction(next('/api/transactions', { accountId: id.manual, type: 'expense', amount: 1,
        currency: 'ARS', description: 'CNF13_PRIVATE_DESCRIPTION_MANUAL' },
      { 'Idempotency-Key': randomUUID(), 'X-Correlation-ID': 'corr-cnf13-01' }));
      check('Manual valid status', response.status, 201);
      check('Manual response correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-01');
      successfulManualId = (await responseJson(response)).id;
      check('Native committed movement UUID', uuid.test(successfulManualId), true);
      check('Native committed balance', sql(`SELECT balance FROM accounts WHERE id='${id.manual}'`), 9999);
      const rows = observationsFor('corr-cnf13-01');
      check('Database and service point to one committed UUID', rows.filter(row => row.referenceId === successfulManualId).map(row => row.component), ['database', 'service']);
      check('Terminal manual success', rows.at(-1)?.outcome, 'success');
    });
    await group('corr-cnf13-02', 'Actual manual validation rejects negative amount before native financial persistence.', async () => {
      const before = financialFingerprint();
      const receipts = sql('SELECT count(*) FROM transaction_requests');
      const response = await createTransaction(next('/api/transactions', { accountId: id.manual, type: 'expense', amount: -1,
        currency: 'ARS', description: 'CNF13_PRIVATE_DESCRIPTION_REJECTED' },
      { 'Idempotency-Key': randomUUID(), 'X-Correlation-ID': 'corr-cnf13-02' }));
      check('Negative amount rejected', response.status, 400);
      check('Validation response correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-02');
      check('No financial effect', financialFingerprint(), before);
      check('No durable receipt', sql('SELECT count(*) FROM transaction_requests'), receipts);
      const terminal = observationsFor('corr-cnf13-02').at(-1);
      check('Validation class', terminal?.failureClass, 'validation');
      check('Rejected outcome', terminal?.outcome, 'rejected');
    });
    await group('corr-cnf13-03', 'Actual PostgreSQL23514 induced by a temporary cloned-account CHECK, removed in finally; no DB mock or original schema change.', async () => {
      const before = financialFingerprint();
      const receipts = sql('SELECT count(*) FROM transaction_requests');
      const requestId = randomUUID();
      sql(`ALTER TABLE transactions ADD CONSTRAINT zarix_delta_controlled_failure CHECK (account_id <> '${id.manual}'::uuid) NOT VALID;`);
      unsafeConstraintPresent = true;
      try {
        const response = await createTransaction(next('/api/transactions', { accountId: id.manual, type: 'expense', amount: 1,
          currency: 'ARS', description: 'CNF13_PRIVATE_DESCRIPTION_SQL_FAILURE' },
        { 'Idempotency-Key': requestId, 'X-Correlation-ID': 'corr-cnf13-03' }));
        check('Real persistence error returns500', response.status, 500);
        check('SQL failure response correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-03');
        check('Safe generic response', await responseJson(response), { error: 'Ocurrió un error procesando la solicitud.' });
        check('SQL failure rolls back balance and rows', financialFingerprint(), before);
        check('SQL failure leaves no receipt', sql('SELECT count(*) FROM transaction_requests'), receipts);
        check('Native rejection has no durable matching request', sql(`SELECT count(*) FROM transaction_requests WHERE request_id='${requestId}'`), 0);
        const rows = observationsFor('corr-cnf13-03');
        check('Persistence classified consistency', rows.at(-1)?.failureClass, 'consistency');
        check('No claimed successful persistence', rows.some(row => row.component === 'database' && row.action === 'persist' && row.outcome === 'success'), false);
      } finally {
        sql('ALTER TABLE transactions DROP CONSTRAINT zarix_delta_controlled_failure;');
        unsafeConstraintPresent = false;
      }
    });
    let recurringTransactionId = '';
    let outboxId = '';
    await group('corr-cnf13-04', 'Actual recurring cron and service-role RPC atomically commit native financial effect/marker/outbox; Telegram not delivered here.', async () => {
      await nativeMutation(adapters.service.from('recurring_rules').insert({ id: id.rule, user_id: a.id, account_id: id.cron,
        type: 'expense', amount: 1000, currency: 'ARS', description: 'CNF13_PRIVATE_DESCRIPTION_RECURRING',
        frequency: 'daily', start_date: todayYmdAr(), notification_enabled: true, is_active: true }));
      const response = await runRecurring(next('/api/cron/recurring', undefined,
        { Authorization: `Bearer ${services.cronSecret}`, 'X-Correlation-ID': 'corr-cnf13-04' }));
      check('Recurring HTTP200', response.status, 200);
      check('Recurring response correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-04');
      check('Exactly one processed recurring rule', await responseJson(response), { success: true, job: 'recurring', total: 1, processed: 1, errors: 0 });
      const occurrence = sql(`SELECT jsonb_agg(to_jsonb(t)) FROM transactions t WHERE recurring_rule_id='${id.rule}'`);
      check('Exactly one actual occurrence', occurrence?.length, 1);
      recurringTransactionId = occurrence[0].id;
      check('Balance9000 after committed1000', sql(`SELECT balance FROM accounts WHERE id='${id.cron}'`), 9000);
      check('Execution marker committed today', sql(`SELECT to_json(last_executed_date) FROM recurring_rules WHERE id='${id.rule}'`), todayYmdAr());
      const pending = sql(`SELECT jsonb_agg(to_jsonb(n)) FROM notification_outbox n WHERE user_id='${a.id}'`);
      check('Exactly one durable outbox event', pending?.length, 1);
      outboxId = pending[0].id;
      check('Outbox links real committed transaction', pending[0].payload.transactionId, recurringTransactionId);
      check('Outbox not delivered during financial commit', pending[0].delivered_at, null);
      check('Recurring did not invoke sender', adapters.send.mock.calls.length, 0);
      check('Observed database persist refers to committed UUID', observationsFor('corr-cnf13-04').some(row =>
        row.component === 'database' && row.action === 'persist' && row.outcome === 'success' && row.referenceId === recurringTransactionId), true);
    });
    await group('corr-cnf13-05', 'Actual cron bearer rejection, no DB financial/receipt/outbox effects.', async () => {
      const before = financialFingerprint();
      const response = await runRecurring(next('/api/cron/recurring', undefined,
        { Authorization: 'Bearer invalid-local-fixture', 'X-Correlation-ID': 'corr-cnf13-05' }));
      check('Invalid bearer401', response.status, 401);
      check('Invalid bearer response correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-05');
      check('Rejected cron has no service/database observations', observationsFor('corr-cnf13-05').every(row => row.component === 'request'), true);
      check('Authentication classification', observationsFor('corr-cnf13-05').at(-1)?.failureClass, 'authentication');
      check('Financial rows unchanged', financialFingerprint(), before);
    });
    await group('corr-cnf13-06', 'Actual native outbox claim/retry and actual worker; sendTelegramDm is an explicit rejecting test double after financial commit, never real Telegram.', async () => {
      check('Valid recurring prerequisite exists', uuid.test(recurringTransactionId) && uuid.test(outboxId), true);
      const before = financialFingerprint();
      adapters.send.mockRejectedValue(new Error('CNF13_PRIVATE_PROVIDER_ERROR'));
      const response = await runOutbox(next('/api/cron/notification-outbox', undefined,
        { Authorization: `Bearer ${services.cronSecret}`, 'X-Correlation-ID': 'corr-cnf13-06' }));
      check('Outbox job reports failed item while HTTP200', response.status, 200);
      check('Outbox failure response correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-06');
      check('Exactly one failed attempt', await responseJson(response), { success: true, job: 'notification-outbox', delivered: 0, failed: 1, errors: 1 });
      check('Explicit sender testdouble invoked once', adapters.send.mock.calls.length, 1);
      check('Synthetic chat only', adapters.send.mock.calls[0][0], -8613000013);
      const pending = sql(`SELECT to_jsonb(n) FROM notification_outbox n WHERE id='${outboxId}'`);
      check('Native claim incremented attempt', pending.attempts, 1);
      check('No false delivery acknowledgement', pending.delivered_at, null);
      check('Lease released for retry', [pending.lease_until, pending.lease_token], [null, null]);
      check('Only safe generic retry error stored', pending.last_error, 'Entrega no confirmada');
      check('Financial rows remain committed unchanged', financialFingerprint(), before);
      const rows = observationsFor('corr-cnf13-06');
      check('Provider error distinguished', rows.some(row => row.component === 'provider' && row.outcome === 'error' && row.failureClass === 'provider'), true);
      check('Outbox failure links committed transaction and outbox', rows.some(row => row.component === 'outbox' &&
        row.outcome === 'error' && row.failureClass === 'provider' && row.referenceId === outboxId && row.transactionId === recurringTransactionId), true);
      check('Terminal remains error despiteHTTP200', rows.at(-1)?.outcome, 'error');
    });
    const control = await requirePrivate(services.providerControlFile);
    if (control.purpose !== 'zarix-delta-provider-control' || control.resourceId !== 'zarix-delta-preapproval' || control.userId !== a.id) throw new Error('ProviderFixtureRejected');
    const setProvider = async (mode: 'valid' | 'failure') => {
      await writeFile(services.providerControlFile, JSON.stringify({ ...control, mp: mode }) + '\n', { mode: 0o600 });
    };
    const mpRequest = (correlationId: string, forged = false) => {
      const timestamp = String(Date.now());
      const requestId = randomUUID();
      const digest = createHmac('sha256', services.mpWebhookSecret).update(
        `id:${control.resourceId};request-id:${requestId};ts:${timestamp};`).digest('hex');
      return next('/api/webhooks/mercado-pago?data.id=' + control.resourceId,
        { type: 'subscription_preapproval', data: { id: control.resourceId } },
        { 'X-Correlation-ID': correlationId, 'x-request-id': requestId,
          'x-signature': `ts=${timestamp},v1=${forged ? '0'.repeat(64) : digest}` });
    };
    await group('corr-cnf13-07', 'Real HMAC webhook handler/provider HTTP fixture/subscription conditional DB write; local MP fixture, no Mercado Pago sandbox or real payment acceptance.', async () => {
      await setProvider('valid');
      await nativeMutation(adapters.service.from('users').update({ status: 'ACTIVE', mp_preapproval_id: control.resourceId,
        current_period_end: fixtureUntil, grace_period_end: null }).eq('id', a.id));
      const before = financialFingerprint();
      const response = await paymentWebhook(mpRequest('corr-cnf13-07'));
      check('Valid local signed webhook200', response.status, 200);
      check('Valid webhook response correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-07');
      check('Provider cancellation persisted', sql(`SELECT to_json(status) FROM users WHERE id='${a.id}'`), 'CANCELED');
      check('Payment does not alter financial/history rows', financialFingerprint(), before);
      const rows = observationsFor('corr-cnf13-07');
      check('Real provider lookup successful', rows.some(row => row.component === 'provider' && row.outcome === 'success'), true);
      check('Actual DB persistence references owner UUID', rows.some(row => row.component === 'database' && row.action === 'persist' && row.outcome === 'success' && row.referenceId === a.id), true);
    });
    await group('corr-cnf13-08', 'Actual forged HMAC rejection before provider/database work.', async () => {
      const before = sql('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u');
      const response = await paymentWebhook(mpRequest('corr-cnf13-08', true));
      check('Forged signature401', response.status, 401);
      check('Forged webhook response correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-08');
      check('Profiles unchanged', sql('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u'), before);
      check('Only request observations', observationsFor('corr-cnf13-08').every(row => row.component === 'request'), true);
      check('Authentication rejection classified', observationsFor('corr-cnf13-08').at(-1)?.failureClass, 'authentication');
    });
    await group('corr-cnf13-09', 'Actual signed handler with real local provider HTTP503; provider classification and no subscription/financial partial effect.', async () => {
      await nativeMutation(adapters.service.from('users').update({ status: 'ACTIVE', mp_preapproval_id: control.resourceId,
        current_period_end: fixtureUntil, grace_period_end: null }).eq('id', a.id));
      await setProvider('failure');
      const before = sql('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u');
      const beforeFinancial = financialFingerprint();
      try {
        const response = await paymentWebhook(mpRequest('corr-cnf13-09'));
        check('HTTP503 provider causes retryable webhook500', response.status, 500);
        check('Provider failure response correlation header', response.headers.get('x-correlation-id'), 'corr-cnf13-09');
        check('Webhook response is safe generic', await responseJson(response), { error: 'Webhook processing failed' });
        check('No partial subscription write', sql('SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u'), before);
        check('No financial changes', financialFingerprint(), beforeFinancial);
        const failures = observationsFor('corr-cnf13-09').filter(row => row.outcome === 'error');
        check('Provider/service/request failure path present', failures.length, 3);
        check('All failure observations retain provider class', failures.every(row => row.failureClass === 'provider'), true);
      } finally { await setProvider('valid'); }
    });
    await group('CNF13-observation-contract', 'All nine actual handler invocations return their correlation ID and produce allowlisted content-free counters; no universal deployment/collector acceptance.', async () => {
      const allowedKeys = new Set(['schema', 'timestamp', 'correlationId', 'channel', 'operation', 'job', 'component', 'action',
        'outcome', 'failureClass', 'referenceType', 'referenceId', 'transactionId', 'status', 'metric', 'value']);
      for (let index = 1; index <= 9; index++) {
        const correlationId = `corr-cnf13-${String(index).padStart(2, '0')}`;
        const rows = observationsFor(correlationId);
        check('Correlation has request started and terminal samples', rows.filter(row => row.component === 'request').length, 2);
        check('Timestamp and exact correlation remain valid', rows.every(row => row.correlationId === correlationId &&
          Number.isFinite(Date.parse(row.timestamp))), true);
        check('Only fixed metadata fields are logged', rows.every(row => Object.keys(row).every(key => allowedKeys.has(key))), true);
        check('Every terminal event is a unit counter sample', rows.filter(row => row.outcome !== 'started').every(row =>
          row.metric === 'zarix_operation_total' && row.value === 1), true);
      }
      const logs = JSON.stringify(rawConsole);
      check('No selected private runtime credential reaches captured console', privateValues.filter(value => typeof value === 'string' && value.length >= 8).some(value => logs.includes(value)), false);
      for (const marker of ['CNF13_PRIVATE_DESCRIPTION', 'CNF13_PRIVATE_NOTE', 'CNF13_PRIVATE_PROVIDER_ERROR'])
        check('No synthetic private payload/error marker reaches console', logs.includes(marker), false);
      check('No raw authorization/cookie/signature field reaches console', /authorization|x-signature|refresh_token|access_token|password|cookie/i.test(logs), false);
    });
  } catch (error: any) {
    outerFailure = ['Error', 'TypeError', 'SyntaxError'].includes(error?.name) ? error.name : 'Error';
  } finally {
    try {
      if (unsafeConstraintPresent && sql!) {
        sql!('ALTER TABLE transactions DROP CONSTRAINT zarix_delta_controlled_failure;');
        unsafeConstraintPresent = false;
      }
      cleanup.controlledConstraintRemoved = !unsafeConstraintPresent;
      // Restore only the fixture-mutated profile columns in the new clone.
      // User identities/passwords and the original PROOF database are untouched.
      if (adapters.service && originalProfiles.length) {
        for (const row of originalProfiles) {
          const { id, ...values } = row;
          await nativeMutation(adapters.service.from('users').update(values).eq('id', id));
        }
        cleanup.profileFixtureRestored = true;
      }
    } catch { cleanup.controlledConstraintRemoved = !unsafeConstraintPresent; }
    for (const client of clients) {
      try {
        const result = await client.auth.signOut({ scope: 'global' });
        cleanup.logoutStatuses.push(result.error?.status ?? 204);
      } catch { cleanup.logoutStatuses.push(0); }
    }
    try {
      if (sql!) {
        cleanup.authSessionsClosed = sql!('SELECT count(*) FROM auth.sessions') === 0;
        cleanup.authRefreshGrantsClosed = sql!('SELECT count(*) FROM auth.refresh_tokens') === 0;
      }
    } catch { /* No raw database diagnostic is copied to evidence. */ }
    vi.unstubAllGlobals();
    for (const spy of consoleSpies) spy.mockRestore();
  }
  const passed = results.filter(result => result.status === 'PASS').length;
  const status = !outerFailure && results.length === 14 && passed === results.length &&
    cleanup.authSessionsClosed && cleanup.authRefreshGrantsClosed && cleanup.controlledConstraintRemoved && cleanup.profileFixtureRestored ? 'PASS' : 'FAIL';
  if (reportPath) {
    // Observation fields themselves are validated above. Never write raw console,
    // request/session/provider bodies, exception text or private config values.
    const allowedKeys = new Set(['schema', 'timestamp', 'correlationId', 'channel', 'operation', 'job', 'component', 'action',
      'outcome', 'failureClass', 'referenceType', 'referenceId', 'transactionId', 'status', 'metric', 'value']);
    const observations = observation().map(row => Object.fromEntries(Object.entries(row).filter(([key]) => allowedKeys.has(key))));
    await writeFile(reportPath, JSON.stringify({ status, revision: config?.revision, cloneSchemaRevision: config?.cloneSchemaRevision,
      completedAt: new Date().toISOString(),
      scope: 'Real current source handlers/services and native GoTrue/PostgREST/PostgreSQL. Next cookie adapter replaced with real normal-session clients. Telegram sender is a rejecting transport double; MP/quotes use local HTTP fixtures, not real providers. No browser/UI, remote service, availability/load or complete restoration acceptance.',
      passed, total: results.length, assertions: results.reduce((sum, row) => sum + row.checks.length, 0), results,
      observations, cleanup, fixtures, ...(outerFailure ? { preparationFailureType: outerFailure } : {}),
      newUsersCreated: 0, externalCredentialsCreated: 0, originalDatabaseWritten: false,
      credentialValuesCopied: false, sessionsPersisted: false, envFilesCreated: false,
      originalCheckpointRewritten: false, browserUsed: false, rawConsolePublished: false,
      exactCredentialAbsenceScope: 'Selected local config credentials, cloned-account passwords and this runner issued sessions against captured console only; no universal absence claim.' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  if (status !== 'PASS') throw new Error('FocalNativeDeltaDidNotPassSeePrivateSafeReport');
}, 180_000);
