// Temporarily change only the existing synthetic57910 fixture control, then restore exact bytes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const sha=x=>createHash('sha256').update(x).digest('hex');
assert.equal(process.env.ZARIX_INVESTMENT_OFFLINE_PHASE,'authorized-owned-57910-temporary');
const here=path.dirname(fileURLToPath(import.meta.url)),runtime='/tmp/zarix-runtime-20261015';
const stateFile=path.join(runtime,'proof-quote-server-state.json'),control=path.join(runtime,'proof-quote-mode.json');
const serverSource=path.join(here,'../fresh-proof/quote-fixture-server.mjs');
const serverBytes=await fs.readFile(serverSource),serverSha=sha(serverBytes);
// Pin the reviewed source bytes for this phase; no claim is made that an older
// preparation manifest included the subsequently added provider fixture.
assert.equal(serverSha,'fafb616944489fbc58592137e99b2c925c49494529a73348dfd8d6994b9ddee7');
const verifyOwner=async()=>{const state=JSON.parse(await fs.readFile(stateFile,'utf8'));assert.equal(state.pid,53373);assert.equal(state.purpose,'synthetic-proof-quotes');assert.equal(state.origin,'http://127.0.0.1:57910');assert.equal(sha(await fs.readFile(serverSource)),serverSha);const command=spawnSync('/bin/ps',['-p','53373','-o','args='],{encoding:'utf8'});assert.equal(command.status,0);assert.ok(command.stdout.includes('quote-fixture-server.mjs'));const listener=spawnSync('/usr/sbin/lsof',['-nP','-a','-p','53373','-iTCP:57910','-sTCP:LISTEN','-Fpn'],{encoding:'utf8'});assert.equal(listener.status,0);assert.ok(listener.stdout.split('\n').includes('n127.0.0.1:57910'));};
await verifyOwner();const original=await fs.readFile(control);assert.equal((await fs.stat(control)).mode&0o077,0);const phase=path.join(runtime,`investment-quote-phase-${randomUUID()}`);await fs.mkdir(phase,{mode:0o700});await fs.writeFile(path.join(phase,'original-mode.private.json'),original,{mode:0o600});
const report={startedAt:new Date().toISOString(),scope:'Existing explicitly synthetic local57910 fixture only; no provider or financial DML in phase controller',ownerPid:53373,serverSourceSha256:serverSha,originalModeSha256:sha(original),steps:[],restored:false};
let changed=false;try{const controlProbe=await fetch('http://127.0.0.1:57910/simple/price?ids=bitcoin&vs_currencies=usd,ars',{redirect:'error',signal:AbortSignal.timeout(5000)});const controlBody=await controlProbe.text();report.controlBefore={status:controlProbe.status,responseSha256:sha(controlBody),classification:'Observed200 is not an offline503 proof'};await verifyOwner();const temporary=path.join(runtime,`proof-quote-mode-${randomUUID()}.tmp`);await fs.writeFile(temporary,JSON.stringify({...JSON.parse(original),mode:'offline503'})+'\n',{mode:0o600});changed=true;await fs.rename(temporary,control);
 for(const [script,extra]of[['prepare-quote-proof.mjs',{ZARIX_INVESTMENT_QUOTE_PROBE:'authorized-fifth-local-double-only'}],['run.mjs',{ZARIX_INVESTMENT_QUOTE_PROOF:path.join(runtime,'investment-quote-proof.json')}]] ){
  const child=spawnSync(process.execPath,[path.join(here,script),...(script==='run.mjs'?['--case','CP4-07','--api-only']:[])],{env:{...process.env,ZARIX_ISOLATED_DATABASE_CONFIRM:'synthetic-only',ZARIX_INVESTMENT_WINDOW:'after-ci4-and-finance',...extra},encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
  await fs.writeFile(path.join(phase,script+'.stdout.private.log'),child.stdout||'',{mode:0o600});await fs.writeFile(path.join(phase,script+'.stderr.private.log'),child.stderr||'',{mode:0o600});let result;try{result=JSON.parse((child.stdout||'').trim().split('\n').at(-1));}catch{}report.steps.push({script,exitCode:child.status,result});assert.equal(child.status,0,'Controlled phase child failed; raw private diagnostics withheld');
 }
}finally{if(changed){const replacement=path.join(runtime,`proof-quote-mode-restore-${randomUUID()}.tmp`);await fs.writeFile(replacement,original,{mode:0o600});await fs.rename(replacement,control);}report.restored=sha(await fs.readFile(control))===sha(original);report.finalModeSha256=sha(await fs.readFile(control));await verifyOwner();report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(phase,'verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});assert.equal(report.restored,true,'Exact original synthetic control bytes must be restored');console.log(JSON.stringify({output:path.basename(phase),restored:report.restored,steps:report.steps}));}
