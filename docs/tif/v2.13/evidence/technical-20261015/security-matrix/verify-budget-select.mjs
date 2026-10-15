// One read-only correction of the DATE query; never rerun financial writes.
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
const digest=value=>createHash('sha256').update(value).digest('hex');
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
const budget=prior.ownFixtures.B.find(row=>row.table==='budgets'); assert.ok(budget);
const output='/tmp/zarix-runtime-20261015/security-matrix-budget-read';
await fs.mkdir(output,{recursive:true,mode:0o700});
const destination=path.join(output,'budget-select.json');
assert.ok(!await fs.access(destination).then(()=>true,()=>false),'Never overwrite earlier evidence');
const report={startedAt:new Date().toISOString(),caseId:'CP2-19',resource:'budgets',layer:'API',operation:'SELECT_U2',status:'RUNNING',scope:'One corrected read-only API SELECT, normal A/B sessions, no new fixtures or writes; the earlier48-cell attempt is preserved unchanged',query:{month:'2099-01-01'},target:{app:app.origin,api:apiUrl.origin,postgresPort:databaseUrl.port},normalVerifiedUsers:0};
try {
  const clients=[];
  const fetchLocal=(url,init={})=>{const headers=new Headers(init.headers);headers.set('Connection','close');return isolatedApiFetch(url,{...init,headers});};
  for (const credential of fixture.users) {
    const jar=new Map();
    const client=createServerClient(apiUrl.href,env.ZARIX_E2E_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))},global:{fetch:fetchLocal}});
    const signed=await client.auth.signInWithPassword({email:credential.email,password:credential.password}); assert.equal(signed.error,null);
    assert.equal((await client.auth.getUser()).data.user.id,credential.id); clients.push({client,jar,id:credential.id}); report.normalVerifiedUsers++;
  }
  const [a,b]=clients;
  const readBudget=async()=>{const r=await b.client.from('budgets').select('*').eq('id',budget.id).single();assert.equal(r.error,null);assert.equal(r.data.user_id,b.id);return r.data;};
  const before=await readBudget(); report.before={sha256:digest(JSON.stringify(before)),columns:Object.keys(before).sort(),rows:1};
  const response=await isolatedApiFetch(new URL('/api/budgets?month=2099-01-01',app),{headers:{Cookie:[...a.jar].map(([name,value])=>`${name}=${value}`).join('; '),Connection:'close'},signal:AbortSignal.timeout(20000)});
  report.httpStatus=response.status; assert.equal(response.status,200);
  const rows=await response.json(); assert.ok(Array.isArray(rows)); assert.ok(!rows.some(row=>row.id===budget.id||row.user_id===b.id));
  report.observation={status:200,foreignRows:0,contract:'The collection is scoped to session A; a valid DATE month does not expose B rows'};
  const after=await readBudget(); report.after={sha256:digest(JSON.stringify(after)),rows:1}; assert.equal(report.after.sha256,report.before.sha256);
  report.bSnapshotUnchanged=true;
  report.sourceManifest=await Promise.all(['app/api/budgets/route.ts','lib/services/budgets.ts','lib/api-handler.ts'].map(async file=>({path:file,sha256:digest(await fs.readFile(path.join(root,file)))})));
  report.revision=spawnSync('git',['rev-parse','HEAD'],{env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},encoding:'utf8'}).stdout.trim();
  report.runnerSha256=digest(await fs.readFile(fileURLToPath(import.meta.url))); report.status='PASS';
} catch(error) {report.status='FAIL';report.failure=safeNativeFailure(error,'Corrected budget API SELECT only');}
report.finishedAt=new Date().toISOString();
await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:report.status,report:destination})); if(report.status==='FAIL')process.exitCode=1;
