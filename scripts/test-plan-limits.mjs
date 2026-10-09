// Real PostgreSQL/PLpgSQL in isolated WASM. Requests are serialized by PGlite;
// native multi-session lock contention needs a separate PostgreSQL integration run.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const u = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const token = '33333333-3333-3333-3333-333333333333';
const account = n => `aaaaaaaa-aaaa-aaaa-aaaa-${String(n).padStart(12,'0')}`;
await db.exec(`
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE users(id uuid PRIMARY KEY,status text NOT NULL DEFAULT 'ACTIVE',current_period_end timestamptz,grace_period_end timestamptz);
 CREATE TABLE accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),name text,is_active boolean NOT NULL DEFAULT true,sort_order int DEFAULT 0,balance numeric DEFAULT 0,type text,currency text,icon text,color text,is_debt boolean,include_in_total boolean,include_in_liquid boolean,min_balance numeric,credit_limit numeric,closing_day int,due_day int,last_4_digits text,is_multicurrency boolean,secondary_currency text);
 CREATE TABLE transactions(id int GENERATED ALWAYS AS IDENTITY,user_id uuid REFERENCES users(id),account_id uuid REFERENCES accounts(id),destination_account_id uuid REFERENCES accounts(id),recurring_rule_id uuid,amount numeric DEFAULT 1,type text,currency text,amount_in_account_currency numeric,description text,transaction_date timestamptz);
 CREATE TABLE recurring_rules(id uuid PRIMARY KEY,user_id uuid REFERENCES users(id),is_active boolean NOT NULL DEFAULT true);
 GRANT USAGE ON SCHEMA auth TO service_role;
 GRANT ALL ON users,accounts,transactions,recurring_rules TO service_role;
 INSERT INTO users(id) VALUES ('${u}'),('${other}');
`);
await db.exec(await fs.readFile(new URL('../supabase/migrations/20261009034943_enforce_plan_allowances.sql', import.meta.url),'utf8'));
const results=[];
async function check(name,fn) { try { await fn();results.push({name,status:'PASS'}); } catch(error){results.push({name,status:'FAIL',error:error.message});} }
const count=async(sql,params=[])=>Number((await db.query(sql,params)).rows[0].n);
const reject=async(sql,match)=>assert.rejects(()=>db.exec(sql),new RegExp(match));
const insert=(n,user=u)=>`INSERT INTO accounts(id,user_id,name) VALUES('${account(n)}','${user}','Fixture ${n}')`;
const reserve=(key,feature='ai',fingerprint='same',t=token)=>`SELECT reserve_plan_usage('${u}','${feature}','${key}','${fingerprint}','${t}') AS value`;
const finish=(key,ok=true,t=token)=>`SELECT finish_plan_usage('${u}','ai','${key}','${t}',${ok},'{"answer":"fixture"}')`;
await check('Free first three allowed and fourth blocked',async()=>{
 await db.exec([1,2,3].map(n=>insert(n)).join(';'));
 await reject(insert(4),'plan_account_limit');
 assert.equal(await count(`SELECT count(*) n FROM accounts WHERE user_id='${u}'`),3);
});
await check('Free cannot bypass cap with reactivation',async()=>{
 await db.exec(`UPDATE accounts SET is_active=false WHERE id='${account(3)}';${insert(4)}`);
 await reject(`UPDATE accounts SET is_active=true WHERE id='${account(3)}'`,'plan_account_limit');
});
await check('Premium permits 20 and rejects 21',async()=>{
 await db.exec(`UPDATE users SET current_period_end=now()+interval '30 days' WHERE id='${u}';UPDATE accounts SET is_active=true WHERE id='${account(3)}'`);
 for(let n=5;n<=20;n++) await db.exec(insert(n));
 await reject(insert(21),'plan_account_limit');
});
await check('Downgrade retains all accounts and historical transactions',async()=>{
 await db.exec(`INSERT INTO transactions(user_id,account_id) VALUES('${u}','${account(20)}');UPDATE users SET status='PAST_DUE' WHERE id='${u}'`);
 await reject(`INSERT INTO transactions(user_id,account_id) VALUES('${u}','${account(1)}')`,'plan_selection_required');
 assert.equal(await count(`SELECT count(*) n FROM accounts WHERE user_id='${u}' AND is_active`),20);
 assert.equal(await count('SELECT count(*) n FROM transactions'),1);
});
await check('Explicit selection preserves history and allows only chosen source/destination',async()=>{
 await db.exec(`SELECT select_movement_accounts('${u}',ARRAY['${account(1)}','${account(2)}','${account(3)}']::uuid[])`);
 await db.exec(`INSERT INTO transactions(user_id,account_id,destination_account_id) VALUES('${u}','${account(1)}','${account(2)}')`);
 await reject(`INSERT INTO transactions(user_id,account_id) VALUES('${u}','${account(20)}')`,'plan_account_disabled');
 await reject(`INSERT INTO transactions(user_id,account_id,destination_account_id) VALUES('${u}','${account(1)}','${account(20)}')`,'plan_account_disabled');
 assert.equal(await count('SELECT count(*) n FROM accounts'),20);
 assert.equal(await count('SELECT count(*) n FROM transactions'),2);
});
await check('Selection is atomic and rejects foreign/duplicate/over-limit IDs',async()=>{
 await db.exec(insert(30,other));
 for (const ids of [[1,2,3,4],[1,1],[1,30]]) await reject(`SELECT select_movement_accounts('${u}',ARRAY[${ids.map(n=>`'${account(n)}'`).join(',')}]::uuid[])`,'plan_(account_limit|invalid_selection)');
 assert.equal(await count(`SELECT count(*) n FROM accounts WHERE user_id='${u}' AND movement_enabled`),3);
});
await check('Free recurring activation and execution rejected but read retained',async()=>{
 await reject(`INSERT INTO recurring_rules(id,user_id) VALUES('${token}','${u}')`,'plan_premium_required');
 await reject(`INSERT INTO transactions(user_id,account_id,recurring_rule_id) VALUES('${u}','${account(1)}','${token}')`,'plan_premium_required');
 await db.exec(`INSERT INTO recurring_rules(id,user_id,is_active) VALUES('${token}','${u}',false)`);
 await reject(`UPDATE recurring_rules SET is_active=true WHERE id='${token}'`,'plan_premium_required');
 assert.equal(await count('SELECT count(*) n FROM recurring_rules'),1);
});
await check('Null/expired entitlement and Free AI fail closed',async()=>{
 await reject(reserve('free'),'plan_premium_required');
 for(const state of ["status='ACTIVE',current_period_end=NULL", "status='ACTIVE',current_period_end=now()", "status='GRACE_PERIOD',grace_period_end=now()"]){
  await db.exec(`UPDATE users SET ${state} WHERE id='${u}'`);
  assert.equal(await count(`SELECT plan_account_limit('${u}') n`),3);
 }
});
await check('Cancellation keeps paid access to exact end; grace explicit',async()=>{
 await db.exec(`UPDATE users SET status='CANCELED',current_period_end=now()+interval '30 days' WHERE id='${u}'`);
 assert.equal(await count(`SELECT plan_account_limit('${u}') n`),20);
 await db.exec(`UPDATE users SET status='GRACE_PERIOD',current_period_end=now()-interval '1 day',grace_period_end=now()+interval '1 day' WHERE id='${u}'`);
 assert.equal(await count(`SELECT plan_account_limit('${u}') n`),20);
 await db.exec(`UPDATE users SET status='ACTIVE',current_period_end=now()+interval '30 days',grace_period_end=NULL WHERE id='${u}'`);
});
await check('Reservation, in-flight duplicate and payload conflict',async()=>{
 await db.exec(reserve('first'));
 await reject(reserve('first'),'plan_request_in_progress');
 await reject(reserve('first','ai','different'),'plan_request_conflict');
});
await check('Success replays cached answer with no second consumption',async()=>{
 await db.exec(finish('first'));
 const result=(await db.query(reserve('first'))).rows[0].value;
 assert.deepEqual(result,{replayed:true,result:{answer:'fixture'}});
 assert.equal(await count('SELECT count(*) n FROM plan_usage_requests'),1);
});
await check('Failed call releases quota and retry fences stale owner',async()=>{
 await db.exec(reserve('failed'));await db.exec(finish('failed',false));
 const newToken='44444444-4444-4444-4444-444444444444';
 await db.exec(reserve('failed','ai','same',newToken));
 await reject(finish('failed'),'plan_request_conflict');
 await db.exec(finish('failed',false,newToken));
});
await check('40 AI limit independent of 20 OCR limit; excess reservations roll back',async()=>{
 for(let n=2;n<=40;n++) await db.exec(reserve(`ai-${n}`));
 await reject(reserve('ai-41'),'plan_quota_exhausted');
 for(let n=1;n<=20;n++) await db.exec(reserve(`ocr-${n}`,'ocr'));
 await reject(reserve('ocr-21','ocr'),'plan_quota_exhausted');
 assert.equal(await count("SELECT count(*) n FROM plan_usage_requests WHERE state<>'released'"),60);
});
await check('Mid-cycle webhook end changes do not reset quota',async()=>{
 await db.exec(`UPDATE users SET current_period_end=current_period_end+interval '1 day' WHERE id='${u}'`);
 await reject(reserve('ai-new-end'),'plan_quota_exhausted');
});
await check('Renewal after frozen end starts new bucket; old request still replays',async()=>{
 await db.exec(`UPDATE plan_usage_cycles SET period_end=now()-interval '1 day' WHERE user_id='${u}'`);
 await db.exec(reserve('renewed'));
 assert.deepEqual((await db.query(reserve('first'))).rows[0].value,{replayed:true,result:{answer:'fixture'}});
});
await check('Quota tables/RPC inaccessible to public authenticated client',async()=>{
 await db.exec('SET ROLE authenticated');
 await reject('SELECT * FROM plan_usage_requests','permission denied');
 await reject(reserve('malicious'),'permission denied');
 await reject(`SELECT select_movement_accounts('${other}',ARRAY[]::uuid[])`,'permission denied');
 await db.exec('RESET ROLE');
});
await check('Service-role RPC executes without security-definer escalation',async()=>{
 await db.exec('SET ROLE service_role');
 await db.exec(reserve('service'));
 await db.exec('RESET ROLE');
 const rows=(await db.query("SELECT proname,prosecdef FROM pg_proc WHERE proname IN ('reserve_plan_usage','finish_plan_usage','select_movement_accounts')")).rows;
 assert.equal(rows.length,3);assert.ok(rows.every(r=>r.prosecdef===false));
});
await check('Account plus opening balance is atomic, idempotent, and conflict-safe',async()=>{
 await db.exec(`CREATE FUNCTION fixture_opening_balance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.amount>99999 THEN RAISE EXCEPTION 'fixture ledger failure'; END IF;
 UPDATE public.accounts SET balance=balance+NEW.amount_in_account_currency WHERE id=NEW.account_id;
 RETURN NEW; END; $$;
 CREATE TRIGGER fixture_balance AFTER INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION fixture_opening_balance();`);
 const payload=JSON.stringify({name:'New fixture',type:'bank',currency:'ARS'});
 const rpc=(key,balance,hash='a'.repeat(64))=>`SELECT create_account_with_opening_balance('${other}','${key}','${hash}','${payload}'::jsonb,${balance}) AS account`;
 const original=(await db.query(rpc('account-ok',1500))).rows[0].account;
 assert.equal(Number(original.balance),1500);
 assert.deepEqual((await db.query(rpc('account-ok',1500))).rows[0].account,original);
 await reject(rpc('account-ok',1500,'b'.repeat(64)),'plan_request_conflict');
 const before=await count(`SELECT count(*) n FROM accounts WHERE user_id='${other}'`);
 await reject(rpc('account-fail',100000),'fixture ledger failure');
 assert.equal(await count(`SELECT count(*) n FROM accounts WHERE user_id='${other}'`),before);
 assert.equal(await count(`SELECT count(*) n FROM account_creation_requests WHERE request_id='account-fail'`),0);
 assert.equal(await count(`SELECT count(*) n FROM transactions WHERE account_id='${original.id}'`),1);
});
console.log(JSON.stringify({engine:'PGlite (isolated real PL/pgSQL, serialized requests)',passed:results.filter(x=>x.status==='PASS').length,total:results.length,results},null,2));
await db.close();
if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
