// Prepared contract runner. --check parses only; all I/O is behind the explicit window guard.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createServerClient } from '@supabase/ssr';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch } from '../../../../../../scripts/lib/test-isolated-native-target.mjs';
import { contracts } from './scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const runtime = '/tmp/zarix-runtime-20261015';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const lit = value => `'${String(value).replaceAll("'", "''")}'`;
class Blocked extends Error {}
const report = { status: 'PREPARED', startedAt: new Date().toISOString(), scope: 'One selected original investment contract or separately labeled derived concurrency probe. Existing normal AuthB is logicalU1Premium; A is logicalU2. Fresh authorized58321replica only; no original plans/identities modified.', results: [], requests: [], fixtures: [], executionCount: 0 };
let ctx, selected, output, protectedRows, sourceManifest;
const protectedTables = ['users', 'accounts', 'transactions', 'investments', 'investment_sales', 'categories', 'budgets', 'recurring_rules', 'shared_groups', 'shared_group_members', 'shared_expenses', 'shared_expense_splits'];
let saveChain=Promise.resolve();
async function save(){if(!output)return;const content=JSON.stringify(report,null,2)+'\n';saveChain=saveChain.then(()=>fs.writeFile(path.join(output,'verification.json'),content,{mode:0o600}));await saveChain;}
const block = reason => { throw new Blocked(reason); };
async function manifest() {
  const files = ['docs/tif/v2.13/casos_prueba.csv', ...['run.mjs','scenarios.mjs','faults-and-concurrency.mjs','plan-transition.mjs','plan.json'].map(name => path.relative(root,path.join(here,name))), 'scripts/lib/test-isolated-native-target.mjs', 'app/api/accounts/route.ts', 'app/api/accounts/[id]/route.ts', 'app/api/accounts/[id]/adjust-secondary-balance/route.ts', 'app/api/transactions/route.ts', 'app/api/transactions/[id]/route.ts', 'app/api/import/transactions/route.ts', 'app/api/export/transactions/route.ts', 'app/api/investments/portfolio/route.ts', 'app/api/ai/anomalies/route.ts', 'app/api/ai/projections/route.ts', 'app/(authenticated)/dashboard/page.tsx', 'lib/services/accounts.ts', 'lib/services/cotizaciones.ts', 'lib/services/transactions.ts', 'lib/financial-anomalies.ts', 'lib/financial-projections.ts','app/api/accounts/movement-selection/route.ts','app/api/user/subscription/route.ts','lib/plans/rules.ts','lib/plans/service.ts','lib/services/subscriptions.ts','app/api/investments/route.ts','types/database.ts','components/investments/InvestmentsList.tsx','lib/services/investments.ts','app/api/investments/[id]/route.ts','app/api/investments/[id]/sell/route.ts','supabase/migrations/20260702120000_atomic_investment_sell.sql','supabase/migrations/20261009035715_durable_sales_shared_expenses.sql','supabase/schema.sql','supabase/migrations/20261009034943_enforce_plan_allowances.sql','supabase/migrations/20261015000402_atomic_account_balance_recompute.sql'];
  return Promise.all(files.map(async file => ({ path: file, sha256: digest(await fs.readFile(path.join(root,file))) })));
}

