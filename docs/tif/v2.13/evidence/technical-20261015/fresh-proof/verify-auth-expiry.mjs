// Real ordinary sessions only; no ad-hoc signed JWT or browser/network outside PROOF.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const requireRepo=createRequire(path.join(process.cwd(),'package.json'));
const {createServerClient}=requireRepo('@supabase/ssr');
assert.equal(process.env.ZARIX_PROOF_AUTH_CONFIRM,'own-local-test-sessions');
process.umask(0o077);
const runtime='/tmp/zarix-runtime-20261015',api='http://127.0.0.1:58321';
const privatePath=runtime+'/proof-auth-expiry-private-attempt-2';await fs.mkdir(privatePath,{mode:0o700});
const report={status:'RUNNING',startedAt:new Date().toISOString(),target:api,checks:[],scope:'Real short-lived JWT of a new ordinary temporary session; only that session locally revoked. Two other ordinary control sessions preserved with legitimate refresh. Not browser/API-app CP2-21 acceptance or an SMTP/recovery delivery test.'};
const values=Object.fromEntries((await fs.readFile(runtime+'/proof.env','utf8')).split('\n').filter(Boolean).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),JSON.parse(line.slice(i+1))];}));
const logins=JSON.parse(await fs.readFile(runtime+'/proof-logins.json','utf8'));
assert.equal(values.ZARIX_PROOF_SUPABASE_URL,api);assert.equal(logins.purpose,'fifth-isolated-acceptance-replica');assert.equal(logins.users.length,2);
const original=await fs.readFile(runtime+'/proof-private/preparation.json','utf8');assert.equal(JSON.parse(original).status,'PASS_PREPARED');
const safeFetch=(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url||input.href);assert.equal(url.origin,api);const headers=new Headers(init.headers);headers.set('Connection','close');return fetch(input,{...init,headers,redirect:'error',signal:AbortSignal.timeout(20000)});};
function normal(user){const jar=new Map();const client=createServerClient(api,values.ZARIX_PROOF_ANON_KEY,{auth:{autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:safeFetch},cookies:{getAll:()=>[...jar.values()].map(({name,value})=>({name,value})),setAll:items=>{for(const cookie of items){if(cookie.options?.maxAge===0)jar.delete(cookie.name);else jar.set(cookie.name,cookie);}}}});return{client,user,cookies:()=>structuredClone([...jar.values()])};}
async function signin(session,checkUsingSdk=true){const result=await session.client.auth.signInWithPassword({email:session.user.email,password:session.user.password});assert.equal(result.error,null);assert.equal(result.data.user.id,session.user.id);if(checkUsingSdk)assert.equal((await session.client.auth.getUser()).data.user.id,session.user.id);assert.ok(session.cookies().length>0);return result.data.session;}
const claims=session=>JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
async function probe(token,resource='/auth/v1/user'){const response=await safeFetch(api+resource,{headers:{apikey:values.ZARIX_PROOF_ANON_KEY,Authorization:'Bearer '+token}});const body=await response.json().catch(()=>({}));return{httpStatus:response.status,errorCode:typeof (body.error_code||body.code)==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(body.error_code||body.code)?(body.error_code||body.code):null};}
let temporary,normalA,normalB,expiredCookieFixture;
try{
  normalA=normal(logins.users[0]);normalB=normal(logins.users[1]);
  const a=await signin(normalA),b=await signin(normalB);temporary=normal(logins.users[0]);const c=await signin(temporary,false);const jwt=claims(c);
  assert.equal(jwt.exp-jwt.iat,60);assert.equal(jwt.sub,logins.users[0].id);assert.equal(jwt.role,'authenticated');
  const before=await probe(c.access_token);assert.equal(before.httpStatus,200);assert.equal((await probe(c.access_token,'/rest/v1/accounts?select=id')).httpStatus,200);
  expiredCookieFixture={purpose:'ordinary-expired-access-and-own-refresh-revoked',appOrigin:'http://127.0.0.1:3002',apiOrigin:api,userId:logins.users[0].id,iat:jwt.iat,exp:jwt.exp,cookies:temporary.cookies(),origin:'Actual SupabaseSSR setAll cookie adapter after ordinary password sign-in; not a browser capture or hand-signed JWT',refreshRevocationScope:'local for this new temporary session only'};
  await fs.writeFile(privatePath+'/expired-session-cookies.json',JSON.stringify(expiredCookieFixture,null,2)+'\n',{mode:0o600,flag:'wx'});
  await fs.writeFile(privatePath+'/normal-cookies-before.json',JSON.stringify({profiles:[{identity:'A',userId:normalA.user.id,cookies:normalA.cookies()},{identity:'B',userId:normalB.user.id,cookies:normalB.cookies()}]},null,2)+'\n',{mode:0o600,flag:'wx'});
  const logout=await safeFetch(api+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:values.ZARIX_PROOF_ANON_KEY,Authorization:'Bearer '+c.access_token}});assert.equal(logout.status,204);
  const refresh=await safeFetch(api+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:values.ZARIX_PROOF_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:c.refresh_token})});
  const refreshBody=await refresh.json().catch(()=>({}));assert.ok([400,401,403].includes(refresh.status));
  const stillAccess=await probe(c.access_token),restBeforeExpiry=await probe(c.access_token,'/rest/v1/accounts?select=id');assert.ok([200,401,403].includes(stillAccess.httpStatus));assert.equal(restBeforeExpiry.httpStatus,200,'PostgREST stateless JWT remains cryptographically valid before actual expiry');
  report.checks.push({name:'ordinary temporary access JWT initially valid; own refresh locally revoked without global signout',status:'PASS',iat:jwt.iat,exp:jwt.exp,lifetimeSeconds:jwt.exp-jwt.iat,before,refreshRejectedHttp:refresh.status,refreshErrorCode:typeof refreshBody.error_code==='string'?refreshBody.error_code:null,authAfterLocalSignoutBeforeExpiry:stillAccess,restBeforeExpiry,revocationMethod:'Direct ordinary Auth logout scope=local with the exact original access JWT; no SDK getSession/refresh of temporary C before revocation',tokensPublished:false});
  await fs.writeFile(privatePath+'/waiting.json',JSON.stringify({exp:jwt.exp,checkAfter:new Date(jwt.exp*1000+2000).toISOString()})+'\n',{mode:0o600,flag:'wx'});
  while(Date.now()<jwt.exp*1000+2000)await new Promise(resolve=>setTimeout(resolve,Math.min(1000,jwt.exp*1000+2000-Date.now())));
  const expired=await probe(c.access_token),restExpired=await probe(c.access_token,'/rest/v1/accounts?select=id');
  assert.ok([401,403].includes(expired.httpStatus));assert.equal(restExpired.httpStatus,401);
  report.checks.push({name:'same original unmodified ordinary JWT rejected after real exp, no clock override',status:'PASS',observedAt:new Date().toISOString(),expiry:new Date(jwt.exp*1000).toISOString(),auth:expired,rest:restExpired});
  const controls=[];
  for(const [name,session] of [['A',normalA],['B',normalB]]){const refreshed=await session.client.auth.refreshSession();assert.equal(refreshed.error,null);assert.equal(refreshed.data.user.id,session.user.id);const checked=await session.client.auth.getUser();assert.equal(checked.error,null);assert.equal(checked.data.user.id,session.user.id);controls.push({identity:name,normalRefreshValid:true,normalGetUser:true,lifetimeSeconds:claims(refreshed.data.session).exp-claims(refreshed.data.session).iat});}
  report.checks.push({name:'other two ordinary sessions legitimately refresh and remain authenticated',status:'PASS',controls,scope:'Expired access with valid refresh can become200; it is not equivalent to logout/expired whole session'});
  await fs.writeFile(privatePath+'/normal-session-cookies.json',JSON.stringify({purpose:'two-normal-control-sessions-with-valid-refresh',appOrigin:'http://127.0.0.1:3002',apiOrigin:api,profiles:[{identity:'A',userId:normalA.user.id,cookies:normalA.cookies()},{identity:'B',userId:normalB.user.id,cookies:normalB.cookies()}],scope:'Retained only for this authorized local fixture; no source session or identity reused'},null,2)+'\n',{mode:0o600,flag:'wx'});
  report.privateFixtures={expiredCookies:privatePath+'/expired-session-cookies.json',normalCookies:privatePath+'/normal-session-cookies.json',mode:'0600',cookieProvenance:'Real SSR cookie adapter, not browser-issued capture; future application/browser test must verify actual behavior',normalSessionsPreserved:2,revokedTemporarySessions:1};
  report.status='PASS_SCOPED_AUTH_EXPIRY';
}catch(error){report.status='FAIL';report.failure={type:error.name,location:error.stack?.match(/verify-auth-expiry\.mjs:(\d+):\d+/)?.[1]||null,rawExceptionPublished:false};await fs.writeFile(privatePath+'/diagnostic.private.log',String(error.stack||error),{mode:0o600,flag:'wx'});}
finally{report.finishedAt=new Date().toISOString();await fs.writeFile(privatePath+'/verification.json',JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify({status:report.status,checks:report.checks.map(c=>({name:c.name,status:c.status})),report:privatePath+'/verification.json',privateFixtures:report.privateFixtures}));if(report.status==='FAIL')process.exitCode=1;}
