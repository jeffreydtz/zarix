"""Prepared only: stop exact two owned Next consumers before root npmci; no native stop."""
import datetime,hashlib,json,os,pathlib,signal,subprocess,time
R=pathlib.Path('/tmp/zarix-runtime-20261015')
TARGETS=[{'state':'contract-clock-retry-app-state.json','proof':'contract-clock-build-proof.json','pid':1822,'port':3002,'copy':'/tmp/zarix-app-contract-clock-20261015','build':'aqWYS3F5R_VxiHxD3LpJV','api':'http://127.0.0.1:58321'}, {'state':'import-target-app-state.json','proof':'import-target-build-proof.json','pid':56597,'port':3003,'copy':'/tmp/zarix-app-import-target-20261015','build':'-zDTe86_KX6NVCcsRaWOj','api':'http://127.0.0.1:59321'}]
def main():
 assert os.environ.get('ZARIX_CI5_STOP_APPS_WINDOW')=='parent-released-ci5-app-stop','Parent must release E2E financial/browser writers first'
 os.umask(0o077);report={'status':'PREFLIGHT','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'targets':[],'nativeServicesTouched':False};path=R/'owned-app-stop-before-acceptance.json'
 with path.open('x') as f:json.dump(report,f);f.write('\n');f.flush();os.fsync(f.fileno())
 env={**os.environ,'TZ':'UTC','LC_ALL':'C'}
 # Validate both identities before sending any signal. Never infer owner from port.
 for t in TARGETS:
  s=json.loads((R/t['state']).read_text());p=json.loads((R/t['proof']).read_text());copy=pathlib.Path(t['copy'])
  assert s['nextPid']==t['pid'] and s['appOrigin']=='http://127.0.0.1:'+str(t['port']) and s['apiOrigin']==t['api']
  assert pathlib.Path(s['copyRoot']).resolve()==copy.resolve() and p['copyRoot']==t['copy']
  assert s['buildId']==p['buildId']==(copy/'.next/BUILD_ID').read_text().strip()==t['build']
  assert p['revision']==s['revision']=='836fd18b310a51cced9074b372a80ce5d7e1a870'
  for e in p['sources']:assert hashlib.sha256((copy/e['path']).read_bytes()).hexdigest()==e['sha256']
  ps=subprocess.run(['/bin/ps','-p',str(t['pid']),'-o','lstart='],env=env,capture_output=True,text=True)
  if ps.returncode:
   assert subprocess.run(['/usr/sbin/lsof','-nP','-iTCP:'+str(t['port']),'-sTCP:LISTEN'],capture_output=True).returncode!=0
   report['targets'].append({**t,'status':'ALREADY_ABSENT','signalSent':False});continue
  dt=datetime.datetime.strptime(ps.stdout.strip(),'%a %b %d %H:%M:%S %Y').replace(tzinfo=datetime.timezone.utc)
  # State records time after own listener verification, so process may precede it.
  delta=(datetime.datetime.fromisoformat(s['startedAt'])-dt).total_seconds();assert 0<=delta<=20
  cwd=subprocess.check_output(['/usr/sbin/lsof','-a','-p',str(t['pid']),'-d','cwd','-Fn'],env=env,text=True)
  assert any(line.startswith('n') and pathlib.Path(line[1:]).resolve()==copy.resolve() for line in cwd.splitlines())
  listener=subprocess.check_output(['/usr/sbin/lsof','-nP','-a','-p',str(t['pid']),'-iTCP:'+str(t['port']),'-sTCP:LISTEN','-Fn'],env=env,text=True)
  assert 'n127.0.0.1:'+str(t['port']) in listener
  report['targets'].append({**t,'status':'IDENTIFIED','signalSent':False,'startTimeMatchesState':True,'exactCwdAndListener':True,'sourcesVerified':len(p['sources'])})
 report['status']='IDENTITIES_VALIDATED';path.write_text(json.dumps(report,indent=2)+'\n')
 for t in report['targets']:
  if t['status']=='ALREADY_ABSENT':continue
  os.kill(t['pid'],signal.SIGTERM);t['signalSent']=True
  for _ in range(60):
   alive=subprocess.run(['/bin/ps','-p',str(t['pid']),'-o','stat='],capture_output=True,text=True)
   if alive.returncode or alive.stdout.strip().startswith('Z'):break
   time.sleep(.25)
  else:t['status']='STOP_TIMEOUT';path.write_text(json.dumps(report,indent=2)+'\n');raise RuntimeError('Own Next did not exit; no other signal sent')
  assert subprocess.run(['/usr/sbin/lsof','-nP','-iTCP:'+str(t['port']),'-sTCP:LISTEN'],capture_output=True).returncode!=0
  t['status']='STOPPED_OWN_NEXT';path.write_text(json.dumps(report,indent=2)+'\n')
 report.update(status='PASS',finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),dataBuildEnvAndPriorStatesPreserved=True);path.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':'PASS','targets':[{'pid':t['pid'],'port':t['port'],'status':t['status']} for t in report['targets']],'nativeServicesTouched':False}))
if __name__=='__main__':main()