// Do not import focal-contracts/run.mjs: that file executes at module top level.
// The small SQL/cookie/checkpoint primitives below follow its already reviewed contract.
async function initialize() {
  assert.equal(process.env.ZARIX_INVESTMENT_WINDOW, 'after-ci4-and-finance', 'Wait for the parent to release the serial E2E window');
  assert.equal(process.env.ZARIX_ISOLATED_DATABASE_CONFIRM, 'synthetic-only');
  const at = process.argv.indexOf('--case');
  assert.ok(at >= 0 && process.argv[at + 1], 'Select exactly one --case; no implicit full suite');
  selected = process.argv[at + 1];
  const plan = JSON.parse(await fs.readFile(path.join(here,'plan.json'),'utf8'));
  const contract = [...plan.cases,...(plan.derived_probes||[])].find(row => row.case_id === selected);
  assert.ok(contract, 'Case is outside the prepared9contracts');
  report.case = { case_id: selected, status: 'BLOCKED', complete_original_contract: false, assertions: [], original_contract: contract.original_contract };
  report.results = [report.case];
  const planTransition=selected==='DERIVED-PLAN-DOWNGRADE';if(planTransition)report.scope='Derived sixth local cloned-B Premium→Free lifecycle only, ordinary Auth APIs plus explicitly authorized fixture plan expiry; intended B plan/updated_at delta, no MercadoPago/provider claim or original CSV promotion';
  const apiOnly=process.argv.includes('--api-only');report.pendingScopes=[];report.executionMode=apiOnly?'api-sql-only':'ui-required';
  const run = randomUUID(); report.run = run;
  output = path.resolve(process.env.ZARIX_INVESTMENT_OUTPUT || path.join(runtime,`investment-contracts-${run}`));
  assert.ok(output.startsWith(runtime + '/investment-contracts-'));
  await fs.mkdir(output,{recursive:false,mode:0o700});
  await save();
  
  const configFile = path.resolve(process.env.ZARIX_INVESTMENT_CONFIG || path.join(runtime,planTransition?'import-target.env':'account-analysis-proof.env'));
  const loginFile = path.resolve(process.env.ZARIX_INVESTMENT_LOGINS || path.join(runtime,planTransition?'import-target-logins.json':'proof-logins.json'));
  for (const f of [configFile,loginFile]) {
    assert.ok(f.startsWith(runtime + '/'),'Use only pre-existing private local fixture files');
    assert.equal((await fs.stat(f)).mode & 0o077,0,'Private fixture must be0600');
  }
  const actualConfig=dotenv.parse(await fs.readFile(configFile));const config=planTransition?{...actualConfig,ZARIX_E2E_SUPABASE_URL:actualConfig.ZARIX_IMPORT_SUPABASE_URL,ZARIX_E2E_DATABASE_URL:actualConfig.ZARIX_IMPORT_DATABASE_URL,ZARIX_E2E_ANON_KEY:actualConfig.ZARIX_IMPORT_ANON_KEY,ZARIX_PG_BIN:actualConfig.ZARIX_IMPORT_PG_BIN}:actualConfig;
  const { apiUrl,databaseUrl } = isolatedNativeTargets({ZARIX_ISOLATED_DATABASE_CONFIRM:'synthetic-only',ZARIX_LOCAL_SUPABASE_URL:config.ZARIX_E2E_SUPABASE_URL,ZARIX_LOCAL_DATABASE_URL:config.ZARIX_E2E_DATABASE_URL});
  assert.ok([planTransition?'59321:59322':'58321:58322'].includes(`${apiUrl.port}:${databaseUrl.port}`),'Only released E2E or separately provisioned investment replica; never SOURCE/RESTORE/LOAD');
  assert.equal(apiUrl.hostname,'127.0.0.1'); assert.equal(databaseUrl.hostname,'127.0.0.1');
  const appUrl = new URL(process.env.ZARIX_INVESTMENT_APP_URL || (planTransition?'http://127.0.0.1:3003':'http://127.0.0.1:3002'));
  assert.equal(appUrl.protocol,'http:'); assert.equal(appUrl.hostname,'127.0.0.1');
  assert.ok((planTransition?['3003']:['3000','3002']).includes(appUrl.port)); assert.equal(appUrl.pathname,'/');
  assert.ok(!appUrl.username && !appUrl.password && !appUrl.search && !appUrl.hash);
  databaseUrl.username = 'supabase_admin';
  const pgEnv = isolatedPgEnvironment(databaseUrl), psql = path.join(config.ZARIX_PG_BIN,'psql');
  function sql(statement) {
    const child = spawnSync(psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',statement],{env:{...pgEnv,PGOPTIONS:'-c statement_timeout=17000 -c lock_timeout=3000'},encoding:'utf8',maxBuffer:8*1024*1024});
    assert.equal(child.status,0,'Native SQL failed; raw SQL diagnostics withheld'); return child.stdout.trim();
  }
  const rows = statement => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (${statement})t`));
  const users = [];
  const logins = JSON.parse(await fs.readFile(loginFile,'utf8'));
  assert.equal(logins.purpose,planTransition?'sixth-isolated-acceptance-replica':'fifth-isolated-acceptance-replica');assert.equal(logins.users.length,2);const nativePrepFile=path.join(runtime,planTransition?'import-target-private/preparation.json':'proof-private/preparation.json');const nativePrep=JSON.parse(await fs.readFile(nativePrepFile,'utf8'));assert.equal(nativePrep.status,'PASS_PREPARED');assert.equal(nativePrep.target.apiOrigin,apiUrl.origin);assert.deepEqual(logins.users.map(x=>x.id),nativePrep.auth.map(x=>x.id));assert.ok(nativePrep.auth.every(x=>x.normalPasswordLogin===true&&x.normalGetUser===true));report.nativePreparation={sha256:digest(await fs.readFile(nativePrepFile)),projectId:nativePrep.target.projectId,normalAuthIdsBound:true};
  for (const credential of logins.users) {
    assert.match(credential.email,/^zarix-.+@example\.invalid$/i);
    const jar = new Map();
    const client = createServerClient(apiUrl.href,config.ZARIX_E2E_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>{for(const {name,value} of items)jar.set(name,value);}},global:{fetch:isolatedApiFetch}});
    const signed = await client.auth.signInWithPassword({email:credential.email,password:credential.password});
    assert.equal(signed.error,null,'Existing normal password Auth required');
    assert.equal((await client.auth.getUser()).data.user?.id,credential.id);
    assert.equal(sql(`SELECT email FROM auth.users WHERE id=${lit(credential.id)}`),credential.email);
    users.push({id:credential.id,client,jar,credential});
  }
  const stateFile = path.resolve(process.env.ZARIX_INVESTMENT_APP_STATE || path.join(runtime,planTransition?'import-target-app-state.json':'proof-app-state.json'));
  assert.ok(stateFile.startsWith(runtime+'/'));
  const appState = JSON.parse(await fs.readFile(stateFile,'utf8'));
  users.reverse(); // Existing BPremium is logicalU1; AFree is logicalU2, explicitly reported.
  assert.equal(Number(sql(`SELECT public.plan_account_limit(${lit(users[0].id)})`)),20,'LogicalU1 must already have documented Premium; no plan mutation');
  // Consume the actual native preparation; do not rewrite fixture purposes or invent a wrapper.
  const targetFile=path.resolve(process.env.ZARIX_INVESTMENT_TARGET_MANIFEST||nativePrepFile);assert.equal(targetFile,nativePrepFile);
  const nativeTarget=nativePrep.target;assert.match(nativeTarget.projectId,/^[0-9a-f-]{36}$/i);assert.match(nativeTarget.stackId,/^[0-9a-f]{64}$/);
  const project=await fs.realpath(path.join(runtime,planTransition?'import-target':'proof'));assert.equal(await fs.realpath(nativeTarget.project),project);
  assert.equal(digest(await fs.readFile(path.join(project,'supabase/config.toml'))),nativeTarget.configSha256);
  const stackRoot=path.join(runtime,'home/stacks',nativeTarget.stackId),stackState=JSON.parse(await fs.readFile(path.join(stackRoot,'state.json'),'utf8'));
  assert.equal(await fs.realpath(stackState.identity.projectRoot),project);
  const databaseInstance=stackState.instances.find(x=>x.creation.service==='database');assert.ok(databaseInstance);assert.match(databaseInstance.id,/^[0-9a-f-]{36}$/i);
  const expectedDataDirectory=await fs.realpath(path.join(stackRoot,'data',databaseInstance.id,'data'));
  assert.equal(await fs.realpath(sql('SHOW data_directory')),expectedDataDirectory,'Effective PostgreSQL directory must be the exact native fifth project instance');
  assert.equal(sql('SELECT current_database()'),databaseUrl.pathname.slice(1));
  const targetManifest={purpose:'isolated-account-analysis-replica',syntheticOnly:true,projectId:nativeTarget.projectId,apiOrigin:apiUrl.origin,databasePort:databaseUrl.port,databaseName:databaseUrl.pathname.slice(1),dataDirectorySha256:digest(expectedDataDirectory),postgresLogPath:path.join(stackRoot,'logs/database',databaseInstance.id,String(databaseInstance.launchId).padStart(10,'0')+'.log')};
  // This normalized in-memory target records validations; no private metadata file is changed.
  const buildFile=path.resolve(process.env.ZARIX_INVESTMENT_BUILD_PROOF||path.join(runtime,planTransition?'import-target-build-proof.json':'proof-build-proof.json'));assert.ok(buildFile.startsWith(runtime+'/'));
  const completedBuild=JSON.parse(await fs.readFile(buildFile,'utf8'));assert.equal(completedBuild.exitCode,0);assert.ok(completedBuild.startedAt&&completedBuild.finishedAt&&completedBuild.sources?.length);
  assert.equal(completedBuild.buildId,appState.buildId);assert.equal(completedBuild.copyRoot,appState.copyRoot);assert.equal(completedBuild.revision,appState.revision);assert.equal(completedBuild.publicSupabaseOrigin,apiUrl.origin);assert.equal(completedBuild.sourceManifestSha256,appState.sourceManifestSha256);assert.equal(completedBuild.sourceCount,completedBuild.sources.length);
  const buildDirectory=path.resolve(completedBuild.copyRoot);assert.equal(buildDirectory,planTransition?'/tmp/zarix-app-import-target-20261015':'/tmp/zarix-app-account-analysis-20261015');
  const actualBuildId=await fs.readFile(path.join(buildDirectory,'.next/BUILD_ID'));assert.equal(actualBuildId.toString().trim(),appState.buildId);
  const listening=spawnSync('/usr/sbin/lsof',['-nP',`-tiTCP:${appUrl.port}`,'-sTCP:LISTEN'],{encoding:'utf8'});assert.equal(listening.status,0);assert.deepEqual([...new Set(listening.stdout.trim().split(/\s+/).map(Number))],[appState.nextPid]);
  assert.equal(digest(JSON.stringify(completedBuild.sources)),completedBuild.sourceManifestSha256);const unbuiltCurrentDeltas=[];for(const file of completedBuild.sources){assert.ok(!path.isAbsolute(file.path)&&!file.path.split('/').includes('..'));assert.equal(digest(await fs.readFile(path.join(buildDirectory,file.path))),file.sha256,'Physical copied source must match completed frozen build');if(!/^(?:app|lib|components|supabase|types)\//.test(file.path))continue;const current=digest(await fs.readFile(path.join(root,file.path)));if(current!==file.sha256){const frozen=spawnSync('git',['show',`${completedBuild.revision}:${file.path}`],{cwd:root,env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},maxBuffer:8*1024*1024});assert.equal(frozen.status,0);assert.equal(digest(frozen.stdout),file.sha256);unbuiltCurrentDeltas.push({path:file.path,servedSha256:file.sha256,currentSha256:current,servedMatchesFrozenGit:true});}}report.unbuiltCurrentDeltas=unbuiltCurrentDeltas;
  const buildProof={...completedBuild,sourceManifest:completedBuild.sources,buildDirectory,buildCompletedAt:completedBuild.finishedAt,buildIdSha256:digest(actualBuildId),nextPid:appState.nextPid,appOrigin:appUrl.origin,apiOrigin:apiUrl.origin,sourceStable:true};
  report.targetBinding={projectId:targetManifest.projectId,stackId:nativeTarget.stackId,apiOrigin:apiUrl.origin,databasePort:databaseUrl.port,targetManifestSha256:digest(await fs.readFile(targetFile)),nativeStateSha256:digest(await fs.readFile(path.join(stackRoot,'state.json'))),dataDirectorySha256:targetManifest.dataDirectorySha256,buildProofSha256:digest(await fs.readFile(buildFile)),buildIdSha256:digest(actualBuildId),listenerPidVerified:true,realNativeMetadata:true};
  assert.equal(appState.appOrigin,appUrl.origin);assert.equal(appState.apiOrigin,apiUrl.origin);
  report.buildBinding = {appOrigin:appUrl.origin,apiOrigin:apiUrl.origin,buildId:appState.buildId,nextPid:appState.nextPid};
  sourceManifest=await manifest();report.workingSourceManifest=sourceManifest;const boundSources=new Map(buildProof.sourceManifest.map(x=>[x.path,x.sha256]));report.sourceManifest=sourceManifest.map(file=>{if(!/^(?:app|lib|components|supabase|types)\//.test(file.path))return file;assert.ok(boundSources.has(file.path),'Every responsible served source must be present in frozen build proof');return{path:file.path,sha256:boundSources.get(file.path),scope:'served frozen build; working-tree deltas are separately disclosed'};});
  report.versions = {node:process.version,postgres:sql('SHOW server_version')};
  report.users = users.map((u,index)=>({id:u.id,label:index?'sourceA/logicalU2':'sourceB/logicalU1',normalAuth:true}));
  const own = {accounts:[],positions:[],categories:[]};
  function check(name,actual,expected) {
    const item = {name,actual,expected,status:'RUNNING'};report.case.assertions.push(item);
    try{assert.deepEqual(actual,expected);item.status='PASS';}catch(e){item.status='FAIL';throw e;}
  }
  function near(name,actual,expected,epsilon=1e-8){const item={name,actual:Number.isFinite(Number(actual))&&Math.abs(Number(actual)-expected)<=epsilon,expected:true,numericActual:actual,numericExpected:expected,tolerance:epsilon,status:'RUNNING'};report.case.assertions.push(item);try{assert.equal(item.actual,true);item.status='PASS';}catch(e){item.status='FAIL';throw e;}}
  async function ensureAuth(user){const session=await user.client.auth.getSession();assert.equal(session.error,null);if(!session.data.session||Number(session.data.session.expires_at)*1000-Date.now()<10000){if(!user.refreshPromise)user.refreshPromise=(async()=>{const r=await user.client.auth.refreshSession();assert.equal(r.error,null,'Normal SDK refresh required near60s expiry');assert.equal(r.data.user?.id,user.id);report.normalAuthRefreshes=(report.normalAuthRefreshes||0)+1;})().finally(()=>{user.refreshPromise=null;});await user.refreshPromise;}}
  async function request(method,endpoint,payload,{user=users[0],key=randomUUID(),raw=false,onDispatch,onResponseHeaders}={}) {
    assert.ok(endpoint.startsWith('/api/')&&!endpoint.includes('://'));
    const url=new URL(endpoint,appUrl);assert.equal(url.origin,appUrl.origin);
    const item={caseId:selected,method,path:url.pathname,requestId:key,httpAttemptId:randomUUID(),startedAt:new Date().toISOString()};report.requests.push(item);await save();
    if(user)await ensureAuth(user);
    const headers={'Idempotency-Key':key};if(user)headers.Cookie=[...user.jar].map(([k,v])=>`${k}=${v}`).join('; ');
    let body;
    if(payload instanceof FormData)body=payload;
    else if(payload!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(payload);}
    report.executionCount=1;item.dispatchedAt=new Date().toISOString();onDispatch?.({...item});const r=await fetch(url,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(17000)});item.responseHeadersAt=new Date().toISOString();onResponseHeaders?.({...item,status:r.status});
    const text=await r.text();Object.assign(item,{status:r.status,responseSha256:digest(text),endedAt:new Date().toISOString()});await save();
    return {status:r.status,body:raw?text:(text?JSON.parse(text):null),headers:r.headers,requestId:key};
  }
  const activeCount = user => Number(sql(`SELECT count(*) FROM accounts WHERE user_id=${lit(user.id)} AND is_active`));
  function slots(user,count){const s=rows(`SELECT public.plan_account_limit(id) AS cap,(SELECT count(*) FROM accounts a WHERE a.user_id=u.id AND a.is_active AND a.movement_enabled) AS used FROM users u WHERE id=${lit(user.id)}`)[0];if(Number(s.cap)-Number(s.used)<count)block(`Exact fixture needs${count}existing allowed account slots; original plans/selections/accounts will not be altered.`);}
  function empty(user,{literal=false}={}) {
    const suffix=literal?'':' AND is_active';
    if(Number(sql(`SELECT count(*) FROM accounts WHERE user_id=${lit(user.id)}${suffix}`))!==0)block(literal?'Literal zero-account precondition missing; provision a separate empty replica without deleting/archiving originals.':'Existing active wealth would contaminate the exact owner aggregate; separate empty replica required.');
    if(literal && Number(sql(`SELECT count(*) FROM transactions WHERE user_id=${lit(user.id)}`)))block('Literal empty transaction history precondition missing.');
    if(Number(sql(`SELECT count(*) FROM investments WHERE user_id=${lit(user.id)}${suffix}`)))block('Exact empty active portfolio precondition missing.');
  }
  async function account(initialBalance=0,extra={},user=users[0]) {
    slots(user,1);const name=`AccountAnalysis ${selected} ${own.accounts.length+1} ${run}`;
    const result=await request('POST','/api/accounts',{name,type:'bank',currency:'ARS',initialBalance,...extra},{user});
    if(result.status===201){const row=rows(`SELECT id,user_id FROM accounts WHERE id=${lit(result.body.id)}`)[0];assert.equal(row.user_id,user.id);own.accounts.push({id:row.id,userId:user.id,user});report.fixtures.push({kind:'account',id:row.id,userId:user.id,caseId:selected});}
    check('Fixture account API201',result.status,201);return result.body;
  }
  async function tx(accountId,amount,type='expense',extra={},user=users[0]) {
    assert.ok(own.accounts.some(a=>a.id===accountId&&a.userId===user.id));
    const r=await request('POST','/api/transactions',{type,accountId,amount,currency:'ARS',description:`AccountAnalysis ${selected} ${run}`,transactionDate:'2026-10-06T12:00:00Z',...extra},{user});
    check('Fixture transaction API201',r.status,201);return r.body;
  }
  async function category(user=users[0]) {
    const id=randomUUID();const result=await user.client.from('categories').insert({id,user_id:user.id,name:`Alimentos ${run}`,type:'expense',icon:'🍽️'});
    assert.equal(result.error,null,'Normal Auth own category insertion failed');own.categories.push({id,userId:user.id});return id;
  }
  async function position(accountId,quantity=6,currentPrice=110) {
    assert.ok(own.accounts.some(a=>a.id===accountId&&a.userId===users[0].id));
    const r=await request('POST','/api/investments',{accountId,type:'stock_us',name:`AccountAnalysis ${selected} ${run}`,quantity,purchasePrice:100,purchaseCurrency:'USD',purchaseDate:'2026-10-01',isManualPrice:true,currentPrice,marketCurrency:'USD'});
    check('Fixture manual position API201',r.status,201);own.positions.push({id:r.body.id,user:users[0]});return r.body;
  }
  async function clock(fixedTime) {
    const file=process.env.ZARIX_INVESTMENT_CLOCK_PROOF;if(!file)block('Exact original server clock requires an independently recorded isolated-process proof; no global clock override is applied by this runner.');
    assert.ok(path.resolve(file).startsWith(runtime+'/'));
    const proof=JSON.parse(await fs.readFile(file,'utf8'));
    assert.equal(proof.fixedTime,fixedTime);assert.equal(proof.buildId,appState.buildId);assert.equal(proof.nextPid,appState.nextPid);assert.equal(proof.sourceStable,true);
    assert.ok(proof.command&&proof.preloadSha256,'Clock proof must bind the actual launched process/preload, not merely an environment flag');
    report.clockProof={path:path.relative(runtime,file),sha256:digest(await fs.readFile(file)),fixedTime};
  }
  function rate(expected){const observed=rows("SELECT rate FROM exchange_rates WHERE source='blue' AND from_currency='USD' AND to_currency='ARS' ORDER BY timestamp DESC LIMIT1".replace('LIMIT1','LIMIT 1'))[0];if(Number(observed?.rate)!==expected)block('Exact FX fixture not available; quote rows are shared originals and are never rewritten by this runner.');}
  function missingUi(name='Actual investment UI acceptance'){if(!report.pendingScopes.some(x=>x.name===name))report.pendingScopes.push({name,status:'BLOCKED',reason:'Automation Codex→Arc is granted (native preflight0). Current native private-window attempt failed -1728 resolving its returned reference; own-close is unconfirmed. Await the human main-chat answer before any new window or closing unidentified windows. LittleArc prepared only; AX/ScreenCapture/JavaScript setting are not enabled. No UI launch or fallback occurs in this runner.'});}
  async function ui(){if(!apiOnly)block('Current Arc -1728 owned-window reference/close remains unresolved; await human cleanup answer before new UI. --api-only executes independent API/SQL and records UI separately.');missingUi();return null;}
  async function hero(ars,usd){const p=await ui();if(!p)return null;await p.goto(new URL('/dashboard',appUrl).href);const section=p.locator('section').filter({has:p.getByRole('heading',{name:'Patrimonio total',exact:true})});await section.waitFor();for(const [i,v]of[[0,ars],[1,usd]])await section.locator('data').nth(i).evaluate((n,e)=>new Promise((resolve,reject)=>{const start=performance.now();function step(){const value=Number(n.getAttribute('value'));if(Number.isFinite(value)&&Math.abs(value-e)<1e-6)return resolve();if(performance.now()-start>20000)return reject(new Error('Wealth value mismatch'));requestAnimationFrame(step);}step();}),v);check('Actual dashboard wealth ARS/USD',[Number(await section.locator('data').nth(0).getAttribute('value')),Number(await section.locator('data').nth(1).getAttribute('value'))],[ars,usd]);return section;}
  ctx={run,users,pgEnv,psql,ensureAuth,targetManifest,buildProof,checkpoint:save,extraCleanup:[],a:users[0],b:users[1],own,sql,rows,check,near,request,account,tx,category,position,slots,empty,rate,clock,ui,hero,block,lit,digest,report,output,activeCount,appUrl,apiUrl,apiOnly,missingUi,async close(){for(const u of users)await u.client.auth.signOut({scope:'local'});}};
  protectedRows=protectedTables.map(table=>{const old=rows(`SELECT id FROM public.${table} ORDER BY id`).map(r=>r.id);const ids=old.length?old.map(lit).join(','):'NULL';return {table,ids:old,count:old.length,sha:sql(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) FROM public.${table} t WHERE t.id IN(${ids})`)};});
  if(planTransition){const ids=protectedRows.find(x=>x.table==='users').ids;report.intendedMutationPolicy={case:selected,targetApi:apiUrl.origin,targetUserId:users[0].id,allowedFields:['status','current_period_end','grace_period_end','updated_at'],scope:'Local sixth cloned B fixture only; all other user/profile/Auth fields and original rows must remain intact; final Free is intended'};ctx.planUserNormalizedBefore=sql(`SELECT md5(COALESCE(jsonb_agg(CASE WHEN t.id=${lit(users[0].id)} THEN to_jsonb(t)-ARRAY['status','current_period_end','grace_period_end','updated_at'] ELSE to_jsonb(t) END ORDER BY t.id)::text,'[]')) FROM users t WHERE t.id IN(${ids.map(lit).join(',')})`);}
  await save();return ctx;
}

