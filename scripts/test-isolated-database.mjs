// Full application-schema checks with real PostgreSQL role/RLS enforcement.
// No URLs, API keys, hosted databases or real users are used by this command.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { root, snapshotSource, baselineCommit, bootstrapSources, bootDatabase, emptyDatabase, seedDatabase, asRole, ids, source, catalog, digest } from './lib/test-isolated-database.mjs';

const outputDir = process.argv.find(a => a.startsWith('--output-dir='))?.slice(13);
const results = [];
async function test(profile, name, fn) {
  try { const evidence = await fn(); results.push({ profile, name, status:'PASS', ...(evidence === undefined ? {} : { evidence }) }); }
  catch(error) { results.push({ profile, name, status:'FAIL', error:error.message, code:error.code }); }
}
async function rejects(fn, codes = ['42501']) {
  let error;
  try { await fn(); } catch(e) { error=e; }
  assert.ok(error, 'Expected rejected operation but it succeeded');
  assert.ok(codes.includes(error.code), `Expected ${codes.join('/')} but got ${error.code}: ${error.message}`);
  return { code:error.code, message:error.message };
}
const queryAs = (db,role,user,sql,values=[]) => asRole(db,role,user,tx=>tx.query(sql,values));
const owner = (db,sql,values=[]) => queryAs(db,'authenticated',ids.a,sql,values);
const service = (db,sql,values=[]) => queryAs(db,'service_role',null,sql,values);
const balance = async(db,id=ids.accountA)=>Number((await db.query('SELECT balance FROM accounts WHERE id=$1',[id])).rows[0].balance);
const save = (db,options={})=>asRole(db,'service_role',null,async tx=>(await tx.query(
  'SELECT save_shared_expense($1,$2,$3,$4,$5,$6,$7,$8) AS result',
  [options.token??ids.tokenA,options.actor??ids.guestA,options.payer??ids.memberA,options.description??'Cena sintética',
    options.amount??10.01,'2026-10-08',options.members??null,options.expense??null])).rows[0].result);
const sell = (db,options={})=>asRole(db,'service_role',options.claim??null,async tx=>(await tx.query(
  'SELECT sell_investment_position($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result',
  [options.user??ids.a,options.investment??ids.investmentA,options.quantity??2,options.price??25,'USD','2026-10-08',
    options.pnl??10,options.pnlUsd??10,options.rate??1200,'Venta sintética'])).rows[0].result);
async function snapshot(db) {
  const tables = (await db.query(`SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','auth') ORDER BY schemaname,tablename`)).rows;
  const data = {};
  // All fixture tables have stable primary-key values. JSONB textual ordering
  // avoids JS float conversion when checking NUMERIC balances and quantities.
  for(const {schemaname:schema,tablename} of tables) {
    const name=`${schema}.${tablename}`;
    data[name]=(await db.query(`SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data::text),'[]')::text AS data FROM (SELECT to_jsonb(t) AS row_data FROM ${schema}."${tablename}" t) q`)).rows[0].data;
  }
  return data;
}

// Strict history probes are evidence of the pre-existing missing baseline,
// not a workaround that swallows duplicate-object errors.
const history = {};
for(const mode of ['migrations-only','snapshot-then-all-migrations']) {
  const db=await emptyDatabase();
  let current;
  try {
    if(mode.startsWith('snapshot')) await db.exec((await source(snapshotSource)).sql);
    for(const file of (await fs.readdir(path.join(root,'supabase/migrations'))).filter(f=>f.endsWith('.sql')).sort()) {
      current=file;await db.exec((await source(`supabase/migrations/${file}`)).sql);
    }
    history[mode]={status:'PASS'};
  } catch(e) { history[mode]={status:'BLOCKED',file:current,code:e.code,message:e.message}; }
  finally { await db.close(); }
}

