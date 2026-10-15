import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath}from'node:url';
import {createHash,randomUUID}from'node:crypto';
import {spawnSync}from'node:child_process';
import dotenv from'dotenv';
import{isolatedNativeTargets,isolatedPgEnvironment,safeNativeFailure}from'../../../../../../scripts/lib/test-isolated-native-target.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../../../..'),runtime='/tmp/zarix-runtime-20261015';
assert.equal(process.env.ZARIX_QUOTE_CONTRACT_WINDOW,'proof-exclusive','Root must release the exclusive quote-contract window');
assert.equal(process.env.ZARIX_ISOLATED_DATABASE_CONFIRM,'synthetic-only');
const output=path.join(runtime,`quote-contracts-${randomUUID()}`);await fs.mkdir(output,{mode:0o700});
const sha=x=>createHash('sha256').update(x).digest('hex'),literal=x=>`'${String(x).replaceAll("'","''")}'`;
const report={startedAt:new Date().toISOString(),status:'RUNNING',scope:'CP3-01 and CP3-02 exact fixtures using the actual CI4 service, own loopback HTTP doubles and actual auxiliary FX persistence. No application edits, Next API request, browser, normal-user/Auth operation, financial write or real-provider acceptance.',target:{apiOrigin:'http://127.0.0.1:58321',postgresPort:'58322',providerDouble:'http://127.0.0.1:57911'},scenarios:[]};
const sources=['lib/services/cotizaciones.ts','lib/supabase/server.ts','lib/yahoo-finance-headers.ts','lib/blue-fx-reference.ts','components/ui/BlueFxReferenceDetails.tsx','package-lock.json'];
const harnessFiles=['run.mjs','worker.mjs','clock-guard.mjs'];
const manifest=()=>Promise.all(sources.map(async p=>({path:p,sha256:sha(await fs.readFile(path.join(root,p)))})));
const canonical=['users','accounts','categories','transactions','recurring_rules','budgets','investments','portfolio_performance_snapshots','bot_sessions','budget_alerts','investment_sales','shared_groups','shared_group_members','shared_expenses','shared_expense_splits','net_worth_snapshots','transaction_requests','notification_outbox','plan_usage_cycles','plan_usage_requests','account_creation_requests','investment_sale_requests','shared_expense_requests','investment_create_requests','import_batches'];
let before,config,pgEnv,psql,lock;
async function checkpoint(){await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});}
function sql(query){const child=spawnSync(psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',`BEGIN READ ONLY;SET LOCAL ROLE service_role;${query};COMMIT;`],{cwd:root,env:pgEnv,encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(child.status,0,'Read-only PostgreSQL snapshot failed; raw diagnostics withheld');return JSON.parse(child.stdout.trim());}
function snapshot(){
  const data=sql(`SELECT jsonb_build_object(${[...canonical,'market_data_cache'].map(t=>`${literal(t)},(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM public.${t} t)`).join(',')},'fxRowTexts',(SELECT COALESCE(jsonb_object_agg(id::text,to_jsonb(t)::text),'{}'::jsonb) FROM public.exchange_rates t))`);
  const tables=Object.fromEntries(canonical.map(t=>[t,{rows:JSON.parse(data[t]).length,sha256:sha(data[t])}]));
  return{canonical:{sha256:sha(JSON.stringify(tables)),tables},cache:{rows:JSON.parse(data.market_data_cache).length,sha256:sha(data.market_data_cache)},fxTexts:data.fxRowTexts,fxRows:Object.entries(data.fxRowTexts).map(([id,text])=>({id,...JSON.parse(text)})),fxHashes:Object.fromEntries(Object.entries(data.fxRowTexts).map(([id,text])=>[id,sha(text)]))};
}
const summarize=s=>({canonical:s.canonical,marketDataCache:s.cache,fx:{rows:s.fxRows.length,hashById:s.fxHashes}});
function verifyFx(initial,after,result){
  assert.ok(Object.entries(initial.fxTexts).every(([id,text])=>after.fxTexts[id]===text),'A preexisting FX row changed or disappeared');
  const fresh=after.fxRows.filter(row=>!Object.hasOwn(initial.fxTexts,row.id));assert.equal(fresh.length,result.expectedNewFxRows,'Unexpected number of new durable FX rows');
  const expected=scenarioRows(result);assert.equal(expected.length,fresh.length);
  for(const e of expected)assert.equal(fresh.filter(r=>r.source===e.source&&r.from_currency==='USD'&&r.to_currency==='ARS'&&Number(r.rate)===e.rate&&Date.parse(r.timestamp)===Date.parse(e.timestamp)).length,1,'Exact source/unit/rate/timestamp persistence mismatch');
  return{newRows:fresh.length,allOriginalFxPreserved:true,normalizedRows:fresh.map(({source,from_currency,to_currency,rate,timestamp})=>({source,from_currency,to_currency,rate,timestamp})),hashById:Object.fromEntries(fresh.map(r=>[r.id,after.fxHashes[r.id]]))};
}
function scenarioRows(result){
  const initial=result.scenario==='mapping'?{blue:1300,oficial:1000,mep:1250,ccl:1280}:{blue:1200,oficial:1200,mep:1200,ccl:1200};
  const out=Object.entries(initial).flatMap(([source,rate])=>[{source,rate,timestamp:result.t0},{source:source+'_buy',rate,timestamp:result.t0}]);
  if(['refresh300','refresh301'].includes(result.scenario))for(const source of Object.keys(initial))for(const suffix of['','_buy'])out.push({source:source+suffix,rate:1300,timestamp:new Date(Date.parse(result.t0)+result.offsetSeconds*1000).toISOString()});
  return out;
}
try{
  lock=await fs.open(path.join(runtime,'quote-contracts.lock'),'wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,output}));
  const envFile=path.join(runtime,'proof.env');assert.equal((await fs.stat(envFile)).mode&0o077,0);config=dotenv.parse(await fs.readFile(envFile));
  const{apiUrl,databaseUrl}=isolatedNativeTargets({ZARIX_ISOLATED_DATABASE_CONFIRM:'synthetic-only',ZARIX_LOCAL_SUPABASE_URL:config.ZARIX_PROOF_SUPABASE_URL,ZARIX_LOCAL_DATABASE_URL:config.ZARIX_PROOF_DATABASE_URL});
  assert.equal(apiUrl.origin,report.target.apiOrigin);assert.equal(databaseUrl.hostname,'127.0.0.1');assert.equal(databaseUrl.port,'58322');assert.equal(databaseUrl.pathname,'/postgres');
  pgEnv=isolatedPgEnvironment(databaseUrl);psql=path.join(config.ZARIX_PG_BIN,'psql');
  const corePath=path.join(root,'docs/tif/v2.13/evidence/technical-20261015/core-reliability/verification.json'),coreRaw=await fs.readFile(corePath),core=JSON.parse(coreRaw);
  assert.equal(core.codeRevision,'836fd18b310a51cced9074b372a80ce5d7e1a870');assert.equal(core.sourceStable,true);assert.equal(core.sourceWorkingTreeClean,true);
  report.sourceManifest=await manifest();report.harnessManifest=await Promise.all(harnessFiles.map(async p=>({path:p,sha256:sha(await fs.readFile(path.join(here,p)))})));
  for(const item of report.sourceManifest){assert.equal(core.sourceManifest.find(x=>x.path===item.path)?.sha256,item.sha256);const git=spawnSync('git',['show',`${core.codeRevision}:${item.path}`],{cwd:root,env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'}});assert.equal(git.status,0);assert.equal(sha(git.stdout),item.sha256);}
  const state=JSON.parse(await fs.readFile(path.join(runtime,'proof-app-state.json')));assert.equal(state.purpose,'account-analysis-proof');assert.equal(state.apiOrigin,apiUrl.origin);assert.equal(state.appOrigin,'http://127.0.0.1:3002');assert.equal(state.revision,core.codeRevision);assert.equal(state.copyRoot,'/tmp/zarix-app-account-analysis-20261015');assert.equal((await fs.readFile(path.join(state.copyRoot,'.next/BUILD_ID'),'utf8')).trim(),state.buildId);
  report.codeBinding={revision:core.codeRevision,coreVerificationSha256:sha(coreRaw),appBuildId:state.buildId,appCopyRoot:state.copyRoot,scope:'Real service imports are hash-matched to immutable CI4 Git bytes. APP metadata is contextual only: this phase does not send requests to Next3002 or claim execution of that compiled build.'};
  before=snapshot();report.before=summarize(before);
  if(before.fxRows.some(r=>Date.parse(r.timestamp)>=Date.parse('2026-10-06T12:00:00.000Z'))){report.status='BLOCKED';report.blocker='Preexisting FX timestamp reaches fixed first T0; preserve originals rather than deleting or altering them to force global DB fallback';}
  else{
    const tsconfig=path.join(output,'tsx.config.json');await fs.writeFile(tsconfig,JSON.stringify({compilerOptions:{target:'ES2022',module:'esnext',moduleResolution:'bundler',jsx:'react-jsx',baseUrl:root,paths:{'@/*':[root+'/*']},esModuleInterop:true}},null,2)+'\n',{mode:0o600});
    for(const scenario of['mapping','hit299','refresh300','refresh301','failure300']){
      const initial=snapshot(),resultFile=path.join(output,scenario+'.json');
      const clean=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/(?:SUPABASE|GEMINI|TELEGRAM|MERCADO|MP_ACCESS|CRYPTOYA|CRIPTOYA|DOLARAPI|COINGECKO|NODE_OPTIONS|NODE_PATH)/i.test(key)));
      const childEnv={...clean,ZARIX_QUOTE_CONTRACT_WINDOW:'proof-exclusive',ZARIX_QUOTE_CONTRACT_SCENARIO:scenario,ZARIX_QUOTE_CONTRACT_RESULT:resultFile,NEXT_PUBLIC_SUPABASE_URL:apiUrl.origin,SUPABASE_SERVICE_ROLE_KEY:config.ZARIX_PROOF_SERVICE_ROLE_KEY,CRIPTOYA_API_URL:'http://127.0.0.1:57911',DOLARAPI_URL:'http://127.0.0.1:57911',COINGECKO_API_URL:'http://127.0.0.1:57911',EXCHANGE_RATE_CACHE_TTL:'300',EXCHANGE_RATE_MAX_AGE_SECONDS:'86400',MARKET_DATA_TIMEOUT_MS:'8000',TSX_TSCONFIG_PATH:tsconfig,TZ:'Etc/UTC'};
      report.scenarios.push({scenario,status:'DISPATCHING',resultFile:path.basename(resultFile)});await checkpoint();
      const child=spawnSync(process.execPath,['--import',path.join(here,'clock-guard.mjs'),'--import',path.join(root,'node_modules/tsx/dist/loader.mjs'),path.join(here,'worker.mjs')],{cwd:root,env:childEnv,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
      await fs.writeFile(path.join(output,scenario+'.private.log'),child.stdout+'\n'+child.stderr,{mode:0o600});
      const entry=report.scenarios.at(-1);entry.exitCode=child.status;
      const result=JSON.parse(await fs.readFile(resultFile,'utf8'));entry.worker=result;
      const after=snapshot();entry.persistence=verifyFx(initial,after,result);entry.canonicalUnchanged=initial.canonical.sha256===after.canonical.sha256;entry.marketCacheUnchanged=initial.cache.sha256===after.cache.sha256;
      assert.equal(entry.canonicalUnchanged,true);assert.equal(entry.marketCacheUnchanged,true);assert.equal(child.status,0);assert.equal(result.status,'PASS');entry.status='PASS';await checkpoint();
    }
    report.originalCases=[{id:'CP3-01',status:'PASS',scenarios:['mapping']},{id:'CP3-02',status:'PASS',scenarios:['hit299','refresh300','refresh301','failure300']}];report.status='PASS';
  }
}catch(error){report.status='FAIL';report.failure=safeNativeFailure(error,'Quote-contract preparation/import/assertion/persistence failure; private diagnostics excluded');}
finally{
  if(before){try{const after=snapshot();report.after=summarize(after);report.canonicalUnchanged=before.canonical.sha256===after.canonical.sha256;report.marketCacheUnchanged=before.cache.sha256===after.cache.sha256;report.allPreexistingFxPreserved=Object.entries(before.fxTexts).every(([id,text])=>after.fxTexts[id]===text);report.newFxRows=after.fxRows.length-before.fxRows.length;if(!report.canonicalUnchanged||!report.marketCacheUnchanged||!report.allPreexistingFxPreserved)report.status='FAIL';}catch(error){report.status='FAIL';report.integrityFailure=safeNativeFailure(error,'Final original-state read-only snapshot');}}
  report.sourceStable=JSON.stringify(report.sourceManifest)===JSON.stringify(await manifest());if(!report.sourceStable)report.status='FAIL';report.finishedAt=new Date().toISOString();await checkpoint();
  if(lock){await lock.close();await fs.unlink(path.join(runtime,'quote-contracts.lock'));}
  console.log(JSON.stringify({status:report.status,scenarios:report.scenarios.map(x=>({scenario:x.scenario,status:x.status})),canonicalUnchanged:report.canonicalUnchanged,allPreexistingFxPreserved:report.allPreexistingFxPreserved,output}));process.exitCode=report.status==='PASS'?0:1;
}
