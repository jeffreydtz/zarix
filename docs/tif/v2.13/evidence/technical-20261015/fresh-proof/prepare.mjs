// One new local-only fixture. Never reset, reuse or mutate the four prior stacks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const repo=path.resolve(process.env.ZARIX_REPLICA_REPO || process.cwd());
const requireRepo=createRequire(path.join(repo,'package.json'));
const { createClient }=requireRepo('@supabase/supabase-js');
const { bootstrapSources }=await import(pathToFileURL(path.join(repo,'scripts/lib/test-isolated-database.mjs')).href);
const { isolatedPgEnvironment }=await import(pathToFileURL(path.join(repo,'scripts/lib/test-isolated-native-target.mjs')).href);

assert.equal(process.env.ZARIX_PROOF_REPLICA_CONFIRM, 'new-empty-synthetic-replica');
process.umask(0o077);
const runtime = '/tmp/zarix-runtime-20261015';
const project = runtime + '/proof';
const work = runtime + '/proof-private';
const reportPath = work + '/preparation.json';
const api = 'http://127.0.0.1:58321';
const pgBin = runtime + '/home/cache/stack/slim-services/postgres/17.11.0.004-r1/darwin-arm64/bin';
const digest = value => createHash('sha256').update(value).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const report = { status: 'RUNNING', startedAt: new Date().toISOString(), results: [],
  scope: 'New fifth disposable native local stack only. Two existing synthetic Auth identities cloned without sessions; application finance empty. Administrative Free/Premium fixture only, no billing/provider acceptance.' };
