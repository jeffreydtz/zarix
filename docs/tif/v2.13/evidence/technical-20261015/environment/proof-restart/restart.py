import datetime,hashlib,json,os,pathlib,signal,subprocess,time
r=pathlib.Path('/tmp/zarix-runtime-20261015');p=r/'proof-restart-private';os.umask(0o077)
def sha(v):return hashlib.sha256(v).hexdigest()
def read(n):return json.loads((r/n).read_text())
state=read('proof-app-state.json');proof=read('proof-build-proof.json');root=pathlib.Path(state['copyRoot'])
assert state['nextPid']==52579 and state['appOrigin']=='http://127.0.0.1:3002' and state['apiOrigin']=='http://127.0.0.1:58321'
assert root.resolve()==pathlib.Path('/tmp/zarix-app-account-analysis-20261015').resolve()
assert state['buildId']==proof['buildId']==(root/'.next/BUILD_ID').read_text().strip()=='a2WBtszbvrpoT9GHwToED'
assert state['revision']==proof['revision']=='836fd18b310a51cced9074b372a80ce5d7e1a870'
assert sha((r/'proof-app.env').read_bytes())==proof['privateEnvSha256']
for e in proof['sources']: assert sha((root/e['path']).read_bytes())==e['sha256']
pid=state['nextPid']; psenv={**os.environ,'TZ':'UTC','LC_ALL':'C'}
cwd=subprocess.check_output(['/usr/sbin/lsof','-a','-p',str(pid),'-d','cwd','-Fn'],env=psenv,text=True)
assert any(line.startswith('n') and pathlib.Path(line[1:]).resolve()==root.resolve() for line in cwd.splitlines())
listener=subprocess.check_output(['/usr/sbin/lsof','-nP','-a','-p',str(pid),'-iTCP:3002','-sTCP:LISTEN','-Fn'],env=psenv,text=True)
assert 'n127.0.0.1:3002' in listener and ('p'+str(pid)) in listener
started=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','lstart='],env=psenv,text=True).strip()
psstart=datetime.datetime.strptime(started,'%a %b %d %H:%M:%S %Y').replace(tzinfo=datetime.timezone.utc)
assert abs((psstart-datetime.datetime.fromisoformat(state['startedAt'])).total_seconds())<2
report={'phase':'before','oldNextPid':pid,'oldNextStartedAt':started,'buildId':state['buildId'],'revision':state['revision'],'sourcesVerified':len(proof['sources']),'guards':{'exactOriginalNextPid':True,'sameBuild':True,'sameCopySources':True,'samePrivateEnv':True,'exactCwd':True,'exactOwnListener':True,'startTimeMatchesOriginalState':True},'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(p/'restart-control.json').write_text(json.dumps(report,indent=2)+'\n')
os.kill(pid,signal.SIGTERM)
for _ in range(40):
 result=subprocess.run(['/bin/ps','-p',str(pid),'-o','stat='],capture_output=True,text=True)
 if result.returncode or result.stdout.strip().startswith('Z'):break
 time.sleep(.25)
else:raise RuntimeError('Own Next did not exit; no other signal sent')
assert subprocess.run(['/usr/sbin/lsof','-nP','-iTCP:3002','-sTCP:LISTEN'],capture_output=True).returncode!=0
report['oldNextExited']=True
cli=r/'bin/supabase';sid='c23a7df7600999c31f2d8435146f55289db07f9f62dfc5d6f08b2562a1529a09'
assert read('proof-start.json')['id']==sid
args=[str(cli),'stack','restart','--workdir',str(r/'proof'),'--stack-id',sid,'--output-format','json']
env={**os.environ,'SUPABASE_HOME':str(r/'home'),'SUPABASE_EXPERIMENTAL_STACK':'1','SUPABASE_NO_UPDATE_NOTIFIER':'1'}
with (p/'restart.stdout.private').open('xb') as out,(p/'restart.stderr.private').open('xb') as err:
 result=subprocess.run(args,env=env,stdout=out,stderr=err,timeout=90)
report.update(cliArgv=args,cliExitCode=result.returncode,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
(p/'restart-control.json').write_text(json.dumps(report,indent=2)+'\n')
assert result.returncode==0,'CLI restart failed; private diagnostics retained'
print(json.dumps({'oldNextExited':True,'cliExitCode':result.returncode,'onlyStackId':sid,'publicApi':'http://127.0.0.1:58321','postgresPort':58322,'sameBuildPreserved':True}))
