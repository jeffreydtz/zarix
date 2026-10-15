"""Guarded final stop of nine exact task-owned HTTP processes. No native PG/Arc."""
import datetime,hashlib,importlib.util,json,os,pathlib,signal,subprocess,sys,time
sys.dont_write_bytecode=True
REPO=pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix');R=pathlib.Path('/tmp/zarix-runtime-20261015')
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def main():
 assert os.environ.get('ZARIX_FINAL_FRONTENDS_STOP_CONFIRM')=='parent-released-all-final-writers'
 os.umask(0o077);out=R/'owned-final-http-services-stop.json';assert not out.exists()
 spec=importlib.util.spec_from_file_location('final_stop_guards',pathlib.Path(__file__).with_name('preserve-six-native-stacks-final.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 targets=[]
 for prefix,pid,port,cwd,build,api in [('closure-proof',39320,3002,'/tmp/zarix-app-closure-final-20261015','aIWVMIWgvq5sbeEtZAZEh','http://127.0.0.1:58321'),('empty-proof',57813,3004,'/tmp/zarix-app-empty-account-20261015','Yi9bH3FttO71PxvY-EwCH','http://127.0.0.1:60321')]:
  state=m.read_json(R/(prefix+'-clock-app-state.json'),private=True);proof=m.read_json(R/(prefix+'-build-proof.json'),private=True)
  assert state['nextPid']==pid and state['appOrigin']=='http://127.0.0.1:'+str(port)and state['apiOrigin']==api
  assert state['buildId']==proof['buildId']==build==(pathlib.Path(cwd)/'.next/BUILD_ID').read_text().strip()
  assert state['revision']==proof['revision']=='84df929ab2f169251a49f3e95d0e0c148dfcb87c'and pathlib.Path(state['copyRoot']).resolve()==pathlib.Path(cwd).resolve()
  assert sha(R/(prefix+'-app.env'))==proof['privateEnvSha256']
  for row in proof['sources']:assert sha(pathlib.Path(cwd)/row['path'])==row['sha256']
  targets.append({'kind':'next','pid':pid,'port':port,'cwd':cwd,'startedAt':state['startedAt'],'commandMarker':'next','buildId':build})
 for file,pid,port,purpose,source in [('proof-quote-server-state.json',53373,57910,'synthetic-proof-quotes','fresh-proof/quote-fixture-server.mjs'),('clock-quote-server-state.json',443,57912,'synthetic-clock-proof-quotes','acceptance-final/clock-quote-fixture.mjs')]:
  state=m.read_json(R/file,private=True);assert state['pid']==pid and state['purpose']==purpose and state['origin']=='http://127.0.0.1:'+str(port)
  script=REPO/'docs/tif/v2.13/evidence/technical-20261015'/source
  if 'sourceSha256'in state:assert sha(script)==state['sourceSha256']
  targets.append({'kind':'quotes','pid':pid,'port':port,'cwd':str(REPO),'startedAt':state['startedAt'],'commandMarker':str(script)})
 services=m.read_json(R/'empty-account-private/services.json',private=True)
 expected={'smtp':(57372,60325),'postgrest':(57381,60323),'auth':(57390,60327),'gateway':(57398,60321),'quote':(57404,57914)}
 for row in services['children']:
  assert(row['pid'],row['port'])==expected[row['name']]
  targets.append({'kind':row['name'],'pid':row['pid'],'port':row['port'],'cwd':str(REPO),'startedAt':row['startedAt'],'commandMarker':row['command'][0]if row['name']in['postgrest','auth']else row['command'][1]})
 assert len(targets)==9
 def identify(target,allow_absent):
  identity=m.processes().get(target['pid'])
  if identity is None:
   assert allow_absent and not m.listeners(port=target['port']);return None
  assert identity['uid']==os.getuid()
  started=datetime.datetime.strptime(identity['start'],'%a %b %d %H:%M:%S %Y').replace(tzinfo=datetime.timezone.utc)
  assert 0<=(datetime.datetime.fromisoformat(target['startedAt'])-started).total_seconds()<=20
  cwd=subprocess.check_output(['/usr/sbin/lsof','-a','-p',str(target['pid']),'-d','cwd','-Fn'],text=True)
  assert any(x.startswith('n')and pathlib.Path(x[1:]).resolve()==pathlib.Path(target['cwd']).resolve()for x in cwd.splitlines())
  listeners=m.listeners(pids=[target['pid']],port=target['port']);assert listeners and all(x['address']=='127.0.0.1:'+str(target['port'])for x in listeners)
  command=subprocess.check_output(['/bin/ps','-p',str(target['pid']),'-o','command='],text=True);assert target['commandMarker']in command
  return identity
 for target in targets:
  identity=identify(target,True);target.update(identity=identity,status='IDENTIFIED'if identity else'ALREADY_ABSENT',signalSent=False)
 report={'status':'ALL_IDENTITIES_VALIDATED','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'targets':targets,'nativeStacksOrPgTouched':False,'arcOrPersonalProcessesTouched':False,'dataDeleted':False,'scope':'Only nine exact task-owned Next/local provider/Auth/REST/gateway/SMTP HTTP processes. No native stack or PG control; all data/config/state/private SMTP payloads retained.'}
 m.write_json(out,report)
 for target in targets:
  if target['status']=='ALREADY_ABSENT':continue
  assert m.same_process(target['identity'],identify(target,False))
  os.kill(target['pid'],signal.SIGTERM);target['signalSent']=True
  for _ in range(60):
   identity=m.processes().get(target['pid'])
   if identity is None and not m.listeners(port=target['port']):break
   time.sleep(.25)
  else:target['status']='STOP_TIMEOUT';m.write_json(out,report,replace=True);raise RuntimeError('Own process still alive; no stronger/broad signal sent')
  target['status']='STOPPED_OWN_PROCESS';m.write_json(out,report,replace=True)
 report.update(status='PASS',finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());m.write_json(out,report,replace=True)
 print(json.dumps({'status':'PASS','ownedProcesses':9,'nativeStacksOrPgTouched':False,'arcOrPersonalProcessesTouched':False,'dataDeleted':False}))
if __name__=='__main__':main()
