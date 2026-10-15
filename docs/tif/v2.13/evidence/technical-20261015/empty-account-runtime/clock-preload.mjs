// Test-only application-process time. Never preload into build, GoTrue or the OS.
import assert from 'node:assert/strict';
import { realpathSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runtimeProfile } from './runtime-profile.mjs';

export function createFrozenDate(OriginalDate, epochMilliseconds) {
  assert.ok(Number.isFinite(epochMilliseconds));
  function FrozenDate(...args) {
    if (!new.target) return new OriginalDate(epochMilliseconds).toString();
    return Reflect.construct(OriginalDate, args.length ? args : [epochMilliseconds], new.target);
  }
  Object.setPrototypeOf(FrozenDate, OriginalDate);
  // Next15 preserves own descriptors when wrapping Date; inheritance is insufficient.
  Object.defineProperty(FrozenDate,'parse',Object.getOwnPropertyDescriptor(OriginalDate,'parse'));
  Object.defineProperty(FrozenDate,'UTC',Object.getOwnPropertyDescriptor(OriginalDate,'UTC'));
  FrozenDate.prototype=Object.create(OriginalDate.prototype,{constructor:{value:FrozenDate,writable:true,configurable:true}});
  Object.defineProperty(FrozenDate,'name',{value:'Date'});
  Object.defineProperty(FrozenDate,'now',{value:()=>epochMilliseconds,writable:true,configurable:true});
  Object.defineProperty(FrozenDate,Symbol.hasInstance,{value:function(value){return this===FrozenDate?value instanceof OriginalDate:Function.prototype[Symbol.hasInstance].call(this,value);}});
  return FrozenDate;
}

if (process.env.ZARIX_FINAL_CLOCK_ENABLE === 'runtime-start-window') {
  const OriginalDate=globalThis.Date;
  const profile=runtimeProfile();
  const fixedTime='2026-10-06T12:00:00.000Z';
  assert.equal(process.env.ZARIX_FINAL_CLOCK_FIXED_TIME,fixedTime);
  assert.equal(realpathSync(process.cwd()),realpathSync(profile.copyRoot));
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:60321');
  assert.ok(process.argv.includes('start')&&process.argv.includes('3004'),'Only the selected Next start process may install the clock');
  const proofFile='/tmp/zarix-runtime-20261015/'+profile.clockObservation;
  assert.equal(process.env.ZARIX_FINAL_CLOCK_PROOF_FILE,proofFile);
  const buildProof=JSON.parse(readFileSync('/tmp/zarix-runtime-20261015/'+profile.artifactPrefix+'-build-proof.json','utf8'));
  assert.equal(buildProof.runtimeProfile,profile.buildProfile??profile.name);assert.equal(buildProof.coreDirectory,profile.coreDirectory);assert.equal(buildProof.exitCode,0);assert.equal(realpathSync(buildProof.copyRoot),realpathSync(process.cwd()));
  for(const entry of buildProof.sources)assert.equal(createHash('sha256').update(readFileSync(entry.path)).digest('hex'),entry.sha256);
  const nativeClockAtInstall=new OriginalDate().toISOString();
  globalThis.Date=createFrozenDate(OriginalDate,OriginalDate.parse(fixedTime));
  assert.equal(new Date().toISOString(),fixedTime);
  const proof={status:'INSTALLED_IN_SELECTED_NEXT_PROCESS',nextPid:process.pid,copyRoot:process.cwd(),
    fixedTime,observedApplicationTime:new Date().toISOString(),nativeClockAtInstall,
    buildId:readFileSync('.next/BUILD_ID','utf8').trim(),revision:buildProof.revision,sourceStable:true,sourceManifestSha256:buildProof.sourceManifestSha256,command:process.argv,
    preloadSha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    scope:'Only this Node process Date()/Date.now()/new Date() without arguments are frozen. Dates with arguments, parse/UTC, native timers and performance remain normal. No OS clock, GoTrue process, browser or runner clock is changed. SSR SDK time shares this process; ordinary clients must refresh with real time before requests. This installation is not an Auth-expiration acceptance assertion.',
    realAuthControlRequired:true};
  const fd=openSync(proofFile,'wx',0o600);
  try{writeFileSync(fd,JSON.stringify(proof,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
} else {
  assert.equal(process.env.ZARIX_FINAL_CLOCK_ENABLE,undefined,'Unexpected clock activation value');
  assert.equal(process.env.ZARIX_FINAL_CLOCK_FIXED_TIME,undefined,'A date flag alone cannot enable the clock');
}
