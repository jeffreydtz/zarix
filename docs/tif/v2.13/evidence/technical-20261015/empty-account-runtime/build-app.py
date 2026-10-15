"""Prepare a new CI6 closure copy; never replace the original PROOF836 copy."""
import argparse, datetime, hashlib, io, json, os, pathlib, re, subprocess, sys, tarfile, time

repo = pathlib.Path.cwd().resolve()
runtime = pathlib.Path('/tmp/zarix-runtime-20261015')
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('mode',choices=['build','start','start-clock'])
parser.add_argument('--revision',required=True)
parser.add_argument('--profile',required=True,choices=['empty-core-closure'])
args=parser.parse_args()
revision=args.revision
profile=json.loads(pathlib.Path(__file__).with_name('profiles.json').read_text())[args.profile]
prefix=profile['artifactPrefix']
copy_root=pathlib.Path(profile['copyRoot'])
if profile['fixedRevision']:assert revision==profile['fixedRevision']
if profile['clockOnly']:assert args.mode in ['build','start-clock']
assert re.fullmatch(r'[0-9a-f]{40}',revision),'Explicit parent-approved CI5 freeze revision required'
assert os.environ.get('ZARIX_ACCEPTANCE_APP_WINDOW_CONFIRM') == 'parent-released-frozen-copy', 'Parent must release this isolated build/start window explicitly'
mode=args.mode
os.umask(0o077)
private_env = runtime / (prefix+'-app.env')
state_path=runtime/(profile['clockState'] if mode=='start-clock' or profile['clockOnly'] else profile['normalState'])
core = json.loads((repo / ('docs/tif/v2.13/evidence/technical-20261015/'+profile['coreDirectory']+'/verification.json')).read_text())
assert core['codeRevision'] == revision and core['sourceStable'] and core['sourceWorkingTreeClean']

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def git(*args):
    env = {**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'}
    result = subprocess.run(['git', *args], cwd=repo, env=env, capture_output=True)
    assert result.returncode == 0, 'Frozen Git read failed; no raw output published'
    return result.stdout

def private_values(path):
    assert path.stat().st_mode & 0o077 == 0
    return dict((key, json.loads(value)) for key, value in
                (line.split('=', 1) for line in path.read_text().splitlines() if line and not line.startswith('#')))

def offline_font_fixture():
    # Read only the already frozen LOAD build, never the repository's .next.
    font_source = pathlib.Path('/tmp/zarix-app-load-20261015-responsive')
    load_proof = json.loads((runtime / 'load-build-proof-responsive.json').read_text())
    assert load_proof['revision'] == 'bb2e8a6aa5de7f7f26ba745da67257b0f1f25e81' and load_proof['buildProof']['exitCode'] == 0
    assert digest((font_source / 'app/layout.tsx').read_bytes()) == next(entry['sha256'] for entry in core['sourceManifest'] if entry['path']=='app/layout.tsx'), 'Inter loader/options must match CI5 exact bytes'
    assert (font_source / '.next/BUILD_ID').read_text().strip() == load_proof['buildId']
    fixture_root = runtime / (prefix+'-app-fonts')
    assert not fixture_root.exists(), 'Never replace a prior font fixture'
    fixture_root.mkdir(mode=0o700)
    faces, files = [], {}
    for css_path in sorted((font_source / '.next/static/css').glob('*.css')):
        for face in re.findall(r'@font-face\s*\{[^}]*\}', css_path.read_text()):
            if not re.search(r'font-family\s*:\s*[\"\']?Inter[\"\']?\s*;', face):
                continue
            matches = re.findall(r'url\(([^)]+)\)', face)
            assert len(matches) == 1, 'Expected one local WOFF2 per Inter face'
            url = matches[0].strip('\"\'')
            assert re.fullmatch(r'/_next/static/media/[A-Za-z0-9.-]+\.woff2', url)
            relative = url.removeprefix('/_next/')
            source = font_source / '.next' / relative
            target = fixture_root / source.name
            raw = source.read_bytes()
            assert raw[:4] == b'wOF2', 'Use actual existing font bytes, never fake URL text'
            if target.name in files:
                assert files[target.name] == digest(raw)
            else:
                target.write_bytes(raw)
                files[target.name] = digest(raw)
            face = face.replace(matches[0], str(target)).replace('src:url(', 'src: url(')
            if re.search(r'unicode-range\s*:\s*U\+(?:0-FF|00\?\?)(?:[,;])', face, re.I):
                face = '/* latin */\n' + face
            if face not in faces:
                faces.append(face)
    assert len(files) == len(faces) == 7, 'Expected seven existing variable Inter subsets'
    assert sum(face.startswith('/* latin */') for face in faces) == 1
    css = '\n'.join(faces)
    url = 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap'
    mocked = fixture_root / 'google-font-mock.cjs'
    mocked.write_text('module.exports = ' + json.dumps({url: css}) + ';\n')
    return {'sourceBuildId': load_proof['buildId'], 'sourceRevision': load_proof['revision'], 'targetLayoutHashMatchesFontSource': True,
            'sourceRoot': str(font_source), 'fontSha256': files, 'cssSha256': digest(css.encode()),
            'mockPath': str(mocked), 'mockSha256': digest(mocked.read_bytes()),
            'scope': 'Existing frozen LOAD Inter WOFF2 copied locally; Next font mock prevents node:https font download; no font provider execution'}

def child_environment():
    # Local credentials are copied from the existing stack, never generated.
    env = {key: value for key, value in os.environ.items()
           if not any(marker in key.upper() for marker in ('SUPABASE', 'GEMINI', 'TELEGRAM', 'MERCADO', 'MP_', 'GOOGLE_API_KEY', 'CRYPTOYA', 'CRIPTOYA', 'DOLARAPI', 'COINGECKO'))}
    env.pop('NODE_OPTIONS', None)
    env.pop('NODE_PATH', None)
    for key in list(env):
        if key.startswith(('ZARIX_FINAL_CLOCK_','ZARIX_FINAL_GEMINI_')) or key in ['CRON_SECRET','ZARIX_ACCEPTANCE_RUNTIME_PROFILE']:env.pop(key)
    restore = private_values(runtime / 'empty-proof.env')
    selected = private_values(private_env)
    assert selected['NEXT_PUBLIC_SUPABASE_URL'] == restore['ZARIX_EMPTY_SUPABASE_URL'] == 'http://127.0.0.1:60321'
    assert selected['NEXT_PUBLIC_SUPABASE_ANON_KEY'] == restore['ZARIX_EMPTY_ANON_KEY']
    assert selected['SUPABASE_SERVICE_ROLE_KEY'] == restore['ZARIX_EMPTY_SERVICE_ROLE_KEY']
    env.update(selected)
    env.update(ZARIX_ACCEPTANCE_RUNTIME_PROFILE=args.profile,NEXT_TELEMETRY_DISABLED='1', DEVELOPER_DIR='/Library/Developer/CommandLineTools', TZ='Etc/UTC')
    env['NODE_OPTIONS'] = '--max-old-space-size=2048 --import=' + str(repo / 'scripts/lib/restored-read-fetch-guard.mjs')
    env['UV_THREADPOOL_SIZE'] = '2'
    return env

if mode == 'build':
    assert not copy_root.exists() and not private_env.exists() and not (runtime/(prefix+'-build-proof.json')).exists(), 'Never overwrite a prior build/copy/config/proof or data'
    sources = list(core['sourceManifest'])
    current_deltas=[]
    public = git('ls-tree', '-r', '--name-only', revision, '--', 'public').decode().splitlines()
    known = {entry['path'] for entry in sources}
    for relative in public:
        if relative not in known:
            sources.append({'path': relative, 'sha256': digest(git('show', revision + ':' + relative))})
    sources.sort(key=lambda entry: entry['path'])
    for entry in sources:
        relative = pathlib.PurePosixPath(entry['path'])
        assert not relative.is_absolute() and '..' not in relative.parts
        assert not relative.name.startswith('.env') or relative.name == '.env.example'
        # Only product bytes must still match the frozen source. Later harness-only changes stay separate.
        if relative.parts[0] in ('app', 'components', 'lib', 'types', 'public') or len(relative.parts) == 1:
            actual=digest((repo / str(relative)).read_bytes())
            if actual!=entry['sha256']:
                assert profile['allowCurrentProductDeltas'] and str(relative) not in ['package.json','package-lock.json'],'Product/dependencies changed after selected final freeze'
                current_deltas.append({'path':str(relative),'frozenSha256':entry['sha256'],'currentSha256':actual,'executedByThisBuild':False})
    # The CI capture includes this ignored CLI version marker. It is metadata,
    # not a Git product file; preserve its exact recorded bytes separately.
    metadata = [entry for entry in sources if entry['path'] == 'supabase/.temp/cli-latest']
    for entry in metadata:
        assert digest((repo / entry['path']).read_bytes()) == entry['sha256']
    archive = git('archive', '--format=tar', revision, '--', *(entry['path'] for entry in sources if entry not in metadata))
    copy_root.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(archive)) as members:
        for member in members:
            relative = pathlib.PurePosixPath(member.name)
            assert not relative.is_absolute() and '..' not in relative.parts
            if member.isdir():
                (copy_root / member.name).mkdir(parents=True, exist_ok=True)
            else:
                assert member.isfile(), 'No links or special files in a frozen source copy'
                target = copy_root / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(members.extractfile(member).read())
    for entry in metadata:
        target = copy_root / entry['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((repo / entry['path']).read_bytes())
    for entry in sources:
        assert digest((copy_root / entry['path']).read_bytes()) == entry['sha256']
    os.symlink(repo / 'node_modules', copy_root / 'node_modules', target_is_directory=True)
    restore = private_values(runtime / 'empty-proof.env')
    assert restore['ZARIX_EMPTY_SUPABASE_URL'] == 'http://127.0.0.1:60321'
    values = {
        'NEXT_PUBLIC_APP_URL': 'http://127.0.0.1:3004',
        'NEXT_PUBLIC_SUPABASE_URL': restore['ZARIX_EMPTY_SUPABASE_URL'],
        'NEXT_PUBLIC_SUPABASE_ANON_KEY': restore['ZARIX_EMPTY_ANON_KEY'],
        'SUPABASE_SERVICE_ROLE_KEY': restore['ZARIX_EMPTY_SERVICE_ROLE_KEY'],
        'ZARIX_ISOLATED_TEST_BUILD': '1',
        'CRIPTOYA_API_URL': 'http://127.0.0.1:57914',
        'DOLARAPI_URL': 'http://127.0.0.1:57914',
        'COINGECKO_API_URL': 'http://127.0.0.1:57914',
        'ZARIX_RESTORE_FETCH_GUARD_LOG': '/tmp/zarix-restored-read-fetch-guard-'+prefix+'-20261015.jsonl',
        'TELEGRAM_ADMIN_CHAT_ID':'',
    }
    cron_fixture=private_values(runtime/'e2e-app.env')
    assert isinstance(cron_fixture.get('CRON_SECRET'),str) and len(cron_fixture['CRON_SECRET'])>=20,'Existing local cron fixture required; never generate a replacement'
    values['CRON_SECRET']=cron_fixture['CRON_SECRET']
    fonts = offline_font_fixture()
    values['NEXT_FONT_GOOGLE_MOCKED_RESPONSES'] = fonts['mockPath']
    private_env.write_text(''.join(key + '=' + json.dumps(value) + '\n' for key, value in values.items()))
    os.chmod(private_env, 0o600)
    proof = {'runtimeProfile':args.profile,'currentProductDeltasNotExecuted':current_deltas,'adminAlertsDisabled':True,'clockEnabledAtBuild':False,'coreDirectory':profile['coreDirectory'],'revision': revision, 'copyRoot': str(copy_root), 'sourceCount': len(sources), 'sourceManifestSha256': digest(json.dumps(sources,separators=(',',':'),ensure_ascii=False).encode()),
             'sources': sources, 'publicSupabaseOrigin': values['NEXT_PUBLIC_SUPABASE_URL'],
             'scope': 'Frozen Git product from selected '+profile['coreDirectory']+' plus the CI-captured ignored CLI marker; current product deltas are executedByThisBuild:false. No FX seed at build/start. Controlled synthetic provider57914 starts unavailable; cases may enable its fixed6Oct1200 fixture explicitly.',
             'manifestOnlyMetadata': metadata,
             'privateEnvSha256': digest(private_env.read_bytes()),
             'offlineFontFixture': fonts, 'fetchGuardBeforeBuildAndWorkers': True,
             'toolRuntimeLimits': {'v8MaxOldSpaceMiBPerProcess': 2048, 'uvThreadpoolSize': 2, 'scope': 'Tool environment only; no application config/source change or total-host-memory guarantee'},
             'fetchGuardSha256': digest((repo / 'scripts/lib/restored-read-fetch-guard.mjs').read_bytes()),
             'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    log_path = runtime / (prefix+'-build.private.log')
    with log_path.open('wb') as log:
        status = subprocess.call(['npm', 'run', 'build'], cwd=copy_root, env=child_environment(), stdout=log, stderr=log)
    proof.update(exitCode=status, finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    if status == 0:
        for entry in sources:
            assert digest((copy_root / entry['path']).read_bytes()) == entry['sha256']
        proof['buildId'] = (copy_root / '.next/BUILD_ID').read_text().strip()
        assets=sorted(file for file in (copy_root/'.next/static').rglob('*') if file.is_file())
        assert assets,'Browser asset set must exist for the exact-value check'
        labels={'SUPABASE_SERVICE_ROLE_KEY':values['SUPABASE_SERVICE_ROLE_KEY'],'CRON_SECRET':values['CRON_SECRET']}
        assert labels['SUPABASE_SERVICE_ROLE_KEY']!=values['NEXT_PUBLIC_SUPABASE_ANON_KEY']
        matched={key:[] for key in labels};asset_manifest=[]
        for file in assets:
            raw=file.read_bytes();relative=str(file.relative_to(copy_root))
            asset_manifest.append({'path':relative,'bytes':len(raw),'sha256':digest(raw)})
            for key,value in labels.items():
                if value.encode() in raw:matched[key].append(relative)
        proof['browserAssetSecretScan']={'status':'PASS' if not any(matched.values()) else 'FAIL','filesScanned':len(assets),'exactMatchCounts':{key:len(files) for key,files in matched.items()},'matchingAssetPaths':matched,'assetManifestSha256':digest(json.dumps(asset_manifest,separators=(',',':')).encode()),'scope':'Exact full-value comparison of service-role key and existing local CRON_SECRET against all .next/static files; anon key intentionally excluded as public configuration. No bundle, raw value, encoded-transformation search or universal-secret-absence claim.'}
        (runtime/(prefix+'-browser-assets-manifest.json')).write_text(json.dumps(asset_manifest,indent=2)+'\n')
        if proof['browserAssetSecretScan']['status']!='PASS':
            proof['buildExitCode']=proof['exitCode'];proof['exitCode']=1;status=1
    (runtime / (prefix+'-build-proof.json')).write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps({key: value for key, value in proof.items() if key != 'sources'}))
    raise SystemExit(status)

assert copy_root.exists() and private_env.exists() and not state_path.exists(), 'Do not overwrite an existing app state'
# A separate, released lifecycle step must stop prior task-owned Next processes.
# This controller never sends a signal or stops a native stack.
for previous in ['empty-proof-app-state.json','empty-proof-clock-app-state.json']:
    file=runtime/previous
    if file.exists():
        prior=json.loads(file.read_text())
        try:os.kill(prior['nextPid'],0)
        except ProcessLookupError:pass
        else:raise AssertionError('Previous recorded Next PID is still alive; parent must release its owned stop first')
proof = json.loads((runtime / (prefix+'-build-proof.json')).read_text())
assert proof['exitCode'] == 0 and proof['revision'] == revision
assert proof['browserAssetSecretScan']['status']=='PASS' and all(value==0 for value in proof['browserAssetSecretScan']['exactMatchCounts'].values())
assert digest(private_env.read_bytes()) == proof['privateEnvSha256'], 'Do not start with changed build credentials/configuration'
for entry in proof['sources']:
    assert digest((copy_root / entry['path']).read_bytes()) == entry['sha256']
# Check the exact loopback port rather than adopting another process's health response.
import socket
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 3004))
guard = repo / 'scripts/lib/restored-read-fetch-guard.mjs'
assert guard.is_file()
assert digest(guard.read_bytes()) == proof['fetchGuardSha256'], 'Use the same reviewed guard for build and server'
fonts = proof['offlineFontFixture']
assert digest(pathlib.Path(fonts['mockPath']).read_bytes()) == fonts['mockSha256']
for name, sha256 in fonts['fontSha256'].items():
    assert digest((pathlib.Path(fonts['mockPath']).parent / name).read_bytes()) == sha256
