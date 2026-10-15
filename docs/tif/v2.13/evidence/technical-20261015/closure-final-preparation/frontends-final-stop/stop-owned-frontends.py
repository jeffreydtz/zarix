"""Prepare/final-only owned Next+two local doubles stop. No native stack/Arc action."""
import datetime,hashlib,json,os,pathlib,signal,subprocess,time
R=pathlib.Path('/tmp/zarix-runtime-20261015');REPO=pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
TARGETS=[{'kind':'next','state':'closure-proof-clock-app-state.json','pid':39320,'port':3002,'cwd':'/tmp/zarix-app-closure-final-20261015','build':'aIWVMIWgvq5sbeEtZAZEh'}, {'kind':'synthetic-quotes','state':'proof-quote-server-state.json','pid':53373,'port':57910,'cwd':str(REPO),'purpose':'synthetic-proof-quotes','source':'docs/tif/v2.13/evidence/technical-20261015/fresh-proof/quote-fixture-server.mjs'}, {'kind':'clock-synthetic-quotes','state':'clock-quote-server-state.json','pid':443,'port':57912,'cwd':str(REPO),'purpose':'synthetic-clock-proof-quotes','source':'docs/tif/v2.13/evidence/technical-20261015/acceptance-final/clock-quote-fixture.mjs'}]
def main():
 assert os.environ.get('ZARIX_FINAL_FRONTENDS_STOP_CONFIRM')=='parent-released-all-final-writers','Parent must release every final case first'
 os.umask(0o077);out=R/'owned-closure-frontends-final-stop.json';report={'status':'PREFLIGHT','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'targets':[],'nativeServicesTouched':False,'arcOrPersonalProcessesTouched':False,'priorStateBuildEnvPreserved':True}
 with out.open('x') as f:json.dump(report,f);f.write('\n');f.flush();os.fsync(f.fileno())
 env={**os.environ,'TZ':'UTC','LC_ALL':'C'}
 for target in TARGETS:
  s=json.loads((R/target['state']).read_text());pid=s['nextPid'] if target['kind']=='next' else s['pid'];assert pid==target['pid']
  if target['kind']=='next':
   proof=json.loads((R/'closure-proof-build-proof.json').read_text());assert s['buildId']==proof['buildId']==(pathlib.Path(target['cwd'])/'.next/BUILD_ID').read_text().strip()==target['build'];assert s['revision']==proof['revision']=='84df929ab2f169251a49f3e95d0e0c148dfcb87c'
   assert pathlib.Path(s['copyRoot']).resolve()==pathlib.Path(target['cwd']).resolve() and s['apiOrigin']=='http://127.0.0.1:58321'
   assert hashlib.sha256((R/'closure-proof-app.env').read_bytes()).hexdigest()==proof['privateEnvSha256']
   for row in proof['sources']:assert hashlib.sha256((pathlib.Path(target['cwd'])/row['path']).read_bytes()).hexdigest()==row['sha256']
  else:
   assert s['purpose']==target['purpose'] and s['origin']=='http://127.0.0.1:'+str(target['port'])
   if 'sourceSha256'in s:assert hashlib.sha256((REPO/target['source']).read_bytes()).hexdigest()==s['sourceSha256']
  ps=subprocess.run(['/bin/ps','-p',str(pid),'-o','lstart='],env=env,capture_output=True,text=True)
  if ps.returncode:
   assert subprocess.run(['/usr/sbin/lsof','-nP','-iTCP:'+str(target['port']),'-sTCP:LISTEN'],capture_output=True).returncode!=0
   report['targets'].append({**target,'status':'ALREADY_ABSENT','signalSent':False});continue
  assert int(subprocess.check_output(['/bin/ps','-p',str(pid),'-o','uid='],env=env,text=True).strip())==os.getuid(),'Target must belong to task user'
  start=datetime.datetime.strptime(ps.stdout.strip(),'%a %b %d %H:%M:%S %Y').replace(tzinfo=datetime.timezone.utc);delta=(datetime.datetime.fromisoformat(s['startedAt'])-start).total_seconds();assert 0<=delta<=20
  cwd=subprocess.check_output(['/usr/sbin/lsof','-a','-p',str(pid),'-d','cwd','-Fn'],env=env,text=True);assert any(x.startswith('n')and pathlib.Path(x[1:]).resolve()==pathlib.Path(target['cwd']).resolve()for x in cwd.splitlines())
  listener=subprocess.check_output(['/usr/sbin/lsof','-nP','-a','-p',str(pid),'-iTCP:'+str(target['port']),'-sTCP:LISTEN','-Fn'],env=env,text=True);assert 'n127.0.0.1:'+str(target['port'])in listener
  if target['kind']!='next':
   command=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','command='],env=env,text=True);assert target['source'] in command,'Expected own synthetic fixture script argv'
  report['targets'].append({**target,'status':'IDENTIFIED','signalSent':False,'pidStartTimeCwdAndListenerMatch':True})
 report['status']='ALL_IDENTITIES_VALIDATED';out.write_text(json.dumps(report,indent=2)+'\n')
 for target in report['targets']:
  if target['status']=='ALREADY_ABSENT':continue
  os.kill(target['pid'],signal.SIGTERM);target['signalSent']=True
  for _ in range(60):
   ps=subprocess.run(['/bin/ps','-p',str(target['pid']),'-o','stat='],capture_output=True,text=True)
   if ps.returncode or ps.stdout.strip().startswith('Z'):break
   time.sleep(.25)
  else:target['status']='STOP_TIMEOUT';out.write_text(json.dumps(report,indent=2)+'\n');raise RuntimeError('Own process did not exit; no broad or stronger signal sent')
  assert subprocess.run(['/usr/sbin/lsof','-nP','-iTCP:'+str(target['port']),'-sTCP:LISTEN'],capture_output=True).returncode!=0
  target['status']='STOPPED_OWN_PROCESS';out.write_text(json.dumps(report,indent=2)+'\n')
 report.update(status='PASS',finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':'PASS','targets':[{'pid':t['pid'],'port':t['port'],'status':t['status']}for t in report['targets']],'nativeServicesTouched':False,'arcOrPersonalProcessesTouched':False}))
if __name__=='__main__':main()
