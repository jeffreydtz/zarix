// Executes real PostgreSQL offline; never connects to a hosted database.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.ZARIX_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const sql = await fs.readFile(path.join(root, 'supabase/migrations/20261006235955_atomic_shared_expense.sql'), 'utf8');
const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
  '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d'];
const token = 'a'.repeat(32), otherToken = 'b'.repeat(32);
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE shared_groups(id UUID PRIMARY KEY, share_token TEXT UNIQUE NOT NULL, is_active BOOLEAN DEFAULT TRUE);
  CREATE TABLE shared_group_members(id UUID PRIMARY KEY, group_id UUID REFERENCES shared_groups(id), created_at TIMESTAMPTZ DEFAULT NOW());
  CREATE TABLE shared_expenses(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), group_id UUID REFERENCES shared_groups(id),
    paid_by_member_id UUID REFERENCES shared_group_members(id), description TEXT NOT NULL, amount NUMERIC(20,2) CHECK(amount>0), expense_date DATE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
  CREATE TABLE shared_expense_splits(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), expense_id UUID REFERENCES shared_expenses(id) ON DELETE CASCADE,
    member_id UUID REFERENCES shared_group_members(id), amount NUMERIC(20,2) CHECK(amount>=0), UNIQUE(expense_id,member_id));
  INSERT INTO shared_groups(id,share_token) VALUES ('${ids[0]}','${token}'),('${ids[1]}','${otherToken}');
  INSERT INTO shared_group_members(id,group_id) VALUES ('${ids[2]}','${ids[0]}'),('${ids[3]}','${ids[0]}'),('${ids[4]}','${ids[0]}'),('${ids[5]}','${ids[1]}');
  ${sql}
`);
const results=[];
async function run(id, fn) {
  try { await fn(); results.push({id,status:'PASS'}); }
  catch(error) { results.push({id,status:'FAIL',error:error.message}); }
}
const save = async ({shareToken=token, actor=ids[2], payer=ids[2], description='Cena', amount=10.01, date='2026-10-06', members=null, expense=null}={}) => {
  return (await db.query('SELECT save_shared_expense($1,$2,$3,$4,$5,$6,$7,$8) AS result',
    [shareToken,actor,payer,description,amount,date,members,expense])).rows[0].result;
};
const snapshot=async()=> (await db.query(`SELECT jsonb_build_object('expenses',
 (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM shared_expenses e), 'splits',
 (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM shared_expense_splits s)) AS state`)).rows[0].state;
const rejected=async(fn,code)=> { let actual; try { await fn(); } catch(e) { actual=e.code; } assert.equal(actual,code); };
let expense;
await run('SH-SQL-01 RPC is executable only by backend role', async()=>{
  const signature='public.save_shared_expense(text,uuid,uuid,text,numeric,date,uuid[],uuid)';
  const q=await db.query('SELECT has_function_privilege($1,$4,\'EXECUTE\') AS anon,has_function_privilege($2,$4,\'EXECUTE\') AS authenticated,has_function_privilege($3,$4,\'EXECUTE\') AS service', ['anon','authenticated','service_role',signature]);
  assert.deepEqual(q.rows[0],{anon:false,authenticated:false,service:true});
});
await run('SH-SQL-02 create and remainder cents conserve total', async()=>{
  expense=await save();
  assert.equal(Number(expense.amount),10.01);
  assert.deepEqual(expense.splits.map(s=>Number(s.amount)),[3.34,3.34,3.33]);
  assert.equal(expense.splits.reduce((n,s)=>n+Math.round(Number(s.amount)*100),0),1001);
});
await run('SH-SQL-03 update replaces amount and splits atomically', async()=>{
  const updated=await save({expense:expense.id,amount:12.35,members:[ids[4],ids[2],ids[4]],date:null});
  assert.equal(Number(updated.amount),12.35);
  assert.equal(updated.expense_date,'2026-10-06');
  assert.deepEqual(updated.splits.map(s=>[s.member_id,Number(s.amount)]),[[ids[2],6.17],[ids[4],6.18]]);
});
for (const [id, params, code] of [
  ['SH-SQL-04 actor from another group',{actor:ids[5]},'42501'],
  ['SH-SQL-05 payer from another group',{payer:ids[5]},'22023'],
  ['SH-SQL-06 split from another group',{members:[ids[2],ids[5]]},'22023'],
  ['SH-SQL-07 sub-cent amount',{amount:.001},'22023'],
]) await run(id,async()=>{const before=await snapshot();await rejected(()=>save({...params,expense:expense.id}),code);assert.deepEqual(await snapshot(),before);});
await run('SH-SQL-08 another group cannot edit an existing expense',async()=>{
  const before=await snapshot();
  assert.equal(await save({shareToken:otherToken,actor:ids[5],payer:ids[5],expense:expense.id}),null);
  assert.deepEqual(await snapshot(),before);
});
await run('SH-SQL-09 invalid/revoked capabilities do not mutate',async()=>{
  const before=await snapshot(); assert.equal(await save({shareToken:'bad'}),null);
  await db.exec(`UPDATE shared_groups SET is_active=FALSE WHERE id='${ids[0]}'`);
  assert.equal(await save(),null); assert.deepEqual(await snapshot(),before);
  await db.exec(`UPDATE shared_groups SET is_active=TRUE WHERE id='${ids[0]}'`);
});
await db.exec(`CREATE FUNCTION reject_split_for_test() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'injected split storage failure' USING ERRCODE='23514'; END $$;
  CREATE TRIGGER reject_split BEFORE INSERT ON shared_expense_splits FOR EACH ROW EXECUTE FUNCTION reject_split_for_test();`);
await run('SH-SQL-10 split insert failure rolls back UPDATE and removed old splits',async()=>{
  const before=await snapshot(); await rejected(()=>save({expense:expense.id,amount:99}), '23514');
  assert.deepEqual(await snapshot(),before);
});
await run('SH-SQL-11 split insert failure leaves no orphan new expense',async()=>{
  const before=await snapshot(); await rejected(()=>save({amount:88}), '23514');
  assert.deepEqual(await snapshot(),before);
});
await db.exec('DROP TRIGGER reject_split ON shared_expense_splits;');
const report={date:new Date().toISOString(),engine:(await db.query('SELECT version() AS version')).rows[0].version,
 scope:'Real PL/pgSQL, minimum isolated schema, RPC access privileges, group scopes and rollback. No hosted deployment, RLS environment or multi-connection load test.',
 passed:results.filter(r=>r.status==='PASS').length,total:results.length,results};
console.log(JSON.stringify(report,null,2)); await db.close();
if(report.passed!==report.total) process.exitCode=1;