let diagnostic = 0;
let sourceBefore, sourceAfter, ownWork=false;
const clients = [];
async function privateJson(file) {
  const stat = await fs.lstat(file); assert.ok(stat.isFile() && stat.nlink === 1); assert.equal(stat.mode & 0o077, 0);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function envFile(file) {
  const stat = await fs.lstat(file); assert.ok(stat.isFile()); assert.equal(stat.mode & 0o077, 0);
  return Object.fromEntries((await fs.readFile(file, 'utf8')).split('\n').filter(line => line && !line.startsWith('#')).map(line => { const index = line.indexOf('='); return [line.slice(0,index), JSON.parse(line.slice(index+1))]; }));
}
function command(binary, args, env, label) {
  const result = spawnSync(binary, args, { env, encoding: 'utf8', maxBuffer: 64*1024*1024 });
  if (result.status !== 0 || result.error) {
    const error = new Error('Private local command failed'); error.name = 'LocalPreparationError'; error.context = label;
    // No raw Auth values, connection URLs or database diagnostics enter public output.
    return { failed: true, result, error };
  }
  return { failed: false, result };
}
async function execute(binary, args, env, label) {
  const outcome = command(binary,args,env,label);
  if (outcome.failed) {
    await fs.writeFile(path.join(work,`diagnostic-${++diagnostic}.private.log`),outcome.result.stderr || outcome.result.error?.message || 'Command failed',{mode:0o600});
    throw outcome.error;
  }
  return outcome.result.stdout.trim();
}
function sql(query, env, writable=false) {
  const outcome = command(path.join(pgBin,'psql'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',`BEGIN ${writable?'':'READ ONLY'};SET LOCAL TIME ZONE 'UTC';${query};COMMIT;`],{...env,PGOPTIONS:`-c default_transaction_read_only=${writable?'off':'on'}`},'isolated SQL');
  if (outcome.failed) throw outcome.error;
  return outcome.result.stdout.trim();
}
const jsonSql = (query,env) => JSON.parse(sql(query,env));
function originalDigest(env) {
  const names=jsonSql("SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'",env);
  assert.equal(names.length,27); assert.ok(names.every(name=>/^[a-z_]+$/.test(name)));
  return jsonSql(`SELECT jsonb_build_object('public',(SELECT jsonb_build_object(${names.map(name=>`${literal(name)},(SELECT jsonb_build_object('rows',count(*),'hash',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')) FROM public.${name} t)`).join(',')})),'authUsers',(SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text,'UTF8')),'hex') FROM auth.users t),'authIdentities',(SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text,'UTF8')),'hex') FROM auth.identities t))`,env);
}
const nativeFetch = (input, init={}) => { const url=new URL(typeof input==='string'?input:input.url||input.href); assert.equal(url.origin,api); const headers=new Headers(init.headers);headers.set('Connection','close');return fetch(input,{...init,headers,redirect:'error'}); };
try {
  for(const item of [project,work,runtime+'/proof-start.json',runtime+'/proof.env',runtime+'/proof-logins.json']) assert.equal(await fs.access(item).then(()=>true,()=>false),false,'Never overwrite any existing fifth-replica project/state/credential/report');
  await fs.mkdir(project,{mode:0o700});await fs.mkdir(path.join(project,'supabase'),{mode:0o700});await fs.mkdir(work,{mode:0o700});ownWork=true;
  const projectId=randomUUID();
  const ttl=Number(process.env.ZARIX_PROOF_JWT_TTL_SECONDS || 3600);
  assert.ok(Number.isSafeInteger(ttl)&&ttl>=60&&ttl<=3600);
  const config=`project_id = ${JSON.stringify(projectId)}\n[api]\nenabled=true\nport=58321\nschemas=["public","graphql_public"]\nextra_search_path=["public","extensions"]\nmax_rows=1000\n[api.tls]\nenabled=false\n[db]\nport=58322\nmajor_version=17\n[db.seed]\nenabled=false\nsql_paths=[]\n[db.pooler]\nenabled=false\n[auth]\nenabled=true\nsite_url="http://127.0.0.1:3002"\nadditional_redirect_urls=["http://127.0.0.1:3002"]\njwt_expiry=${ttl}\nenable_signup=true\n[auth.email]\nenable_signup=true\nenable_confirmations=false\n[storage]\nenabled=true\n[experimental]\nstack=true\n`;
  await fs.writeFile(path.join(project,'supabase/config.toml'),config,{mode:0o600});
  const cliEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('SUPABASE_')));
  Object.assign(cliEnv,{SUPABASE_HOME:runtime+'/home',SUPABASE_EXPERIMENTAL_STACK:'1',SUPABASE_NO_UPDATE_NOTIFIER:'1'});
  const start=await execute(runtime+'/bin/supabase',['stack','start','--runtime','native','--exclude','studio,realtime,functions,analytics,pooler,mail','--eager','--workdir',project,'--output-format','json'],cliEnv,'official fifth-stack start');
  await fs.writeFile(runtime+'/proof-start.json',start+'\n',{mode:0o600,flag:'wx'});
  const started=JSON.parse(start); assert.equal(started.runtime,'native');assert.equal(started.env.API_URL,api);
  const database=new URL(started.env.DB_URL);assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'58322');assert.equal(database.pathname,'/postgres');assert.equal(database.search,'');
  const env={ZARIX_PROOF_SUPABASE_URL:api,ZARIX_PROOF_DATABASE_URL:started.env.DB_URL,ZARIX_PROOF_ANON_KEY:started.env.ANON_KEY,ZARIX_PROOF_SERVICE_ROLE_KEY:started.env.SERVICE_ROLE_KEY,ZARIX_PG_BIN:pgBin,SUPABASE_HOME:runtime+'/home',SUPABASE_EXPERIMENTAL_STACK:'1',SUPABASE_NO_UPDATE_NOTIFIER:'1'};
  await fs.writeFile(runtime+'/proof.env',Object.entries(env).map(([key,value])=>key+'='+JSON.stringify(value)+'\n').join(''),{mode:0o600,flag:'wx'});
  const targetEnv=isolatedPgEnvironment(database);
  assert.equal(sql("SELECT (SELECT count(*) FROM auth.users)||'|'||(SELECT count(*) FROM storage.objects)||'|'||(SELECT count(*) FROM pg_tables WHERE schemaname='public')",targetEnv),'0|0|0');
  report.results.push({name:'fifth platform initialized with Auth0/Storage0/public0',status:'PASS'});
  const sourceEnvFile=await envFile(runtime+'/source.env');const sourceUrl=new URL(sourceEnvFile.ZARIX_LOCAL_DATABASE_URL);
  assert.equal(sourceUrl.hostname,'127.0.0.1');assert.equal(sourceUrl.port,'54322');assert.equal(sourceUrl.pathname,'/postgres');
  const sourceEnv={...isolatedPgEnvironment(sourceUrl),PGOPTIONS:'-c default_transaction_read_only=on'};
  const logins=await privateJson(runtime+'/source-native-logins.json');assert.equal(logins.users.length,2);
  for(const user of logins.users){assert.match(user.id,/^[0-9a-f-]{36}$/i);assert.match(user.email,/^zarix-.+@example\.invalid$/);}
  const expectedIds=logins.users.map(user=>user.id).sort();
  assert.deepEqual(jsonSql('SELECT jsonb_agg(id::text ORDER BY id) FROM auth.users',sourceEnv),expectedIds);
  assert.equal(Number(sql('SELECT count(*) FROM auth.identities',sourceEnv)),2);
  sourceBefore=originalDigest(sourceEnv);
  const files=await bootstrapSources();report.sqlSources=files.map(({path,sha256})=>({path,sha256}));
  const bootstrap=path.join(work,'bootstrap.private.sql');await fs.writeFile(bootstrap,files.map(file=>`-- ${file.path} SHA256 ${file.sha256}\n${file.sql}`).join('\n\n'),{mode:0o600});
  await execute(path.join(pgBin,'psql'),['-X','-q','-v','ON_ERROR_STOP=1','-c','SET search_path=public,extensions','-f',bootstrap],targetEnv,'bootstrap only the empty fifth stack');
  const archive=path.join(work,'two-auth-identities.private.dump');
  await execute(path.join(pgBin,'pg_dump'),['-Fc','--data-only','--no-owner','--no-acl','--table=auth.users','--table=auth.identities','--file',archive],sourceEnv,'read-only dump of two synthetic Auth identities');
  await fs.chmod(archive,0o600);
  await execute(path.join(pgBin,'pg_restore'),['--data-only','--no-owner','--no-acl','--single-transaction','--dbname=postgres',archive],targetEnv,'clone only Auth users and identities into fresh fifth platform');
  assert.deepEqual(jsonSql('SELECT jsonb_agg(id::text ORDER BY id) FROM auth.users',targetEnv),expectedIds);
  assert.equal(Number(sql('SELECT count(*) FROM auth.sessions',targetEnv)),0);assert.equal(Number(sql('SELECT count(*) FROM auth.refresh_tokens',targetEnv)),0);
  assert.equal(Number(sql('SELECT count(*) FROM public.users',targetEnv)),2);
  sql(`UPDATE public.users SET status='CANCELED',current_period_end=NULL,grace_period_end=NULL,mp_preapproval_id=NULL WHERE id=${literal(logins.users[0].id)};UPDATE public.users SET status='ACTIVE',current_period_end=now()+interval '30 days',grace_period_end=NULL,mp_preapproval_id=NULL WHERE id=${literal(logins.users[1].id)};NOTIFY pgrst,'reload schema'`,targetEnv,true);
  const rowCounts=jsonSql("SELECT jsonb_object_agg(t.tablename,(xpath('/row/n/text()',query_to_xml(format('SELECT count(*) AS n FROM public.%I',t.tablename),false,true,'')))[1]::text::int) FROM pg_tables t WHERE t.schemaname='public'",targetEnv);
  const finance=['accounts','transactions','investments','investment_sales','recurring_rules','budgets','shared_groups','shared_group_members','shared_expenses','shared_expense_splits','net_worth_snapshots','portfolio_performance_snapshots'];
  for(const table of finance)assert.equal(rowCounts[table],0);
  const catalog=jsonSql("SELECT jsonb_build_object('tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'rlsTables',(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity),'ordinaryRoles',(SELECT jsonb_agg(jsonb_build_object('role',rolname,'superuser',rolsuper,'bypassRls',rolbypassrls)) FROM pg_roles WHERE rolname IN ('anon','authenticated')),'backendRpcs',(SELECT jsonb_agg(jsonb_build_object('name',proname,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'serviceRole',has_function_privilege('service_role',p.oid,'EXECUTE'))) FROM pg_proc p WHERE pronamespace='public'::regnamespace AND proname IN ('save_shared_expense','sell_investment_position','recompute_account_balance')))",targetEnv);
  assert.equal(catalog.tables,27);assert.equal(catalog.rlsTables,27);assert.ok(catalog.ordinaryRoles.every(role=>!role.superuser&&!role.bypassRls));assert.ok(catalog.backendRpcs.length>=3&&catalog.backendRpcs.every(rpc=>!rpc.anon&&!rpc.authenticated&&rpc.serviceRole));
  report.results.push({name:'baseline and migrations only in fresh target; Auth clone has no source sessions',status:'PASS',applicationTables:27,financeTablesVerifiedEmpty:finance,rowCounts,catalog});
  report.auth=[];
  for(const [index,user] of logins.users.entries()){
    const client=createClient(api,env.ZARIX_PROOF_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:nativeFetch}});clients.push(client);
    const login=await client.auth.signInWithPassword({email:user.email,password:user.password});assert.equal(login.error,null);assert.equal(login.data.user.id,user.id);
    const checked=await client.auth.getUser();assert.equal(checked.error,null);assert.equal(checked.data.user.id,user.id);
    const accounts=await client.from('accounts').select('id');assert.equal(accounts.error,null);assert.deepEqual(accounts.data,[]);
    const claims=JSON.parse(Buffer.from(login.data.session.access_token.split('.')[1],'base64url').toString());
    report.auth.push({identity:index===0?'A':'B',id:user.id,normalPasswordLogin:true,normalGetUser:true,visibleAccounts:0,jwtIssuedAt:claims.iat,jwtExpiresAt:claims.exp,jwtLifetimeSeconds:claims.exp-claims.iat,tokenPublished:false});
  }
  sourceAfter=originalDigest(sourceEnv);assert.deepEqual(sourceAfter,sourceBefore,'Original SOURCE changed during strictly read-only clone operation');
  const current=(await bootstrapSources()).map(({path,sha256})=>({path,sha256}));assert.deepEqual(current,report.sqlSources);
  await fs.writeFile(runtime+'/proof-logins.json',JSON.stringify({purpose:'fifth-isolated-acceptance-replica',users:logins.users,plans:{[logins.users[0].id]:'free',[logins.users[1].id]:'premium'},source:'Existing synthetic identities cloned as Auth.users+identities only; no source session reused'},null,2)+'\n',{mode:0o600,flag:'wx'});
  report.target={projectId,stackId:started.id,runtime:'native',project,apiOrigin:api,postgresEndpoint:'127.0.0.1:58322/postgres',jwtExpiryConfiguration:ttl,privateEnv:runtime+'/proof.env',privateLogins:runtime+'/proof-logins.json',privateArchiveSha256:digest(await fs.readFile(archive)),configSha256:digest(config),localSessionCleanup:'Own temporary sessions sign out locally in finally'};
  report.originalPreservation={sourceConnectionReadOnly:true,all27PublicTablesPlusAuthUsersIdentitiesBefore:sourceBefore,after:sourceAfter,exactMatch:true,otherPriorStacksConnected:false};
  report.planFixture={A:'Free: CANCELED without paid period',B:'Premium: ACTIVE for30days',authority:'Administrative setup only in fifth replica; no MercadoPago operation or entitlement-provider acceptance'};
  report.cleanupPlan={operation:'Official CLI2.120 stack stop only after parent releases fifth fixture and retains private dump',workdir:project,stackId:started.id,destructiveCommands:false,scope:'Preserve native data/config/identity; no stop executed now; internal REST wildcard limitation applies to native runtime'};
  report.status='PASS_PREPARED';
}catch(error){report.status='FAIL';report.failure={type:error.name,context:error.context||'Guard or isolated initialization assertion',rawDetailsPublished:false};}
finally{
  report.cleanup=[];for(const client of clients){try{const r=await client.auth.signOut({scope:'local'});report.cleanup.push({ownLocalSession:true,status:r.error?'FAIL':'PASS'});}catch{report.cleanup.push({ownLocalSession:true,status:'FAIL'});}}
  if(report.cleanup.some(r=>r.status==='FAIL'))report.status='FAIL';report.finishedAt=new Date().toISOString();
  if(ownWork)await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({status:report.status,report:reportPath,apiOrigin:api,postgresEndpoint:'127.0.0.1:58322/postgres',privateEnv:runtime+'/proof.env',privateLogins:runtime+'/proof-logins.json',failure:report.failure}));
  if(report.status==='FAIL')process.exitCode=1;
}
