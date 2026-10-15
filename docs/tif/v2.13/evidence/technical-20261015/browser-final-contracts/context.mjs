// Definitions only. Runtime is gated by root's serial release in createContext.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import dotenv from 'dotenv';
import {isolatedPgEnvironment} from '../../../../../../scripts/lib/test-isolated-native-target.mjs';

export const repo=fileURLToPath(new URL('../../../../../../',import.meta.url));
export const runtime='/tmp/zarix-runtime-20261015';
export const revision='84df929ab2f169251a49f3e95d0e0c148dfcb87c';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const lit=value=>"'"+String(value).replaceAll("'","''")+"'";
const ident=value=>'"'+String(value).replaceAll('"','""')+'"';
const tables=['users','accounts','transactions','investments','investment_sales','shared_groups','shared_group_members','shared_expenses','shared_expense_splits','categories','budgets','recurring_rules','net_worth_snapshots'];
export const ownSnapshot='4f8abad4-1c2d-49a2-8bab-032bc71a288d';
export async function createContext(){
 assert.equal(process.env.ZARIX_CHROME_CONTRACT_WINDOW,'parent-released-after-cp210');
 assert.equal(process.env.ZARIX_ISOLATED_DATABASE_CONFIRM,'synthetic-only');
 process.umask(0o077);
 const runtimeReal=await fs.realpath(runtime);
 const privateBytes=async file=>{assert.ok(path.resolve(file).startsWith(runtime+'/'));const s=await fs.lstat(file);assert.ok(s.isFile()&&!s.isSymbolicLink()&&!(s.mode&0o077));assert.ok((await fs.realpath(file)).startsWith(runtimeReal+'/'));return fs.readFile(file);};
 const targetFile=path.join(runtime,'empty-account-private/targets.json'),targetBytes=await privateBytes(targetFile),target=JSON.parse(targetBytes);
 assert.equal(target.purpose,'empty-account-http-replica');assert.equal(target.ready,true);assert.equal(target.status,'READY');
 assert.equal(target.apiOrigin,'http://127.0.0.1:60321');assert.equal(target.authUpstream,'http://127.0.0.1:60327');assert.equal(target.originalAuthUpstream,'http://127.0.0.1:55321');assert.equal(target.authIsolation,'separate-cache-binary-on-new-database');
 assert.match(target.newDatabaseName,/^zarix_empty_[a-f0-9]{12}4[a-f0-9]{3}[89ab][a-f0-9]{15}$/);
 const envFile=path.join(runtime,'empty-proof.env'),envBytes=await privateBytes(envFile),env=dotenv.parse(envBytes);
 const databaseUrl=new URL(env.ZARIX_EMPTY_DATABASE_URL),originalUrl=new URL(target.originalDatabaseUrl);
 for(const u of[databaseUrl,originalUrl]){assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55322');assert.equal(u.search,'');assert.equal(u.hash,'');u.username='supabase_admin';}
 assert.equal(databaseUrl.pathname,'/'+target.newDatabaseName);assert.equal(originalUrl.pathname,'/postgres');assert.equal(env.ZARIX_EMPTY_SUPABASE_URL,target.apiOrigin);
 const originals=dotenv.parse(await privateBytes(path.join(runtime,'restore.env')));assert.equal(env.ZARIX_EMPTY_ANON_KEY,originals.ZARIX_RESTORE_ANON_KEY);assert.equal(env.ZARIX_EMPTY_SERVICE_ROLE_KEY,originals.ZARIX_RESTORE_SERVICE_ROLE_KEY);
 const configBytes=await privateBytes(target.authConfigFile),config=JSON.parse(configBytes);assert.equal(hash(configBytes),target.authConfigSha256);
 const authDsn=new URL(config.GOTRUE_DB_DATABASE_URL);assert.equal(authDsn.hostname,'127.0.0.1');assert.equal(authDsn.port,'55322');assert.equal(authDsn.pathname,'/'+target.newDatabaseName);assert.deepEqual([...authDsn.searchParams],[['sslmode','disable']]);
 const gatewayBytes=await privateBytes(target.gatewayConfigFile),gateway=JSON.parse(gatewayBytes);assert.equal(hash(gatewayBytes),target.gatewayConfigSha256);assert.equal(gateway.databaseName,target.newDatabaseName);assert.equal(gateway.authUpstream,target.authUpstream);
 const proofFile=path.join(runtime,'empty-proof-build-proof.json'),proofBytes=await privateBytes(proofFile),proof=JSON.parse(proofBytes);
 const stateFile=path.join(runtime,'empty-proof-clock-app-state.json'),stateBytes=await privateBytes(stateFile),state=JSON.parse(stateBytes);
 const appEnvFile=path.join(runtime,'empty-proof-app.env'),appEnvBytes=await privateBytes(appEnvFile),appEnv=dotenv.parse(appEnvBytes);
 assert.equal(proof.exitCode,0);assert.equal(proof.revision,revision);assert.equal(proof.copyRoot,'/tmp/zarix-app-empty-account-20261015');assert.equal(proof.publicSupabaseOrigin,target.apiOrigin);assert.equal(proof.privateEnvSha256,hash(appEnvBytes));assert.equal(hash(JSON.stringify(proof.sources)),proof.sourceManifestSha256);
 assert.equal(state.revision,revision);assert.equal(state.runtimeProfile,'empty-core-closure');assert.equal(state.appOrigin,'http://127.0.0.1:3004');assert.equal(state.apiOrigin,target.apiOrigin);assert.equal(state.buildId,proof.buildId);assert.equal(state.copyRoot,proof.copyRoot);
 assert.equal(appEnv.NEXT_PUBLIC_SUPABASE_URL,target.apiOrigin);assert.equal(appEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,env.ZARIX_EMPTY_ANON_KEY);assert.equal(appEnv.SUPABASE_SERVICE_ROLE_KEY,env.ZARIX_EMPTY_SERVICE_ROLE_KEY);
 const logins=JSON.parse(await privateBytes(target.authLoginFile));assert.equal(logins.users.length,2);const user=logins.users[1];assert.match(user.email,/^zarix-.+@example\.invalid$/);assert.match(user.id,/^[a-f0-9-]{36}$/i);
 const pg=isolatedPgEnvironment(databaseUrl),originalPg=isolatedPgEnvironment(originalUrl),psql=path.join(env.ZARIX_PG_BIN,'psql');
 const sql=(q,original=false)=>{const r=spawnSync(psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',`BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s'; ${q}; COMMIT;`],{env:original?originalPg:pg,encoding:'utf8',timeout:20000,maxBuffer:16*1024*1024});assert.equal(r.status,0,'Private read-only preservation oracle failed; raw diagnostics withheld');return r.stdout.trim();};
 const rows=(q,original=false)=>JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM(${q})q`,original));
 assert.equal(sql(`SELECT email FROM auth.users WHERE id=${lit(user.id)}`),user.email);
 const profile=rows(`SELECT status,current_period_end,telegram_chat_id,(telegram_bot_token IS NULL)AS no_bot FROM public.users WHERE id=${lit(user.id)}`)[0];assert.equal(profile.status,'ACTIVE');assert.ok(Date.parse(profile.current_period_end)>Date.parse('2026-10-06T12:00:00Z'));assert.equal(profile.no_bot,true);
 const snapshot=rows(`SELECT * FROM public.net_worth_snapshots WHERE user_id=${lit(user.id)}`);assert.equal(snapshot.length,1);assert.equal(snapshot[0].id,ownSnapshot);
 const listTables=rows("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",true).map(r=>r.tablename);
 const fingerprint=(table,original=false,ids)=>{const where=ids?(ids.length?' WHERE q.id IN('+ids.map(lit).join(',')+')':' WHERE false'):'';return rows(`SELECT count(*)::int AS count,md5(COALESCE(jsonb_agg(to_jsonb(q) ORDER BY to_jsonb(q)::text)::text,'[]')) AS md5 FROM public.${ident(table)} q${where}`,original)[0];};
 const originalBefore=listTables.map(table=>({table,...fingerprint(table,true)}));
 const targetBefore=tables.map(table=>{const own=table==='net_worth_snapshots'?` WHERE id<>${lit(ownSnapshot)}`:'';const ids=rows(`SELECT id FROM public.${ident(table)}${own} ORDER BY id`).map(r=>r.id);return{table,ids,...fingerprint(table,false,ids)};});
 const listener=(port,pid)=>{const r=spawnSync('/usr/sbin/lsof',['-nP','-iTCP:'+port,'-sTCP:LISTEN','-Fpn'],{encoding:'utf8'});assert.equal(r.status,0,'Owned local listener unavailable');assert.deepEqual([...new Set(r.stdout.split('\n').filter(l=>l.startsWith('p')).map(l=>Number(l.slice(1))))],[pid]);assert.ok(r.stdout.split('\n').includes('n127.0.0.1:'+port));};
 const sourceFiles=['run.mjs','context.mjs','plan.json'];const harness=await Promise.all(sourceFiles.map(async f=>({path:f,sha256:hash(await fs.readFile(new URL(f,import.meta.url)))})));
 const verify=async()=>{
  listener(3004,state.nextPid);listener(60321,target.gatewayPid);listener(60327,target.authPid);listener(60323,target.restPid);
  const cwd=spawnSync('/usr/sbin/lsof',['-a','-p',String(state.nextPid),'-d','cwd','-Fn'],{encoding:'utf8'});assert.equal(cwd.status,0);assert.ok(cwd.stdout.split('\n').includes('n'+proof.copyRoot));
  for(const item of proof.sources)assert.equal(hash(await fs.readFile(path.join(proof.copyRoot,item.path))),item.sha256,'Frozen physical app source changed');
  assert.equal((await fs.readFile(path.join(proof.copyRoot,'.next/BUILD_ID'),'utf8')).trim(),proof.buildId);
  for(const[file,b]of[[targetFile,targetBytes],[envFile,envBytes],[proofFile,proofBytes],[stateFile,stateBytes],[appEnvFile,appEnvBytes],[target.authConfigFile,configBytes],[target.gatewayConfigFile,gatewayBytes]])assert.equal(hash(await privateBytes(file)),hash(b));
  for(const item of harness)assert.equal(hash(await fs.readFile(new URL(item.path,import.meta.url))),item.sha256);
 };
 await verify();
 const privateDirectory=path.join(runtime,'chrome-contracts-private-'+randomUUID());await fs.mkdir(privateDirectory,{mode:0o700});
 const secretFile=path.join(privateDirectory,'session-secrets.private.json');const secrets={purpose:'isolated-Chrome-contract-private-session-registry',issuedSessions:[],cookies:[]};
 const writeSecrets=async()=>fs.writeFile(secretFile,JSON.stringify(secrets,null,2)+'\n',{mode:0o600});await writeSecrets();
 const registerSession=async session=>{if(session?.access_token&&!secrets.issuedSessions.some(s=>s.accessToken===session.access_token)){secrets.issuedSessions.push({accessToken:session.access_token,refreshToken:session.refresh_token});await writeSecrets();}};
 const registerCookies=async cookies=>{for(const cookie of cookies)if(!secrets.cookies.some(c=>c.name===cookie.name&&c.value===cookie.value))secrets.cookies.push({name:cookie.name,value:cookie.value});await writeSecrets();};
 const preservation=async()=>{
  await verify();const original=listTables.map((table,i)=>({table,before:originalBefore[i],after:fingerprint(table,true)}));
  const existing=targetBefore.map(before=>({table:before.table,before:{count:before.count,md5:before.md5},after:fingerprint(before.table,false,before.ids)}));
  return{originalRestoreFullPublicTables:original.map(r=>({...r,unchanged:r.before.count===r.after.count&&r.before.md5===r.after.md5})),existingTargetRows:existing.map(r=>({...r,unchanged:r.before.count===r.after.count&&r.before.md5===r.after.md5})),ownedSnapshotExclusion:ownSnapshot,sourceStable:true};
 };
 return{user,logins,env,target,state,proof,privateDirectory,sql,rows,harness,verify,preservation,registerSession,registerCookies,secrets,secretFile,profileBefore:profile,ownedSnapshotBefore:snapshot[0],binding:{revision,buildId:proof.buildId,sourceManifestSha256:proof.sourceManifestSha256,physicalSources:proof.sources.length,targetsSha256:hash(targetBytes),purpose:target.purpose,appOrigin:state.appOrigin,apiOrigin:target.apiOrigin,databaseName:target.newDatabaseName,normalOwner:user.id}};
}