log_path = runtime / (profile.get('runtimeLogPrefix',prefix)+'-next.private.log')
command=['node','--import',str(guard)]
start_env=child_environment()
clock_preload=repo/'docs/tif/v2.13/evidence/technical-20261015/empty-account-runtime/clock-preload.mjs'
clock_observation=runtime/profile['clockObservation']
if mode=='start-clock':
    assert clock_preload.is_file() and not clock_observation.exists()
    command+=['--import',str(clock_preload)]
    provider_state=json.loads((runtime/'empty-account-private/empty-quote-server-state.json').read_text())
    assert provider_state['purpose']=='isolated-empty-account-quotes' and provider_state['origin']=='http://127.0.0.1:57914' and provider_state['status']=='LISTENING'
    assert provider_state['sourceSha256']==digest((repo/'docs/tif/v2.13/evidence/technical-20261015/empty-account-runtime/quote-fixture.mjs').read_bytes())
    os.kill(provider_state['pid'],0)
    provider_cwd=subprocess.run(['/usr/sbin/lsof','-a','-p',str(provider_state['pid']),'-d','cwd','-Fn'],capture_output=True,text=True)
    assert provider_cwd.returncode==0 and pathlib.Path(next(line[1:] for line in provider_cwd.stdout.splitlines() if line.startswith('n'))).resolve()==repo
    provider_listener=subprocess.run(['/usr/sbin/lsof','-nP','-a','-p',str(provider_state['pid']),'-iTCP:57914','-sTCP:LISTEN','-Fn'],capture_output=True,text=True)
    assert provider_listener.returncode==0 and 'n127.0.0.1:57914' in provider_listener.stdout.splitlines()
    start_env.update(CRIPTOYA_API_URL='http://127.0.0.1:57914',DOLARAPI_URL='http://127.0.0.1:57914',COINGECKO_API_URL='http://127.0.0.1:57914')
    start_env.update(ZARIX_FINAL_CLOCK_ENABLE='runtime-start-window',ZARIX_FINAL_CLOCK_FIXED_TIME='2026-10-06T12:00:00.000Z',ZARIX_FINAL_CLOCK_PROOF_FILE=str(clock_observation))