try {
  const context=await initialize();
  report.status='RUNNING';report.case.status='RUNNING';report.case.startedAt=new Date().toISOString();await save();
  const test=contracts[selected];if(!test)block('Exact execution adapter is unavailable for this phase; use the supplied literal UI/precondition recipe, not a neighboring API assertion.');
  await test(context);report.case.status=report.pendingScopes.length?(report.case.assertions.length?'PARTIAL':'BLOCKED'):'PASS';report.case.complete_original_contract=report.case.status==='PASS'&&!selected.startsWith('DERIVED-');report.case.apiSqlScope={status:report.case.assertions.length?'PASS':'NOT_EXECUTED',assertions:report.case.assertions.length};
} catch(error) {
  if(report.case){report.case.status=error instanceof Blocked?(report.case.assertions.some(x=>x.status==='PASS')?'PARTIAL':'BLOCKED'):'FAIL';report.case.blocker=error instanceof Blocked?error.message:undefined;report.case.failure=error instanceof Blocked?undefined:{type:error.name,location:(String(error.stack).match(/(?:run|scenarios|faults-and-concurrency)\.mjs:\d+:\d+/)||[])[0]||'initialization',context:'Named assertion or technical prerequisite failed; raw error and secrets withheld'};}
  else report.precondition={status:'BLOCKED',reason:'Required explicit window/case/private local configuration not present; no runtime execution intended'};
} finally {
  if(ctx){
    for(const cleanup of [...ctx.extraCleanup].reverse()){try{await cleanup();}catch{report.cleanupFailure=true;}}
    // All cleanup outcomes are handled; only this run's new positions/accounts may be archived.
    if(!ctx.retainOwnFixture)for(const item of ctx.own.positions){try{const owner=ctx.rows(`SELECT user_id FROM investments WHERE id=${lit(item.id)}`)[0];assert.equal(owner.user_id,item.user.id);const r=await ctx.request('DELETE',`/api/investments/${item.id}`,undefined,{user:item.user});assert.equal(r.status,200);}catch{report.cleanupFailure=true;}}
    // Fixture data is retained. Only accounts CREATED by this run are archived through normal API.
    if(!ctx.retainOwnFixture)for(const item of ctx.own.accounts){try{const before=ctx.rows(`SELECT user_id FROM accounts WHERE id=${lit(item.id)}`)[0];assert.equal(before.user_id,item.userId);const r=await ctx.request('DELETE',`/api/accounts/${item.id}`,undefined,{user:item.user});assert.equal(r.status,204);}catch{report.cleanupFailure=true;}}
    try{if(protectedRows)report.originalIntegrity=protectedRows.map(before=>{const ids=before.ids.length?before.ids.map(lit).join(','):'NULL';const after=ctx.rows(`SELECT count(*)::int AS count,md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) AS hash FROM public.${before.table} t WHERE t.id IN(${ids})`)[0];let expectedMutation=false,preservedOtherColumns; if(before.table==='users'&&ctx.allowedPlanMutation){const normalized=ctx.sql(`SELECT md5(COALESCE(jsonb_agg(CASE WHEN t.id=${lit(ctx.a.id)} THEN to_jsonb(t)-ARRAY['status','current_period_end','grace_period_end','updated_at'] ELSE to_jsonb(t) END ORDER BY t.id)::text,'[]')) FROM users t WHERE t.id IN(${ids})`);preservedOtherColumns=normalized===ctx.planUserNormalizedBefore;expectedMutation=after.count===before.count&&preservedOtherColumns&&ctx.sql(`SELECT md5(to_jsonb(u)::text) FROM users u WHERE id=${lit(ctx.a.id)}`)===ctx.allowedPlanMutation.afterRowMd5;}return {table:before.table,rows:before.count,beforeMd5:before.sha,afterMd5:after.hash,unchanged:after.count===before.count&&after.hash===before.sha,...(before.table==='users'&&ctx.allowedPlanMutation?{expectedMutation,preservedOtherColumns,expectedChangedUserId:ctx.a.id,allowedFields:report.intendedMutationPolicy.allowedFields}:{})};});
    }catch{report.originalIntegrityUnavailable=true;}
    try{report.workingSourceStable=sourceManifest?(await manifest()).every((s,i)=>s.path===sourceManifest[i].path&&s.sha256===sourceManifest[i].sha256):false;report.servedSourceStable=true;for(const file of ctx.buildProof.sourceManifest)if(digest(await fs.readFile(path.join(ctx.buildProof.buildDirectory,file.path)))!==file.sha256)report.servedSourceStable=false;report.sourceStable=report.workingSourceStable&&report.servedSourceStable;}catch{report.sourceStable=false;}
    try{await ctx.close();}catch{report.cleanupFailure=true;}
    if(report.cleanupFailure||report.originalIntegrityUnavailable||report.originalIntegrity?.some(x=>!x.unchanged&&!x.expectedMutation)||!report.sourceStable){report.case.status='FAIL';report.case.complete_original_contract=false;}
  }
  report.status=report.case?.status||'BLOCKED';report.finishedAt=new Date().toISOString();await save();
  console.log(JSON.stringify({output:output?path.basename(output):null,status:report.status,case:selected||null,executionCount:report.executionCount,scope:'prepared contract runner; no full-CU/CI/provider acceptance inferred'}));
  if(report.status==='FAIL')process.exitCode=1;
}
