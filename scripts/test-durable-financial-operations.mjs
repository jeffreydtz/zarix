// Isolated real PL/pgSQL regression. No production data, provider calls or credentials.
import assert from 'node:assert/strict';
import { bootDatabase, seedDatabase, asRole, ids } from './lib/test-isolated-database.mjs';
const { db, manifest } = await bootDatabase({ legacyGrants: true });
const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', error: e.message }); }
};
const hash = 'a'.repeat(64), otherHash = 'b'.repeat(64);
const row = (overrides = {}) => ({ user_id: ids.a, type: 'expense', account_id: ids.accountA,
  amount: 100, currency: 'ARS', amount_in_account_currency: 100,
  transaction_date: '2026-10-09T12:00:00Z', ...overrides });
const create = (key, data = row(), fingerprint = hash, installments = 1) => asRole(db, 'service_role', null, async tx =>
  (await tx.query('SELECT public.create_transaction_once($1,$2,$3,$4,$5) AS receipt',
    [ids.a, key, fingerprint, JSON.stringify(data), installments])).rows[0].receipt);
const balance = async () => Number((await db.query('SELECT balance FROM accounts WHERE id=$1', [ids.accountA])).rows[0].balance);
const count = async table => Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
try {
  await seedDatabase(db);
  await test('response loss/restart replay returns exact persisted result and one debit', async () => {
    const before = await balance();
    const first = await create('manual:request:1');
    const replay = await create('manual:request:1');
    assert.deepEqual(replay, first); assert.equal(await balance(), before - 100);
    assert.equal(await count('transaction_requests'), 1);
  });
  await test('identical legitimate operations have different IDs and both debit', async () => {
    const before = await balance();
    const [a, b] = await Promise.all([create('manual:request:2'), create('manual:request:3')]);
    assert.notEqual(a.id, b.id); assert.equal(await balance(), before - 200);
  });
  await test('same-key submitted together is replayed once (single-session scheduling)', async () => {
    const before = await balance();
    const [a, b] = await Promise.all([create('manual:request:4'), create('manual:request:4')]);
    assert.deepEqual(a, b); assert.equal(await balance(), before - 100);
  });
  await test('changed payload is a conflict, not another financial operation', async () => {
    const before = await balance();
    await assert.rejects(create('manual:request:1', row({ amount: 101 }), otherHash), e => e.code === 'Z0001');
    assert.equal(await balance(), before);
  });
  await test('receipt remains after transaction deletion; retry does not recreate it', async () => {
    const receipt = await create('manual:request:deleted');
    await db.query('DELETE FROM transactions WHERE id=$1', [receipt.id]);
    const before = await balance();
    assert.deepEqual(await create('manual:request:deleted'), receipt);
    assert.equal(await balance(), before);
    assert.equal((await db.query('SELECT id FROM transactions WHERE id=$1', [receipt.id])).rows.length, 0);
  });
  await test('installment group and first response share one atomic receipt', async () => {
    const before = await balance();
    const data = row({ amount: 300, description: 'Cuotas' });
    const a = await create('manual:installment:1', data, hash, 3);
    const b = await create('manual:installment:1', data, hash, 3);
    assert.deepEqual(a, b);
    const group = await db.query('SELECT amount FROM transactions WHERE installment_group_id=$1', [a.installment_group_id]);
    assert.equal(group.rows.length, 3); assert.equal(await balance(), before - 300);
  });
  await test('tenant mismatch cannot write a transaction or receipt', async () => {
    const before = await count('transaction_requests');
    await assert.rejects(create('manual:tenant:1', row({ user_id: ids.b, account_id: ids.accountB })));
    await assert.rejects(create('manual:tenant:2', row({ account_id: ids.accountB })));
    assert.equal(await count('transaction_requests'), before);
  });
  const rule = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await db.query("UPDATE users SET status='ACTIVE',current_period_end=now()+interval '1 month' WHERE id=$1", [ids.a]);
  await db.query(`INSERT INTO recurring_rules(id,user_id,account_id,type,amount,currency,description,frequency,start_date)
    VALUES($1,$2,$3,'expense',100,'ARS','Alquiler','daily','2026-10-01')`, [rule, ids.a, ids.accountA]);
  const recurring = row({ is_recurring: true, recurring_rule_id: rule, description: 'Alquiler' });
  await test('recurring financial insert, date marker, reply and notification commit together', async () => {
    const before = await balance();
    const receipt = await create(`recurring:${rule}:2026-10-09`, recurring);
    assert.deepEqual(await create(`recurring:${rule}:2026-10-09`, recurring), receipt);
    assert.equal(await balance(), before - 100);
    assert.equal((await db.query('SELECT last_executed_date::text AS last_executed_date FROM recurring_rules WHERE id=$1', [rule])).rows[0].last_executed_date, '2026-10-09');
    const outbox = (await db.query('SELECT * FROM notification_outbox')).rows;
    assert.equal(outbox.length, 1); assert.equal(outbox[0].payload.transactionId, receipt.id);
    assert.equal(outbox[0].delivered_at, null);
  });
  await test('failure after financial insert rolls back balance, marker, receipt and outbox', async () => {
    const before = await balance(), txCount = await count('transactions'), outCount = await count('notification_outbox');
    await db.exec(`CREATE FUNCTION fail_receipt_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.request_id = 'fixture:rollback' THEN RAISE EXCEPTION 'fixture failure after insert'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER fail_receipt_fixture BEFORE INSERT ON transaction_requests FOR EACH ROW EXECUTE FUNCTION fail_receipt_fixture();`);
    await assert.rejects(create('fixture:rollback', { ...recurring, transaction_date: '2026-10-10T12:00:00Z' }), /fixture failure/);
    assert.equal(await balance(), before); assert.equal(await count('transactions'), txCount);
    assert.equal(await count('notification_outbox'), outCount);
    assert.equal((await db.query('SELECT last_executed_date::text AS last_executed_date FROM recurring_rules WHERE id=$1', [rule])).rows[0].last_executed_date, '2026-10-09');
    assert.equal((await db.query("SELECT * FROM transaction_requests WHERE request_id='fixture:rollback'")).rows.length, 0);
    await db.exec('DROP TRIGGER fail_receipt_fixture ON transaction_requests; DROP FUNCTION fail_receipt_fixture();');
  });
  await test('claim excludes leased messages and retries with a fresh lease after expiry', async () => {
    const first = await asRole(db, 'service_role', null, tx => tx.query('SELECT * FROM claim_notification_outbox(10)'));
    assert.equal(first.rows.length, 1); assert.equal(first.rows[0].attempts, 1);
    assert.equal((await db.query('SELECT * FROM claim_notification_outbox(10)')).rows.length, 0);
    await db.exec("UPDATE notification_outbox SET lease_until=now()-interval '1 second'");
    const retry = (await db.query('SELECT * FROM claim_notification_outbox(10)')).rows[0];
    assert.equal(retry.id, first.rows[0].id); assert.equal(retry.attempts, 2);
    assert.notEqual(retry.lease_token, first.rows[0].lease_token);
    const before = await balance();
    const stale = await db.query('UPDATE notification_outbox SET delivered_at=now() WHERE id=$1 AND lease_token=$2 RETURNING id', [retry.id, first.rows[0].lease_token]);
    assert.equal(stale.rows.length, 0);
    await db.query('UPDATE notification_outbox SET delivered_at=now() WHERE id=$1 AND lease_token=$2', [retry.id, retry.lease_token]);
    assert.equal((await db.query('SELECT * FROM claim_notification_outbox(10)')).rows.length, 0);
    assert.equal(await balance(), before);
  });
  await test('committed replay survives downgrade and movement account disablement', async () => {
    const receipt = await create('manual:request:1');
    await db.query("UPDATE users SET status='PAST_DUE', current_period_end=now()-interval '1 day' WHERE id=$1", [ids.a]);
    await db.query('UPDATE accounts SET movement_enabled=false WHERE id=$1', [ids.accountA]);
    const before = await balance();
    assert.deepEqual(await create('manual:request:1'), receipt); assert.equal(await balance(), before);
    await assert.rejects(create('manual:new:disabled'));
  });
  await test('browser roles cannot invoke server-only RPC or inspect receipt/outbox payloads', async () => {
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(asRole(db, role, role === 'authenticated' ? ids.a : null, tx => tx.query('SELECT * FROM transaction_requests')));
      await assert.rejects(asRole(db, role, role === 'authenticated' ? ids.a : null, tx => tx.query('SELECT * FROM notification_outbox')));
      await assert.rejects(asRole(db, role, role === 'authenticated' ? ids.a : null, tx => tx.query('SELECT * FROM claim_notification_outbox(1)')));
      await assert.rejects(asRole(db, role, role === 'authenticated' ? ids.a : null, tx => tx.query('SELECT create_transaction_once($1,$2,$3,$4,1)', [ids.a, 'not:authorized', hash, JSON.stringify(row())])));
    }
  });

  const sellData = { p_investment_id:ids.investmentA,p_quantity:2,p_price:30,p_currency:'USD',
    p_sold_at:'2026-10-09',p_realized_pnl_native:20,p_realized_pnl_usd:20,p_ars_per_usd:1200,
    p_expected_purchase_price:20,p_expected_purchase_currency:'USD',p_expected_type:'stock_us' };
  const sell = (key, sale=sellData, fingerprint=hash) => asRole(db,'service_role',null,async tx =>
    (await tx.query('SELECT sell_investment_once($1,$2,$3,$4) AS result',[ids.a,key,fingerprint,JSON.stringify(sale)])).rows[0].result);
  await test('investment response loss repeats neither quantity reduction nor sale',async()=>{
    const a=await sell('sale:request:1'), b=await sell('sale:request:1');
    assert.deepEqual(a,b);assert.equal(a.remaining_quantity,8);
    assert.equal(Number((await db.query('SELECT quantity FROM investments WHERE id=$1',[ids.investmentA])).rows[0].quantity),8);
    assert.equal(await count('investment_sales'),1);
    const distinct=await sell('sale:request:2');assert.notEqual(distinct.sale.id,a.sale.id);assert.equal(distinct.remaining_quantity,6);
    await assert.rejects(sell('sale:request:1',{...sellData,p_quantity:3},otherHash),e=>e.code==='Z0001');
  });
  await test('full liquidation replay still returns committed response after position closes',async()=>{
    const full={...sellData,p_quantity:6};const a=await sell('sale:close:1',full);
    assert.equal(a.position_closed,true);
    await db.query("UPDATE investments SET purchase_price=999,purchase_currency='ARS',type='bond' WHERE id=$1",[ids.investmentA]);
    assert.deepEqual(await sell('sale:close:1',full),a);
    assert.equal(await count('investment_sales'),3);
  });
  await test('stale price, currency or type rejects atomically after the basis row is locked',async()=>{
    const snapshot={...sellData,p_investment_id:ids.investmentB,p_expected_purchase_price:30};
    const beforeSales=await count('investment_sales'),beforeReceipts=await count('investment_sale_requests');
    for(const [field,value] of [['purchase_price',31],['purchase_currency','ARS'],['type','bond']]) {
      await db.query(`UPDATE investments SET ${field}=$1 WHERE id=$2`,[value,ids.investmentB]);
      await assert.rejects(asRole(db,'service_role',null,tx=>tx.query('SELECT sell_investment_once($1,$2,$3,$4)',
        [ids.b,`sale:stale:${field}`,hash,JSON.stringify(snapshot)])),e=>e.code==='Z0002');
      assert.equal(Number((await db.query('SELECT quantity FROM investments WHERE id=$1',[ids.investmentB])).rows[0].quantity),5);
      assert.equal(await count('investment_sales'),beforeSales);assert.equal(await count('investment_sale_requests'),beforeReceipts);
      await db.query("UPDATE investments SET purchase_price=30,purchase_currency='USD',type='stock_us' WHERE id=$1",[ids.investmentB]);
    }
    const missing={...snapshot};delete missing.p_expected_type;
    await assert.rejects(asRole(db,'service_role',null,tx=>tx.query('SELECT sell_investment_once($1,$2,$3,$4)',
      [ids.b,'sale:stale:missing',hash,JSON.stringify(missing)])),e=>e.code==='Z0002');
  });
  await test('sale receipt failure rolls quantity and sale back atomically',async()=>{
    await db.exec(`CREATE FUNCTION fail_sale_receipt_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'sale receipt fixture'; END $$;
      CREATE TRIGGER fail_sale_receipt_fixture BEFORE INSERT ON investment_sale_requests FOR EACH ROW EXECUTE FUNCTION fail_sale_receipt_fixture();`);
    const before=await count('investment_sales');
    await assert.rejects(asRole(db,'service_role',null,tx=>tx.query('SELECT sell_investment_once($1,$2,$3,$4)',
      [ids.b,'sale:rollback:1',hash,JSON.stringify({...sellData,p_investment_id:ids.investmentB,p_expected_purchase_price:30})])),/sale receipt fixture/);
    assert.equal(Number((await db.query('SELECT quantity FROM investments WHERE id=$1',[ids.investmentB])).rows[0].quantity),5);
    assert.equal(await count('investment_sales'),before);
    await db.exec('DROP TRIGGER fail_sale_receipt_fixture ON investment_sale_requests;DROP FUNCTION fail_sale_receipt_fixture();');
  });
  await db.query("UPDATE accounts SET type='investment' WHERE id=$1",[ids.usdA]);
  const investmentData={user_id:ids.a,account_id:ids.usdA,type:'stock_us',name:'Nueva posición',quantity:2,
    purchase_price:20,purchase_currency:'USD',purchase_date:'2026-10-09',is_manual_price:true,current_price:22,
    current_price_updated_at:'2026-10-09T12:00:00Z'};
  const createInvestment=(key,data=investmentData,fingerprint=hash)=>asRole(db,'service_role',null,async tx=>
    (await tx.query('SELECT create_investment_once($1,$2,$3,$4) AS result',[ids.a,key,fingerprint,JSON.stringify(data)])).rows[0].result);
  await test('investment create response-loss replay creates one lot; new request creates a distinct lot',async()=>{
    const before=await count('investments');
    const [a,b]=await Promise.all([createInvestment('investment:create:1'),createInvestment('investment:create:1')]);
    assert.deepEqual(a,b);assert.equal(await count('investments'),before+1);
    const distinct=await createInvestment('investment:create:2');assert.notEqual(a.id,distinct.id);
    await assert.rejects(createInvestment('investment:create:1',{...investmentData,quantity:3},otherHash),e=>e.code==='Z0001');
    assert.equal(await count('investments'),before+2);
  });
  await test('investment create receipt outlives later edits, deletion and account deactivation',async()=>{
    const original=await createInvestment('investment:create:1');
    await db.query('UPDATE investments SET quantity=7,purchase_price=40 WHERE id=$1',[original.id]);
    assert.deepEqual(await createInvestment('investment:create:1'),original);
    await db.query('DELETE FROM investments WHERE id=$1',[original.id]);
    await db.query('UPDATE accounts SET is_active=false WHERE id=$1',[ids.usdA]);
    const before=await count('investments');assert.deepEqual(await createInvestment('investment:create:1'),original);
    assert.equal(await count('investments'),before);
    await assert.rejects(createInvestment('investment:create:disabled'));
    await db.query('UPDATE accounts SET is_active=true WHERE id=$1',[ids.usdA]);
  });
  await test('investment create rejects another owner and invalid account without a receipt',async()=>{
    const before=await count('investments'),receipts=await count('investment_create_requests');
    await assert.rejects(createInvestment('investment:create:tenant',{...investmentData,account_id:ids.accountB}));
    await assert.rejects(createInvestment('investment:create:payload-owner',{...investmentData,user_id:ids.b}));
    await assert.rejects(createInvestment('investment:create:wrong-type',{...investmentData,account_id:ids.accountA}));
    assert.equal(await count('investments'),before);assert.equal(await count('investment_create_requests'),receipts);
  });
  await test('investment create receipt failure rolls back the new lot',async()=>{
    const before=await count('investments'),receipts=await count('investment_create_requests');
    await db.exec(`CREATE FUNCTION fail_investment_receipt_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'investment receipt fixture'; END $$;
      CREATE TRIGGER fail_investment_receipt_fixture BEFORE INSERT ON investment_create_requests FOR EACH ROW EXECUTE FUNCTION fail_investment_receipt_fixture();`);
    await assert.rejects(createInvestment('investment:create:rollback'),/investment receipt fixture/);
    assert.equal(await count('investments'),before);assert.equal(await count('investment_create_requests'),receipts);
    await db.exec('DROP TRIGGER fail_investment_receipt_fixture ON investment_create_requests;DROP FUNCTION fail_investment_receipt_fixture();');
  });
  const sharedData={ p_actor_member_id:ids.memberA,p_paid_by_member_id:ids.memberA,p_description:'Asado',
    p_amount:10,p_expense_date:'2026-10-09',p_split_member_ids:[ids.memberA,ids.guestA] };
  const shared=(key,expense=sharedData,fingerprint=hash,token=ids.tokenA)=>asRole(db,'service_role',null,async tx=>
    (await tx.query('SELECT save_shared_expense_once($1,$2,$3,$4) AS result',[token,key,fingerprint,JSON.stringify(expense)])).rows[0].result);
  await test('shared expense and splits replay once; identical new expense is distinct',async()=>{
    const a=await shared('shared:request:1'),b=await shared('shared:request:1');assert.deepEqual(a,b);
    assert.equal(await count('shared_expenses'),1);assert.equal(await count('shared_expense_splits'),2);
    const c=await shared('shared:request:2');assert.notEqual(c.id,a.id);assert.equal(await count('shared_expenses'),2);
    await assert.rejects(shared('shared:request:1',{...sharedData,p_amount:12},otherHash),e=>e.code==='Z0001');
  });
  await test('shared edit replay cannot revert a later confirmed edit',async()=>{
    const original=await shared('shared:request:1');
    const edit={...sharedData,p_expense_id:original.id,p_amount:20};
    const a=await shared('shared:edit:1',edit);
    await shared('shared:edit:2',{...edit,p_amount:30});
    assert.deepEqual(await shared('shared:edit:1',edit),a);
    assert.equal(Number((await db.query('SELECT amount FROM shared_expenses WHERE id=$1',[original.id])).rows[0].amount),30);
  });
  await test('capability authorization precedes shared receipt replay',async()=>{
    assert.equal(await shared('shared:request:1',sharedData,hash,'0'.repeat(32)),null);
    await assert.rejects(shared('shared:request:1',sharedData,hash,ids.tokenB));
    await db.query('UPDATE shared_groups SET is_active=false WHERE id=$1',[ids.groupA]);
    assert.equal(await shared('shared:request:1'),null);
    await db.query('UPDATE shared_groups SET is_active=true WHERE id=$1',[ids.groupA]);
  });
  await test('shared receipt failure rolls expense and all splits back',async()=>{
    const expenses=await count('shared_expenses'),splits=await count('shared_expense_splits');
    await db.exec(`CREATE FUNCTION fail_shared_receipt_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'shared receipt fixture'; END $$;
      CREATE TRIGGER fail_shared_receipt_fixture BEFORE INSERT ON shared_expense_requests FOR EACH ROW EXECUTE FUNCTION fail_shared_receipt_fixture();`);
    await assert.rejects(shared('shared:rollback:1'),/shared receipt fixture/);
    assert.equal(await count('shared_expenses'),expenses);assert.equal(await count('shared_expense_splits'),splits);
    await db.exec('DROP TRIGGER fail_shared_receipt_fixture ON shared_expense_requests;DROP FUNCTION fail_shared_receipt_fixture();');
  });
  await test('sale and shared receipt tables and RPCs are server-only',async()=>{
    for(const role of ['anon','authenticated']) {
      const uid=role==='authenticated'?ids.a:null;
      for(const table of ['investment_sale_requests','investment_create_requests','shared_expense_requests']) {
        await assert.rejects(asRole(db,role,uid,tx=>tx.query(`SELECT * FROM ${table}`)));
      }
      await assert.rejects(asRole(db,role,uid,tx=>tx.query('SELECT create_investment_once($1,$2,$3,$4)',[ids.a,'investment:create:1',hash,JSON.stringify(investmentData)])));
      await assert.rejects(asRole(db,role,uid,tx=>tx.query('SELECT sell_investment_once($1,$2,$3,$4)',[ids.a,'sale:request:1',hash,JSON.stringify(sellData)])));
      await assert.rejects(asRole(db,role,uid,tx=>tx.query('SELECT save_shared_expense_once($1,$2,$3,$4)',[ids.tokenA,'shared:request:1',hash,JSON.stringify(sharedData)])));
    }
  });
  console.log(JSON.stringify({ engine: 'PGlite PostgreSQL WASM', scope: 'Real PL/pgSQL and role grants; simultaneous submissions serialized in one database session, not a multi-session contention claim; provider delivery tested separately with doubles', manifest, passed: results.filter(r => r.status === 'PASS').length, total: results.length, results }, null, 2));
  if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
} finally { await db.close(); }
