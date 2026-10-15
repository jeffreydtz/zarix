import datetime, http.server, json, os, pathlib, signal, socket, socketserver, subprocess, threading, time

root = pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
runtime = pathlib.Path('/tmp/zarix-runtime-20261015')
private = pathlib.Path(os.environ.get('ZARIX_E2E_APP_ENV_FILE', str(runtime / 'e2e-app.env')))
assert private.resolve().parent == runtime.resolve() and private.name in ('e2e-app.env','e2e-app-live-quotes.env','e2e-app-fallback-quotes.env')
assert private.stat().st_mode & 0o077 == 0
env = {k: v for k, v in os.environ.items() if k in ('PATH','HOME','USER','TMPDIR','LANG')}
for line in private.read_text().splitlines():
    if line and not line.startswith('#'):
        key, value = line.split('=', 1)
        env[key] = json.loads(value)
assert env['NEXT_PUBLIC_SUPABASE_URL'] == 'http://127.0.0.1:57321'
assert env['ZARIX_ISOLATED_TEST_BUILD'] == '1'
env.update(NODE_ENV='production', NEXT_TELEMETRY_DISABLED='1', TZ='Etc/UTC')
build_id = (root / '.next/BUILD_ID').read_text().strip()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
fault_count = 0
(runtime/'e2e-fault-count.json').write_text(json.dumps({'purpose':'local-provider-failure-double','status':503,'requests':0,'updatedAt':now()},indent=2)+'\n')
fault_lock = threading.Lock()
class Fault(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global fault_count
        with fault_lock:
            fault_count += 1
            (runtime/'e2e-fault-count.json').write_text(json.dumps({'purpose':'local-provider-failure-double','status':503,'requests':fault_count,'updatedAt':now()},indent=2)+'\n')
        self.send_response(503)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.wfile.write(b'{"error":"SYNTHETIC_LOCAL_PROVIDER_OUTAGE"}')
    def log_message(self, *args):
        pass
class LoopbackServer(http.server.ThreadingHTTPServer):
    def server_bind(self):
        socketserver.TCPServer.server_bind(self)
        self.server_name='localhost'
        self.server_port=self.server_address[1]
fault = LoopbackServer(('127.0.0.1',57910),Fault)
threading.Thread(target=fault.serve_forever, daemon=True).start()
child = None
events = []
stop_requested = False
restart_requested = False
def save():
    state = {'purpose':'isolated-e2e-app-supervisor', 'supervisorPid':os.getpid(),
             'appOrigin':'http://127.0.0.1:3000','apiOrigin':'http://127.0.0.1:57321',
             'buildId':build_id,'nextPid':child.pid if child else None,
             'runtimeQuoteProfile':{'environmentFileName':private.name,'providers':{'criptoya':env.get('CRIPTOYA_API_URL'),'dolarapi':env.get('DOLARAPI_URL'),'coingecko':env.get('COINGECKO_API_URL')},'marketTimeoutMs':int(env.get('MARKET_DATA_TIMEOUT_MS','8000')),'maxRateAgeSeconds':int(env.get('EXCHANGE_RATE_MAX_AGE_SECONDS','86400'))},
             'providerDouble':{'port':57910,'response':503,'realIntegration':False},'events':events}
    (runtime/'e2e-app-state.json').write_text(json.dumps(state,indent=2)+'\n')
def start():
    global child
    with socket.socket() as probe:
        probe.bind(('127.0.0.1',3000))
    assert (root/'.next/BUILD_ID').read_text().strip() == build_id
    log = open(runtime/'e2e-next-private.log','ab', buffering=0)
    os.chmod(runtime/'e2e-next-private.log',0o600)
    began=now()
    child = subprocess.Popen(['node', str(root/'node_modules/next/dist/bin/next'), 'start',
                              '--hostname','127.0.0.1','--port','3000'], cwd=root, env=env,
                             stdin=subprocess.DEVNULL, stdout=log, stderr=log)
    from urllib.request import urlopen
    for attempt in range(200):
        assert child.poll() is None, 'Owned Next process exited'
        try:
            with urlopen('http://127.0.0.1:3000/api/health',timeout=1) as response:
                if response.status==200:
                    owned=subprocess.run(['/usr/sbin/lsof','-nP','-a','-p',str(child.pid),'-iTCP:3000','-sTCP:LISTEN','-Fp'], capture_output=True,text=True)
                    assert owned.returncode==0 and ('p'+str(child.pid)) in owned.stdout.splitlines()
                    event={'pid':child.pid,'buildId':build_id,'startedAt':began,'readyAt':now(),'startConfirmed':True,'listenerOwned':True}
                    events.append({'type':'start',**event}); save(); print(json.dumps(event),flush=True); return event
        except Exception:
            time.sleep(0.1)
    raise RuntimeError('Owned Next readiness timeout')
def stop():
    global child
    old=child
    assert old is not None
    old.terminate()
    try: old.wait(timeout=10)
    except subprocess.TimeoutExpired: old.kill(); old.wait(timeout=5)
    result={'pid':old.pid,'buildId':build_id,'stoppedAt':now(),'stopConfirmed':old.poll() is not None}
    child=None
    events.append({'type':'stop',**result}); save(); return result
def handle(signum, frame):
    global stop_requested, restart_requested
    if signum==signal.SIGUSR1: restart_requested=True
    else: stop_requested=True
for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGUSR1): signal.signal(sig,handle)
try:
    start()
    while not stop_requested:
        if restart_requested:
            restart_requested=False
            before=stop(); after=start()
            proof={'purpose':'isolated-offline-server-restart','appOrigin':'http://127.0.0.1:3000','before':before,'after':after}
            (runtime/'next-restart-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
            print('OWNED_NEXT_RESTART_CONFIRMED',flush=True)
        assert child.poll() is None, 'Owned Next stopped unexpectedly'
        time.sleep(0.25)
finally:
    if child is not None and child.poll() is None: stop()
    fault.shutdown(); fault.server_close()
    save()
