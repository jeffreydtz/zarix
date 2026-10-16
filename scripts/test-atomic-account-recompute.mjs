// Fresh, synthetic PostgreSQL WASM fixture: no network, remote SQL, or credentials.
// Role GUCs model database authorization; they are not real Auth sessions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { asRole, bootDatabase, bootstrapSources, digest } from './lib/test-isolated-database.mjs';

const userA = '13131313-1313-4131-8131-131313131313';
const userB = '24242424-2424-4242-8242-242424242424';
const signature = 'public.recompute_account_balance(uuid,uuid)';
const repairMigration = 'supabase/migrations/20261015172417_atomic_account_balance_recompute.sql';
const results = [];
const report = {
  startedAt: new Date().toISOString(),
  command: 'node scripts/test-atomic-account-recompute.mjs',
  runtime: { node: process.version },
  scope: 'Fresh baseline and migrations in PGlite; synthetic ledger and role claims. No GoTrue, PostgREST, UI, provider, or native multi-session concurrency verification.',
  concurrency: { verified: false, legacyInterleaving: 'Sequential replay of independently committed commands; not simultaneous WASM sessions.' },
  results,
};
let db;

// Do not serialize PostgreSQL messages, details, queries, rows, or assertion values.
const safeError = (error, context) => ({
  type: error instanceof assert.AssertionError ? 'AssertionError' : error?.code ? 'DatabaseError' : 'RuntimeError',
  code: typeof error?.code === 'string' && /^(?:[A-Z0-9]{5}|ERR_[A-Z0-9_]+)$/.test(error.code) ? error.code : null,
  context,
});
const canonical = value => String(value).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
const balance = async accountId => canonical((await db.query(
  'SELECT balance::text AS value FROM public.accounts WHERE id=$1', [accountId])).rows[0].value);
const countLedger = async () => Number((await db.query('SELECT count(*) AS n FROM public.transactions')).rows[0].n);
const corruptBalance = (accountId, value = '777') => db.query('UPDATE public.accounts SET balance=$1 WHERE id=$2', [value, accountId]);
const recompute = (owner, accountId) => asRole(db, 'service_role', null, async tx => (
  await tx.query('SELECT public.recompute_account_balance($1,$2) AS result', [owner, accountId])).rows[0].result);
const account = async (options = {}) => {
  const accountId = randomUUID();
  await db.query(`INSERT INTO public.accounts
    (id,user_id,name,type,currency,balance,is_multicurrency,secondary_currency)
    VALUES($1,$2,'Synthetic recompute fixture',$3,$4,0,$5,$6)`, [
    accountId, options.owner ?? userA, options.type ?? 'bank', options.currency ?? 'ARS',
    options.multicurrency ?? false, options.secondary ?? null,
  ]);
  return accountId;
};
const entry = (accountId, options = {}) => asRole(db, 'service_role', null, async tx => (
  await tx.query(`INSERT INTO public.transactions
    (user_id,type,account_id,destination_account_id,amount,currency,
      amount_in_account_currency,exchange_rate,destination_amount_in_account_currency,
      transaction_date,description)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'2026-10-15T12:00:00Z','Synthetic recompute ledger')
    RETURNING id`, [
    options.owner ?? userA, options.type ?? 'income', accountId, options.destination ?? null,
    options.amount ?? '1', options.currency ?? 'ARS', options.inAccount ?? options.amount ?? '1',
    options.rate ?? null, options.credit ?? null,
  ])).rows[0].id);
