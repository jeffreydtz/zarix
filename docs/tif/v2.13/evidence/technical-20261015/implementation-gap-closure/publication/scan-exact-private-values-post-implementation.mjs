// Separate post-implementation exact check; historical scanner and reports stay immutable.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import dotenv from '/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix/node_modules/dotenv/lib/main.js';

async function main() {
  async function readPrivateJson(file) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      // A JSON parser error can include input bytes. Never propagate its details.
      throw new Error('Private JSON fixture unavailable or malformed; details suppressed');
    }
  }
  const root='/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix',base='/tmp/zarix-runtime-20261015';
  const reportName=process.argv[2]??'exact-private-value-scan-post-implementation-20261015.json';
  if(!/^[a-z0-9-]+\.json$/.test(reportName))throw new Error('Report name must be a local JSON basename');
  const out=path.join(root,'docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/publication',reportName);
  if(await fs.access(out).then(()=>true,()=>false))throw new Error('Preserve the existing report; choose a new report name');
  const secretName=/(?:password|(?:^|_)token|accessToken|refreshToken|recoveryHash|token.?hash|service.?role.?key|anon.?key|cron.?secret|database.?url|shareToken|jwt|jwt.?secret|jwt.?keys?|jwks|api.?key|private.?key|client.?secret|(?:^|_)secret)$/i;
  const values=new Set();
  const add=(name,value)=>{if(secretName.test(name)&&typeof value==='string'&&value.length>=8)values.add(value);if(typeof value==='string'&&/(?:jwt.*key|jwks)/i.test(name)){try{walk(JSON.parse(value));}catch{}}};
  function walk(x){if(!x||typeof x!=='object')return;if(['EC','RSA','OKP','oct'].includes(x.kty))for(const field of ['d','k','p','q','dp','dq','qi'])if(typeof x[field]==='string'&&x[field].length>=8)values.add(x[field]);if(typeof x.name==='string'&&/auth-token/.test(x.name)&&typeof x.value==='string'&&x.value.length>=8)values.add(x.value);for(const[k,v]of Object.entries(x)){add(k,v);walk(v);}}
  for(const name of ['runtime.env','source.env','restore.env','load.env','e2e.env','e2e-app.env','load-app.env','e2e-app-live-quotes.env','e2e-app-fallback-quotes.env','proof.env','proof-app.env','import-target.env','import-target-app.env','contract-clock-app.env','final-proof-app.env','closure-proof-app.env','account-analysis-proof.env','restored-read-app.env','empty-proof.env','empty-proof-app.env']){
   const file=path.join(base,name);if(await fs.access(file).then(()=>true,()=>false))for(const[k,v]of Object.entries(dotenv.parse(await fs.readFile(file))))add(k,v);
  }
  for(const name of ['e2e-logins.json','source-native-logins.json','load-fixture.json','offline-durability-state.json','proof-logins.json','import-target-logins.json','proof-auth-negative.json','proof-expired-browser.json','proof-recovery-private/fixture.json','proof-auth-expiry-private/expired-session-cookies.json','proof-auth-expiry-resume/normal-session-cookies.json','proof-auth-expiry-private-attempt-2/normal-cookies-before.json','proof-auth-expiry-private-attempt-2/expired-session-cookies.json','cnf12-private/reservation.private.json','cnf12-private/targets.json','cnf12-private/lifecycle-complete.private.json','empty-account-private/database-preparation.json','empty-account-private/database-reservation.private.json','empty-account-private/existing-native-service-material.private.json','empty-account-private/auth-environment.private.json','empty-account-private/targets.json']){
   const file=path.join(base,name);if(await fs.access(file).then(()=>true,()=>false))walk(await readPrivateJson(file));
  }
  for(const entry of await fs.readdir(base,{withFileTypes:true})){
   if(entry.isDirectory()&&/^auth-valid-recovery-[0-9a-f-]{36}$/i.test(entry.name)){
    const file=path.join(base,entry.name,'password-restoration.private.json');
    if(await fs.access(file).then(()=>true,()=>false)){
     const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077))throw new Error('Private checkpoint permissions changed');
     walk(await readPrivateJson(file));
    }
   }
  }
  const listed=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},encoding:'utf8'});if(listed.status)throw new Error('File enumeration failed');
  const files=[...new Set(listed.stdout.split('\0').filter(Boolean))];let checked=0;const findings=[];
  for(const file of files){let bytes;try{bytes=await fs.readFile(path.join(root,file));}catch{continue;}checked++;if([...values].some(value=>bytes.includes(Buffer.from(value))))findings.push({path:file,rule:'exact-existing-private-value'});}
  const report={checkedAt:new Date().toISOString(),reproductionCommand:`node docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/publication/scan-exact-private-values-post-implementation.mjs ${reportName}`,scannerSha256:createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex'),privateValuesCompared:values.size,files:checked,findings,status:findings.length?'FAIL':'PASS',scope:'Exact-value comparison against existing private local runtime environment credentials and password/token fields in the explicit private fixture files, including expired/reused recovery and expired/normal SSR cookie fixtures, selected local JWT/JWKS material, owned auth-valid-recovery UUID password-restoration checkpoints and private JWK scalar fields (d/k/p/q/dp/dq/qi). Values, hashes of values and matching excerpts are never published. Includes tracked and non-ignored untracked repository files, not ignored build assets or external files; no claim of universal absence of secrets.'};
  await fs.writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
  
}

main().catch(() => {
  // Never publish raw exceptions, causes, stderr fragments or private parser input.
  console.error(JSON.stringify({
    status: 'ERROR',
    reason: 'Exact publication scan did not complete; private diagnostics suppressed',
  }));
  process.exitCode = 1;
});
