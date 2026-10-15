"""Guarded final stop of nine exact task-owned HTTP processes. No native PG/Arc."""
import datetime,hashlib,importlib.util,json,os,pathlib,signal,subprocess,sys,time,shlex
sys.dont_write_bytecode=True
REPO=pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix');R=pathlib.Path('/tmp/zarix-runtime-20261015')
WRAPPED_MATERIAL={'auth': {'/tmp/zarix-runtime-20261015/home/cache/stack/slim-services/auth/v2.197.0-r0/darwin-arm64/bin/auth': '2814745719ac5830d28152874dfe23d2bd703c1c985569115d9568d6b9345115', '/tmp/zarix-runtime-20261015/home/cache/stack/slim-services/auth/v2.197.0-r0/darwin-arm64/bin/.auth-wrapped': '04606de0bd299c575f2459daa8768e2529c95334ef1af878d21bb93e358bebba', '/tmp/zarix-runtime-20261015/home/cache/stack/slim-services/auth/v2.197.0-r0/darwin-arm64/bin/.runtime-env.sh': '8269c5167fa1730f82618ec100053ca84ff2256e8bde19b53e9190bd39a5aef8'}, 'postgrest': {'/tmp/zarix-runtime-20261015/home/cache/stack/slim-services/postgrest/v16.4-r0/darwin-arm64/bin/postgrest': '5ad4c1b59bfa74dcd9ed37038c18f7ce1b091990e1930fc367b6d77a56463af9', '/tmp/zarix-runtime-20261015/home/cache/stack/slim-services/postgrest/v16.4-r0/darwin-arm64/bin/.postgrest-wrapped': 'b7abbdfa383f6c2039f919b3b442fa6598319314f360e0c90575c07faa8583e4', '/tmp/zarix-runtime-20261015/home/cache/stack/slim-services/postgrest/v16.4-r0/darwin-arm64/bin/.runtime-env.sh': '6cce1989c6320397596088f5506cbf9566da748605c8df8ff931369c0d661b8a'}}
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
  marker=row['command'][0]if row['name']in['postgrest','auth']else row['command'][1]
  binary=None
  if row['name']in['postgrest','auth']:
   wrapped_expected=WRAPPED_MATERIAL[row['name']]
   for path,expected_sha in wrapped_expected.items():assert sha(path)==expected_sha
   launcher=pathlib.Path(row['command'][0]);binary=launcher.with_name('.'+launcher.name+'-wrapped');assert str(launcher)in wrapped_expected and str(binary)in wrapped_expected
   marker=str(binary)
  targets.append({'kind':row['name'],'pid':row['pid'],'port':row['port'],'cwd':str(REPO),'startedAt':row['startedAt'],'commandMarker':marker,'mappedBinary':str(binary)if binary else None})
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
  command=subprocess.check_output(['/bin/ps','-p',str(target['pid']),'-o','command='],text=True)
  if target['commandMarker']not in command:
   # The observed original Node launch used this exact relative script argument.
   assert target['kind']=='quotes'and target['pid']==53373 and target['port']==57910
   argv=shlex.split(command);relative='docs/tif/v2.13/evidence/technical-20261015/fresh-proof/quote-fixture-server.mjs'
   assert len(argv)>=2 and pathlib.Path(argv[0]).name=='node'and argv[1]==relative
   script=pathlib.Path(target['cwd'])/argv[1]
   assert script.resolve()==pathlib.Path(target['commandMarker']).resolve()
   assert sha(script)=='fafb616944489fbc58592137e99b2c925c49494529a73348dfd8d6994b9ddee7'
   target['exactRelativeNodeScriptValidated']=True
  if target.get('mappedBinary'):
   mapped=subprocess.check_output(['/usr/sbin/lsof','-a','-p',str(target['pid']),'-d','txt','-Fn'],text=True);assert any(line.startswith('n')and pathlib.Path(line[1:]).resolve()==pathlib.Path(target['mappedBinary']).resolve()for line in mapped.splitlines())
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
