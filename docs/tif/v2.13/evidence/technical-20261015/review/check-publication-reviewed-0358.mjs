import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import dotenv from '/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix/node_modules/dotenv/lib/main.js';
const root='/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix',base='/tmp/zarix-runtime-20261015';
const secretName=/(?:password|(?:^|_)token|accessToken|refreshToken|recoveryHash|token_hash|service.?role.?key|anon.?key|cron.?secret|database.?url|shareToken)$/i;
const values=new Set();
const add=(name,value)=>{if(secretName.test(name)&&typeof value==='string'&&value.length>=8)values.add(value);};
function walk(x){if(!x||typeof x!=='object')return;if(typeof x.name==='string'&&/auth-token/.test(x.name)&&typeof x.value==='string'&&x.value.length>=8)values.add(x.value);for(const[k,v]of Object.entries(x)){add(k,v);walk(v);}}
for(const name of ['runtime.env','source.env','restore.env','load.env','e2e.env','e2e-app.env','load-app.env','e2e-app-live-quotes.env','e2e-app-fallback-quotes.env','proof.env','proof-app.env','import-target.env','import-target-app.env']){
 const file=path.join(base,name);if(await fs.access(file).then(()=>true,()=>false))for(const[k,v]of Object.entries(dotenv.parse(await fs.readFile(file))))add(k,v);
}
for(const name of ['e2e-logins.json','source-native-logins.json','load-fixture.json','offline-durability-state.json','proof-logins.json','import-target-logins.json','proof-auth-negative.json','proof-expired-browser.json','proof-recovery-private/fixture.json','proof-auth-expiry-private/expired-session-cookies.json','proof-auth-expiry-resume/normal-session-cookies.json','proof-auth-expiry-private-attempt-2/normal-cookies-before.json','proof-auth-expiry-private-attempt-2/expired-session-cookies.json']){
 const file=path.join(base,name);if(await fs.access(file).then(()=>true,()=>false))walk(JSON.parse(await fs.readFile(file,'utf8')));
}
const listed=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'},encoding:'utf8'});if(listed.status)throw new Error('File enumeration failed');
const files=[...new Set(listed.stdout.split('\0').filter(Boolean))];let checked=0;const findings=[];
for(const file of files){let bytes;try{bytes=await fs.readFile(path.join(root,file));}catch{continue;}checked++;if([...values].some(value=>bytes.includes(Buffer.from(value))))findings.push({path:file,rule:'exact-existing-private-value'});}
const report={checkedAt:new Date().toISOString(),privateValuesCompared:values.size,files:checked,findings,status:findings.length?'FAIL':'PASS',scope:'Exact-value comparison against existing private local runtime environment credentials and password/token fields in the explicit private fixture files, including expired/reused recovery and expired/normal SSR cookie fixtures. Values, hashes of values and matching excerpts are never published. Includes tracked and non-ignored untracked repository files, not ignored build assets or external files; no claim of universal absence of secrets.'};
const out=path.join(root,'docs/tif/v2.13/evidence/technical-20261015/review/exact-private-value-scan-0358.json');await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