const frozenSources=await bootstrapSources();
let finalManifest, engine, recovery;
for(const legacyGrants of [false,true]) {
  const profile=legacyGrants?'legacy-default-grants':'explicit-grants-only';
  const {db,manifest}=await bootDatabase({legacyGrants,sourceFiles:frozenSources});
  finalManifest=manifest;
  try {
    engine=(await db.query('SELECT version() AS v')).rows[0].v;
    if(!legacyGrants) await test(profile,'generated schema mirror equals complete chronological replay',async()=>{
      const mirror=await emptyDatabase();
      try { const file=await source('supabase/schema.sql');await mirror.exec(file.sql);assert.deepEqual(await catalog(mirror),await catalog(db));return {sha256:file.sha256}; }
      finally {await mirror.close();}
    });
    await seedDatabase(db);
    await test(profile,'two synthetic normal identities and one guest',async()=>{
      assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.users')).rows[0].n,2);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.users')).rows[0].n,2);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM shared_group_members WHERE user_id IS NULL')).rows[0].n,1);
      const roles=(await db.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated') ORDER BY 1")).rows;
      assert.ok(roles.every(r=>!r.rolsuper&&!r.rolbypassrls));return roles;
    });
    await test(profile,'every public table has RLS and views are invoker',async()=>{
      const c=await catalog(db);assert.ok(c.tables.every(t=>t.rls));assert.ok(c.views.every(v=>v.reloptions?.includes('security_invoker=true')));return {tables:c.tables.length,policies:c.policies.length};
    });
    await test(profile,'normal A and B see only their own accounts',async()=>{
      assert.deepEqual((await owner(db,'SELECT id FROM accounts ORDER BY id')).rows.map(r=>r.id),[ids.accountA,ids.usdA]);
      assert.deepEqual((await queryAs(db,'authenticated',ids.b,'SELECT id FROM accounts ORDER BY id')).rows.map(r=>r.id),[ids.accountB]);
    });
    await test(profile,'owner can create update and delete an account',async()=>asRole(db,'authenticated',ids.a,async tx=>{
      const id=(await tx.query("INSERT INTO accounts(user_id,name) VALUES ($1,'Temporal') RETURNING id",[ids.a])).rows[0].id;
      assert.equal((await tx.query("UPDATE accounts SET name='Editada' WHERE id=$1 RETURNING id",[id])).rows.length,1);
      assert.equal((await tx.query('DELETE FROM accounts WHERE id=$1 RETURNING id',[id])).rows.length,1);
    }));
    await test(profile,'other tenant account updates/deletes affect zero rows',async()=>{
      assert.equal((await owner(db,"UPDATE accounts SET name='No permitido' WHERE id=$1 RETURNING id",[ids.accountB])).rows.length,0);
      assert.equal((await owner(db,'DELETE FROM accounts WHERE id=$1 RETURNING id',[ids.accountB])).rows.length,0);
      assert.equal(await balance(db,ids.accountB),5000);
    });
    await test(profile,'owner cannot reassign account ownership',()=>rejects(()=>owner(db,'UPDATE accounts SET user_id=$1 WHERE id=$2',[ids.b,ids.accountA]),['42501','P0001']));
    for(const table of ['accounts','transactions','investments','shared_groups','users']) {
      await test(profile,`anon cannot read ${table}`,()=>rejects(()=>queryAs(db,'anon',null,`SELECT * FROM ${table}`)));
    }
    await test(profile,'own profile safe read and settings update work',async()=>{
      assert.deepEqual((await owner(db,'SELECT id,timezone FROM users')).rows.map(r=>r.id),[ids.a]);
      assert.equal((await owner(db,"UPDATE users SET timezone='Etc/UTC' WHERE id=$1 RETURNING timezone",[ids.a])).rows[0].timezone,'Etc/UTC');
    });
    for(const column of ['gemini_api_key','telegram_bot_token','telegram_link_code']) {
      await test(profile,`credential column ${column} is not readable`,()=>rejects(()=>owner(db,`SELECT ${column} FROM users`)));
    }
    for(const [column,value] of [['status',"'CANCELED'"],['telegram_chat_id','1234567'],['current_period_end',"now()+interval '1 year'"]]) {
      await test(profile,`profile cannot change privileged ${column}`,()=>rejects(()=>owner(db,`UPDATE users SET ${column}=${value} WHERE id=$1`,[ids.a])));
    }
    await test(profile,'own transaction CRUD and type edit preserve balance',async()=>{
      const initial=await balance(db);
      const id=(await owner(db,"INSERT INTO transactions(user_id,type,account_id,amount,currency,amount_in_account_currency) VALUES($1,'expense',$2,100,'ARS',100) RETURNING id",[ids.a,ids.accountA])).rows[0].id;
      assert.equal(await balance(db),initial-100);
      await owner(db,"UPDATE transactions SET type='income',amount=150,amount_in_account_currency=150 WHERE id=$1",[id]);
      assert.equal(await balance(db),initial+150);
      await owner(db,'DELETE FROM transactions WHERE id=$1',[id]);assert.equal(await balance(db),initial);
    });
    for(const value of ['NaN','Infinity','-Infinity']) {
      await test(profile,`normal-role nonfinite transaction ${value} cannot poison balance`,async()=>{
        const before=await snapshot(db);
        await rejects(()=>owner(db,"INSERT INTO transactions(user_id,type,account_id,amount,currency,amount_in_account_currency) VALUES($1,'expense',$2,$3,'ARS',$3)",[ids.a,ids.accountA,value]),['23514','22003']);
        assert.deepEqual(await snapshot(db),before);
      });
    }
    for(const [table,column,id] of [['accounts','balance',ids.accountA],['investments','quantity',ids.investmentA],['investments','purchase_price',ids.investmentA]]) {
      await test(profile,`normal-role ${table}.${column} rejects NaN`,async()=>{
        const before=await snapshot(db);await rejects(()=>owner(db,`UPDATE ${table} SET ${column}='NaN' WHERE id=$1`,[id]),['23514']);assert.deepEqual(await snapshot(db),before);
      });
    }
    await test(profile,'installment RPC works with extensions schema and conserves cents',async()=>{
      const initial=await balance(db);
      const group=(await service(db,"SELECT create_installment_transactions($1,$2,100,'ARS',3,NULL,'Cuotas sintéticas','2026-10-08') AS id",[ids.a,ids.accountA])).rows[0].id;
      const amounts=(await db.query('SELECT amount::text FROM transactions WHERE installment_group_id=$1 ORDER BY installment_number',[group])).rows.map(r=>Number(r.amount));
      assert.deepEqual(amounts,[33.33,33.33,33.34]);assert.equal(await balance(db),initial-100);
      await service(db,'DELETE FROM transactions WHERE installment_group_id=$1',[group]);assert.equal(await balance(db),initial);
    });
    await test(profile,'adjustment and bulk RPC lock order is user before account',async()=>{
      for(const signature of ['create_balance_adjustment(uuid,uuid,numeric)','create_secondary_balance_adjustment(uuid,uuid,numeric)','bulk_move_transactions(uuid,uuid,jsonb)']) {
        const definition=(await db.query('SELECT pg_get_functiondef($1::regprocedure) AS definition',[signature])).rows[0].definition;
        const userLock=definition.indexOf('FROM public.users WHERE id = p_user_id FOR UPDATE');
        const accountLock=definition.indexOf('FROM accounts');assert.ok(userLock>=0 && accountLock>userLock,signature);
      }
      await service(db,'SELECT create_balance_adjustment($1,$2,9999.99)',[ids.a,ids.accountA]);assert.equal(await balance(db),9999.99);
      return {scope:'Definition order and executed adjustment, not a native multi-session deadlock proof'};
    });
    await test(profile,'cross-tenant transaction references are rejected without debit',async()=>{
      const before=await snapshot(db);
      await rejects(()=>owner(db,"INSERT INTO transactions(user_id,type,account_id,amount,currency,amount_in_account_currency) VALUES($1,'expense',$2,1,'ARS',1)",[ids.a,ids.accountB]),['23503','P0001']);
      await rejects(()=>service(db,"INSERT INTO transactions(user_id,type,account_id,amount,currency,amount_in_account_currency) VALUES($1,'expense',$2,1,'ARS',1)",[ids.a,ids.accountB]),['23503','P0001']);
      assert.deepEqual(await snapshot(db),before);
    });
    await test(profile,'cross-tenant investment account is rejected',()=>rejects(()=>owner(db,"INSERT INTO investments(user_id,account_id,type,name,quantity,purchase_price,purchase_currency,purchase_date) VALUES($1,$2,'stock_us','Prueba',1,1,'USD','2026-10-01')",[ids.a,ids.accountB]),['23503']));
    await test(profile,'cross-tenant category is rejected',()=>rejects(()=>owner(db,"INSERT INTO budgets(user_id,category_id,month,amount) VALUES($1,$2,'2026-10-01',100)",[ids.a,ids.categoryB]),['23503']));
    await test(profile,'own category and budget work',async()=>{
      const row=await owner(db,"INSERT INTO budgets(user_id,category_id,month,amount) VALUES($1,$2,'2026-10-01',100) RETURNING id",[ids.a,ids.categoryA]);assert.equal(row.rows.length,1);
    });
    await test(profile,'system categories cannot be minted or modified',async()=>{
      await rejects(()=>owner(db,"INSERT INTO categories(user_id,name,type,is_system) VALUES($1,'Fake global','expense',true)",[ids.a]));
      assert.equal((await owner(db,"UPDATE categories SET name='Fake' WHERE is_system=true RETURNING id")).rows.length,0);
    });
    await test(profile,'exchange rates are read-only to authenticated users',async()=>{
      await owner(db,'SELECT * FROM exchange_rates');
      await rejects(()=>owner(db,"INSERT INTO exchange_rates(source,from_currency,rate) VALUES('poison','USD',1)"));
    });
    await test(profile,'invoker views do not expose another tenant',async()=>{
      assert.deepEqual((await owner(db,'SELECT user_id FROM v_user_balance_summary')).rows.map(r=>r.user_id),[ids.a]);
    });
    await test(profile,'read RPC with another user parameter leaks no rows',async()=>{
      assert.equal((await owner(db,'SELECT * FROM get_multicurrency_balances($1,ARRAY[$2]::uuid[])',[ids.b,ids.accountB])).rows.length,0);
      assert.equal((await owner(db,"SELECT * FROM analytics_category_breakdown($1,'2026-01-01','2027-01-01','expense')",[ids.b])).rows.length,0);
    });
    for(const role of ['anon','authenticated']) {
      await test(profile,`${role} cannot directly execute sale RPC`,()=>rejects(()=>queryAs(db,role,role==='authenticated'?ids.a:null,"SELECT sell_investment_position($1,$2,1,25,'USD','2026-10-08',5,5,1200,NULL)",[ids.a,ids.investmentA])));
      await test(profile,`${role} cannot directly execute shared RPC`,()=>rejects(()=>queryAs(db,role,role==='authenticated'?ids.a:null,"SELECT save_shared_expense($1,$2,$2,'Cena',10,NULL,NULL,NULL)",[ids.tokenA,ids.guestA])));
    }
    let expense;
    await test(profile,'guest capability through backend creates cent-conserving split',async()=>{
      expense=await save(db);assert.equal(expense.amount,10.01);assert.deepEqual(expense.splits.map(s=>s.amount),[5.01,5]);
    });
    await test(profile,'normal owner sees shared data but other owner cannot',async()=>{
      assert.equal((await owner(db,'SELECT id FROM shared_expenses')).rows.length,1);
      assert.equal((await queryAs(db,'authenticated',ids.b,'SELECT id FROM shared_expenses')).rows.length,0);
      assert.equal((await owner(db,'SELECT id FROM shared_group_members')).rows.length,2);
    });
    await test(profile,'shared amount/split edits must go through atomic backend RPC',()=>rejects(()=>owner(db,'UPDATE shared_expenses SET amount=999 WHERE id=$1',[expense.id])));
    await test(profile,'cross-group actor payer and splits are rejected',async()=>{
      const before=await snapshot(db);
      await rejects(()=>save(db,{actor:ids.memberB}),['42501']);
      await rejects(()=>save(db,{payer:ids.memberB}),['22023']);
      await rejects(()=>save(db,{members:[ids.memberA,ids.memberB]}),['22023']);
      assert.deepEqual(await snapshot(db),before);
    });
    await test(profile,'wrong and invalid token cannot edit another group expense',async()=>{
      const before=await snapshot(db);assert.equal(await save(db,{token:'invalid'}),null);
      assert.equal(await save(db,{token:ids.tokenB,actor:ids.memberB,payer:ids.memberB,expense:expense.id}),null);
      assert.deepEqual(await snapshot(db),before);
    });
    await test(profile,'revoked capability fails closed',async()=>{
      await db.query('UPDATE shared_groups SET is_active=false WHERE id=$1',[ids.groupA]);
      try { assert.equal(await save(db),null); } finally { await db.query('UPDATE shared_groups SET is_active=true WHERE id=$1',[ids.groupA]); }
    });
    await test(profile,'shared split storage failure rolls back parent and old splits',async()=>{
      await db.exec("CREATE FUNCTION public.test_reject_split() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected storage failure' USING ERRCODE='23514'; END $$; CREATE TRIGGER test_reject_split BEFORE INSERT ON shared_expense_splits FOR EACH ROW EXECUTE FUNCTION public.test_reject_split();");
      try { const before=await snapshot(db);await rejects(()=>save(db,{expense:expense.id,amount:22}),['23514']);assert.deepEqual(await snapshot(db),before); }
      finally { await db.exec('DROP TRIGGER test_reject_split ON shared_expense_splits; DROP FUNCTION public.test_reject_split();'); }
    });
    await test(profile,'sale partially decrements and inserts one exact record',async()=>{
      const r=await sell(db);assert.equal(r.remaining_quantity,8);assert.equal(r.sale.quantity,2);assert.equal(r.position_closed,false);
    });
    await test(profile,'mismatched claimed user and position owner cannot sell',async()=>{
      const before=await snapshot(db);
      await rejects(()=>sell(db,{user:ids.b,investment:ids.investmentB,claim:ids.a}),['P0001']);
      await rejects(()=>sell(db,{investment:ids.investmentB}),['P0001']);assert.deepEqual(await snapshot(db),before);
    });
    for(const invalid of [{quantity:0},{quantity:-1},{price:0},{price:'NaN'},{quantity:'NaN'},{pnl:'NaN'},{rate:0},{rate:'Infinity'}]) {
      await test(profile,`invalid sale input ${JSON.stringify(invalid)} rolls back`,async()=>{
        const before=await snapshot(db);await rejects(()=>sell(db,invalid),['P0001']);assert.deepEqual(await snapshot(db),before);
      });
    }
    await test(profile,'overselling is rejected with unchanged position and sales',async()=>{
      const before=await snapshot(db);await rejects(()=>sell(db,{quantity:9}),['P0001']);assert.deepEqual(await snapshot(db),before);
    });
    await test(profile,'sale insert failure rolls back prior quantity decrement',async()=>{
      await db.exec("CREATE FUNCTION public.test_reject_sale() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected sale failure' USING ERRCODE='23514'; END $$; CREATE TRIGGER test_reject_sale BEFORE INSERT ON investment_sales FOR EACH ROW EXECUTE FUNCTION public.test_reject_sale();");
      try { const before=await snapshot(db);await rejects(()=>sell(db),['23514']);assert.deepEqual(await snapshot(db),before); }
      finally { await db.exec('DROP TRIGGER test_reject_sale ON investment_sales; DROP FUNCTION public.test_reject_sale();'); }
    });
    await test(profile,'two overlapping submitted sale calls cannot oversell (single connection)',async()=>{
      const attempts=await Promise.allSettled([sell(db,{quantity:6}),sell(db,{quantity:6})]);
      assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(attempts.filter(r=>r.status==='rejected').length,1);
      assert.equal(Number((await db.query('SELECT quantity FROM investments WHERE id=$1',[ids.investmentA])).rows[0].quantity),2);
      return {submitted:2,succeeded:1,rejected:1,limitation:'PGlite serializes one connection; this is NOT a two-connection PostgreSQL lock race.'};
    });
    await test(profile,'full sale closes position and a replay cannot sell more',async()=>{
      const r=await sell(db,{quantity:2});assert.equal(r.remaining_quantity,0);assert.equal(r.position_closed,true);
      await rejects(()=>sell(db,{quantity:1}),['P0001']);
      assert.equal(Number((await db.query('SELECT sum(quantity) AS n FROM investment_sales WHERE investment_id=$1',[ids.investmentA])).rows[0].n),10);
    });
    await test(profile,'CB-P03 full close: four units at cost 100 sold at 120',async()=>{
      const investment=(await service(db,"INSERT INTO investments(user_id,account_id,type,name,quantity,purchase_price,purchase_currency,purchase_date) VALUES($1,$2,'stock_us','CB-P03 sintética',4,100,'USD','2026-10-01') RETURNING id",[ids.b,ids.accountB])).rows[0].id;
      const result=await sell(db,{user:ids.b,investment,quantity:4,price:120,pnl:80,pnlUsd:80});
      assert.equal(result.remaining_quantity,0);assert.equal(result.position_closed,true);assert.equal(result.sale.realized_pnl_native,80);assert.equal(result.sale.purchase_price_at_sale,100);
      const position=(await db.query('SELECT quantity::text,is_active,(quantity*purchase_price)::text AS remaining_cost FROM investments WHERE id=$1',[investment])).rows[0];
      assert.equal(Number(position.quantity),0);assert.equal(Number(position.remaining_cost),0);assert.equal(position.is_active,false);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM investment_sales WHERE investment_id=$1',[investment])).rows[0].n,1);
      return {caseId:'CB-P03',initialQuantity:4,initialCost:400,saleQuantity:4,salePrice:120,remainingQuantity:0,remainingCost:0,realized:80,closedHistory:1};
    });
    await test(profile,'new ownership constraints validate against all synthetic data',async()=>{
      const constraints=(await db.query("SELECT conrelid::regclass::text AS relation,conname FROM pg_constraint WHERE contype IN ('f','c') AND connamespace='public'::regnamespace AND NOT convalidated ORDER BY 1,2")).rows;
      for(const row of constraints)await db.exec(`ALTER TABLE ${row.relation} VALIDATE CONSTRAINT "${row.conname}"`);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE contype IN ('f','c') AND connamespace='public'::regnamespace AND NOT convalidated")).rows[0].n,0);
      return {validated:constraints.length};
    });
    if(!legacyGrants) await test(profile,'representative synthetic records populate every application table for recovery',async()=>{
      await db.query("UPDATE users SET status='ACTIVE',current_period_end='2099-01-01',gemini_api_key='SYNTHETIC_NOT_A_CREDENTIAL' WHERE id=$1",[ids.b]);
      const rule=(await service(db,"INSERT INTO recurring_rules(user_id,account_id,type,amount,currency,description,frequency,start_date) VALUES($1,$2,'expense',12.34,'ARS','Recurrente sintética','monthly','2026-10-01') RETURNING id",[ids.b,ids.accountB])).rows[0].id;
      await service(db,"SELECT create_transaction_once($1,'recovery-request-001',$2,$3::jsonb,1)",[ids.b,digest('synthetic-recovery'),JSON.stringify({user_id:ids.b,type:'expense',account_id:ids.accountB,amount:12.34,currency:'ARS',amount_in_account_currency:12.34,description:'Movimiento sintético',is_recurring:true,recurring_rule_id:rule,transaction_date:'2026-10-08T15:00:00Z'})]);
      await service(db,"INSERT INTO bot_sessions(user_id,telegram_chat_id,context) VALUES($1,123456,'[{\"synthetic\":true}]'::jsonb)",[ids.a]);
      await service(db,"INSERT INTO exchange_rates(source,from_currency,rate) VALUES('synthetic','USD',1200)");
      await service(db,"INSERT INTO budget_alerts(budget_id,percent_reached) SELECT id,80 FROM budgets WHERE user_id=$1",[ids.a]);
      await service(db,"INSERT INTO market_data_cache(id,payload) VALUES(1,'{\"synthetic\":true}')");
      await service(db,"INSERT INTO portfolio_performance_snapshots(user_id,snapshot_date,cost_basis_usd,market_value_usd,unrealized_pnl_usd,roi_percent,blue_ars_per_usd) VALUES($1,'2026-10-08',150,160,10,6.666667,1200)",[ids.b]);
      await service(db,"INSERT INTO net_worth_snapshots(user_id,snapshot_date,liquid_usd,investments_usd,total_usd,total_ars_blue,blue_ars_per_usd) VALUES($1,'2026-10-08',4.15638333,160,164.15638333,196987.66,1200)",[ids.b]);
      await service(db,"SELECT sell_investment_once($1,'recovery-sale-001',$2,$3::jsonb)",[ids.b,digest('recovery-sale'),JSON.stringify({p_investment_id:ids.investmentB,p_quantity:1,p_price:35,p_currency:'USD',p_sold_at:'2026-10-08',p_realized_pnl_native:5,p_realized_pnl_usd:5,p_ars_per_usd:1200,p_expected_purchase_price:30,p_expected_purchase_currency:'USD',p_expected_type:'stock_us'})]);
      await service(db,"SELECT save_shared_expense_once($1,'recovery-shared-001',$2,$3::jsonb)",[ids.tokenA,digest('recovery-shared'),JSON.stringify({p_actor_member_id:ids.guestA,p_paid_by_member_id:ids.memberA,p_description:'Gasto con recibo sintético',p_amount:1.03,p_expense_date:'2026-10-08'})]);
      const recoveryAccount=(await service(db,"SELECT create_account_with_opening_balance($1,'recovery-account-001',$2,$3::jsonb,123.45) AS result",[ids.b,digest('recovery-account'),JSON.stringify({name:'Cuenta con recibo sintético',type:'investment',currency:'ARS'})])).rows[0].result;
      await service(db,"SELECT create_investment_once($1,'recovery-investment-001',$2,$3::jsonb)",[ids.b,digest('recovery-investment'),JSON.stringify({user_id:ids.b,account_id:recoveryAccount.id,type:'stock_us',name:'Posición con recibo sintético',quantity:2,purchase_price:20,purchase_currency:'USD',purchase_date:'2026-10-08'})]);
      await service(db,"SELECT begin_import_batch($1,$2,$3,$4::jsonb)",[ids.b,ids.categoryB,digest('synthetic-import-batch'),JSON.stringify({synthetic:true,account_id:ids.accountB})]);
      const data=await snapshot(db);
      assert.ok(Object.values(data).every(value=>JSON.parse(value).length>0),'Each application table must contain recovery fixtures');
      return {rowCounts:Object.fromEntries(Object.entries(data).map(([name,value])=>[name,JSON.parse(value).length]))};
    });
    if(!legacyGrants) await test(profile,'complete isolated snapshot restores to a separate fresh database',async()=>{
      const originalData=await snapshot(db),originalCatalog=await catalog(db);
      const sourceSearchPath=(await db.query('SHOW search_path')).rows[0].search_path;
      const dump=await db.dumpDataDir('gzip');const bytes=Buffer.from(await dump.arrayBuffer());
      const started=Date.now();
      // A brand-new memory filesystem receives the archive; no source instance
      // or existing data directory is reused. Roles, grants and constraints travel.
      const restored=await PGlite.create({loadDataDir:new Blob([bytes]),extensions:{uuid_ossp,pg_trgm}});
      try {
        // Session GUCs are not persisted in a datadir backup. Restore the runtime
        // search_path before comparing PostgreSQL's context-sensitive deparsing.
        await restored.query("SELECT set_config('search_path',$1,false)",[sourceSearchPath]);
        assert.deepEqual(await snapshot(restored),originalData);assert.deepEqual(await catalog(restored),originalCatalog);
        assert.deepEqual((await owner(restored,'SELECT id FROM accounts ORDER BY id')).rows.map(r=>r.id),[ids.accountA,ids.usdA]);
        await rejects(()=>queryAs(restored,'anon',null,'SELECT * FROM accounts'));
        await rejects(()=>queryAs(restored,'authenticated',ids.b,"SELECT save_shared_expense($1,$2,$2,'x',1,NULL,NULL,NULL)",[ids.tokenA,ids.guestA]));
        const restoredExpense=await save(restored,{amount:1.03});assert.equal(restoredExpense.splits.reduce((n,s)=>n+Math.round(s.amount*100),0),103);
        assert.deepEqual(await snapshot(db),originalData,'Restoring/mutating target must not change source');
        recovery={format:'PGlite physical datadir gzip archive',sessionSearchPathRestored:sourceSearchPath,bytes:bytes.length,sha256:digest(bytes),restoreMs:Date.now()-started,
          catalogSha256:digest(JSON.stringify(originalCatalog)),tables:Object.keys(originalData).length,rowCounts:Object.fromEntries(Object.entries(originalData).map(([name,value])=>[name,JSON.parse(value).length])),tableHashes:Object.fromEntries(Object.entries(originalData).map(([n,s])=>[n,digest(s)])),
          scope:'Complete isolated PostgreSQL fixture, including auth fixture, application schema, data, roles, RLS, grants, functions, triggers and indexes. Not a Supabase-hosted backup or GoTrue restore.'};
        if(outputDir){await fs.mkdir(outputDir,{recursive:true});await fs.writeFile(path.join(outputDir,'synthetic-database-backup.tar.gz'),bytes);}
        return recovery;
      } finally {await restored.close();}
    });
  } finally { await db.close(); }
}
await test('source-integrity','SQL sources did not change during the verification run',async()=>{
  const current=(await bootstrapSources()).map(({path,sha256})=>({path,sha256}));
  assert.deepEqual(current,finalManifest);
});
history['reconstructed-baseline-then-all-migrations']={status:'PASS',sources:finalManifest.length,migrations:finalManifest.length-1,skipped:0};
const report={runAt:new Date().toISOString(),baselineCommit,engine,
 scope:'Reconstructed prehistory baseline + EVERY repository migration unchanged in timestamp order. Real PostgreSQL roles/RLS; synthetic Auth fixture only.',
 history,manifest:finalManifest,passed:results.filter(r=>r.status==='PASS').length,total:results.length,recovery,results,
 remaining:['Raw historical migration directory still requires the explicit fresh-install baseline first; do not apply it to an existing database.','This harness does not exercise GoTrue, JWT signature validation, PostgREST, browser session cookies, external providers or independent database connections.']};
if(outputDir){await fs.mkdir(outputDir,{recursive:true});await fs.writeFile(path.join(outputDir,'database-verification.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
if(report.passed!==report.total)process.exitCode=1;
