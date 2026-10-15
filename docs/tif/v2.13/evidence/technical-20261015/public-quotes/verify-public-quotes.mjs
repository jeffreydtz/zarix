// Documentary acceptance probe; execute only in the agreed post-LOAD window.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createServerClient } from '@supabase/ssr';
import { isolatedNativeTargets, isolatedPgEnvironment, isolatedApiFetch, safeNativeFailure } from '../../../../../../scripts/lib/test-isolated-native-target.mjs';

assert.equal(process.env.ZARIX_QUOTES_WINDOW_CONFIRM,'post-load-exclusive','Root must release the exclusive post-LOAD window');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../../..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const base='/tmp/zarix-runtime-20261015';
const profileFile=process.env.ZARIX_QUOTE_PROFILE_FILE;
assert.ok(profileFile?.startsWith(base+'/')&&profileFile.endsWith('.json'));
for(const file of [profileFile,base+'/e2e.env',base+'/e2e-logins.json']) assert.equal((await fs.stat(file)).mode&0o077,0);
const profile=JSON.parse(await fs.readFile(profileFile,'utf8'));
assert.equal(profile.purpose,'isolated-public-quote-profile'); assert.ok(['real','fallback-real'].includes(profile.profile));
assert.equal(profile.maxRateAgeSeconds,86400); assert.equal(profile.marketTimeoutMs,8000);
assert.ok(Number.isInteger(profile.nextPid)&&profile.nextPid>0&&typeof profile.buildId==='string');
const normalize=value=>{const u=new URL(value);assert.ok(!u.username&&!u.password&&!u.search&&!u.hash);return u.origin+u.pathname.replace(/\/$/,'');};
assert.equal(normalize(profile.providers.dolarapi),'https://dolarapi.com/v1');
assert.equal(normalize(profile.providers.coingecko),'https://api.coingecko.com/api/v3');
if(profile.profile==='real')assert.equal(normalize(profile.providers.criptoya),'https://criptoya.com/api');
else {const u=new URL(profile.providers.criptoya);normalize(u.href);assert.equal(u.protocol,'http:');assert.equal(u.hostname,'127.0.0.1');assert.ok(Number(u.port)>1024);}
const env=dotenv.parse(await fs.readFile(base+'/e2e.env'));
const {apiUrl,databaseUrl}=isolatedNativeTargets({ZARIX_ISOLATED_DATABASE_CONFIRM:'synthetic-only',ZARIX_LOCAL_SUPABASE_URL:env.ZARIX_E2E_SUPABASE_URL,ZARIX_LOCAL_DATABASE_URL:env.ZARIX_E2E_DATABASE_URL});
assert.equal(`${apiUrl.origin}:${databaseUrl.hostname}:${databaseUrl.port}`,'http://127.0.0.1:57321:127.0.0.1:57322');
const app=new URL('http://127.0.0.1:3000');
const state=JSON.parse(await fs.readFile(base+'/e2e-app-state.json','utf8'));
assert.equal(state.nextPid,profile.nextPid);assert.equal(state.buildId,profile.buildId);assert.equal(state.apiOrigin,apiUrl.origin);assert.equal(state.appOrigin,app.origin);
const login=JSON.parse(await fs.readFile(base+'/e2e-logins.json','utf8'));
assert.equal(login.purpose,'isolated-api-e2e-replica');assert.equal(login.users.length,2);
const output=process.env.ZARIX_PUBLIC_QUOTE_OUTPUT||base+'/public-quotes-'+profile.profile;
await fs.mkdir(output,{recursive:true,mode:0o700});
const destination=path.join(output,'public-quotes.json');assert.ok(!await fs.access(destination).then(()=>true,()=>false),'Never overwrite an earlier attempt');
const pgEnv=isolatedPgEnvironment(databaseUrl,{...process.env,...env});
const psql=path.join(env.ZARIX_PG_BIN,'psql');
const canonical=['users','accounts','categories','transactions','recurring_rules','budgets','investments','portfolio_performance_snapshots','bot_sessions','budget_alerts','investment_sales','shared_groups','shared_group_members','shared_expenses','shared_expense_splits','net_worth_snapshots','transaction_requests','notification_outbox','plan_usage_cycles','plan_usage_requests','account_creation_requests','investment_sale_requests','shared_expense_requests','investment_create_requests','import_batches'];
function sql(query){const r=spawnSync(psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',`BEGIN READ ONLY;SET LOCAL ROLE service_role;${query};COMMIT;`],{env:pgEnv,encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(r.status,0,'Read-only SQL failed; raw diagnostics omitted');return JSON.parse(r.stdout.trim());}
function snapshot(){
  // PostgreSQL text preserves every NUMERIC digit; never hash parsed JS numbers.
  const data=sql(`SELECT jsonb_build_object(${[...canonical,'exchange_rates','market_data_cache'].map(table=>`${literal(table)},(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM public.${table} t)`).join(',')},'fxRowTexts',(SELECT COALESCE(jsonb_object_agg(t.id::text,to_jsonb(t)::text),'{}'::jsonb) FROM public.exchange_rates t))`);
  const fx=JSON.parse(data.exchange_rates);
  const publicFx=fx.map(r=>({source:r.source,from_currency:r.from_currency,to_currency:r.to_currency,rate:r.rate,timestamp:r.timestamp}));
  const digests=Object.fromEntries([...canonical,'exchange_rates','market_data_cache'].map(table=>[table,{rows:JSON.parse(data[table]).length,sha256:sha(data[table])}]));
  return {canonical:{sha256:sha(JSON.stringify(Object.fromEntries(canonical.map(t=>[t,digests[t]])))),tables:Object.fromEntries(canonical.map(t=>[t,digests[t]]))},auxiliary:{exchange_rates:digests.exchange_rates,market_data_cache:digests.market_data_cache},publicFx,fxIds:fx.map(r=>r.id),fxRowTexts:data.fxRowTexts};
}
const paths=['app/api/cotizaciones/route.ts','lib/services/cotizaciones.ts','lib/supabase/server.ts','supabase/schema.sql','package-lock.json'];
const manifest=()=>Promise.all(paths.map(async file=>({path:file,sha256:sha(await fs.readFile(path.join(root,file)))})));
const report={startedAt:new Date().toISOString(),status:'RUNNING',profile:{purpose:profile.purpose,profile:profile.profile,providers:{criptoya:profile.providers.criptoya,dolarapi:profile.providers.dolarapi,coingecko:profile.providers.coingecko},buildId:profile.buildId,nextPid:profile.nextPid,maxRateAgeSeconds:profile.maxRateAgeSeconds,marketTimeoutMs:profile.marketTimeoutMs,metadataSha256:sha(await fs.readFile(profileFile))},target:{app:app.origin,api:apiUrl.origin,postgresPort:databaseUrl.port},scope:'One normal A API request, existing credentials only; 25 canonical public tables read only for counts/hashes; auxiliary rates/cache may change. No financial writes, new users, provider credentials, SOURCE/RESTORE/LOAD.',hashScope:'Hashes use PostgreSQL canonical JSONB text before JavaScript numeric parsing, preserving exact NUMERIC digits',results:[],transportScope:'Official endpoint binding is supplied by the private server profile. Root must verify PID/listener binding when releasing the window. Application and Next fetch caches can serve provider data; no claim of a fresh external socket per quote without separate transport logs. Crypto has no origin/provider metadata in this API.'};
let before,after,expectedFxIds=[];
try{
  report.sourceManifest=await manifest();report.runnerSha256=sha(await fs.readFile(fileURLToPath(import.meta.url)));
  report.revision=spawnSync('git',['rev-parse','HEAD'],{env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},encoding:'utf8'}).stdout.trim();
  const jar=new Map();const fetchLocal=(url,init={})=>{const headers=new Headers(init.headers);headers.set('Connection','close');return isolatedApiFetch(url,{...init,headers});};
  const client=createServerClient(apiUrl.href,env.ZARIX_E2E_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))},global:{fetch:fetchLocal}});
  const credential=login.users[0];const auth=await client.auth.signInWithPassword({email:credential.email,password:credential.password});assert.equal(auth.error,null);assert.equal((await client.auth.getUser()).data.user.id,credential.id);
  const claims=JSON.parse(Buffer.from(auth.data.session.access_token.split('.')[1],'base64url'));assert.equal(claims.role,'authenticated');assert.equal(claims.sub,credential.id);report.auth={normalUsers:1,role:'authenticated',verified:true,newIdentities:0};
  before=snapshot();report.before={canonical:before.canonical,auxiliary:before.auxiliary};
  const requestStart=Date.now();
  const response=await isolatedApiFetch(new URL('/api/cotizaciones',app),{headers:{Cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; '),Connection:'close'},signal:AbortSignal.timeout(45000)});
  report.httpStatus=response.status;const text=await response.text();report.responseSha256=sha(text);
  if(response.status!==200){report.results.push({check:'API quotes',status:'BLOCKED',httpStatus:response.status,reason:'Real-profile request did not return quotes; no provider/cache/persistence success inferred from the generic API error'});report.status='BLOCKED';}
  else{
    const quotes=JSON.parse(text),requestEnd=Date.now();report.requestWindow={startedAt:new Date(requestStart).toISOString(),finishedAt:new Date(requestEnd).toISOString()};
    const fresh=(timestamp,prices)=>{const time=new Date(timestamp).getTime();assert.ok(Number.isFinite(time)&&requestStart-time<=profile.maxRateAgeSeconds*1000&&time<=requestEnd+300000);assert.ok(prices.every(price=>Number.isFinite(price)&&price>0));};
    const expected=[];
    for(const source of ['blue','oficial','mep','ccl']){const q=quotes.dolar[source];assert.equal(q.type,source);fresh(q.timestamp,[q.buy,q.sell]);assert.ok(['provider','persisted'].includes(q.origin));if(q.origin==='provider')assert.ok(['criptoya','dolarapi'].includes(q.provider));else assert.equal(q.provider,null);expected.push({source,rate:q.sell,timestamp:q.timestamp},{source:source+'_buy',rate:q.buy,timestamp:q.timestamp});}
    for(const [key,symbol]of[['btc','BTC'],['eth','ETH'],['usdt','USDT']]){const q=quotes.crypto[key];assert.equal(q.symbol,symbol);fresh(q.timestamp,[q.priceUSD,q.priceARS]);}
    assert.equal(quotes.timestamp,quotes.dolar.blue.timestamp);
    report.normalizedPublicQuotes={dolar:Object.fromEntries(['blue','oficial','mep','ccl'].map(s=>{const q=quotes.dolar[s];return[s,{type:q.type,buy:q.buy,sell:q.sell,timestamp:q.timestamp,origin:q.origin,provider:q.provider}];})),crypto:Object.fromEntries(['btc','eth','usdt'].map(s=>{const q=quotes.crypto[s];return[s,{symbol:q.symbol,priceUSD:q.priceUSD,priceARS:q.priceARS,change24h:q.change24h,timestamp:q.timestamp}];}))};
    report.results.push({check:'API normalization and existing freshness contract',status:'PASS',dollarQuotes:4,cryptoQuotes:3});
    const liveDollar=Object.values(quotes.dolar).every(q=>q.origin==='provider');
    report.results.push({check:'Dollar provenance',status:liveDollar?'PASS':'LIMITED',observedProviders:[...new Set(Object.values(quotes.dolar).map(q=>q.provider))],observedOrigins:[...new Set(Object.values(quotes.dolar).map(q=>q.origin))],scope:'Application metadata and configured endpoint binding; caches can retain provider provenance'});
    if(profile.profile==='fallback-real')report.results.push({check:'Configured primary failure and DolarAPI selection',status:liveDollar&&Object.values(quotes.dolar).every(q=>q.provider==='dolarapi')?'PASS':'LIMITED',scope:'CriptoYa endpoint is an explicit local failure double; selected DolarAPI URL is real. Primary request count/status requires the separate root transport evidence.'});
    const matched=sql(`WITH expected AS (SELECT * FROM jsonb_to_recordset(${literal(JSON.stringify(expected))}::jsonb) AS e(source text,rate numeric,timestamp timestamptz)) SELECT jsonb_agg(to_jsonb(m) ORDER BY m.source) FROM (SELECT e.source,e.rate AS api_rate,round(e.rate,8) AS stored_rate,e.timestamp,count(r.id)::int AS matching_rows,array_agg(r.id) FILTER (WHERE r.id IS NOT NULL) AS matched_ids FROM expected e LEFT JOIN public.exchange_rates r ON r.source=e.source AND r.from_currency='USD' AND r.to_currency='ARS' AND r.rate=round(e.rate,8) AND r.timestamp=e.timestamp GROUP BY e.source,e.rate,e.timestamp) m`);
    assert.equal(matched.length,8);if(liveDollar)assert.ok(matched.every(r=>r.matching_rows===1));
    expectedFxIds=matched.flatMap(r=>r.matched_ids||[]);report.matchingPublicFx=matched.map(({matched_ids,...publicRow})=>publicRow);
    report.results.push({check:'API rates match durable DB source/timestamp/NUMERIC(20,8)',status:liveDollar?'PASS':'LIMITED',rowsMatched:matched.filter(r=>r.matching_rows===1).length,scope:'Live source bulk persistence expects eight matching tuples; DB fallback may combine existing buy/sell dates and does not promise a new INSERT'});
    report.status=liveDollar&&report.results.every(r=>r.status==='PASS')?'PASS':'LIMITED';
  }
}catch(error){report.status='FAIL';report.failure=safeNativeFailure(error,'Public quote probe');}
finally{
  if(before){try{after=snapshot();report.after={canonical:after.canonical,auxiliary:after.auxiliary};report.canonicalUnchanged=before.canonical.sha256===after.canonical.sha256;if(!report.canonicalUnchanged)report.status='FAIL';
    const oldKeys=new Set(before.publicFx.map(r=>JSON.stringify(r)));const newFx=after.publicFx.filter(r=>!oldKeys.has(JSON.stringify(r)));report.newPublicFxRows=newFx;
    const oldIds=new Set(before.fxIds),afterIds=new Set(after.fxIds),newIds=after.fxIds.filter(id=>!oldIds.has(id)),newMatchingIds=expectedFxIds.filter(id=>!oldIds.has(id)&&afterIds.has(id));
    const exactExpectedDiff=newIds.length===8&&newMatchingIds.length===8&&newIds.every(id=>newMatchingIds.includes(id));
    report.oldPublicFxPreserved=Object.entries(before.fxRowTexts).every(([id,text])=>after.fxRowTexts[id]===text);if(!report.oldPublicFxPreserved)report.status='FAIL';
    report.incrementalPersistence={newPublicTuples:newFx.length,newIds:newIds.length,newMatchingExpectedIds:newMatchingIds.length,status:exactExpectedDiff?'PASS':'LIMITED',scope:'Exactly eight new IDs, still present in the final snapshot and matching the expected source/rate/timestamp, prove a new INSERT. All earlier FX rows must remain byte-equivalent in PostgreSQL JSONB text. Existing matches alone do not prove insertion; UNIQUE collisions are swallowed by the service.'};
    report.marketDataCacheUnchanged=before.auxiliary.market_data_cache.sha256===after.auxiliary.market_data_cache.sha256;if(!report.marketDataCacheUnchanged)report.status='FAIL';
    if(report.status==='PASS'&&!exactExpectedDiff)report.status='LIMITED';
  }catch(error){report.status='FAIL';report.snapshotFailure=safeNativeFailure(error,'Post-quote read-only snapshot');}}
  try{report.sourceStable=JSON.stringify(await manifest())===JSON.stringify(report.sourceManifest);if(!report.sourceStable)report.status='FAIL';}catch{report.status='FAIL';report.sourceStable=false;}
  report.finishedAt=new Date().toISOString();await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({status:report.status,httpStatus:report.httpStatus,canonicalUnchanged:report.canonicalUnchanged,report:destination}));if(report.status==='FAIL')process.exitCode=1;
}
