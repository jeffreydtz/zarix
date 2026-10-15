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
import { bindIntermediateClock } from './profile-binding.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const runtime = '/tmp/zarix-runtime-20261015';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const lit = value => `'${String(value).replaceAll("'", "''")}'`;
class Blocked extends Error {}
const report = { status: 'PREPARED', startedAt: new Date().toISOString(), scope: 'One exact selected original account/analysis contract. Existing ordinary Auth A/B; no new identities/plans/credentials. Prepared separately from CI3 and LOAD.', results: [], requests: [], fixtures: [], executionCount: 0 };
let ctx, selected, output, protectedRows, sourceManifest, runtimeBinding;
const protectedTables = ['users', 'accounts', 'transactions', 'investments', 'investment_sales', 'categories', 'budgets', 'recurring_rules', 'shared_groups', 'shared_group_members', 'shared_expenses', 'shared_expense_splits'];
async function save() { if (output) await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
const block = reason => { throw new Blocked(reason); };
async function manifest() {
  const files = ['docs/tif/v2.13/casos_prueba.csv','docs/tif/v2.13/evidence/technical-20261015/acceptance-final/profiles.json','docs/tif/v2.13/evidence/technical-20261015/acceptance-final/clock-preload.mjs','docs/tif/v2.13/evidence/technical-20261015/acceptance-final/gemini-unavailable-preload.mjs', ...['run.mjs','scenarios.mjs','profile-binding.mjs','plan.json'].map(name => path.relative(root,path.join(here,name))), 'scripts/lib/test-isolated-native-target.mjs', 'app/api/accounts/route.ts', 'app/api/accounts/[id]/route.ts', 'app/api/accounts/[id]/adjust-secondary-balance/route.ts', 'app/api/transactions/route.ts', 'app/api/transactions/[id]/route.ts', 'app/api/import/transactions/route.ts', 'app/api/export/transactions/route.ts', 'app/api/investments/portfolio/route.ts', 'app/api/ai/anomalies/route.ts', 'app/api/ai/projections/route.ts', 'app/(authenticated)/dashboard/page.tsx', 'lib/services/accounts.ts', 'lib/services/cotizaciones.ts', 'lib/services/transactions.ts', 'lib/financial-anomalies.ts', 'lib/financial-projections.ts','supabase/schema.sql','supabase/migrations/20261009034943_enforce_plan_allowances.sql','supabase/migrations/20261015000402_atomic_account_balance_recompute.sql'];
  return Promise.all(files.map(async file => ({ path: file, sha256: digest(await fs.readFile(path.join(root,file))) })));
}

// Do not import focal-contracts/run.mjs: that file executes at module top level.
// The small SQL/cookie/checkpoint primitives below follow its already reviewed contract.
async function initialize() {
  assert.equal(process.env.ZARIX_ACCOUNT_ANALYSIS_WINDOW, 'after-load-quotes-focal-finance', 'Wait for the parent to release the serial E2E window');
  assert.equal(process.env.ZARIX_ISOLATED_DATABASE_CONFIRM, 'synthetic-only');
  const at = process.argv.indexOf('--case');
  assert.ok(at >= 0 && process.argv[at + 1], 'Select exactly one --case; no implicit full suite');
  selected = process.argv[at + 1];
  const plan = JSON.parse(await fs.readFile(path.join(here,'plan.json'),'utf8'));
  const contract = plan.cases.find(row => row.case_id === selected);
  assert.ok(contract, 'Case is outside the prepared23contracts');
  report.case = { case_id: selected, status: 'BLOCKED', complete_original_contract: false, assertions: [], original_contract: contract.original_contract };
  report.results = [report.case];
  const profileAt=process.argv.indexOf('--profile'),profileName=profileAt<0?'legacy-existing':process.argv[profileAt+1];assert.ok(['legacy-existing','intermediate-core-reliability-clock-retry'].includes(profileName));const clockProfile=profileName==='intermediate-core-reliability-clock-retry';if(clockProfile)assert.ok(['CP3-13','CP3-14','CP3-15','CP3-16'].includes(selected));report.runtimeProfile=profileName;
  const apiOnly=process.argv.includes('--api-only');
  const ownerAt=process.argv.indexOf('--owner');const physicalOwner=ownerAt<0?'A':process.argv[ownerAt+1];assert.ok(['A','B'].includes(physicalOwner),'--owner must be A or B');
  report.executionMode=apiOnly?'api-sql-only':'ui-required';report.logicalOwner=physicalOwner;report.pendingScopes=[];
  const run = randomUUID(); report.run = run;
  output = path.resolve(process.env.ZARIX_ACCOUNT_ANALYSIS_OUTPUT || path.join(runtime,`account-analysis-${run}`));
  assert.ok(output.startsWith(runtime + '/account-analysis-'));
  await fs.mkdir(output,{recursive:false,mode:0o700});
  await save();
  if (selected === 'CP3-02') block('CP3-02 is explicitly reserved for the parent TTL fix and its exact controlled-clock verification.');
  const configFile = path.resolve(process.env.ZARIX_ACCOUNT_ANALYSIS_CONFIG || path.join(runtime,clockProfile?'account-analysis-proof.env':'e2e.env'));
  const loginFile = path.resolve(process.env.ZARIX_ACCOUNT_ANALYSIS_LOGINS || path.join(runtime,clockProfile?'proof-logins.json':'e2e-logins.json'));
  for (const f of [configFile,loginFile]) {
    assert.ok(f.startsWith(runtime + '/'),'Use only pre-existing private local fixture files');
    assert.equal((await fs.stat(f)).mode & 0o077,0,'Private fixture must be0600');
  }
  const actualConfig=dotenv.parse(await fs.readFile(configFile));const config=actualConfig.ZARIX_IMPORT_SUPABASE_URL?{...actualConfig,ZARIX_E2E_SUPABASE_URL:actualConfig.ZARIX_IMPORT_SUPABASE_URL,ZARIX_E2E_DATABASE_URL:actualConfig.ZARIX_IMPORT_DATABASE_URL,ZARIX_E2E_ANON_KEY:actualConfig.ZARIX_IMPORT_ANON_KEY,ZARIX_PG_BIN:actualConfig.ZARIX_IMPORT_PG_BIN}:actualConfig;
  const { apiUrl,databaseUrl } = isolatedNativeTargets({ZARIX_ISOLATED_DATABASE_CONFIRM:'synthetic-only',ZARIX_LOCAL_SUPABASE_URL:config.ZARIX_E2E_SUPABASE_URL,ZARIX_LOCAL_DATABASE_URL:config.ZARIX_E2E_DATABASE_URL});
  assert.ok(['57321:57322','58321:58322','59321:59322'].includes(`${apiUrl.port}:${databaseUrl.port}`),'Only released E2E or separately provisioned account-analysis replica; never SOURCE/RESTORE/LOAD');
  assert.equal(apiUrl.hostname,'127.0.0.1'); assert.equal(databaseUrl.hostname,'127.0.0.1');
  const appUrl = new URL(process.env.ZARIX_ACCOUNT_ANALYSIS_APP_URL || (apiUrl.port==='59321'?'http://127.0.0.1:3003':apiUrl.port==='58321'?'http://127.0.0.1:3002':'http://127.0.0.1:3000'));
  assert.equal(appUrl.protocol,'http:'); assert.equal(appUrl.hostname,'127.0.0.1');
  assert.ok((apiUrl.port==='59321'?['3003']:['3000','3002']).includes(appUrl.port)); assert.equal(appUrl.pathname,'/');
  assert.ok(!appUrl.username && !appUrl.password && !appUrl.search && !appUrl.hash);
  databaseUrl.username = 'supabase_admin';
  const pgEnv = isolatedPgEnvironment(databaseUrl), psql = path.join(config.ZARIX_PG_BIN,'psql');
  function sql(statement) {
    const child = spawnSync(psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',statement],{env:{...pgEnv,PGOPTIONS:'-c statement_timeout=17000 -c lock_timeout=3000'},encoding:'utf8',timeout:22000,maxBuffer:8*1024*1024});
    assert.equal(child.status,0,'Native SQL failed; raw SQL diagnostics withheld'); return child.stdout.trim();
  }
  const rows = statement => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (${statement})t`));
  const users = [];
  const logins = JSON.parse(await fs.readFile(loginFile,'utf8'));
  const expectedPurpose={'57321':'isolated-api-e2e-replica','58321':'fifth-isolated-acceptance-replica','59321':'sixth-isolated-acceptance-replica'}[apiUrl.port];assert.equal(logins.purpose,expectedPurpose);assert.equal(logins.users.length,2);
  if(apiUrl.port!=='57321'){const prepFile=path.join(runtime,apiUrl.port==='58321'?'proof-private/preparation.json':'import-target-private/preparation.json');const prep=JSON.parse(await fs.readFile(prepFile,'utf8'));assert.equal(prep.status,'PASS_PREPARED');assert.equal(prep.target.apiOrigin,apiUrl.origin);assert.deepEqual(logins.users.map(x=>x.id),prep.auth.map(x=>x.id));assert.ok(prep.auth.every(x=>x.normalPasswordLogin===true&&x.normalGetUser===true));report.nativePreparation={sha256:digest(await fs.readFile(prepFile)),projectId:prep.target.projectId,apiOrigin:prep.target.apiOrigin,normalAuthIdsBound:true};}
  for (const credential of logins.users) {
    assert.match(credential.email,apiUrl.port==='57321'?/^zarix-e2e-.+@example\.invalid$/i:/^zarix-.+@example\.invalid$/i);
    const jar = new Map();
    const client = createServerClient(apiUrl.href,config.ZARIX_E2E_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>{for(const {name,value} of items)jar.set(name,value);}},global:{fetch:isolatedApiFetch}});
    const signed = await client.auth.signInWithPassword({email:credential.email,password:credential.password});
    assert.equal(signed.error,null,'Existing normal password Auth required');
    assert.equal((await client.auth.getUser()).data.user?.id,credential.id);
    assert.equal(sql(`SELECT email FROM auth.users WHERE id=${lit(credential.id)}`),credential.email);
    users.push({id:credential.id,client,jar,credential});
  }
  if(physicalOwner==='B')users.reverse();
  const stateFile = path.resolve(process.env.ZARIX_ACCOUNT_ANALYSIS_APP_STATE || path.join(runtime,clockProfile?'contract-clock-retry-app-state.json':apiUrl.port==='59321'?'import-target-app-state.json':'e2e-app-state.json'));
  assert.ok(stateFile.startsWith(runtime+'/'));
  const appState = JSON.parse(await fs.readFile(stateFile,'utf8'));
  assert.equal(appState.appOrigin,appUrl.origin);assert.equal(appState.apiOrigin,apiUrl.origin);
  report.buildBinding = {appOrigin:appUrl.origin,apiOrigin:apiUrl.origin,buildId:appState.buildId,nextPid:appState.nextPid};
  report.sourceManifest=sourceManifest=await manifest();
  if(apiUrl.port==='59321'){
    const proofFile=path.join(runtime,'import-target-build-proof.json'),proof=JSON.parse(await fs.readFile(proofFile,'utf8'));assert.equal(appState.purpose,'import-target-proof');assert.equal(proof.exitCode,0);assert.equal(proof.copyRoot,'/tmp/zarix-app-import-target-20261015');assert.equal(proof.copyRoot,appState.copyRoot);assert.equal(proof.buildId,appState.buildId);assert.equal(proof.revision,appState.revision);assert.equal(proof.publicSupabaseOrigin,apiUrl.origin);assert.equal(proof.sourceManifestSha256,appState.sourceManifestSha256);assert.equal(proof.sourceCount,proof.sources.length);assert.equal(digest(JSON.stringify(proof.sources)),proof.sourceManifestSha256);assert.ok(proof.startedAt&&proof.finishedAt);
    const buildIdBytes=await fs.readFile(path.join(proof.copyRoot,'.next/BUILD_ID'));assert.equal(buildIdBytes.toString().trim(),appState.buildId);
    const gitSources=proof.sources.filter(x=>!(proof.manifestOnlyMetadata||[]).some(m=>m.path===x.path));const gitBatch=spawnSync('git',['cat-file','--batch'],{cwd:root,env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},input:gitSources.map(x=>`${proof.revision}:${x.path}`).join('\n')+'\n',maxBuffer:64*1024*1024});assert.equal(gitBatch.status,0);let cursor=0;for(const file of gitSources){const end=gitBatch.stdout.indexOf(10,cursor);assert.ok(end>=cursor);const header=gitBatch.stdout.subarray(cursor,end).toString().split(' ');assert.equal(header[1],'blob');const size=Number(header[2]);assert.ok(Number.isSafeInteger(size)&&size>=0);cursor=end+1;assert.equal(digest(gitBatch.stdout.subarray(cursor,cursor+size)),file.sha256);cursor+=size+1;}report.frozenGitSourcesVerified=gitSources.length;
    const bound=new Map(),unrelatedCurrentDeltas=[];for(const file of proof.sources){assert.ok(!path.isAbsolute(file.path)&&!file.path.split('/').includes('..')&&!bound.has(file.path));bound.set(file.path,file.sha256);assert.equal(digest(await fs.readFile(path.join(proof.copyRoot,file.path))),file.sha256,'Every physical copied build source must match frozen proof');if(/^(?:app|lib|components|supabase|types)\//.test(file.path)){const current=digest(await fs.readFile(path.join(root,file.path)));if(current!==file.sha256){const frozen=spawnSync('git',['show',`${proof.revision}:${file.path}`],{cwd:root,env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},maxBuffer:8*1024*1024});assert.equal(frozen.status,0);assert.equal(digest(frozen.stdout),file.sha256);unrelatedCurrentDeltas.push({path:file.path,servedSha256:file.sha256,currentSha256:current,servedMatchesFrozenGit:true});}}}report.unrelatedCurrentDeltas=unrelatedCurrentDeltas;
    const relevantFor202=new Set(['app/api/accounts/route.ts','app/api/accounts/[id]/route.ts','lib/services/accounts.ts','supabase/schema.sql','supabase/migrations/20261009034943_enforce_plan_allowances.sql','supabase/migrations/20261015000402_atomic_account_balance_recompute.sql']);for(const file of sourceManifest.filter(x=>/^(?:app|lib|components|supabase|types)\//.test(x.path)&&(selected!=='CP2-02'||relevantFor202.has(x.path))))assert.equal(bound.get(file.path),file.sha256);report.currentSourceBindingScope=selected==='CP2-02'?'Only responsible accounts API/service/schema/migrations must match current; all477physical copied sources and frozen Git are independently verified, unbuilt export/UI deltas disclosed':'Selected original contract sources';
    const listener=spawnSync('/usr/sbin/lsof',['-nP','-a','-p',String(appState.nextPid),'-iTCP:3003','-sTCP:LISTEN','-Fpn'],{encoding:'utf8'});assert.equal(listener.status,0);assert.ok(listener.stdout.split('\n').includes('n127.0.0.1:3003'));
    const cwd=spawnSync('/usr/sbin/lsof',['-a','-p',String(appState.nextPid),'-d','cwd','-Fn'],{encoding:'utf8'});assert.equal(cwd.status,0);assert.equal(await fs.realpath(cwd.stdout.split('\n').find(x=>x.startsWith('n')).slice(1)),await fs.realpath(proof.copyRoot));
    report.buildBinding={...report.buildBinding,revision:proof.revision,proofSha256:digest(await fs.readFile(proofFile)),buildIdSha256:digest(buildIdBytes),physicalSourcesVerified:true,ownedListenerAndCwdVerified:true};
  }
  if(clockProfile){runtimeBinding=await bindIntermediateClock({root,runtime,profileName,selected,appState,stateFile,appUrl,apiUrl,config,sourceManifest,digest,sql});report.workingSourceManifest=sourceManifest;report.sourceManifest=runtimeBinding.servedSources;report.unbuiltCurrentDeltas=runtimeBinding.currentDeltas;report.buildBinding=runtimeBinding.binding;report.clockProof=runtimeBinding.clockProof;}
  report.versions = {node:process.version,postgres:sql('SHOW server_version')};
  report.users=users.map((u,index)=>({id:u.id,logicalRole:index?'other-owner':'selected-owner',physicalLabel:index?(physicalOwner==='A'?'B':'A'):physicalOwner,normalAuth:true}));
  const own = {accounts:[],positions:[],categories:[]};
  function check(name,actual,expected) {
    const item = {name,actual,expected,status:'RUNNING'};report.case.assertions.push(item);
    try{assert.deepEqual(actual,expected);item.status='PASS';}catch(e){item.status='FAIL';throw e;}
  }
  function near(name,actual,expected,epsilon=1e-8){const item={name,actual:Number.isFinite(Number(actual))&&Math.abs(Number(actual)-expected)<=epsilon,expected:true,numericActual:actual,numericExpected:expected,tolerance:epsilon,status:'RUNNING'};report.case.assertions.push(item);try{assert.equal(item.actual,true);item.status='PASS';}catch(e){item.status='FAIL';throw e;}}
  async function request(method,endpoint,payload,{user=users[0],key=randomUUID(),raw=false}={}) {
    assert.ok(endpoint.startsWith('/api/')&&!endpoint.includes('://'));
    const url=new URL(endpoint,appUrl);assert.equal(url.origin,appUrl.origin);
    const item={caseId:selected,method,path:url.pathname,requestId:key,startedAt:new Date().toISOString()};report.requests.push(item);await save();
    if(user){const session=await user.client.auth.getSession();assert.equal(session.error,null,'Normal Auth session unavailable');if(!session.data.session||Number(session.data.session.expires_at)*1000-Date.now()<10000){const refreshed=await user.client.auth.refreshSession();assert.equal(refreshed.error,null,'Normal SDK refresh required near local60s expiry');assert.equal(refreshed.data.user?.id,user.id);report.normalAuthRefreshes=(report.normalAuthRefreshes||0)+1;}}
    const headers={'Idempotency-Key':key};if(user)headers.Cookie=[...user.jar].map(([k,v])=>`${k}=${v}`).join('; ');
    let body;
    if(payload instanceof FormData)body=payload;
    else if(payload!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(payload);}
    report.executionCount=1;const r=await fetch(url,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(55000)});
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
    const file=process.env.ZARIX_ACCOUNT_ANALYSIS_CLOCK_PROOF||runtimeBinding?.clockFile;if(!file)block('Exact original server clock requires an independently recorded isolated-process proof; no global clock override is applied by this runner.');
    assert.ok(path.resolve(file).startsWith(runtime+'/'));
    const proof=JSON.parse(await fs.readFile(file,'utf8'));
    assert.equal(proof.fixedTime,fixedTime);assert.equal(proof.buildId,appState.buildId);assert.equal(proof.nextPid,appState.nextPid);assert.equal(proof.sourceStable,true);
    assert.ok(proof.command&&proof.preloadSha256,'Clock proof must bind the actual launched process/preload, not merely an environment flag');
    report.clockProof={path:path.relative(runtime,file),sha256:digest(await fs.readFile(file)),fixedTime};
  }
  function rate(expected){const observed=rows("SELECT rate FROM exchange_rates WHERE source='blue' AND from_currency='USD' AND to_currency='ARS' ORDER BY timestamp DESC LIMIT1".replace('LIMIT1','LIMIT 1'))[0];if(Number(observed?.rate)!==expected)block('Exact FX fixture not available; quote rows are shared originals and are never rewritten by this runner.');}
  function missingUi(name='Actual UI acceptance') {if(!report.pendingScopes.some(x=>x.name===name))report.pendingScopes.push({name,status:'BLOCKED',reason:'Automation Codex→Arc is granted (native preflight0). Current native private-window attempt failed -1728 resolving its returned reference; own-close is unconfirmed. Await the human main-chat answer before any new window or closing unidentified windows. LittleArc prepared only; AX/ScreenCapture/JavaScript setting are not enabled. No UI launch or fallback occurs in this runner.'});}
  async function ui() {
    if(!apiOnly)block('Current Arc -1728 owned-window reference/close is unresolved; await human main-chat answer before new windows or closing unidentified windows. Use --api-only for independent API/SQL; LittleArc prepared only. No permission request, browser launch or fallback occurs in this runner.');
    missingUi();return null;
  }
  async function hero(ars,usd){const p=await ui();if(!p)return null;await p.goto(new URL('/dashboard',appUrl).href);const section=p.locator('section').filter({has:p.getByRole('heading',{name:'Patrimonio total',exact:true})});await section.waitFor();for(const [i,v]of[[0,ars],[1,usd]])await section.locator('data').nth(i).evaluate((n,e)=>new Promise((resolve,reject)=>{const start=performance.now();function step(){const value=Number(n.getAttribute('value'));if(Number.isFinite(value)&&Math.abs(value-e)<1e-6)return resolve();if(performance.now()-start>20000)return reject(new Error('Wealth value mismatch'));requestAnimationFrame(step);}step();}),v);check('Actual dashboard wealth ARS/USD',[Number(await section.locator('data').nth(0).getAttribute('value')),Number(await section.locator('data').nth(1).getAttribute('value'))],[ars,usd]);return section;}
  ctx={run,users,geminiProofFile:runtimeBinding?.geminiFile,a:users[0],b:users[1],own,sql,rows,check,near,request,account,tx,category,position,slots,empty,rate,clock,ui,hero,block,lit,digest,report,output,activeCount,appUrl,apiUrl,apiOnly,missingUi,async close(){for(const u of users)await u.client.auth.signOut({scope:'local'});}};
  protectedRows=protectedTables.map(table=>{const old=rows(`SELECT id FROM public.${table} ORDER BY id`).map(r=>r.id);const ids=old.length?old.map(lit).join(','):'NULL';return {table,ids:old,count:old.length,sha:sql(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) FROM public.${table} t WHERE t.id IN(${ids})`)};});
  await save();return ctx;
}

