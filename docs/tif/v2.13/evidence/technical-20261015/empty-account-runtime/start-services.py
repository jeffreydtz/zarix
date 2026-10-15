#!/usr/bin/env python3
"""Start only cached/test-owned loopback services against the new empty DB."""
import datetime,hashlib,json,os,pathlib,re,socket,subprocess,sys,time,traceback,urllib.parse,urllib.request,uuid
R=pathlib.Path('/tmp/zarix-runtime-20261015');D=R/'empty-account-private';REPO=pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def save(p,v):
 with pathlib.Path(p).open('x')as f:os.chmod(p,0o600);json.dump(v,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
def main():
 assert os.environ.get('ZARIX_EMPTY_SERVICES_WINDOW')=='parent-released-local-empty-services';os.umask(0o077)
 assert not D.is_symlink() and D.resolve()==pathlib.Path('/private/tmp/zarix-runtime-20261015/empty-account-private') and D.lstat().st_mode&0o777==0o700
 assert not(D/'services.json').exists()and not(D/'services-start-attempt.private.json').exists()
 db=json.loads((D/'database-preparation.json').read_text());assert db['status']=='DATABASE_READY_FINANCES_EMPTY'and re.fullmatch(r'zarix_empty_[0-9a-f]{32}',db['newDatabaseName'])
 material=json.loads((D/'existing-native-service-material.private.json').read_text());assert all(urllib.parse.urlparse(material[k]).hostname=='127.0.0.1'and urllib.parse.urlparse(material[k]).port==55322 and urllib.parse.urlparse(material[k]).path=='/'+db['newDatabaseName']for k in['restDatabaseUrl','authDatabaseUrl'])
 for port in[60321,60323,60325,60327,57914]:
  with socket.socket()as probe:probe.bind(('127.0.0.1',port))
 restore=json.loads((R/'home/stacks/eba0705e785c32981474ff420bc2da819e603fce4e36d2c4d244f9cbfab7dcb5/state.json').read_text());nativeAuth=next(x for x in restore['instances']if x['creation']['service']=='auth')['creation']['config']
 assert nativeAuth['jwtSecret']==material['jwtSecret']and nativeAuth['gotrueJwtKeys']==material['gotrueJwtKeys']
 smtpRoot=R/'auth-reset-private';smtpRoot.mkdir(mode=0o700,exist_ok=True);assert smtpRoot.stat().st_mode&0o077==0
 users=json.loads((R/'source-native-logins.json').read_text())['users'];assert len(users)==2 and all(re.fullmatch(r'zarix-.+@example\.invalid',x['email'])for x in users)
 smtpConfig=smtpRoot/'empty-account-smtp-config.json';smtpOutput=smtpRoot/('smtp-attempt-empty-'+uuid.uuid4().hex)
 save(smtpConfig,{'purpose':'zarix-local-auth-reset-smtp','host':'127.0.0.1','port':60325,'allowedRecipients':[u['email']for u in users],'outputDirectory':str(smtpOutput)})
 authEnv={'GOTRUE_API_HOST':'127.0.0.1','GOTRUE_API_PORT':'60327','API_HOST':'127.0.0.1','PORT':'60327','API_EXTERNAL_URL':'http://127.0.0.1:60321/auth/v1','GOTRUE_SITE_URL':'http://127.0.0.1:3004','GOTRUE_URI_ALLOW_LIST':'http://127.0.0.1:3004/**','GOTRUE_DB_DRIVER':'postgres','GOTRUE_DB_DATABASE_URL':material['authDatabaseUrl']+'?sslmode=disable','GOTRUE_DB_NAMESPACE':'auth','GOTRUE_JWT_SECRET':material['jwtSecret'],'GOTRUE_JWT_KEYS':material['gotrueJwtKeys'],'GOTRUE_JWT_EXP':'60','GOTRUE_JWT_AUD':'authenticated','GOTRUE_JWT_DEFAULT_GROUP_NAME':'authenticated','GOTRUE_JWT_ADMIN_ROLES':'service_role','GOTRUE_DISABLE_SIGNUP':'true','GOTRUE_EXTERNAL_EMAIL_ENABLED':'true','GOTRUE_MAILER_AUTOCONFIRM':'false','GOTRUE_SMTP_ADMIN_EMAIL':'noreply@example.invalid','GOTRUE_SMTP_HOST':'127.0.0.1','GOTRUE_SMTP_PORT':'60325','GOTRUE_SMTP_SENDER_NAME':'ZARIX Local Synthetic','GOTRUE_MAILER_URLPATHS_RECOVERY':'/verify','GOTRUE_LOG_LEVEL':'warn'}
 authConfig=D/'auth-environment.private.json';save(authConfig,authEnv)
 restConfig=D/'postgrest.private.conf';restValues={'db-uri':material['restDatabaseUrl']+'?sslmode=disable','db-schemas':'public','db-extra-search-path':'public,extensions','db-anon-role':'anon','jwt-secret':material['jwks'],'server-host':'127.0.0.1','server-port':60323,'db-max-rows':1000,'db-pool':4,'db-config':False,'log-level':'error'}
 with restConfig.open('x')as f:os.chmod(f.name,0o600);f.write(''.join(k+' = '+json.dumps(v)+'\n'for k,v in restValues.items()));f.flush();os.fsync(f.fileno())
 save(D/'gateway-config.json',{'purpose':'empty-account-gateway','origin':'http://127.0.0.1:60321','authUpstream':'http://127.0.0.1:60327','restUpstream':'http://127.0.0.1:60323','databaseName':db['newDatabaseName']})
 save(D/'empty-quote-control.json',{'purpose':'isolated-empty-account-quote-control','mode':'unavailable','rate':1200,'fixedTime':'2026-10-06T12:00:00.000Z'})
 cache=R/'home/cache/stack/slim-services';restBin=cache/'postgrest/v16.4-r0/darwin-arm64/bin/postgrest';authBin=cache/'auth/v2.197.0-r0/darwin-arm64/bin/auth'
 smtpScript=REPO/'docs/tif/v2.13/evidence/technical-20261015/auth-reset-contract/smtp-sink.mjs';gatewayScript=REPO/'docs/tif/v2.13/evidence/technical-20261015/empty-account-runtime/gateway.mjs';quoteScript=gatewayScript.with_name('quote-fixture.mjs')
 assert sha(smtpScript)=='0c1d72411a5204e9f7483b0c494364a920ba0ce25775ac9c749a775afae20342'
 base={k:v for k,v in os.environ.items()if k in['PATH','HOME','TMPDIR','LANG','LC_ALL']};base.update(TZ='UTC',ZARIX_EMPTY_SERVICES_WINDOW='parent-released-local-empty-services',NEXT_TELEMETRY_DISABLED='1')
 record={'status':'START_RESERVED','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'databaseName':db['newDatabaseName'],'children':[],'originalNativeServicesReconfigured':False};attempt=D/'services-start-attempt.private.json';save(attempt,record);children=[]
 def checkpoint():
  p=attempt.with_suffix('.new');save(p,record);os.replace(p,attempt)
 def launch(label,args,port,extra=None):
  logs=[D/(label+'.stdout.private.log'),D/(label+'.stderr.private.log')];handles=[p.open('xb')for p in logs]
  proc=subprocess.Popen([str(x)for x in args],cwd=REPO,env={**base,**(extra or{})},stdout=handles[0],stderr=handles[1],start_new_session=True);children.append(proc)
  for f in handles:f.close()
  item={'name':label,'pid':proc.pid,'port':port,'command':[str(x)for x in args],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ordinaryLogFiles':[str(x)for x in logs]};record['children'].append(item);checkpoint()
  for _ in range(80):
   assert proc.poll()is None,'Owned child exited; inspect private log'
   v=subprocess.run(['/usr/sbin/lsof','-nP','-a','-p',str(proc.pid),'-iTCP:'+str(port),'-sTCP:LISTEN','-Fn'],capture_output=True,text=True)
   if v.returncode==0:
    names=[x[1:]for x in v.stdout.splitlines()if x.startswith('n')];assert names==['127.0.0.1:'+str(port)],'Own service must bind exact loopback only';break
   time.sleep(.25)
  else:raise AssertionError('Own child failed exact listener readiness')
  item['exactOwnLoopbackListener']=True;checkpoint();return item
 try:
  smtp=launch('smtp',['node',smtpScript,'--config',smtpConfig],60325)
  rest=launch('postgrest',[restBin,restConfig],60323)
  auth=launch('auth',[authBin],60327,authEnv)
  gateway=launch('gateway',['node',gatewayScript],60321)
  quote=launch('quote',['node',quoteScript],57914)
  for url in['http://127.0.0.1:60327/health','http://127.0.0.1:60321/auth/v1/health','http://127.0.0.1:57914/health']:
   with urllib.request.urlopen(url,timeout=10)as response:assert response.status==200;json.loads(response.read())
  report={**db,'status':'INFRA_READY_AUTH_ACCEPTANCE_PENDING','ready':False,'authConfigFile':str(authConfig),'authConfigSha256':sha(authConfig),'authBinary':str(authBin),'authBinarySha256':sha(authBin),'authPid':auth['pid'],'authOrdinaryLogFiles':auth['ordinaryLogFiles'],'restConfigFile':str(restConfig),'restConfigSha256':sha(restConfig),'restBinary':str(restBin),'restBinarySha256':sha(restBin),'restPid':rest['pid'],'gatewayPid':gateway['pid'],'gatewaySourceSha256':sha(gatewayScript),'gatewayConfigFile':str(D/'gateway-config.json'),'gatewayConfigSha256':sha(D/'gateway-config.json'),'smtpConfigFile':str(smtpConfig),'smtpConfigSha256':sha(smtpConfig),'smtpOutputDirectory':str(smtpOutput),'smtpPid':smtp['pid'],'smtpScriptSha256':sha(smtpScript),'smtpOrdinaryLogFiles':smtp['ordinaryLogFiles'],'quoteOrigin':'http://127.0.0.1:57914','quoteControlFile':str(D/'empty-quote-control.json'),'quoteJournalFile':str(D/'empty-quote-journal.jsonl'),'quoteServerStateFile':str(D/'empty-quote-server-state.json'),'quotePid':quote['pid'],'quoteSourceSha256':sha(quoteScript),'children':record['children'],'keysReusedFromOriginalNative':True,'newExternalCredentials':False,'originalAuthRequests':0}
  save(D/'services.json',report);record['status']='PASS_INFRA_OWN_LISTENERS';checkpoint();print(json.dumps({'status':report['status'],'databaseName':db['newDatabaseName'],'children':[{'name':x['name'],'pid':x['pid'],'port':x['port']}for x in record['children']],'authOriginalUntouched':True}))
 except BaseException:
  record['status']='FAILED_CLEANUP_OWN_CHILDREN_ONLY'
  for proc in reversed(children):
   if proc.poll()is None:
    proc.terminate()
    try:proc.wait(timeout=15)
    except subprocess.TimeoutExpired:pass
  checkpoint();raise
if __name__=='__main__':
 try:main()
 except Exception as e:
  p=D/'services-start-failure.private.log'
  if D.exists()and not p.exists():
   with p.open('x')as f:os.chmod(p,0o600);traceback.print_exc(file=f)
  print(json.dumps({'status':'BLOCKED','errorType':type(e).__name__,'privateDiagnostics':str(D),'nativeServicesTouched':False}));sys.exit(1)
