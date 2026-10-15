/** Local/synthetic verification only. Never runs db:push, db:reset, deploy or live payments. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const day=new Date().toISOString().slice(0,10).replaceAll('-','');
const output=path.resolve(process.env.ZARIX_EVIDENCE_DIR||path.join(root,`docs/tif/v2.13/evidence/technical-${day}/core`));
await fs.mkdir(output,{recursive:true});
const databaseEvidence=await fs.mkdtemp('/tmp/zarix-isolated-verification-');
const digest=b=>createHash('sha256').update(b).digest('hex');
async function manifest(){
 const files=[];
 async function walk(dir){for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const f=path.posix.join(dir,e.name);if(e.isDirectory())await walk(f);else if(e.isFile())files.push(f);}}
 for(const dir of ['app','components','lib','types','scripts','supabase','__tests__','.github'])await walk(dir);
 for(const file of ['package.json','package-lock.json','tsconfig.json','next.config.js','vitest.config.ts','vercel.json','.env.example','middleware.ts','tailwind.config.ts','postcss.config.js','.eslintrc.json'])files.push(file);
 const values=[];for(const file of files.sort())values.push({path:file,sha256:digest(await fs.readFile(path.join(root,file)))});return values;
}
const before=await manifest();
const isolatedBuild=process.env.ZARIX_ISOLATED_TEST_BUILD==='1';
if(isolatedBuild){
 const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL||'');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Verification build must use an exact loopback origin');
 if(!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Private isolated build environment is incomplete');
}
let codeRevision=null,sourceWorkingTreeClean=null;
try {
 codeRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const changed=execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean).map(line=>line.slice(3));
 sourceWorkingTreeClean=!changed.some(file=>before.some(source=>source.path===file));
} catch { /* Manifest hashes remain available if git is absent in the executor. */ }
const commands=[
 ['npm-ci','npm',['ci']],['typecheck','npm',['run','typecheck']],['lint','npm',['run','lint']],
 ['coverage','npm',['run','test:coverage','--','--reporter=json',`--outputFile=${path.join(output,'final-vitest.json')}`]],
 ['native-harness-syntax','node',['--check','scripts/test-isolated-native-supabase.mjs']],
 ['traceability-regression','python3',['scripts/test-technical-traceability.py']],
 ['test-db','npm',['run','test:db']],['build','npm',['run','build']],['dependency-audit','npm',['audit','--json']],
 ['balance-sql','node',['scripts/test-balance-trigger.mjs']],['shared-sql','node',['scripts/test-shared-expenses-sql.mjs']],
 ['plan-sql','node',['scripts/test-plan-limits.mjs']],['durable-sql','node',['scripts/test-durable-financial-operations.mjs']],
 ['import-sql','node',['scripts/test-durable-import.mjs']],
 ['account-recompute-sql','node',['scripts/test-atomic-account-recompute.mjs']],
 ['full-schema-sql','node',['scripts/test-isolated-database.mjs',`--output-dir=${databaseEvidence}`]],
 ['performance','node',['scripts/test-isolated-performance.mjs']],
];
const records=[];
for(const [name,command,args] of commands){
 const startedAt=new Date().toISOString(),start=Date.now();
 const stdout=await fs.open(path.join(output,`${name}.log`),'w');const stderr=await fs.open(path.join(output,`${name}.stderr.log`),'w');
 const commandEnv={...process.env,ZARIX_PERFORMANCE_REPORT:path.join(output,'performance.json'),...(name==='build'&&!isolatedBuild?{NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder-anon-key',SUPABASE_SERVICE_ROLE_KEY:'placeholder-service-role-key'}:{})};
 const exitCode=await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,env:commandEnv,stdio:['ignore',stdout.fd,stderr.fd]});child.on('error',reject);child.on('close',code=>resolve(code));});
 await stdout.close();await stderr.close();
 records.push({name,command:[command,...args],startedAt,finishedAt:new Date().toISOString(),durationMs:Date.now()-start,exitCode,status:exitCode===0?'PASS':'FAIL'});
 console.log(`${name}: ${exitCode===0?'PASS':'FAIL'} (${exitCode})`);
 if(['balance-sql','shared-sql','plan-sql','durable-sql','import-sql','account-recompute-sql','dependency-audit'].includes(name))await fs.copyFile(path.join(output,`${name}.log`),path.join(output,`${name}.json`));
}
for(const [from,to] of [['coverage/coverage-summary.json','coverage-summary.json'],[path.join(databaseEvidence,'database-verification.json'),'database-verification.json']]){
 try{await fs.copyFile(path.isAbsolute(from)?from:path.join(root,from),path.join(output,to));}catch(error){records.push({name:`copy:${to}`,status:'FAIL',error:error.message});}
}
const after=await manifest();const sourceStable=JSON.stringify(before)===JSON.stringify(after);
const report={runAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,codeRevision,sourceWorkingTreeClean,buildEnvironment:isolatedBuild?'Explicit isolated loopback Supabase; exact origin baked into browser assets, private credentials excluded from report':'Explicit dummy Supabase URL/keys, identical to CI; no authenticated build integration',sourceStable,sourceManifestSha256:digest(JSON.stringify(before)),sourceManifest:before,commands:records,scope:'Synthetic local SQL and explicit provider/browser doubles. Native Auth/PostgREST, browser journeys and real provider checks have separate reports; this aggregate alone does not establish their acceptance. Audit FAIL is retained, not suppressed.'};
await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
if(!sourceStable||records.some(r=>r.status==='FAIL'&&r.name!=='dependency-audit'))process.exitCode=1;
