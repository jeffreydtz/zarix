// Three negative UPDATE requests only, reusing the preserved own B fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createServerClient } from '@supabase/ssr';
import { isolatedNativeTargets, isolatedApiFetch, safeNativeFailure } from '../../../../../../scripts/lib/test-isolated-native-target.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../../..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const env=dotenv.parse(await fs.readFile('/tmp/zarix-runtime-20261015/e2e.env'));
const {apiUrl,databaseUrl}=isolatedNativeTargets({ZARIX_ISOLATED_DATABASE_CONFIRM:'synthetic-only',ZARIX_LOCAL_SUPABASE_URL:env.ZARIX_E2E_SUPABASE_URL,ZARIX_LOCAL_DATABASE_URL:env.ZARIX_E2E_DATABASE_URL});
assert.equal(`${apiUrl.origin}:${databaseUrl.hostname}:${databaseUrl.port}`,'http://127.0.0.1:57321:127.0.0.1:57322');
const app=new URL('http://127.0.0.1:3000');
const privateLogins='/tmp/zarix-runtime-20261015/e2e-logins.json';
assert.equal((await fs.stat(privateLogins)).mode&0o077,0);
const fixture=JSON.parse(await fs.readFile(privateLogins,'utf8'));
assert.equal(fixture.purpose,'isolated-api-e2e-replica'); assert.equal(fixture.users.length,2);
const prior=JSON.parse(await fs.readFile('/tmp/zarix-runtime-20261015/security-matrix-attempt2/cp2-19.json','utf8'));
assert.equal(prior.caseId,'CP2-19'); assert.equal(prior.before.sha256,prior.after.sha256);
const output=process.env.ZARIX_SECURITY_UPDATE_OUTPUT || '/tmp/zarix-runtime-20261015/security-matrix-http-correction';
await fs.mkdir(output,{recursive:true,mode:0o700});
const destination=path.join(output,'foreign-updates.json');
assert.ok(!await fs.access(destination).then(()=>true,()=>false),'Never overwrite earlier evidence');
const report={startedAt:new Date().toISOString(),caseId:'CP2-19',status:'RUNNING',scope:'Only three valid foreign-ID UPDATE requests after the HTTP mapping correction; reuse archived B rows, which remain readable by their normal owner. No fixture creation, new identities, preference changes, SOURCE/RESTORE/LOAD or quotation reads.',target:{app:app.origin,api:apiUrl.origin,postgresPort:databaseUrl.port},results:[],normalVerifiedUsers:0};
const paths=['app/api/investments/[id]/route.ts','lib/services/investments.ts','app/api/recurring/[id]/route.ts','app/api/budgets/[id]/route.ts','lib/services/budgets.ts','lib/api-handler.ts'];
const manifest=()=>Promise.all(paths.map(async file=>({path:file,sha256:sha(await fs.readFile(path.join(root,file)))})));
try {
  report.sourceManifest=await manifest();
  report.revision=spawnSync('git',['rev-parse','HEAD'],{env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},encoding:'utf8'}).stdout.trim();
  report.runnerSha256=sha(await fs.readFile(fileURLToPath(import.meta.url)));
  const clients=[];
  const fetchLocal=(url,init={})=>{const headers=new Headers(init.headers);headers.set('Connection','close');return isolatedApiFetch(url,{...init,headers});};
  for (const credential of fixture.users) {
    const jar=new Map();
    const client=createServerClient(apiUrl.href,env.ZARIX_E2E_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))},global:{fetch:fetchLocal}});
    const signed=await client.auth.signInWithPassword({email:credential.email,password:credential.password}); assert.equal(signed.error,null);
    assert.equal((await client.auth.getUser()).data.user.id,credential.id);
    const claims=JSON.parse(Buffer.from(signed.data.session.access_token.split('.')[1],'base64url')); assert.equal(claims.role,'authenticated'); assert.equal(claims.sub,credential.id);
    clients.push({client,jar,id:credential.id}); report.normalVerifiedUsers++;
  }
  const [a,b]=clients;
  const definitions=[{table:'investments',base:'/api/investments',method:'PATCH',body:{name:'Security foreign ownership check'}},{table:'recurring_rules',base:'/api/recurring',method:'PUT',body:{description:'Security foreign ownership check'}},{table:'budgets',base:'/api/budgets',method:'PUT',body:{amount:2}}];
  const read=async(table,id)=>{const r=await b.client.from(table).select('*').eq('id',id).single();assert.equal(r.error,null);assert.equal(r.data.user_id,b.id);return r.data;};
  const snapshot=async()=>{
    const rows=await Promise.all(definitions.map(async d=>{const fixtureRow=prior.ownFixtures.B.find(r=>r.table===d.table);assert.ok(fixtureRow);const row=await read(d.table,fixtureRow.id);return[d.table,{rows:1,sha256:sha(JSON.stringify(row)),columns:Object.keys(row).sort()}];}));
    return {sha256:sha(JSON.stringify(rows)),tables:Object.fromEntries(rows)};
  };
  report.before=await snapshot();
  for(const d of definitions){
    const row=prior.ownFixtures.B.find(r=>r.table===d.table);
    const baseline=await snapshot();
    const entry={resource:d.table,layer:'API',operation:'UPDATE_U2',method:d.method,path:`${d.base}/${row.id}`,status:'RUNNING',before:baseline}; report.results.push(entry);
    try {
      const response=await isolatedApiFetch(new URL(entry.path,app),{method:d.method,headers:{Cookie:[...a.jar].map(([name,value])=>`${name}=${value}`).join('; '),Connection:'close','Content-Type':'application/json'},body:JSON.stringify(d.body),signal:AbortSignal.timeout(20000)});
      entry.httpStatus=response.status; entry.responseSha256=sha(await response.text()); assert.equal(response.status,404);
      entry.status='PASS';entry.observation='Valid foreign-ID UPDATE maps the owner-scoped missing row to404';
    }catch(error){entry.status='FAIL';entry.failure=safeNativeFailure(error,`${d.table}/API/UPDATE_U2`);}
    entry.after=await snapshot();entry.bSnapshotUnchanged=entry.after.sha256===baseline.sha256;
    if(!entry.bSnapshotUnchanged){entry.status='FAIL';throw new Error('An owned B fixture changed; stop and preserve');}
  }
  report.after=await snapshot(); assert.equal(report.after.sha256,report.before.sha256);
  report.sourceStable=JSON.stringify(await manifest())===JSON.stringify(report.sourceManifest);assert.ok(report.sourceStable);
  report.status=report.results.every(r=>r.status==='PASS')?'PASS':'FAIL';
}catch(error){report.status='FAIL';report.failure=safeNativeFailure(error,'Foreign UPDATE correction');}
report.finishedAt=new Date().toISOString();
report.counts=report.results.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{});
await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:report.status,counts:report.counts,report:destination}));if(report.status==='FAIL')process.exitCode=1;
