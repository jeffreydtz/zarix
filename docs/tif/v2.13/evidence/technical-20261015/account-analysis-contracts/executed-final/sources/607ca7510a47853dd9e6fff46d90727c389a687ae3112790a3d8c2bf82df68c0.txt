// Test-only canary: the already-installed loopback fetch guard must deny it.
// No credential, Google request, socket, provider outage or calculation is implied.
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, statSync, openSync, writeSync, fsyncSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runtimeProfile } from './runtime-profile.mjs';

const runtime='/tmp/zarix-runtime-20261015',profile=runtimeProfile();
assert.equal(process.env.ZARIX_FINAL_GEMINI_MODE,'guarded-local-unavailable');
assert.equal(realpathSync(process.cwd()),realpathSync(profile.copyRoot));
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:58321');
assert.ok(process.argv.includes('start')&&process.argv.includes('3002'));
const clock=process.env.ZARIX_FINAL_CLOCK_ENABLE==='runtime-start-window';
const prefix=clock?profile.clockGeminiPrefix:profile.normalGeminiPrefix;assert.ok(prefix);
const proofFile=runtime+'/'+prefix+'-gemini-unavailable.json';
assert.equal(process.env.ZARIX_FINAL_GEMINI_PROOF_FILE,proofFile);
assert.ok(!Object.entries(process.env).some(([name,value])=>/GEMINI|GOOGLE.*API.*KEY/i.test(name)&&!name.startsWith('ZARIX_FINAL_')&&value),'No Gemini credential may enter this controlled process');
const proof=JSON.parse(readFileSync(runtime+'/'+profile.artifactPrefix+'-build-proof.json','utf8'));
assert.equal(proof.runtimeProfile,profile.buildProfile??profile.name);assert.equal(proof.coreDirectory,profile.coreDirectory);assert.equal(proof.exitCode,0);assert.equal(realpathSync(proof.copyRoot),realpathSync(process.cwd()));
for(const entry of proof.sources)assert.equal(createHash('sha256').update(readFileSync(entry.path)).digest('hex'),entry.sha256);
assert.equal(readFileSync('.next/BUILD_ID','utf8').trim(),proof.buildId);
const guardFile='/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix/scripts/lib/restored-read-fetch-guard.mjs';
assert.equal(createHash('sha256').update(readFileSync(guardFile)).digest('hex'),proof.fetchGuardSha256);
assert.equal(globalThis.fetch.name,'guardedFetch','The reviewed guard must already be active before a canary is even attempted');
const audit=process.env.ZARIX_RESTORE_FETCH_GUARD_LOG;
assert.equal(audit,'/tmp/zarix-restored-read-fetch-guard-'+profile.artifactPrefix+'-20261015.jsonl');
assert.equal(statSync(audit).mode&0o777,0o600);
const beforeAuditSize=statSync(audit).size;
const guardedFetch=globalThis.fetch;
const journalFile=runtime+'/'+prefix+'-gemini-attempts.jsonl';
const journal=openSync(journalFile,'wx',0o600);
const geminiHost=hostname=>hostname==='generativelanguage.googleapis.com'||hostname==='aiplatform.googleapis.com'||hostname.endsWith('-aiplatform.googleapis.com');
let phase='denial-canary';
globalThis.fetch=async function trackedGuardedFetch(input,init){
  let url;try{url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);}catch{/* The reviewed guard handles malformed input. */}
  if(url&&geminiHost(url.hostname)){
    writeSync(journal,JSON.stringify({phase,origin:url.origin,monotonicNs:process.hrtime.bigint().toString(),nextPid:process.pid})+'\n');
    fsyncSync(journal);
  }
  return guardedFetch(input,init);
};
let denied=false;
try{await globalThis.fetch('https://generativelanguage.googleapis.com/v1beta/models');}
catch(error){assert.equal(error.name,'TypeError');assert.match(error.message,/permits only loopback/);denied=true;}
assert.equal(denied,true,'Never continue if the guard fails to reject the bare no-credential canary');
const appended=readFileSync(audit).subarray(beforeAuditSize).toString().trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
assert.ok(appended.some(entry=>entry.allowed===false&&String(entry.origin).includes('generativelanguage.googleapis.com')));
phase='after-canary-before-or-during-application';
const record={status:'PREPARED_GUARDED_UNAVAILABLE',mode:'configured-unavailable',nextPid:process.pid,
  buildId:proof.buildId,revision:proof.revision,sourceStable:true,sourceManifestSha256:proof.sourceManifestSha256,
  command:process.argv,instrumentationSha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  guardSha256:proof.fetchGuardSha256,noGeminiEnvironmentCredential:true,
  canary:{origin:'https://generativelanguage.googleapis.com',credentialsOrHeadersProvided:false,rejectedByInstalledLoopbackGuard:true,nativeDispatchPreventedByReviewedGuard:true,auditAppendSha256:createHash('sha256').update(JSON.stringify(appended)).digest('hex')},
  journalFile,journalInitialEntries:1,calculationExecuted:false,
  acceptanceRequired:'A later bounded successful normal GET /api/ai/projections must compare this same process journal before/after and prove zero additional Gemini-host attempts. Per-user stored credential absence must be checked separately in its private SQL fixture; no environment-only acceptance.',
  scope:'Local test denial of Gemini global fetch only; no real Google outage/network call or universal TCP/firewall claim. This preload does not itself accept CP3-16. Other clients and sockets are outside its instrumentation.'};
const fd=openSync(proofFile,'wx',0o600);writeSync(fd,JSON.stringify(record,null,2)+'\n');fsyncSync(fd);
