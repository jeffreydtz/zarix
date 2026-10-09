/** Local/synthetic verification only. Never runs db:push, db:reset, deploy or live payments. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.env.ZARIX_EVIDENCE_DIR||path.join(root,'docs/tif/v2.13/evidence/technical-20261009'));
await fs.mkdir(output,{recursive:true});
const digest=b=>createHash('sha256').update(b).digest('hex');
async function manifest(){
 const files=[];
 async function walk(dir){for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const f=path.posix.join(dir,e.name);if(e.isDirectory())await walk(f);else if(e.isFile())files.push(f);}}
 for(const dir of ['app','components','lib','types','scripts','supabase','__tests__','.github'])await walk(dir);
 for(const file of ['package.json','package-lock.json','tsconfig.json','next.config.js','vitest.config.ts','vercel.json','.env.example'])files.push(file);
 const values=[];for(const file of files.sort())values.push({path:file,sha256:digest(await fs.readFile(path.join(root,file)))});return values;
}
const before=await manifest();
const commands=[
 ['npm-ci','npm',['ci']],['typecheck','npm',['run','typecheck']],['lint','npm',['run','lint']],
 ['coverage','npm',['run','test:coverage','--','--reporter=json',`--outputFile=${path.join(output,'final-vitest.json')}`]],
 ['native-harness-syntax','node',['--check','scripts/test-isolated-native-supabase.mjs']],
 ['test-db','npm',['run','test:db']],['build','npm',['run','build']],['dependency-audit','npm',['audit','--json']],
 ['balance-sql','node',['scripts/test-balance-trigger.mjs']],['shared-sql','node',['scripts/test-shared-expenses-sql.mjs']],
 ['plan-sql','node',['scripts/test-plan-limits.mjs']],['durable-sql','node',['scripts/test-durable-financial-operations.mjs']],
 ['import-sql','node',['scripts/test-durable-import.mjs']],
 ['full-schema-sql','node',['scripts/test-isolated-database.mjs','--output-dir=/tmp/zarix-final-isolated-evidence']],
 ['performance','node',['scripts/test-isolated-performance.mjs']],
];
const records=[];
for(const [name,command,args] of commands){
 const startedAt=new Date().toISOString(),start=Date.now();
 const stdout=await fs.open(path.join(output,`${name}.log`),'w');const stderr=await fs.open(path.join(output,`${name}.stderr.log`),'w');
 const commandEnv=name==='build'?{...process.env,NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder-anon-key',SUPABASE_SERVICE_ROLE_KEY:'placeholder-service-role-key'}:process.env;
 const exitCode=await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,env:commandEnv,stdio:['ignore',stdout.fd,stderr.fd]});child.on('error',reject);child.on('close',code=>resolve(code));});
 await stdout.close();await stderr.close();
 records.push({name,command:[command,...args],startedAt,finishedAt:new Date().toISOString(),durationMs:Date.now()-start,exitCode,status:exitCode===0?'PASS':'FAIL'});
 console.log(`${name}: ${exitCode===0?'PASS':'FAIL'} (${exitCode})`);
 if(['balance-sql','shared-sql','plan-sql','durable-sql','import-sql','dependency-audit'].includes(name))await fs.copyFile(path.join(output,`${name}.log`),path.join(output,`${name}.json`));
}
for(const [from,to] of [['coverage/coverage-summary.json','coverage-summary.json'],['/tmp/zarix-final-isolated-evidence/database-verification.json','database-verification.json'],['/tmp/zarix-isolated-performance.json','performance.json']]){
 try{await fs.copyFile(path.isAbsolute(from)?from:path.join(root,from),path.join(output,to));}catch(error){records.push({name:`copy:${to}`,status:'FAIL',error:error.message});}
}
const after=await manifest();const sourceStable=JSON.stringify(before)===JSON.stringify(after);
const report={runAt:new Date().toISOString(),node:process.version,platform:process.platform,buildEnvironment:'Explicit dummy Supabase URL/keys, identical to CI; no authenticated build integration',baselineCommit:'ed894431968775dba1d9ba01df99d9a442407865',sourceStable,sourceManifestSha256:digest(JSON.stringify(before)),sourceManifest:before,commands:records,scope:'Synthetic local SQL and explicit provider/browser doubles. Auth/PostgREST/UI/native-concurrency remain separately blocked; audit FAIL is retained, not suppressed.'};
await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
if(!sourceStable||records.some(r=>r.status==='FAIL'&&r.name!=='dependency-audit'))process.exitCode=1;