try {
  const context=await initialize();
  report.status='RUNNING';report.case.status='RUNNING';report.case.startedAt=new Date().toISOString();await save();
  const test=contracts[selected];if(!test)block('Exact execution adapter is unavailable for this phase; use the supplied literal UI/precondition recipe, not a neighboring API assertion.');
  await test(context);report.case.status=report.pendingScopes.length?(report.case.assertions.length?'PARTIAL':'BLOCKED'):'PASS';report.case.complete_original_contract=report.case.status==='PASS';report.case.apiSqlScope={status:report.case.assertions.length?'PASS':'NOT_EXECUTED',assertions:report.case.assertions.length};
} catch(error) {
  if(report.case){report.case.status=error instanceof Blocked?(report.case.assertions.some(x=>x.status==='PASS')?'PARTIAL':'BLOCKED'):'FAIL';if(error instanceof Blocked&&report.case.assertions.some(x=>x.status==='PASS'))report.case.apiSqlScope={status:'PARTIAL',passedAssertions:report.case.assertions.filter(x=>x.status==='PASS').length};report.case.blocker=error instanceof Blocked?error.message:undefined;report.case.failure=error instanceof Blocked?undefined:{type:error.name,location:(String(error.stack).match(/(?:run|scenarios|profile-binding)\.mjs:\d+:\d+/)||[])[0]||'initialization',context:'Named assertion or technical prerequisite failed; raw error and secrets withheld'};}
  else report.precondition={status:'BLOCKED',reason:'Required explicit window/case/private local configuration not present; no runtime execution intended'};
} finally {
  if(ctx){
    // Fixture data/history is retained; only own newly created active entities are archived.
    for(const item of ctx.own.positions){try{const r=await ctx.request('DELETE',`/api/investments/${item.id}`,undefined,{user:item.user});assert.equal(r.status,200);}catch{report.cleanupFailure=true;}}
    for(const item of ctx.own.accounts){try{const before=ctx.rows(`SELECT user_id FROM accounts WHERE id=${lit(item.id)}`)[0];assert.equal(before.user_id,item.userId);const r=await ctx.request('DELETE',`/api/accounts/${item.id}`,undefined,{user:item.user});assert.equal(r.status,204);}catch{report.cleanupFailure=true;}}
    try{if(protectedRows)report.originalIntegrity=protectedRows.map(before=>{const ids=before.ids.length?before.ids.map(lit).join(','):'NULL';const after=ctx.rows(`SELECT count(*)::int AS count,md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) AS hash FROM public.${before.table} t WHERE t.id IN(${ids})`)[0];return {table:before.table,rows:before.count,beforeMd5:before.sha,afterMd5:after.hash,unchanged:after.count===before.count&&after.hash===before.sha};});
    }catch{report.originalIntegrityUnavailable=true;}
    try{report.sourceStable=sourceManifest?(await manifest()).every((s,i)=>s.path===sourceManifest[i].path&&s.sha256===sourceManifest[i].sha256):false;}catch{report.sourceStable=false;}
    if(runtimeBinding){try{report.servedBuildStable=await runtimeBinding.verifyStable();if(!report.servedBuildStable)report.sourceStable=false;}catch{report.servedBuildStable=false;report.sourceStable=false;}}
    try{await ctx.close();}catch{report.cleanupFailure=true;}
    if(report.cleanupFailure||report.originalIntegrityUnavailable||report.originalIntegrity?.some(x=>!x.unchanged)||!report.sourceStable){report.case.status='FAIL';report.case.complete_original_contract=false;}
  }
  report.status=report.case?.status||'BLOCKED';report.finishedAt=new Date().toISOString();await save();
  console.log(JSON.stringify({output:output?path.basename(output):null,status:report.status,case:selected||null,executionCount:report.executionCount,scope:'prepared contract runner; no full-CU/CI/provider acceptance inferred'}));
  if(report.status==='FAIL')process.exitCode=1;
}