gemini_preload=repo/'docs/tif/v2.13/evidence/technical-20261015/empty-account-runtime/gemini-unavailable-preload.mjs'
gemini_prefix=profile['clockGeminiPrefix'] if mode=='start-clock' else profile['normalGeminiPrefix']
gemini_proof=runtime/(gemini_prefix+'-gemini-unavailable.json')
assert gemini_preload.is_file() and not gemini_proof.exists()
start_env.update(ZARIX_FINAL_GEMINI_MODE='guarded-local-unavailable',ZARIX_FINAL_GEMINI_PROOF_FILE=str(gemini_proof))
command+=['--import',str(gemini_preload)]
command += [str(repo/'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p','3004']
attempt_path=runtime/(profile['clockState'].removesuffix('-app-state.json')+'-start-attempt.json' if mode=='start-clock' else prefix+'-start-attempt.json')
attempt_file=attempt_path.open('x+')
os.chmod(attempt_path,0o600)
attempt_record={'status':'RESERVED_NOT_SPAWNED','copyRoot':str(copy_root),'buildId':proof['buildId'],'command':command,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
def checkpoint_attempt():
    attempt_file.seek(0);attempt_file.truncate();json.dump(attempt_record,attempt_file,indent=2);attempt_file.write('\n');attempt_file.flush();os.fsync(attempt_file.fileno())
process=None
try:
    checkpoint_attempt()
    with log_path.open('ab') as log:
        process=subprocess.Popen(command,cwd=copy_root,env=start_env,stdout=log,stderr=log,start_new_session=True)
    attempt_record.update(status='SPAWNED_REQUIRES_OWN_LISTENER_VERIFICATION',nextPid=process.pid)
    checkpoint_attempt()
    # Never accept another listener's health response after spawn.
    for attempt in range(60):
        assert process.poll() is None,'Own Next process exited; raw private log is retained'
        listener=subprocess.run(['/usr/sbin/lsof','-nP','-a','-p',str(process.pid),'-iTCP:3004','-sTCP:LISTEN','-Fn'],capture_output=True,text=True)
        if listener.returncode==0 and 'n127.0.0.1:3004' in listener.stdout.splitlines():break
        time.sleep(0.25)
    else:raise AssertionError('Own Next PID did not obtain loopback3004; do not adopt another process')
    cwd_probe=subprocess.run(['/usr/sbin/lsof','-a','-p',str(process.pid),'-d','cwd','-Fn'],capture_output=True,text=True)
    assert cwd_probe.returncode==0 and pathlib.Path(next(line[1:] for line in cwd_probe.stdout.splitlines() if line.startswith('n'))).resolve()==copy_root.resolve()
    if mode=='start-clock':
        observed=json.loads(clock_observation.read_text())
        assert observed['nextPid']==process.pid and observed['buildId']==proof['buildId']
        assert observed['fixedTime']==observed['observedApplicationTime']=='2026-10-06T12:00:00.000Z'
        assert observed['preloadSha256']==digest(clock_preload.read_bytes())
    state = {'purpose': 'empty-account-proof', 'nextPid': process.pid, 'appOrigin': 'http://127.0.0.1:3004',
             'apiOrigin': 'http://127.0.0.1:60321', 'copyRoot': str(copy_root), 'revision': revision,
             'buildId': proof['buildId'], 'sourceManifestSha256': proof['sourceManifestSha256'], 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'fetchGuardSha256': digest(guard.read_bytes()), 'guardInstalledBeforeNext': True}
    state.update(geminiUnavailableProofFile=str(gemini_proof),geminiInstrumentationSha256=digest(gemini_preload.read_bytes()),runtimeProfile=args.profile,currentProductDeltasNotExecuted=proof['currentProductDeltasNotExecuted'],adminAlertsDisabled=start_env['TELEGRAM_ADMIN_CHAT_ID']=='',runtimeProviderOrigins={key:start_env[key] for key in ['CRIPTOYA_API_URL','DOLARAPI_URL','COINGECKO_API_URL']},coreDirectory=profile['coreDirectory'],privateEnvSha256=proof['privateEnvSha256'],exactOwnListenerAndCwd=True,clockProfile='fixed-20261006T120000Z' if mode=='start-clock' else 'real-time')
    if mode=='start-clock':
        state.update(fixedTime=observed['fixedTime'],clockPreloadSha256=observed['preloadSha256'],clockObservationSha256=digest(clock_observation.read_bytes()),clockProofFile=str(clock_observation),realAuthControlRequiredBeforeAcceptance=True)
    gemini_observed=json.loads(gemini_proof.read_text())
    assert gemini_observed['nextPid']==process.pid and gemini_observed['buildId']==proof['buildId'] and gemini_observed['sourceStable']
    state.update(geminiUnavailableProofSha256=digest(gemini_proof.read_bytes()))
    state_path.write_text(json.dumps(state, indent=2) + '\n')
    os.chmod(state_path, 0o600)
    print(json.dumps(state))
    attempt_record.update(status='OWN_LISTENER_AND_STATE_VERIFIED',finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    checkpoint_attempt()
except BaseException as error:
    attempt_record.update(status='START_FAILED',errorType=type(error).__name__,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    if process is not None:
        attempt_record['nextPid']=process.pid
        # Popen owns this unreaped direct child. Never signal a preexisting PID,
        # native service, process group or listener discovered through a port.
        if process.poll() is None:
            process.terminate()
            try:process.wait(timeout=15)
            except subprocess.TimeoutExpired:attempt_record['ownChildStillAliveRequiresParentCleanup']=True
        attempt_record['ownChildExitCode']=process.poll()
    checkpoint_attempt()
    raise
finally:
    attempt_file.close()