const expectResult = (result, before, after) => {
  assert.deepEqual(Object.keys(result).sort(), ['after', 'before']);
  assert.equal(typeof result.before, 'number');
  assert.equal(typeof result.after, 'number');
  assert.equal(result.before, Number(before));
  assert.equal(result.after, Number(after));
};
const expectCode = async (promise, expected) => assert.rejects(promise, error => error.code === expected);
const test = async (id, name, fn) => {
  try {
    // Only this script's freshly created in-memory fixture is reset.
    await db.exec('DELETE FROM public.transactions; DELETE FROM public.accounts;');
    await fn();
    results.push({ id, name, status: 'PASS' });
  } catch (error) {
    results.push({ id, name, status: 'FAIL', error: safeError(error, id) });
  }
};
const roundingOrderFixture = async (credits, expenseFirst) => {
  const source = await account(), destination = await account();
  const expense = () => entry(destination, { type: 'expense', amount: '0.00000001' });
  const credit = () => entry(source, { type: 'transfer', amount: '0.00000001',
    destination, rate: '0.5' });
  if (expenseFirst) await expense();
  for (let i = 0; i < credits; i += 1) await credit();
  if (!expenseFirst) await expense();
  return { source, destination };
};
const proveOriginalRoundingOrder = async sourceFiles => {
  // Reproduce the historical pre-repair schema. Later migrations belong only
  // to the current fixture, rather than leaking into this immutable before cut.
  const repairIndex = sourceFiles.findIndex(file => file.path === repairMigration);
  assert.ok(repairIndex > 0);
  const beforeSources = sourceFiles.slice(0, repairIndex);
  assert.equal(beforeSources.length, 27); // Fresh baseline plus 26 original migrations.
  const { db: beforeDb, manifest } = await bootDatabase({ legacyGrants: true, sourceFiles: beforeSources });
  report.beforeProof = {
    startedAt: new Date().toISOString(),
    scope: 'Separate fresh PGlite instance with baseline and 26 pre-repair migrations; original trigger order dependence is a reproduced failure, not repaired behavior.',
    sqlSourceManifest: manifest,
    status: 'RUNNING',
  };
  try {
    await beforeDb.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [userA, 'recompute-before@zarix.invalid']);
    const source = randomUUID(), expenseFirst = randomUUID(), creditsFirst = randomUUID();
    for (const id of [source, expenseFirst, creditsFirst]) {
      await beforeDb.query(`INSERT INTO public.accounts(id,user_id,name,type,currency,balance)
        VALUES($1,$2,'Synthetic original rounding fixture','bank','ARS',0)`, [id, userA]);
    }
    const expense = destination => asRole(beforeDb, 'service_role', null, tx => tx.query(`INSERT INTO public.transactions
      (user_id,type,account_id,amount,currency,amount_in_account_currency,transaction_date)
      VALUES($1,'expense',$2,0.00000001,'ARS',0.00000001,'2026-10-15T12:00:00Z')`, [userA, destination]));
    const credit = destination => asRole(beforeDb, 'service_role', null, tx => tx.query(`INSERT INTO public.transactions
      (user_id,type,account_id,destination_account_id,amount,currency,amount_in_account_currency,exchange_rate,transaction_date)
      VALUES($1,'transfer',$2,$3,0.00000001,'ARS',0.00000001,0.5,'2026-10-15T12:00:00Z')`, [userA, source, destination]));
    await expense(expenseFirst);
    await credit(expenseFirst);
    await credit(expenseFirst);
    await credit(creditsFirst);
    await credit(creditsFirst);
    await expense(creditsFirst);
    const originalBalance = async id => canonical((await beforeDb.query(
      'SELECT balance::text AS value FROM public.accounts WHERE id=$1', [id])).rows[0].value);
    assert.equal(await originalBalance(expenseFirst), '-0.00000001');
    assert.equal(await originalBalance(creditsFirst), '0.00000001');
    // The identical multiset of original impacts has one raw sum in both cases.
    const rawLedger = async id => canonical((await beforeDb.query(`SELECT sum(impact)::text AS value FROM (
      SELECT -amount_in_account_currency AS impact FROM public.transactions
        WHERE account_id=$1 AND type='expense'
      UNION ALL
      SELECT amount*coalesce(exchange_rate,1) FROM public.transactions
        WHERE destination_account_id=$1 AND type='transfer') ledger`, [id])).rows[0].value);
    assert.equal(await rawLedger(expenseFirst), '0');
    assert.equal(await rawLedger(creditsFirst), '0');
    report.beforeProof.status = 'ORIGINAL_FAILURE_REPRODUCED';
    report.beforeProof.passed = 1;
    report.beforeProof.total = 1;
    report.beforeProof.results = [{ id: 'RECOMPUTE-BEFORE-01', name: 'Original trigger produces different balances for identical impacts in opposite orders', status: 'PASS' }];
  } catch (error) {
    report.beforeProof.status = 'FAIL';
    report.beforeProof.error = safeError(error, 'original-rounding-order-proof');
    throw error;
  } finally {
    await beforeDb.close();
    report.beforeProof.finishedAt = new Date().toISOString();
  }
};

