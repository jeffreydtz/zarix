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
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch, safeNativeFailure } from './lib/test-isolated-native-target.mjs';

const {apiUrl,databaseUrl}=isolatedNativeTargets();
const anonKey=process.env.ZARIX_LOCAL_ANON_KEY,serviceKey=process.env.ZARIX_LOCAL_SERVICE_ROLE_KEY;
if(!anonKey||!serviceKey)throw new Error('Supply only disposable local stack keys in ZARIX_LOCAL_ANON_KEY and ZARIX_LOCAL_SERVICE_ROLE_KEY.');
const pgBin=process.env.ZARIX_PG_BIN||'';
const pgEnv=isolatedPgEnvironment(databaseUrl);
const restoreConfigured=Boolean(process.env.ZARIX_RESTORE_SUPABASE_URL);
const restoreTarget=restoreConfigured?isolatedNativeTargets({
 ZARIX_ISOLATED_DATABASE_CONFIRM:process.env.ZARIX_ISOLATED_DATABASE_CONFIRM,
 ZARIX_LOCAL_SUPABASE_URL:process.env.ZARIX_RESTORE_SUPABASE_URL,
 ZARIX_LOCAL_DATABASE_URL:process.env.ZARIX_RESTORE_DATABASE_URL,
}):null;
const restoreEnv=restoreTarget?isolatedPgEnvironment(restoreTarget.databaseUrl):null;
if(restoreTarget && (!process.env.ZARIX_RESTORE_ANON_KEY||!process.env.ZARIX_RESTORE_SERVICE_ROLE_KEY||!process.env.ZARIX_RESTORE_DATABASE_URL)) throw new Error('A separate restore stack requires all four ZARIX_RESTORE_* settings.');
if(restoreTarget && (restoreTarget.apiUrl.href===apiUrl.href || (restoreEnv.PGHOST===pgEnv.PGHOST && restoreEnv.PGPORT===pgEnv.PGPORT && restoreEnv.PGDATABASE===pgEnv.PGDATABASE))) throw new Error('Restore target must be distinct from the source stack.');
const outputDir=process.env.ZARIX_EVIDENCE_DIR||await fs.mkdtemp(path.join(os.tmpdir(),'zarix-native-evidence-'));
await fs.mkdir(outputDir,{recursive:true,mode:0o700});
const diagnosticsDir=await fs.mkdtemp(path.join(os.tmpdir(),'zarix-native-private-'));
await fs.chmod(diagnosticsDir,0o700);
let diagnosticNumber=0;
const retainFailure=async error=>{
 await fs.writeFile(path.join(diagnosticsDir,`failure-${++diagnosticNumber}.txt`),`${error.stack??error.message??'Native verification failed'}\n${error.privateDetails??''}\n`,{mode:0o600});
};
const loginFile=process.env.ZARIX_TEST_LOGIN_FILE?path.resolve(process.env.ZARIX_TEST_LOGIN_FILE):null;
if(loginFile) {
 assert.ok(loginFile.startsWith('/tmp/')||loginFile.startsWith(os.tmpdir()+path.sep),'Synthetic browser credentials may be retained only in a private temporary directory');
 assert.ok(!loginFile.startsWith(path.resolve(outputDir)+path.sep),'Synthetic credentials must never be written in evidence');
}
const retainLogins=async data=>{if(loginFile){await fs.writeFile(loginFile,JSON.stringify(data,null,2),{mode:0o600});await fs.chmod(loginFile,0o600);}};
const bin=name=>pgBin?path.join(pgBin,name):name;
function command(name,args,extra={}) {
 const result=spawnSync(bin(name),args,{env:pgEnv,encoding:'utf8',maxBuffer:64*1024*1024,...extra});
 if(result.error)throw result.error;
 if(result.status!==0) {
  const error=new Error('Native local command failed');error.name='NativeCommandError';error.code=`EXIT_${result.status}`;error.privateDetails=result.stderr;throw error;
 }
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
async function observeSql(predicate,description) {
 for(let attempt=0;attempt<40;attempt++) {
  if(Number(sql(predicate))>0) return;
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw new Error(`Independent-session observation timed out: ${description}`);
}
// The experimental native gateway can reset an idle pooled HTTP connection
// while synchronous catalog probes run. A fresh connection avoids that
// transport artifact without retrying a potentially committed financial write.
const nativeFetch=(input,init={})=>{const headers=new Headers(init.headers);headers.set('Connection','close');return isolatedApiFetch(input,{...init,headers});};
const makeClient=key=>createClient(apiUrl.href,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:nativeFetch}});
const clientAt=(url,key)=>createClient(url.href,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:nativeFetch}});
const admin=makeClient(serviceKey),anon=makeClient(anonKey);
const results=[];const report={runAt:new Date().toISOString(),status:'RUNNING',target:'loopback disposable Supabase',results};
const harnessUrl=new URL(import.meta.url),harnessSha256=createHash('sha256').update(await fs.readFile(harnessUrl)).digest('hex');
report.harnessSha256=harnessSha256;
const revision=spawnSync('git',['rev-parse','HEAD'],{env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},encoding:'utf8'});
report.sourceRevision=revision.status===0?revision.stdout.trim():null;
const unwrap=response=>{if(response.error){const error=new Error('Native Supabase API operation failed');error.name='NativeApiError';error.code=response.error.code;error.privateDetails=JSON.stringify(response.error);throw error;}return response.data;};
const deny=response=>{assert.ok(response.error,'Expected permission denial');assert.equal(response.error.code,'42501');};
async function test(name,fn) {
 try {const evidence=await fn();results.push({name,status:'PASS',...(evidence?{evidence}:{})});}
 catch(error) {await retainFailure(error);results.push({name,status:'FAIL',error:safeNativeFailure(error,name)});throw error;}
}
const run=randomUUID().slice(0,8),credentials=[];
const recoveryOnly=process.argv.includes('--recovery-only');
const backupPath=path.join(outputDir,recoveryOnly?'native-database-recovery.dump':'native-database.dump');
report.mode=recoveryOnly?'recovery-only':'complete';
let a,b,userA,userB,accountA,accountB,sharedArgs,storageBucket,storagePath,storageBytes;
const users=[];
const tableHashes=(environment,schemas=['public','auth','storage'])=>{
 const query=statement=>command('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',statement],{env:environment});
 const tables=JSON.parse(query(`SELECT json_agg(json_build_object('schema',schemaname,'table',tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname IN (${schemas.map(literal).join(',')})`));
 return Object.fromEntries(tables.map(({schema,table})=>[`${schema}.${table}`,JSON.parse(query(`SELECT json_build_object('count',count(*),'sha256',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text,'UTF8')),'hex')) FROM "${schema}"."${table}" t`))]));
};
const canonicalCatalog=data=>{
 // pg_dump can reorder ACL entries while preserving every grantee, grantor,
 // privilege and grant option. Compare the complete entries as an unordered set.
 for(const rows of Object.values(data)) for(const row of rows??[]) {
  if(Array.isArray(row.acl))row.acl.sort();
  if(Array.isArray(row.options))row.options.sort();
 }
 return data;
};
try {
 const files=await bootstrapSources();
 report.engine=sql('SELECT version()');
 report.pgTools={psql:command('psql',['--version']),pgDump:command('pg_dump',['--version']),pgRestore:command('pg_restore',['--version'])};
 report.manifest=files.map(({path,sha256})=>({path,sha256}));
 if(recoveryOnly) {
  assert.ok(loginFile&&process.env.ZARIX_NATIVE_CHECKPOINT_FILE,'Recovery continuation requires a private login file and the previous sanitized checkpoint report');
  const privateData=JSON.parse(await fs.readFile(loginFile,'utf8'));
  const checkpointBytes=await fs.readFile(process.env.ZARIX_NATIVE_CHECKPOINT_FILE);
  const checkpoint=JSON.parse(checkpointBytes);
  assert.deepEqual(checkpoint.manifest,report.manifest,'SQL sources changed since the previous native checkpoint');
  assert.equal(privateData.users.length,2);
  assert.ok(privateData.users.every(user=>user.email.endsWith('@example.invalid')),'Only synthetic registered users can continue this verification');
  const previousUsers=checkpoint.results.find(result=>result.name==='two real ordinary Auth registrations and verified sign-ins'&&result.status==='PASS')?.evidence.ids;
  assert.deepEqual(privateData.users.map(user=>user.id),previousUsers,'Private credentials must belong to the previous test identities');
  assert.equal(Number(sql('SELECT count(*) FROM auth.users')),2);
  assert.equal(Number(sql(`SELECT count(*) FROM auth.users WHERE id IN (${previousUsers.map(literal).join(',')}) AND email LIKE 'zarix-%@example.invalid'`)),2);
  report.checkpoint={sha256:digest(checkpointBytes),runAt:checkpoint.runAt,harnessSha256:checkpoint.harnessSha256,previousPassed:checkpoint.results.filter(result=>result.status==='PASS').length,scope:'Earlier checks remain evidence of their original run; they are not counted as executed again here.'};
  const clients=[];
  for(const user of privateData.users) {
   const client=makeClient(anonKey);credentials.push({email:user.email,password:user.password});
   assert.equal(unwrap(await client.auth.signInWithPassword(credentials.at(-1))).user.id,user.id);
   assert.equal(unwrap(await client.auth.getUser()).user.id,user.id);
   users.push(user.id);clients.push(client);
  }
  [a,b]=clients;[userA,userB]=users;
  accountA=JSON.parse(sql(`SELECT jsonb_agg(id) FROM public.accounts WHERE user_id=${literal(userA)}`))[0];
  accountB=JSON.parse(sql(`SELECT jsonb_agg(id) FROM public.accounts WHERE user_id=${literal(userB)} AND name='Cuenta sintética B'`))[0];
  sharedArgs={p_share_token:privateData.guest.token,p_actor_member_id:privateData.guest.memberId,p_paid_by_member_id:privateData.guest.payerMemberId,p_description:'Cena sintética',p_amount:10.01};
  const objects=JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name)) FROM storage.objects WHERE name=${literal(userA+'/synthetic-recovery.txt')}`));
  assert.equal(objects?.length,1,'Expected one original private synthetic Storage fixture');
  storageBucket=objects[0].bucket;storagePath=objects[0].name;
  storageBytes=Buffer.from(await unwrap(await a.storage.from(storageBucket).download(storagePath)).arrayBuffer());
  const originalStorage=checkpoint.results.find(result=>result.name==='private Storage synthetic object is accessible only to its ordinary owner'&&result.status==='PASS')?.evidence;
  assert.equal(digest(storageBytes),originalStorage.sha256,'The original binary Storage fixture changed');
 } else {
 assert.equal(Number(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'")),0,'Refusing bootstrap into a nonempty public schema');
 assert.equal(Number(sql('SELECT count(*) FROM auth.users')),0,'Refusing use of a stack with existing Auth users');
 assert.equal(unwrap(await admin.auth.admin.listUsers({page:1,perPage:1})).users.length,0,'Refusing an API target with existing Auth users');

 const bootstrap=path.join(outputDir,'bootstrap.sql');await fs.writeFile(bootstrap,files.map(f=>`-- ${f.path} SHA256 ${f.sha256}\n${f.sql}`).join('\n\n'),{mode:0o600});
 // extensions is Supabase's standard extension schema; fixture SQL is unmodified.
 command('psql',['-X','-q','-v','ON_ERROR_STOP=1','-c','SET search_path=public,extensions','-f',bootstrap]);
 sql("NOTIFY pgrst,'reload schema'");
 const clients=[];
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
   credentials.push({email,password});
  }
  assert.equal(Number(sql(`SELECT count(*) FROM auth.users WHERE id IN (${users.map(literal).join(',')})`)),2,'Auth API and SQL URL must target the same disposable database');
  await retainLogins({users:credentials.map((credential,index)=>({id:users[index],...credential}))});
  return {normalRoles:2,ids:users,credentials:'ephemeral synthetic values; excluded from logs and evidence'};
 });
 [a,b]=clients;[userA,userB]=users;
 await test('cryptographically altered and malformed access tokens fail Auth and PostgREST',async()=>{
  const original=unwrap(await a.auth.getSession()).session.access_token;
  const pieces=original.split('.');pieces[2]=(pieces[2][0]==='a'?'b':'a')+pieces[2].slice(1);
  const statuses=[];
  for(const token of [pieces.join('.'),'invalid.synthetic.token']) {
   assert.ok((await anon.auth.getUser(token)).error);
   const response=await nativeFetch(new URL('/rest/v1/accounts?select=id',apiUrl),{headers:{apikey:anonKey,Authorization:`Bearer ${token}`}});
   assert.equal(response.status,401);statuses.push(response.status);
  }
  return {alteredSignatureAndMalformedToken:statuses,tokenValues:'not recorded'};
 });
 await test('native catalog enforces RLS, invoker views and unprivileged ordinary roles',async()=>{
  assert.equal(Number(sql("SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND NOT relrowsecurity")),0);
  assert.equal(Number(sql("SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='v' AND NOT coalesce(reloptions @> ARRAY['security_invoker=true'],false)")),0);
  assert.equal(Number(sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)")),0);
 });
 accountA=randomUUID();accountB=randomUUID();const investmentA=randomUUID(),groupA=randomUUID(),groupB=randomUUID(),memberA=randomUUID(),guestA=randomUUID(),memberB=randomUUID();
 const tokenA=randomUUID().replaceAll('-',''),tokenB=randomUUID().replaceAll('-','');
 let savedExpense;
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
 await test('ordinary transfer edits and deletion preserve distinct authoritative monetary amounts',async()=>{
  const destination=randomUUID();
  unwrap(await a.from('accounts').insert({id:destination,user_id:userA,name:'Destino USD sintético',currency:'USD',balance:50}));
  const initial=unwrap(await a.from('accounts').select('balance').eq('id',accountA).single()).balance;
  try {
   const transfer=unwrap(await a.from('transactions').insert({user_id:userA,type:'transfer',account_id:accountA,destination_account_id:destination,amount:1200,currency:'ARS',amount_in_account_currency:1200,destination_amount_in_account_currency:1,exchange_rate:0.00083333}).select('id').single());
   assert.equal(unwrap(await a.from('accounts').select('balance').eq('id',accountA).single()).balance,initial-1200);
   assert.equal(unwrap(await a.from('accounts').select('balance').eq('id',destination).single()).balance,51);
   unwrap(await a.from('transactions').update({amount:1001.23,amount_in_account_currency:1001.23,destination_amount_in_account_currency:1.11,exchange_rate:0.00110864}).eq('id',transfer.id));
   assert.equal(unwrap(await a.from('accounts').select('balance').eq('id',accountA).single()).balance,initial-1001.23);
   assert.equal(unwrap(await a.from('accounts').select('balance').eq('id',destination).single()).balance,51.11);
   unwrap(await a.from('transactions').delete().eq('id',transfer.id));
   assert.equal(unwrap(await a.from('accounts').select('balance').eq('id',accountA).single()).balance,initial);
   assert.equal(unwrap(await a.from('accounts').select('balance').eq('id',destination).single()).balance,50);
  } finally {unwrap(await a.from('accounts').delete().eq('id',destination));}
 });
 unwrap(await admin.from('investments').insert({id:investmentA,user_id:userA,account_id:accountA,type:'stock_us',name:'Posición sintética',quantity:10,purchase_price:20,purchase_currency:'USD',purchase_date:'2026-10-01'}));
 unwrap(await admin.from('shared_groups').insert([{id:groupA,owner_user_id:userA,name:'Grupo A',share_token:tokenA},{id:groupB,owner_user_id:userB,name:'Grupo B',share_token:tokenB}]));
 unwrap(await admin.from('shared_group_members').insert([{id:memberA,group_id:groupA,user_id:userA,display_name:'Usuario A'},{id:guestA,group_id:groupA,display_name:'Invitado sintético'},{id:memberB,group_id:groupB,user_id:userB,display_name:'Usuario B'}]));
 await retainLogins({users:credentials.map((credential,index)=>({id:users[index],...credential})),guest:{groupId:groupA,memberId:guestA,payerMemberId:memberA,token:tokenA}});
 const saleArgs={p_user_id:userA,p_investment_id:investmentA,p_quantity:1,p_price:25,p_currency:'USD',p_sold_at:'2026-10-08',p_realized_pnl_native:5,p_realized_pnl_usd:5,p_ars_per_usd:1200};
 sharedArgs={p_share_token:tokenA,p_actor_member_id:guestA,p_paid_by_member_id:memberA,p_description:'Cena sintética',p_amount:10.01};
 await test('real anon/normal sessions cannot invoke backend-only RPCs',async()=>{
  for(const client of [anon,a,b]){deny(await client.rpc('sell_investment_position',saleArgs));deny(await client.rpc('save_shared_expense',sharedArgs));}
 });
 await test('guest capability is bounded by group through backend RPC',async()=>{
  const expense=unwrap(await admin.rpc('save_shared_expense',sharedArgs));savedExpense=expense;assert.equal(expense.amount,10.01);
  assert.deepEqual(expense.splits.map(s=>s.amount).sort(),[5,5.01]);
  assert.equal(unwrap(await a.from('shared_expenses').select('id')).length,1);
  assert.equal(unwrap(await b.from('shared_expenses').select('id')).length,0);
  deny(await anon.from('shared_expenses').select('*'));
  assert.equal((await admin.rpc('save_shared_expense',{...sharedArgs,p_actor_member_id:memberB})).error?.code,'42501');
  assert.equal(unwrap(await admin.rpc('save_shared_expense',{...sharedArgs,p_share_token:tokenB,p_actor_member_id:memberB,p_paid_by_member_id:memberB,p_expense_id:expense.id})),null);
 });
 await test('invalid, rotated and inactive guest capabilities cannot write or replay a receipt',async()=>{
  const args={p_share_token:tokenA,p_request_id:'native-guest-retry-001',p_request_hash:digest(JSON.stringify(sharedArgs)),p_expense:{...sharedArgs,p_expense_id:savedExpense.id}};
  unwrap(await admin.rpc('save_shared_expense_once',args));
  assert.equal(unwrap(await admin.rpc('save_shared_expense',{...sharedArgs,p_share_token:'invalid'})),null);
  assert.equal(unwrap(await admin.rpc('save_shared_expense',{...sharedArgs,p_share_token:'f'.repeat(32)})),null);
  const replacement=randomUUID().replaceAll('-','');
  unwrap(await a.from('shared_groups').update({share_token:replacement}).eq('id',groupA));
  try {
   assert.equal(unwrap(await admin.rpc('save_shared_expense',sharedArgs)),null);
   assert.equal(unwrap(await admin.rpc('save_shared_expense_once',args)),null);
   unwrap(await a.from('shared_groups').update({is_active:false}).eq('id',groupA));
   assert.equal(unwrap(await admin.rpc('save_shared_expense',{...sharedArgs,p_share_token:replacement})),null);
  } finally {unwrap(await a.from('shared_groups').update({share_token:tokenA,is_active:true}).eq('id',groupA));}
  return {invalid:2,rotated:2,inactive:1,scope:'Group capability revocation, including durable replay; member IDs are declared identities.'};
 });
 await test('manipulated tenant, payer and split identifiers leave financial data unchanged',async()=>{
  const before=tableHashes(pgEnv,['public']);
  assert.ok((await admin.rpc('sell_investment_position',{...saleArgs,p_user_id:userB})).error);
  assert.equal((await admin.rpc('save_shared_expense',{...sharedArgs,p_paid_by_member_id:memberB})).error?.code,'22023');
  assert.equal((await admin.rpc('save_shared_expense',{...sharedArgs,p_split_member_ids:[guestA,memberB]})).error?.code,'22023');
  assert.deepEqual(tableHashes(pgEnv,['public']),before);
 });
 await test('native shared split failure rolls back expense amount and prior distribution',async()=>{
  const before=tableHashes(pgEnv,['public']);
  sql("CREATE FUNCTION public.native_reject_split() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic split failure' USING ERRCODE='23514'; END $$;CREATE TRIGGER native_reject_split BEFORE INSERT ON public.shared_expense_splits FOR EACH ROW EXECUTE FUNCTION public.native_reject_split()");
  try {assert.equal((await admin.rpc('save_shared_expense',{...sharedArgs,p_expense_id:savedExpense.id,p_amount:20.55})).error?.code,'23514');}
  finally {sql('DROP TRIGGER native_reject_split ON public.shared_expense_splits;DROP FUNCTION public.native_reject_split()');}
  assert.deepEqual(tableHashes(pgEnv,['public']),before);
 });
 await test('native sale insert failure rolls back its preceding quantity decrement',async()=>{
  const before=tableHashes(pgEnv,['public']);
  sql("CREATE FUNCTION public.native_reject_sale() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic sale failure' USING ERRCODE='23514'; END $$;CREATE TRIGGER native_reject_sale BEFORE INSERT ON public.investment_sales FOR EACH ROW EXECUTE FUNCTION public.native_reject_sale()");
  try {const response=await admin.rpc('sell_investment_position',saleArgs);assert.equal(response.error?.code,'23514',JSON.stringify({status:response.status,error:response.error}));}
  finally {sql('DROP TRIGGER native_reject_sale ON public.investment_sales;DROP FUNCTION public.native_reject_sale()');}
  assert.deepEqual(tableHashes(pgEnv,['public']),before);
 });
 await test('two independent PostgreSQL sessions cannot oversell',async()=>{
  const call=`SELECT sell_investment_position(${literal(userA)},${literal(investmentA)},6,25,'USD','2026-10-08',30,30,1200,NULL);`;
  const first=parallelSql(`/* native-sale-first */ BEGIN; SET LOCAL ROLE service_role; ${call} SELECT pg_sleep(3); COMMIT;`);
  await observeSql("SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query LIKE '/* native-sale-first */%' AND wait_event='PgSleep'",'first sale holds its row lock');
  const second=parallelSql(`/* native-sale-second */ BEGIN; SET LOCAL ROLE service_role; ${call} COMMIT;`);
  await observeSql("SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query LIKE '/* native-sale-second */%' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",'second sale waits for the first transaction');
  const attempts=await Promise.all([first,second]);
  assert.equal(attempts.filter(r=>r.status===0).length,1);assert.equal(attempts.filter(r=>r.status!==0).length,1);
  assert.match(attempts.find(r=>r.status!==0).stderr,/CANTIDAD_INSUFICIENTE/);
  assert.equal(Number(sql(`SELECT quantity FROM investments WHERE id=${literal(investmentA)}`)),4);
  assert.equal(Number(sql(`SELECT sum(quantity) FROM investment_sales WHERE investment_id=${literal(investmentA)}`)),6);
  return {independentSessions:2,observedLockWait:true,committed:1,rejected:1,remaining:4,scope:'pg_stat_activity and pg_blocking_pids observed the second independent session waiting before the first committed.'};
 });
 await test('two independent PostgreSQL retries have one financial effect and one durable response',async()=>{
  const request={user_id:userA,type:'expense',account_id:accountA,amount:12.34,currency:'ARS',amount_in_account_currency:12.34,description:'Reintento sintético'};
  const call=`SELECT create_transaction_once(${literal(userA)},'native-retry-001',${literal(digest(JSON.stringify(request)))},${literal(JSON.stringify(request))}::jsonb,1);`;
  const first=parallelSql(`/* native-retry-first */ BEGIN; SET LOCAL ROLE service_role; ${call} SELECT pg_sleep(3); COMMIT;`);
  await observeSql("SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query LIKE '/* native-retry-first */%' AND wait_event='PgSleep'",'first request holds its durable receipt transaction');
  const second=parallelSql(`/* native-retry-second */ BEGIN; SET LOCAL ROLE service_role; ${call} COMMIT;`);
  await observeSql("SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query LIKE '/* native-retry-second */%' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",'second retry waits for the first transaction');
  const attempts=await Promise.all([first,second]);assert.ok(attempts.every(r=>r.status===0));
  const responses=attempts.map(r=>JSON.parse(r.stdout.split('\n').find(line=>line.startsWith('{'))));assert.deepEqual(responses[0],responses[1]);
  assert.equal(Number(sql(`SELECT count(*) FROM transactions WHERE user_id=${literal(userA)}`)),1);
  assert.equal(Number(sql(`SELECT balance FROM accounts WHERE id=${literal(accountA)}`)),9987.66);
  return {independentSessions:2,observedLockWait:true,responses:2,financialEffects:1,scope:'Second independent session was observed blocked, then returned the first durable response after commit.'};
 });
 await test('representative synthetic records populate all application tables for native recovery',async()=>{
  sql(`UPDATE public.users SET status='ACTIVE',current_period_end='2099-01-01' WHERE id=${literal(userB)}`);
  const category=randomUUID(),budget=randomUUID(),rule=randomUUID(),importBatch=randomUUID();
  sql(`INSERT INTO public.categories(id,user_id,name,type) VALUES(${literal(category)},${literal(userB)},'Categoría de recuperación','expense');
   INSERT INTO public.budgets(id,user_id,category_id,month,amount) VALUES(${literal(budget)},${literal(userB)},${literal(category)},'2026-10-01',100);
   INSERT INTO public.budget_alerts(budget_id,percent_reached) VALUES(${literal(budget)},80);
   INSERT INTO public.bot_sessions(user_id,telegram_chat_id,context) VALUES(${literal(userB)},123456,'[{"synthetic":true}]');
   INSERT INTO public.exchange_rates(source,from_currency,rate) VALUES('synthetic','USD',1200);
   INSERT INTO public.market_data_cache(id,payload) VALUES(1,'{"synthetic":true}');
   INSERT INTO public.portfolio_performance_snapshots(user_id,snapshot_date,cost_basis_usd,market_value_usd,unrealized_pnl_usd,roi_percent,blue_ars_per_usd) VALUES(${literal(userB)},'2026-10-08',150,160,10,6.666667,1200);
   INSERT INTO public.net_worth_snapshots(user_id,snapshot_date,liquid_usd,investments_usd,total_usd,total_ars_blue,blue_ars_per_usd) VALUES(${literal(userB)},'2026-10-08',4,160,164,196800,1200);
   INSERT INTO public.recurring_rules(id,user_id,account_id,type,amount,currency,description,frequency,start_date) VALUES(${literal(rule)},${literal(userB)},${literal(accountB)},'expense',12.34,'ARS','Recurrente sintética','monthly','2026-10-01')`);
  const request={user_id:userB,type:'expense',account_id:accountB,amount:12.34,currency:'ARS',amount_in_account_currency:12.34,description:'Movimiento recurrente sintético',is_recurring:true,recurring_rule_id:rule,transaction_date:'2026-10-08T15:00:00Z'};
  unwrap(await admin.rpc('create_transaction_once',{p_user_id:userB,p_request_id:'native-recurring-001',p_request_hash:digest(JSON.stringify(request)),p_transaction:request,p_installments:1}));
  const recoveryAccount=unwrap(await admin.rpc('create_account_with_opening_balance',{p_user_id:userB,p_request_id:'native-account-recovery-001',p_request_hash:digest('native-recovery-account'),p_account:{name:'Cuenta con recibo sintético',type:'investment',currency:'ARS'},p_initial_balance:123.45}));
  const investment=unwrap(await admin.rpc('create_investment_once',{p_user_id:userB,p_request_id:'native-investment-recovery-001',p_request_hash:digest('native-recovery-investment'),p_investment:{user_id:userB,account_id:recoveryAccount.id,type:'stock_us',name:'Posición con recibo sintético',quantity:2,purchase_price:20,purchase_currency:'USD',purchase_date:'2026-10-08'}}));
  const sale={p_investment_id:investment.id,p_quantity:1,p_price:25,p_currency:'USD',p_sold_at:'2026-10-08',p_realized_pnl_native:5,p_realized_pnl_usd:5,p_ars_per_usd:1200,p_expected_purchase_price:20,p_expected_purchase_currency:'USD',p_expected_type:'stock_us'};
  unwrap(await admin.rpc('sell_investment_once',{p_user_id:userB,p_request_id:'native-sale-recovery-001',p_request_hash:digest(JSON.stringify(sale)),p_sale:sale}));
  const reservation=randomUUID();
  unwrap(await admin.rpc('reserve_plan_usage',{p_user_id:userB,p_feature:'ai',p_request_key:'native-ai-recovery-001',p_fingerprint:digest('synthetic-ai'),p_token:reservation}));
  unwrap(await admin.rpc('finish_plan_usage',{p_user_id:userB,p_feature:'ai',p_request_key:'native-ai-recovery-001',p_token:reservation,p_succeeded:true,p_result:{synthetic:true}}));
  unwrap(await admin.rpc('begin_import_batch',{p_user_id:userB,p_batch_id:importBatch,p_intent_hash:digest('native-synthetic-import'),p_context:{synthetic:true,account_id:accountB}}));
  sql(`INSERT INTO public.inbound_email_mailboxes(user_id,token_hash,token_prefix) VALUES(${literal(userB)},${literal(digest('synthetic-mailbox'))},'zrxm_synth00')`);
  sql(`INSERT INTO public.user_benchmark_settings(user_id,plazo_fijo_tna) VALUES(${literal(userB)},30)`);
  const rows=tableHashes(pgEnv,['public']);assert.ok(Object.values(rows).every(table=>table.count>0),'Every application table must have recovery fixtures');
  return {applicationTables:Object.keys(rows).length,rowCounts:Object.fromEntries(Object.entries(rows).map(([name,value])=>[name,value.count]))};
 });
 await test('global Auth sign-out revokes refresh and records remaining access-token lifetime',async()=>{
  const session=unwrap(await b.auth.getSession()).session;
  unwrap(await b.auth.signOut({scope:'global'}));
  assert.ok((await makeClient(anonKey).auth.refreshSession({refresh_token:session.refresh_token})).error);
  const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
  const response=await nativeFetch(new URL('/rest/v1/accounts?select=id',apiUrl),{headers:{apikey:anonKey,Authorization:`Bearer ${session.access_token}`}});
  assert.ok([200,401].includes(response.status));
  return {refreshTokenRevoked:true,previousAccessTokenHttpStatus:response.status,accessTokenExpiresAt:new Date(claims.exp*1000).toISOString(),scope:'Supabase sign-out revokes refresh tokens. Stateless access JWT can remain valid until expiry; immediate access revocation is not an application guarantee.'};
 });
 storageBucket=`zarix-recovery-${run}`;storagePath=`${userA}/synthetic-recovery.txt`;storageBytes=Buffer.from(`ZARIX synthetic recovery ${run}\n`);
 await test('private Storage synthetic object is accessible only to its ordinary owner',async()=>{
  unwrap(await b.auth.signInWithPassword(credentials[1]));
  unwrap(await admin.storage.createBucket(storageBucket,{public:false}));
  for(const operation of ['SELECT','INSERT','UPDATE','DELETE']) {
   const predicate=`bucket_id=${literal(storageBucket)} AND (storage.foldername(name))[1]=(SELECT auth.uid())::text`;
   sql(`CREATE POLICY native_storage_${operation.toLowerCase()}_${run} ON storage.objects FOR ${operation} TO authenticated ${operation==='INSERT'?`WITH CHECK (${predicate})`:operation==='UPDATE'?`USING (${predicate}) WITH CHECK (${predicate})`:`USING (${predicate})`}`);
  }
  unwrap(await a.storage.from(storageBucket).upload(storagePath,storageBytes,{contentType:'text/plain'}));
  const downloaded=unwrap(await a.storage.from(storageBucket).download(storagePath));
  assert.equal(digest(Buffer.from(await downloaded.arrayBuffer())),digest(storageBytes));
  assert.ok((await b.storage.from(storageBucket).download(storagePath)).error);
  assert.ok((await anon.storage.from(storageBucket).download(storagePath)).error);
  return {objects:1,bytes:storageBytes.length,sha256:digest(storageBytes),scope:'Private synthetic recovery fixture; ZARIX does not currently define application Storage buckets.'};
 });
 }
 const catalog=environment=>canonicalCatalog(JSON.parse(command('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',`SET search_path=pg_catalog; SELECT jsonb_build_object(
    'relations',(SELECT jsonb_agg(jsonb_build_object('schema',c.relnamespace::regnamespace::text,'name',c.relname,'owner',c.relowner::regrole::text,'rls',c.relrowsecurity,'acl',c.relacl,'options',c.reloptions,'view',CASE WHEN c.relkind='v' THEN pg_get_viewdef(c.oid) ELSE NULL END) ORDER BY c.relnamespace::regnamespace::text,c.relname) FROM pg_class c WHERE c.relnamespace IN ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace) AND c.relkind IN ('r','v','S')),
    'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',p.proowner::regrole::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace) AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('sql','plpgsql'))),
    'defaultPrivileges',(SELECT jsonb_agg(jsonb_build_object('role',d.defaclrole::regrole::text,'schema',d.defaclnamespace::regnamespace::text,'kind',d.defaclobjtype,'acl',d.defaclacl) ORDER BY d.defaclrole::regrole::text,d.defaclnamespace::regnamespace::text,d.defaclobjtype) FROM pg_default_acl d),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname) FROM pg_policies p WHERE p.schemaname IN ('public','auth','storage')),
    'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.schemaname,i.tablename,i.indexname) FROM pg_indexes i WHERE i.schemaname IN ('public','auth','storage')),
    'constraints',(SELECT jsonb_agg(jsonb_build_object('relation',c.conrelid::regclass::text,'name',c.conname,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conrelid::regclass::text,c.conname) FROM pg_constraint c WHERE c.connamespace IN ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace)),
    'columns',(SELECT jsonb_agg(jsonb_build_object('relation',c.oid::regclass::text,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relnamespace::regnamespace::text,c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE c.relnamespace IN ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace) AND c.relkind IN ('r','v') AND a.attnum>0 AND NOT a.attisdropped),
    'triggers',(SELECT jsonb_agg(jsonb_build_object('relation',c.oid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY c.relnamespace::regnamespace::text,c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace IN ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace) AND NOT t.tgisinternal)
  )`],{env:environment})));
 await test('native pg_dump restores database schema data Auth and grants to a separate empty database',async()=>{
  const target=`zarix_restore_${run.replaceAll('-','')}`;
  const before=tableHashes(pgEnv),beforeCatalog=catalog(pgEnv),backup=backupPath;
  command('pg_dump',['--format=custom','--file',backup]);await fs.chmod(backup,0o600);
  assert.deepEqual(tableHashes(pgEnv),before,'Source changed during backup; retry from a quiet checkpoint');
  sql(`CREATE DATABASE "${target}" TEMPLATE template0`);
  assert.equal(Number(sql("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')",target)),0);
  command('pg_restore',['--exit-on-error','--dbname',target,backup]);
  const targetEnv={...pgEnv,PGDATABASE:target};
  assert.deepEqual(tableHashes(targetEnv),before);assert.deepEqual(catalog(targetEnv),beforeCatalog);
  assert.equal(Number(sql(`BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',${literal(userA)},true);SELECT count(*) FROM accounts;ROLLBACK`,target).split('\n').at(-1)),1);
  const denied=await new Promise(resolve=>{const child=spawn(bin('psql'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c','SET ROLE anon;SELECT * FROM public.accounts'],{env:{...pgEnv,PGDATABASE:target}});child.on('close',code=>resolve(code));child.stderr.resume();child.stdout.resume();});assert.notEqual(denied,0);
  const storageBackup=path.join(outputDir,'synthetic-storage-object.bin');await fs.writeFile(storageBackup,storageBytes,{mode:0o600});
  const bytes=await fs.readFile(backup);report.recovery={targetDatabase:target,format:'native pg_dump custom archive',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),catalogSha256:digest(JSON.stringify(beforeCatalog)),tables:before,storageObject:{bytes:storageBytes.length,sha256:digest(storageBytes)}};
  return {targetDatabase:target,verifiedTables:Object.keys(before).length,sha256:report.recovery.sha256,scope:'Fresh database in isolated source cluster; SQL/Auth/Storage metadata restored. Binary objects are backed up separately and require the independent-stack check below.'};
 });
 if(restoreTarget) await test('independent Supabase stack restores Auth login private Storage balances RPC and durable outbox',async()=>{
  const restoreAdmin=clientAt(restoreTarget.apiUrl,process.env.ZARIX_RESTORE_SERVICE_ROLE_KEY);
  const restoreSql=statement=>command('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',statement],{env:restoreEnv});
  assert.equal(Number(restoreSql("SELECT count(*) FROM pg_tables WHERE schemaname='public'")),0,'Refusing to replace any existing application schema in restore target');
  assert.equal(Number(restoreSql('SELECT count(*) FROM auth.users')),0,'Refusing restore into any existing Auth users');
  assert.equal(Number(restoreSql('SELECT count(*) FROM storage.objects')),0,'Refusing restore into any existing Storage objects');
  assert.equal(unwrap(await restoreAdmin.auth.admin.listUsers({page:1,perPage:1})).users.length,0,'Restore API and SQL target must both be disposable');
  const before=tableHashes(pgEnv),beforeCatalog=catalog(pgEnv);
  const roles=queryEnv=>JSON.parse(command('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',"SELECT jsonb_agg(jsonb_build_object('role',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','supabase_auth_admin','supabase_storage_admin')"],{env:queryEnv}));
  assert.deepEqual(roles(restoreEnv),roles(pgEnv),'Restore requires the equivalent pre-provisioned platform role profile');
  // An initialized Supabase target already has permissive default grants. An
  // archive ACL is not a reset of those inherited grants during CREATE. Clear
  // only destination defaults before replay; the dump reinstates source defaults
  // afterwards. All object/default ACLs and ownership are compared below.
  restoreSql(`DO $$ DECLARE d RECORD; g RECORD; object_kind TEXT; scope TEXT; BEGIN
   FOR d IN SELECT * FROM pg_default_acl LOOP
    object_kind:=CASE d.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'FUNCTIONS' WHEN 'T' THEN 'TYPES' WHEN 'n' THEN 'SCHEMAS' END;
    IF object_kind IS NULL THEN RAISE EXCEPTION 'Unsupported destination default privilege kind'; END IF;
    scope:=CASE WHEN d.defaclnamespace=0 THEN '' ELSE format(' IN SCHEMA %I',d.defaclnamespace::regnamespace::text) END;
    FOR g IN SELECT DISTINCT grantee FROM aclexplode(d.defaclacl) LOOP
     EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL ON %s FROM %s',d.defaclrole::regrole::text,scope,object_kind,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(g.grantee::regrole::text) END);
    END LOOP;
   END LOOP;
  END $$`);
  command('pg_restore',['--clean','--if-exists','--exit-on-error','--dbname',restoreEnv.PGDATABASE,backupPath],{env:restoreEnv});
  assert.deepEqual(tableHashes(restoreEnv),before);assert.deepEqual(catalog(restoreEnv),beforeCatalog);
  restoreSql("NOTIFY pgrst,'reload schema'");
  const restoredClients=[];
  for(let i=0;i<credentials.length;i++) {
   const client=clientAt(restoreTarget.apiUrl,process.env.ZARIX_RESTORE_ANON_KEY);
   assert.equal(unwrap(await client.auth.signInWithPassword(credentials[i])).user.id,users[i]);
   assert.equal(unwrap(await client.auth.getUser()).user.id,users[i]);restoredClients.push(client);
  }
  const [restoredA,restoredB]=restoredClients;
  assert.deepEqual(unwrap(await restoredA.from('accounts').select('id,balance')),unwrap(await a.from('accounts').select('id,balance')));
  assert.ok((await restoredA.from('accounts').select('id')).data.every(row=>row.id!==accountB));
  const restoredAnon=clientAt(restoreTarget.apiUrl,process.env.ZARIX_RESTORE_ANON_KEY);
  const restoredSaleArgs={p_user_id:userA,p_investment_id:JSON.parse(restoreSql(`SELECT jsonb_agg(id) FROM public.investments WHERE user_id=${literal(userA)}`))[0],p_quantity:1,p_price:25,p_currency:'USD',p_sold_at:'2026-10-08',p_realized_pnl_native:5,p_realized_pnl_usd:5,p_ars_per_usd:1200};
  for(const client of [restoredAnon,restoredA,restoredB]) {
   deny(await client.rpc('sell_investment_position',restoredSaleArgs));
   deny(await client.rpc('save_shared_expense',sharedArgs));
  }
  deny(await restoredA.from('users').select('gemini_api_key'));
  deny(await restoredAnon.from('accounts').select('id'));
  const fixture=await fs.readFile(path.join(outputDir,'synthetic-storage-object.bin'));
  unwrap(await restoreAdmin.storage.from(storageBucket).upload(storagePath,fixture,{upsert:true,contentType:'text/plain'}));
  const recovered=unwrap(await restoredA.storage.from(storageBucket).download(storagePath));
  assert.equal(digest(Buffer.from(await recovered.arrayBuffer())),report.recovery.storageObject.sha256);
  assert.ok((await restoredB.storage.from(storageBucket).download(storagePath)).error);
  assert.ok((await clientAt(restoreTarget.apiUrl,process.env.ZARIX_RESTORE_ANON_KEY).storage.from(storageBucket).download(storagePath)).error);
  const receipt=unwrap(await restoreAdmin.from('transaction_requests').select('request_hash,response').eq('user_id',userA).eq('request_id','native-retry-001').single());
  const request={user_id:userA,type:'expense',account_id:accountA,amount:12.34,currency:'ARS',amount_in_account_currency:12.34,description:'Reintento sintético'};
  const replay=unwrap(await restoreAdmin.rpc('create_transaction_once',{p_user_id:userA,p_request_id:'native-retry-001',p_request_hash:receipt.request_hash,p_transaction:request,p_installments:1}));
  assert.deepEqual(replay,receipt.response);
  assert.equal(unwrap(await restoredA.from('accounts').select('balance').eq('id',accountA).single()).balance,9987.66);
  assert.equal(Number(restoreSql(`SELECT count(*) FROM transactions WHERE user_id=${literal(userA)}`)),1);
  const outboxBefore=JSON.parse(restoreSql("SELECT jsonb_agg(jsonb_build_object('id',id,'delivered_at',delivered_at,'attempts',attempts)) FROM notification_outbox"));
  assert.equal(outboxBefore.length,1);assert.equal(outboxBefore[0].delivered_at,null);
  const claimed=unwrap(await restoreAdmin.rpc('claim_notification_outbox',{p_limit:20}));assert.equal(claimed.length,1);assert.equal(claimed[0].attempts,1);
  const expense=unwrap(await restoreAdmin.rpc('save_shared_expense',{...sharedArgs,p_amount:1.03}));
  assert.equal(expense.splits.reduce((sum,split)=>sum+Math.round(split.amount*100),0),103);
  assert.deepEqual(tableHashes(pgEnv,['public','storage']),Object.fromEntries(Object.entries(before).filter(([name])=>!name.startsWith('auth.'))),'Recovery target operations must not modify source application or Storage data');
  report.recovery.independentStack={data:true,schema:true,authLogin:true,storageBinary:true,rls:true,grants:true,backendRpcDenials:6,balances:true,rpc:true,durableReplay:true,outbox:true,roles:'equivalent pre-provisioned platform roles, password hashes never reported',storageObjects:1};
  return report.recovery.independentStack;
 });
 else results.push({name:'independent Supabase Auth/Storage recovery',status:'BLOCKED',reason:'Provide a second empty loopback stack using ZARIX_RESTORE_* settings. SQL restore alone does not verify Auth login or binary Storage recovery.'});
 await test('SQL source files remained unchanged throughout native verification',async()=>{
  const current=(await bootstrapSources()).map(({path,sha256})=>({path,sha256}));
  assert.deepEqual(current,report.manifest);
  assert.equal(createHash('sha256').update(await fs.readFile(harnessUrl)).digest('hex'),harnessSha256,'Native harness changed during execution');
 });
 if(loginFile) report.syntheticBrowserCredentials='Retained only in the explicitly requested private temporary file; values excluded from logs and evidence.';
 report.status=results.some(result=>result.status==='BLOCKED')?'PARTIAL':'PASS';report.passed=results.filter(result=>result.status==='PASS').length;
} catch(error) {await retainFailure(error);report.status='FAIL';report.error=safeNativeFailure(error,'native verification');process.exitCode=1;}
finally {await fs.writeFile(path.join(outputDir,recoveryOnly?'native-recovery-verification.json':'native-verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2));}
