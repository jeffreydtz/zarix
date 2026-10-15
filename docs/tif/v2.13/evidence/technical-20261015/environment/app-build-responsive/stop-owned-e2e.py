import datetime, json, os, pathlib, signal, subprocess, time
runtime=pathlib.Path('/tmp/zarix-runtime-20261015')
state=json.loads((runtime/'e2e-app-state.json').read_text())
assert state['purpose']=='isolated-e2e-app-supervisor'
pid=state['supervisorPid']
args=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','args='],text=True).strip()
assert args.endswith(' /tmp/zarix-runtime-20261015/start-e2e.py')
label=os.environ.get('ZARIX_STOP_PHASE','responsive-before-core')
assert label.replace('-','').isalnum()
proof=runtime/('owned-app-stop-'+label+'.json')
assert not proof.exists()
os.kill(pid, signal.SIGTERM)
for attempt in range(100):
    r=subprocess.run(['/bin/ps','-p',str(pid),'-o','stat='],capture_output=True,text=True)
    if r.returncode or r.stdout.strip().startswith('Z'):break
    time.sleep(0.1)
else:raise AssertionError('Own supervisor did not stop')
new=json.loads((runtime/'e2e-app-state.json').read_text())
assert new['nextPid'] is None
proof.write_text(json.dumps({'phase':label,'stoppedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ownedSupervisorPid':pid,'lastBuildId':state['buildId'],'state':new,'status':'PASS'},indent=2)+'\n')
print(json.dumps({'phase':label,'status':'PASS','ownSupervisorStopped':pid,'ownNextStopped':state['nextPid']}))