try {
  const sourceFiles = await bootstrapSources();
  report.scriptSha256 = digest(await fs.readFile(fileURLToPath(import.meta.url)));
  assert.ok(sourceFiles.some(file => file.path === repairMigration));
  await proveOriginalRoundingOrder(sourceFiles);
  ({ db, manifest: report.sqlSourceManifest } = await bootDatabase({ legacyGrants: true, sourceFiles }));
  report.engine = (await db.query('SELECT version() AS version')).rows[0].version;
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2),($3,$4)', [
    userA, 'recompute-a@zarix.invalid', userB, 'recompute-b@zarix.invalid',
  ]);
  // Keep account quota out of this ledger test while exercising its real triggers.
  await db.exec("UPDATE public.users SET status='ACTIVE',current_period_end=now()+interval '1 month'");

  await test('RECOMPUTE-01', 'RPC is SECURITY INVOKER, JSONB, and executable only by service_role', async () => {
    const row = (await db.query(`SELECT p.prosecdef,p.proconfig, p.prorettype::regtype::text AS return_type,
      has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
      FROM pg_proc p WHERE p.oid=$1::regprocedure`, [signature])).rows[0];
    assert.ok(row);
    assert.equal(row.prosecdef, false);
    assert.equal(row.return_type, 'jsonb');
    assert.ok(row.proconfig.includes('search_path=""'));
    assert.equal(row.anon_execute, false);
    assert.equal(row.authenticated_execute, false);
    assert.equal(row.service_execute, true);
  });

  await test('RECOMPUTE-02', 'anon and authenticated owners A/B cannot invoke RPC or change balances', async () => {
    const a = await account(), b = await account({ owner: userB });
    await entry(a, { amount: '100' });
    await entry(b, { owner: userB, amount: '50' });
    await corruptBalance(a, '91');
    await corruptBalance(b, '92');
    for (const [role, caller] of [['anon', null], ['authenticated', userA], ['authenticated', userB]]) {
      for (const [owner, accountId] of [[userA, a], [userB, b]]) {
        await expectCode(asRole(db, role, caller, tx => tx.query(
          'SELECT public.recompute_account_balance($1,$2)', [owner, accountId])), '42501');
      }
    }
    assert.equal(await balance(a), '91');
    assert.equal(await balance(b), '92');
    assert.equal(await countLedger(), 2);
  });

  await test('RECOMPUTE-03', 'wrong owner and missing account fail without modifying either tenant', async () => {
    const a = await account(), b = await account({ owner: userB });
    await entry(a, { amount: '100' });
    await entry(b, { owner: userB, amount: '50' });
    await corruptBalance(a, '91');
    await corruptBalance(b, '92');
    await expectCode(recompute(userA, b), '42501');
    await expectCode(recompute(userB, a), '42501');
    await expectCode(recompute(userA, randomUUID()), '42501');
    assert.equal(await balance(a), '91');
    assert.equal(await balance(b), '92');
    assert.equal(await countLedger(), 2);
  });

  await test('RECOMPUTE-04', 'an empty ledger recomputes to zero rather than preserving a corrupt baseline', async () => {
    const a = await account();
    await corruptBalance(a);
    expectResult(await recompute(userA, a), '777', '0');
    assert.equal(await balance(a), '0');
    expectResult(await recompute(userA, a), '0', '0');
  });

  await test('RECOMPUTE-05', 'initial and signed adjustments plus income, expense, and source transfer retain eight decimals', async () => {
    const a = await account(), peer = await account({ currency: 'USD' });
    await entry(a, { type: 'adjustment', amount: '500' });
    await entry(a, { amount: '1', inAccount: '123.45678901', currency: 'USD' });
    await entry(a, { type: 'expense', amount: '1', inAccount: '23.45678901', currency: 'USD' });
    await entry(a, { type: 'transfer', amount: '12.5', destination: peer, credit: '17.75' });
    await entry(a, { type: 'adjustment', amount: '88.125', inAccount: '-88.125' });
    assert.equal(await balance(a), '499.375');
    await corruptBalance(a, '9999');
    expectResult(await recompute(userA, a), '9999', '499.375');
    assert.equal(await balance(a), '499.375');
    assert.equal(await balance(peer), '17.75');
  });

  await test('RECOMPUTE-06', 'the authoritative SQL sum includes more than 1000 ledger rows', async () => {
    const a = await account();
    await asRole(db, 'service_role', null, tx => tx.query(`INSERT INTO public.transactions
      (user_id,type,account_id,amount,currency,amount_in_account_currency,description)
      SELECT $1,'income',$2,1.00000001,'ARS',1.00000001,'Synthetic full ledger'
      FROM generate_series(1,1005)`, [userA, a]));
    await asRole(db, 'service_role', null, tx => tx.query(`INSERT INTO public.transactions
      (user_id,type,account_id,amount,currency,amount_in_account_currency,description)
      SELECT $1,'expense',$2,0.5,'ARS',0.5,'Synthetic full ledger'
      FROM generate_series(1,17)`, [userA, a]));
    assert.equal(await countLedger(), 1022);
    await corruptBalance(a);
    expectResult(await recompute(userA, a), '777', '996.50001005');
    assert.equal(await balance(a), '996.50001005');
  });

  await test('RECOMPUTE-07', 'destination credit uses the stored amount through edit, replay, and deletion', async () => {
    const source = await account(), destination = await account({ currency: 'USD' });
    const id = await entry(source, { type: 'transfer', amount: '120000', destination,
      rate: '0.00083333', credit: '100' });
    await corruptBalance(destination);
    expectResult(await recompute(userA, destination), '777', '100');
    assert.equal(await balance(destination), '100');
    await db.query(`UPDATE public.transactions SET amount=240000,amount_in_account_currency=240000,
      destination_amount_in_account_currency=200 WHERE id=$1`, [id]);
    expectResult(await recompute(userA, destination), '200', '200');
    await corruptBalance(source);
    expectResult(await recompute(userA, source), '777', '-240000');
    await db.query('DELETE FROM public.transactions WHERE id=$1', [id]);
    expectResult(await recompute(userA, destination), '0', '0');
    assert.equal(await balance(destination), '0');
  });

  await test('RECOMPUTE-08', 'reverse FX transfer retains its independently stored destination credit', async () => {
    const source = await account({ currency: 'USD' }), destination = await account();
    await entry(source, { type: 'transfer', amount: '100', currency: 'USD', destination,
      rate: '1199.99999999', credit: '120000' });
    await corruptBalance(destination);
    expectResult(await recompute(userA, destination), '777', '120000');
    assert.equal(await balance(destination), '120000');
  });

  await test('RECOMPUTE-09', 'historical destination fallback rounds each credit to eight decimals and null rate defaults to one', async () => {
    const source = await account(), destination = await account({ currency: 'USD' });
    await entry(source, { type: 'transfer', amount: '10', inAccount: '100', destination, rate: '2.5' });
    await entry(source, { type: 'transfer', amount: '7.5', inAccount: '9', destination });
    await entry(source, { type: 'transfer', amount: '1.00000001', destination, rate: '0.5' });
    await entry(source, { type: 'transfer', amount: '1.00000001', destination, rate: '0.5' });
    // Rounding only the final sum would discard one stored eighth-decimal unit.
    const rawSum = canonical((await db.query(`SELECT sum(amount*coalesce(exchange_rate,1))::text AS amount
      FROM public.transactions WHERE destination_account_id=$1`, [destination])).rows[0].amount);
    assert.equal(rawSum, '33.50000001');
    assert.equal(await balance(destination), '33.50000002');
    await corruptBalance(destination);
    expectResult(await recompute(userA, destination), '777', '33.50000002');
    assert.equal(await balance(destination), '33.50000002');
  });

  await test('RECOMPUTE-10', 'secondary USD card adjustments are excluded without excluding USD income or expense', async () => {
    const card = await account({ type: 'credit_card', multicurrency: true, secondary: 'USD' });
    await entry(card, { type: 'adjustment', amount: '10', inAccount: '10000', currency: 'USD' });
    await entry(card, { type: 'adjustment', amount: '2', inAccount: '-2000', currency: ' USD ' });
    await entry(card, { type: 'adjustment', amount: '100' });
    await entry(card, { type: 'expense', amount: '1', inAccount: '1250', currency: 'USD' });
    await entry(card, { amount: '2', inAccount: '2500', currency: 'USD' });
    await entry(card, { type: 'adjustment', amount: '5', inAccount: '42', currency: 'EUR' });
    assert.equal(await balance(card), '1392');
    await corruptBalance(card);
    expectResult(await recompute(userA, card), '777', '1392');
    assert.equal(await balance(card), '1392');
  });

  await test('RECOMPUTE-11', 'secondary exclusion applies only to enabled multicurrency cards with a secondary currency', async () => {
    for (const [options, expected] of [
      [{ type: 'bank', multicurrency: true, secondary: 'USD' }, '75'],
      [{ type: 'credit_card', multicurrency: false, secondary: 'USD' }, '55'],
      [{ type: 'credit_card', multicurrency: true, secondary: null }, '20'],
    ]) {
      const a = await account(options);
      await entry(a, { type: 'adjustment', amount: '10', inAccount: expected, currency: 'USD' });
      await corruptBalance(a);
      expectResult(await recompute(userA, a), '777', expected);
      assert.equal(await balance(a), expected);
    }
  });

  await test('RECOMPUTE-12', 'editing source account and transaction type follows the current committed ledger', async () => {
    const a = await account(), b = await account();
    const id = await entry(a, { type: 'expense', amount: '10' });
    await db.query("UPDATE public.transactions SET account_id=$1,type='income',amount=25,amount_in_account_currency=25 WHERE id=$2", [b, id]);
    await corruptBalance(a);
    await corruptBalance(b);
    expectResult(await recompute(userA, a), '777', '0');
    expectResult(await recompute(userA, b), '777', '25');
    await db.query('DELETE FROM public.transactions WHERE id=$1', [id]);
    expectResult(await recompute(userA, b), '0', '0');
  });

  await test('RECOMPUTE-13', 'a fault after UPDATE rolls back the new balance and side effects', async () => {
    const a = await account();
    await entry(a, { amount: '100' });
    await corruptBalance(a);
    await db.exec(`CREATE TABLE public.recompute_fault_fixture(n integer);
      GRANT INSERT ON public.recompute_fault_fixture TO service_role;
      CREATE FUNCTION public.recompute_fault_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO public.recompute_fault_fixture VALUES(1);
        RAISE EXCEPTION 'Synthetic post-update failure' USING ERRCODE='Z0100';
      END $$;
      CREATE TRIGGER recompute_fault_fixture AFTER UPDATE OF balance ON public.accounts
      FOR EACH ROW EXECUTE FUNCTION public.recompute_fault_fixture();`);
    try {
      await expectCode(recompute(userA, a), 'Z0100');
      assert.equal(await balance(a), '777');
      assert.equal(await countLedger(), 1);
      assert.equal(Number((await db.query('SELECT count(*) AS n FROM public.recompute_fault_fixture')).rows[0].n), 0);
    } finally {
      await db.exec(`DROP TRIGGER recompute_fault_fixture ON public.accounts;
        DROP FUNCTION public.recompute_fault_fixture(); DROP TABLE public.recompute_fault_fixture;`);
    }
    expectResult(await recompute(userA, a), '777', '100');
  });

  await test('RECOMPUTE-14', 'old read then committed income then stale UPDATE loses an effect; RPC repairs the ledger', async () => {
    const a = await account();
    await entry(a, { amount: '100' });
    const staleRead = (await db.query(`SELECT sum(amount_in_account_currency)::text AS amount
      FROM public.transactions WHERE user_id=$1 AND account_id=$2`, [userA, a])).rows[0].amount;
    await entry(a, { amount: '25' });
    assert.equal(await balance(a), '125');
    // Represents the legacy application strategy after another command commits.
    await asRole(db, 'service_role', null, tx => tx.query(
      'UPDATE public.accounts SET balance=$1 WHERE id=$2 AND user_id=$3', [staleRead, a, userA]));
    assert.equal(await balance(a), '100');
    const committedLedger = canonical((await db.query(`SELECT sum(amount_in_account_currency)::text AS amount
      FROM public.transactions WHERE user_id=$1 AND account_id=$2`, [userA, a])).rows[0].amount);
    assert.equal(committedLedger, '125');
    assert.equal(await countLedger(), 2);
    expectResult(await recompute(userA, a), '100', '125');
    assert.equal(await balance(a), '125');
  });

  await test('RECOMPUTE-15', 'a service-role call carrying another user claim is rejected without a write', async () => {
    const a = await account();
    await entry(a, { amount: '100' });
    await corruptBalance(a);
    await expectCode(asRole(db, 'service_role', userB, tx => tx.query(
      'SELECT public.recompute_account_balance($1,$2)', [userA, a])), '42501');
    assert.equal(await balance(a), '777');
    assert.equal(await countLedger(), 1);
    expectResult(await recompute(userA, a), '777', '100');
  });

  await test('RECOMPUTE-16', 'a single legacy half-unit credit crossing zero is independent of insertion order', async () => {
    for (const expenseFirst of [true, false]) {
      const { source, destination } = await roundingOrderFixture(1, expenseFirst);
      assert.equal(await balance(source), '-0.00000001');
      assert.equal(await balance(destination), '0');
      expectResult(await recompute(userA, destination), '0', '0');
      assert.equal(await balance(destination), '0');
    }
    assert.equal(await countLedger(), 4);
  });

  await test('RECOMPUTE-17', 'two legacy half-unit credits and an expense match RPC in either insertion order', async () => {
    for (const expenseFirst of [true, false]) {
      const { source, destination } = await roundingOrderFixture(2, expenseFirst);
      assert.equal(await balance(source), '-0.00000002');
      assert.equal(await balance(destination), '0.00000001');
      expectResult(await recompute(userA, destination), '0.00000001', '0.00000001');
      assert.equal(await balance(destination), '0.00000001');
    }
    assert.equal(await countLedger(), 6);
  });

  await test('RECOMPUTE-18', 'legacy fractional credit edit and deletion reverse the same rounded impact', async () => {
    const source = await account(), destination = await account();
    await entry(destination, { type: 'expense', amount: '0.00000001' });
    const id = await entry(source, { type: 'transfer', amount: '0.00000001', destination, rate: '0.5' });
    assert.equal(await balance(destination), '0');
    expectResult(await recompute(userA, destination), '0', '0');
    await db.query(`UPDATE public.transactions SET amount=0.00000003,amount_in_account_currency=0.00000003
      WHERE id=$1`, [id]);
    assert.equal(await balance(source), '-0.00000003');
    assert.equal(await balance(destination), '0.00000001');
    expectResult(await recompute(userA, destination), '0.00000001', '0.00000001');
    await db.query('DELETE FROM public.transactions WHERE id=$1', [id]);
    assert.equal(await balance(source), '0');
    assert.equal(await balance(destination), '-0.00000001');
    expectResult(await recompute(userA, destination), '-0.00000001', '-0.00000001');
    assert.equal(await countLedger(), 1);
  });
} catch (error) {
  report.setupError = safeError(error, 'fresh-fixture-setup');
} finally {
  if (db) {
    try { await db.close(); }
    catch (error) { report.closeError = safeError(error, 'fresh-fixture-close'); }
  }
  report.finishedAt = new Date().toISOString();
  report.passed = results.filter(result => result.status === 'PASS').length;
  report.total = results.length;
  report.status = !report.setupError && !report.closeError && report.beforeProof?.status === 'ORIGINAL_FAILURE_REPRODUCED'
    && report.total === 18 && report.passed === report.total ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'PASS') process.exitCode = 1;
}
