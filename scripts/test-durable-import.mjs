// Synthetic PGlite execution of actual migrations. No providers or real data.
import assert from 'node:assert/strict';
import { bootDatabase, seedDatabase, asRole, ids } from './lib/test-isolated-database.mjs';
const {db} = await bootDatabase({legacyGrants:true});
const results=[];
const test=async(name,fn)=>{try{await fn(); results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}};
const batch='33333333-3333-4333-8333-333333333331';
const nextBatch='33333333-3333-4333-8333-333333333332';
const hash='a'.repeat(64), changed='b'.repeat(64);
const row=(overrides={})=>({user_id:ids.a,type:'expense',account_id:ids.accountA,amount:200,
  currency:'ARS',amount_in_account_currency:200,transaction_date:'2026-10-09T12:00:00Z',description:'Importada',...overrides});
const balance=async()=>Number((await db.query('SELECT balance FROM accounts WHERE id=$1',[ids.accountA])).rows[0].balance);
const count=async()=>Number((await db.query('SELECT count(*) n FROM transactions')).rows[0].n);
const begin=(id=batch,fingerprint=hash,context={accounts:[ids.accountA]})=>asRole(db,'service_role',null,
  async tx=>(await tx.query('SELECT begin_import_batch($1,$2,$3,$4) receipt',[ids.a,id,fingerprint,JSON.stringify(context)])).rows[0].receipt);
const create=(index,data=row(),skip=false,id=batch,fingerprint=hash)=>asRole(db,'service_role',null,
  async tx=>(await tx.query('SELECT create_import_transaction_once($1,$2,$3,$4,$5,$6) receipt',
    [ids.a,id,`import:${id}:${data.type==='transfer'?'transfer':'transaction'}:${index}`,fingerprint,JSON.stringify(data),skip])).rows[0].receipt);
try {
 await seedDatabase(db);
 await test('batch binds immutable file/options hash and freezes original mapping',async()=>{
   const context=await begin();
   assert.deepEqual(await begin(batch,hash,{accounts:[ids.accountB]}),context);
   await assert.rejects(begin(batch,changed),e=>e.code==='Z0001');
 });
 await test('partial row failure and retry preserve one effect per original row',async()=>{
   const before=await balance(), n=await count();
   await create(0);
   await assert.rejects(create(1,row({account_id:ids.accountB})));
   assert.equal(await balance(),before-200); assert.equal(await count(),n+1);
   await create(0); await create(1,row({amount:300,amount_in_account_currency:300}));
   assert.equal(await balance(),before-500); assert.equal(await count(),n+2);
 });
 await test('same batch replay and simultaneous submissions keep exact receipts (single-session scheduling)',async()=>{
   const before=await balance();
   const replies=await Promise.all(Array.from({length:10},()=>create(2)));
   replies.forEach(r=>assert.deepEqual(r,replies[0]));
   assert.equal(await balance(),before-200);
 });
 await test('equal legitimate rows and explicit new batches remain separate operations',async()=>{
   const before=await balance(); const a=await create(3),b=await create(4);
   await begin(nextBatch); const c=await create(0,row(),false,nextBatch);
   assert.notEqual(a.id,b.id); assert.notEqual(b.id,c.id); assert.equal(await balance(),before-600);
 });
 await test('explicit duplicate skip matches existing content and survives deletion of the match',async()=>{
   const before=await balance();
   const receipt=await create(5,row(),true);
   assert.deepEqual(receipt,{import_skipped_duplicate:true}); assert.equal(await balance(),before);
   await db.query('DELETE FROM transactions WHERE user_id=$1 AND description=$2',[ids.a,'Importada']);
   const after=await balance(); assert.deepEqual(await create(5,row(),true),receipt); assert.equal(await balance(),after);
 });
 await test('historical equivalents and durable replay ignore changed computed FX',async()=>{
   const before=await balance();
   const a=await create(6,row({amount:10,currency:'USD',amount_in_account_currency:9500}));
   const b=await create(6,row({amount:10,currency:'USD',amount_in_account_currency:12500}));
   assert.deepEqual(a,b); assert.equal(Number(b.amount_in_account_currency),9500); assert.equal(await balance(),before-9500);
 });
 await test('imported transfer debits and credits historical equivalents exactly once',async()=>{
   const before=await balance();
   const usdBefore=Number((await db.query('SELECT balance FROM accounts WHERE id=$1',[ids.usdA])).rows[0].balance);
   const transfer=row({type:'transfer',amount:1000,amount_in_account_currency:1000,
     destination_account_id:ids.usdA,destination_amount_in_account_currency:1.23,exchange_rate:0.00123});
   const first=await create(0,transfer);
   assert.deepEqual(await create(0,transfer),first);
   assert.equal(await balance(),before-1000);
   const usdAfter=Number((await db.query('SELECT balance FROM accounts WHERE id=$1',[ids.usdA])).rows[0].balance);
   assert.equal(usdAfter,usdBefore+1.23);
 });
 await test('receipt failure rolls back the imported row and its balance impact',async()=>{
   await db.exec(`CREATE FUNCTION fail_import_receipt_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
     IF NEW.request_id LIKE '%:transaction:7' THEN RAISE EXCEPTION 'synthetic receipt failure'; END IF; RETURN NEW; END $$;
     CREATE TRIGGER fail_import_receipt_fixture BEFORE INSERT ON transaction_requests FOR EACH ROW EXECUTE FUNCTION fail_import_receipt_fixture();`);
   const before=await balance(),n=await count();
   await assert.rejects(create(7),/synthetic receipt failure/);
   assert.equal(await balance(),before); assert.equal(await count(),n);
   await db.exec('DROP TRIGGER fail_import_receipt_fixture ON transaction_requests; DROP FUNCTION fail_import_receipt_fixture();');
   await create(7); assert.equal(await balance(),before-200);
 });
 await test('batch and receipt payload conflicts cannot add new financial effects',async()=>{
   const before=await balance();
   await assert.rejects(create(7,row(),false,batch,changed),e=>e.code==='Z0001');
   await assert.rejects(create(8,row(),false,'99999999-9999-4999-8999-999999999999'),/Import batch not found/);
   await assert.rejects(create(9,row({user_id:ids.b})),/No autorizado/);
   assert.equal(await balance(),before);
 });
 await test('anon and authenticated roles cannot access import ledger or RPCs',async()=>{
   for(const role of ['anon','authenticated']) {
     await assert.rejects(asRole(db,role,ids.a,tx=>tx.query('SELECT * FROM import_batches')),/permission denied/);
     await assert.rejects(asRole(db,role,ids.a,tx=>tx.query('SELECT begin_import_batch($1,$2,$3,$4)',[ids.a,batch,hash,'{}'])),/permission denied/);
     await assert.rejects(asRole(db,role,ids.a,tx=>tx.query('SELECT create_import_transaction_once($1,$2,$3,$4,$5,false)',[ids.a,batch,`import:${batch}:transaction:10`,hash,JSON.stringify(row())])),/permission denied/);
   }
 });
 console.log(JSON.stringify({suite:'durable-import',results},null,2));
 if(results.some(r=>r.status!=='PASS')) process.exitCode=1;
} finally {await db.close();}
