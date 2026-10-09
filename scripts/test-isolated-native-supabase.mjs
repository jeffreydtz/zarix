// PREPARED, NOT EXECUTED in the restricted verification environment.
// Requires an empty, disposable LOCAL Supabase stack. It refuses remote URLs
// and existing application/Auth data. Never use production credentials here.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { bootstrapSources, digest } from './lib/test-isolated-database.mjs';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch } from './lib/test-isolated-native-target.mjs';

const {apiUrl,databaseUrl}=isolatedNativeTargets();
const anonKey=process.env.ZARIX_LOCAL_ANON_KEY,serviceKey=process.env.ZARIX_LOCAL_SERVICE_ROLE_KEY;
if(!anonKey||!serviceKey)throw new Error('Supply only disposable local stack keys in ZARIX_LOCAL_ANON_KEY and ZARIX_LOCAL_SERVICE_ROLE_KEY.');
const pgBin=process.env.ZARIX_PG_BIN||'';
const pgEnv=isolatedPgEnvironment(databaseUrl);
const outputDir=process.env.ZARIX_EVIDENCE_DIR||await fs.mkdtemp(path.join(os.tmpdir(),'zarix-native-evidence-'));
await fs.mkdir(outputDir,{recursive:true,mode:0o700});
const bin=name=>pgBin?path.join(pgBin,name):name;
function command(name,args,extra={}) {
 const result=spawnSync(bin(name),args,{env:pgEnv,encoding:'utf8',maxBuffer:64*1024*1024,...extra});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(`${name} failed: ${result.stderr}`);
 return result.stdout.trim();
}
const sql=(statement,database=pgEnv.PGDATABASE)=>command('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',statement],{env:{...pgEnv,PGDATABASE:database}});
const literal=value=>value===null?'NULL':`'${String(value).replaceAll("'","''")}'`;
function parallelSql(statement) {
 return new Promise(resolve=>{
  const child=spawn(bin('psql'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',statement],{env:pgEnv});
  let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  child.on('error',error=>resolve({status:-1,stdout,stderr:error.message}));child.on('close',status=>resolve({status,stdout:stdout.trim(),stderr:stderr.trim()}));
 });
}
const makeClient=key=>createClient(apiUrl.href,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:isolatedApiFetch}});
const admin=makeClient(serviceKey),anon=makeClient(anonKey);
const results=[];const report={runAt:new Date().toISOString(),status:'RUNNING',target:'loopback disposable Supabase',results};
const unwrap=response=>{if(response.error)throw new Error(`${response.error.code||''} ${response.error.message}`);return response.data;};
const deny=response=>{assert.ok(response.error,'Expected permission denial');assert.equal(response.error.code,'42501');};
async function test(name,fn) { const evidence=await fn();results.push({name,status:'PASS',...(evidence?{evidence}:{})}); }
try {
 assert.equal(Number(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'")),0,'Refusing bootstrap into a nonempty public schema');
 assert.equal(Number(sql('SELECT count(*) FROM auth.users')),0,'Refusing use of a stack with existing Auth users');
 assert.equal(unwrap(await admin.auth.admin.listUsers({page:1,perPage:1})).users.length,0,'Refusing an API target with existing Auth users');
 const files=await bootstrapSources();
 report.manifest=files.map(({path,sha256})=>({path,sha256}));
 const bootstrap=path.join(outputDir,'bootstrap.sql');await fs.writeFile(bootstrap,files.map(f=>`-- ${f.path} SHA256 ${f.sha256}\n${f.sql}`).join('\n\n'),{mode:0o600});
 // extensions is Supabase's standard extension schema; fixture SQL is unmodified.
 command('psql',['-X','-q','-v','ON_ERROR_STOP=1','-c','SET search_path=public,extensions','-f',bootstrap]);
 sql("NOTIFY pgrst,'reload schema'");
 const run=randomUUID().slice(0,8);const clients=[];const users=[];
 await test('two real ordinary Auth registrations and verified sign-ins',async()=>{
  for(const suffix of ['a','b']) {
   const client=makeClient(anonKey),email=`zarix-${run}-${suffix}@example.invalid`,password=`Synthetic-${randomUUID()}-9a!`;
   const signup=await client.auth.signUp({email,password});unwrap(signup);
   if(!signup.data.session)throw new Error('Local email confirmation is enabled. Use a fresh local stack with confirmations disabled; do not substitute a service-role session.');
   await client.auth.signOut();const signed=unwrap(await client.auth.signInWithPassword({email,password}));
   const verified=unwrap(await client.auth.getUser());assert.equal(verified.user.id,signed.user.id);
   const claims=JSON.parse(Buffer.from(signed.session.access_token.split('.')[1],'base64url').toString());
   assert.equal(claims.role,'authenticated');assert.equal(claims.sub,signed.user.id);
   clients.push(client);users.push(signed.user.id);
  }
  assert.equal(Number(sql(`SELECT count(*) FROM auth.users WHERE id IN (${users.map(literal).join(',')})`)),2,'Auth API and SQL URL must target the same disposable database');
  return {normalRoles:2,ids:users,credentials:'ephemeral synthetic values; never logged or persisted by the test'};
 });
 const [a,b]=clients,[userA,userB]=users;
 const accountA=randomUUID(),accountB=randomUUID(),investmentA=randomUUID(),groupA=randomUUID(),groupB=randomUUID(),memberA=randomUUID(),guestA=randomUUID(),memberB=randomUUID();
 const tokenA=randomUUID().replaceAll('-',''),tokenB=randomUUID().replaceAll('-','');
 await test('ordinary PostgREST account CRUD and tenant isolation',async()=>{
  unwrap(await a.from('accounts').insert({id:accountA,user_id:userA,name:'Cuenta sintética A',balance:10000}));
  unwrap(await b.from('accounts').insert({id:accountB,user_id:userB,name:'Cuenta sintética B',balance:5000}));
  assert.deepEqual(unwrap(await a.from('accounts').select('id')).map(r=>r.id),[accountA]);
  assert.deepEqual(unwrap(await b.from('accounts').select('id')).map(r=>r.id),[accountB]);
  assert.deepEqual(unwrap(await a.from('accounts').update({name:'Intrusión'}).eq('id',accountB).select('id')),[]);
  assert.deepEqual(unwrap(await a.from('accounts').delete().eq('id',accountB).select('id')),[]);
  deny(await anon.from('accounts').select('*'));
  unwrap(await a.from('accounts').update({name:'Cuenta A editada'}).eq('id',accountA));
 });
 await test('ordinary profile grants protect credentials and paid status',async()=>{
  assert.deepEqual(unwrap(await a.from('users').select('id,timezone')).map(r=>r.id),[userA]);
  unwrap(await a.from('users').update({timezone:'Etc/UTC'}).eq('id',userA));
  deny(await a.from('users').select('gemini_api_key'));
  deny(await a.from('users').update({status:'CANCELED'}).eq('id',userA));
  deny(await a.from('users').update({telegram_chat_id:123456}).eq('id',userA));
 });
 await test('ordinary financial writes run actual triggers and reject another tenant account',async()=>{
  const tx=unwrap(await a.from('transactions').insert({user_id:userA,type:'expense',account_id:accountA,amount:100,currency:'ARS',amount_in_account_currency:100}).select('id').single());
  assert.equal(unwrap(await a.from('accounts').select('balance').eq('id',accountA).single()).balance,9900);
  unwrap(await a.from('transactions').update({type:'income'}).eq('id',tx.id));
  assert.equal(unwrap(await a.from('accounts').select('balance').eq('id',accountA).single()).balance,10100);
  unwrap(await a.from('transactions').delete().eq('id',tx.id));
  assert.equal(unwrap(await a.from('accounts').select('balance').eq('id',accountA).single()).balance,10000);
  assert.ok((await a.from('transactions').insert({user_id:userA,type:'expense',account_id:accountB,amount:1,currency:'ARS',amount_in_account_currency:1})).error);
 });
 await test('normal-session NaN transaction is rejected without poisoning balance',async()=>{
  const before=unwrap(await a.from('accounts').select('balance').eq('id',accountA).single()).balance;
  const attempt=await a.from('transactions').insert({user_id:userA,type:'expense',account_id:accountA,amount:'NaN',currency:'ARS',amount_in_account_currency:'NaN'});
  assert.equal(attempt.error?.code,'23514');
  assert.equal(unwrap(await a.from('accounts').select('balance').eq('id',accountA).single()).balance,before);
 });
 unwrap(await admin.from('investments').insert({id:investmentA,user_id:userA,account_id:accountA,type:'stock_us',name:'Posición sintética',quantity:10,purchase_price:20,purchase_currency:'USD',purchase_date:'2026-10-01'}));
 unwrap(await admin.from('shared_groups').insert([{id:groupA,owner_user_id:userA,name:'Grupo A',share_token:tokenA},{id:groupB,owner_user_id:userB,name:'Grupo B',share_token:tokenB}]));
 unwrap(await admin.from('shared_group_members').insert([{id:memberA,group_id:groupA,user_id:userA,display_name:'Usuario A'},{id:guestA,group_id:groupA,display_name:'Invitado sintético'},{id:memberB,group_id:groupB,user_id:userB,display_name:'Usuario B'}]));
 const saleArgs={p_user_id:userA,p_investment_id:investmentA,p_quantity:1,p_price:25,p_currency:'USD',p_sold_at:'2026-10-08',p_realized_pnl_native:5,p_realized_pnl_usd:5,p_ars_per_usd:1200};
 const sharedArgs={p_share_token:tokenA,p_actor_member_id:guestA,p_paid_by_member_id:memberA,p_description:'Cena sintética',p_amount:10.01};
 await test('real anon/normal sessions cannot invoke backend-only RPCs',async()=>{
  for(const client of [anon,a,b]){deny(await client.rpc('sell_investment_position',saleArgs));deny(await client.rpc('save_shared_expense',sharedArgs));}
 });
 await test('guest capability is bounded by group through backend RPC',async()=>{
  const expense=unwrap(await admin.rpc('save_shared_expense',sharedArgs));assert.equal(expense.amount,10.01);
  assert.deepEqual(expense.splits.map(s=>s.amount).sort(),[5,5.01]);
  assert.equal(unwrap(await a.from('shared_expenses').select('id')).length,1);
  assert.equal(unwrap(await b.from('shared_expenses').select('id')).length,0);
  deny(await anon.from('shared_expenses').select('*'));
  assert.equal((await admin.rpc('save_shared_expense',{...sharedArgs,p_actor_member_id:memberB})).error?.code,'42501');
  assert.equal(unwrap(await admin.rpc('save_shared_expense',{...sharedArgs,p_share_token:tokenB,p_actor_member_id:memberB,p_paid_by_member_id:memberB,p_expense_id:expense.id})),null);
 });
 await test('two independent PostgreSQL sessions cannot oversell',async()=>{
  const call=`BEGIN; SET LOCAL ROLE service_role; SELECT pg_sleep(0.2); SELECT sell_investment_position(${literal(userA)},${literal(investmentA)},6,25,'USD','2026-10-08',30,30,1200,NULL); COMMIT;`;
  const attempts=await Promise.all([parallelSql(call),parallelSql(call)]);
  assert.equal(attempts.filter(r=>r.status===0).length,1);assert.equal(attempts.filter(r=>r.status!==0).length,1);
  assert.match(attempts.find(r=>r.status!==0).stderr,/CANTIDAD_INSUFICIENTE/);
  assert.equal(Number(sql(`SELECT quantity FROM investments WHERE id=${literal(investmentA)}`)),4);
  assert.equal(Number(sql(`SELECT sum(quantity) FROM investment_sales WHERE investment_id=${literal(investmentA)}`)),6);
  return {independentSessions:2,committed:1,rejected:1,remaining:4,scope:'Concurrent process submission; exact lock contention is not instrumented.'};
 });
 await test('two independent PostgreSQL retries have one financial effect and one durable response',async()=>{
  const request={user_id:userA,type:'expense',account_id:accountA,amount:12.34,currency:'ARS',amount_in_account_currency:12.34,description:'Reintento sintético'};
  const call=`BEGIN; SET LOCAL ROLE service_role; SELECT pg_sleep(0.2); SELECT create_transaction_once(${literal(userA)},'native-retry-001',${literal(digest(JSON.stringify(request)))},${literal(JSON.stringify(request))}::jsonb,1); COMMIT;`;
  const attempts=await Promise.all([parallelSql(call),parallelSql(call)]);assert.ok(attempts.every(r=>r.status===0));
  const responses=attempts.map(r=>JSON.parse(r.stdout.split('\n').find(line=>line.startsWith('{'))));assert.deepEqual(responses[0],responses[1]);
  assert.equal(Number(sql(`SELECT count(*) FROM transactions WHERE user_id=${literal(userA)}`)),1);
  assert.equal(Number(sql(`SELECT balance FROM accounts WHERE id=${literal(accountA)}`)),9987.66);
  return {independentSessions:2,responses:2,financialEffects:1,scope:'Concurrent process submission; exact lock contention is not instrumented.'};
 });
 await test('native pg_dump restores to a separate newly created empty database',async()=>{
  const target=`zarix_restore_${run.replaceAll('-','')}`;
  const hashes=db=>{
   const tables=JSON.parse(sql("SELECT json_agg(json_build_object('schema',schemaname,'table',tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname IN ('public','auth')",db));
   return Object.fromEntries(tables.map(({schema,table})=>[`${schema}.${table}`,JSON.parse(sql(`SELECT json_build_object('count',count(*),'sha256',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text,'UTF8')),'hex')) FROM "${schema}"."${table}" t`,db))]));
  };
  const catalog=db=>JSON.parse(sql(`SET search_path=pg_catalog; SELECT jsonb_build_object(
    'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'acl',c.relacl,'options',c.reloptions) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','v','S')),
    'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('sql','plpgsql'))),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname) FROM pg_policies p WHERE p.schemaname='public'),
    'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.tablename,i.indexname) FROM pg_indexes i WHERE i.schemaname='public'),
    'constraints',(SELECT jsonb_agg(jsonb_build_object('relation',c.conrelid::regclass::text,'name',c.conname,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conrelid::regclass::text,c.conname) FROM pg_constraint c WHERE c.connamespace='public'::regnamespace),
    'columns',(SELECT jsonb_agg(jsonb_build_object('relation',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','v') AND a.attnum>0 AND NOT a.attisdropped),
    'triggers',(SELECT jsonb_agg(jsonb_build_object('relation',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal)
  )`,db));
  const before=hashes(pgEnv.PGDATABASE),beforeCatalog=catalog(pgEnv.PGDATABASE),backup=path.join(outputDir,'native-database.dump');
  command('pg_dump',['--format=custom','--file',backup]);await fs.chmod(backup,0o600);
  assert.deepEqual(hashes(pgEnv.PGDATABASE),before,'Source changed during backup; retry from a quiet checkpoint');
  sql(`CREATE DATABASE "${target}" TEMPLATE template0`);
  assert.equal(Number(sql("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')",target)),0);
  command('pg_restore',['--exit-on-error','--dbname',target,backup]);
  assert.deepEqual(hashes(target),before);assert.deepEqual(catalog(target),beforeCatalog);
  assert.equal(Number(sql(`BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',${literal(userA)},true);SELECT count(*) FROM accounts;ROLLBACK`,target).split('\n').at(-1)),1);
  const denied=await new Promise(resolve=>{const child=spawn(bin('psql'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c','SET ROLE anon;SELECT * FROM public.accounts'],{env:{...pgEnv,PGDATABASE:target}});child.on('close',code=>resolve(code));child.stderr.resume();child.stdout.resume();});assert.notEqual(denied,0);
  const bytes=await fs.readFile(backup);report.recovery={targetDatabase:target,format:'native pg_dump custom archive',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),catalogSha256:digest(JSON.stringify(beforeCatalog)),tables:before};
  return {targetDatabase:target,verifiedTables:Object.keys(before).length,sha256:report.recovery.sha256,scope:'same isolated cluster roles; database schema/data/grants restored, external Storage objects not included'};
 });
 await test('SQL source files remained unchanged throughout native verification',async()=>{
  const current=(await bootstrapSources()).map(({path,sha256})=>({path,sha256}));
  assert.deepEqual(current,report.manifest);
 });
 report.status='PASS';report.passed=results.length;
} catch(error) {report.status='FAIL';report.error=error.message;process.exitCode=1;}
finally {await fs.writeFile(path.join(outputDir,'native-verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2));}
