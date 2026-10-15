"""Build/start only the explicitly selected restored read-only UI copy after LOAD."""
import datetime, hashlib, io, json, os, pathlib, re, subprocess, sys, tarfile

repo = pathlib.Path(__file__).resolve().parent.parent
runtime = pathlib.Path('/tmp/zarix-runtime-20261015')
copy_root = pathlib.Path('/tmp/zarix-app-restored-read-20261015')
revision = 'bb2e8a6aa5de7f7f26ba745da67257b0f1f25e81'
assert os.environ.get('ZARIX_RESTORE_UI_WINDOW_CONFIRM') == 'post-load-exclusive', 'Parent must release LOAD before build/start'
mode = sys.argv[1] if len(sys.argv) > 1 else ''
assert mode in ('build', 'start'), 'Choose build or start; no reset/destroy/stop operation exists here'
os.umask(0o077)
private_env = runtime / 'restored-read-app.env'
state_path = runtime / 'restored-read-app-state.json'
core = json.loads((repo / 'docs/tif/v2.13/evidence/technical-20261015/core-responsive/verification.json').read_text())
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
    assert load_proof['revision'] == revision and load_proof['buildProof']['exitCode'] == 0
    assert (font_source / '.next/BUILD_ID').read_text().strip() == load_proof['buildId']
    fixture_root = runtime / 'restored-read-fonts'
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
    return {'sourceBuildId': load_proof['buildId'], 'sourceRevision': revision,
            'sourceRoot': str(font_source), 'fontSha256': files, 'cssSha256': digest(css.encode()),
            'mockPath': str(mocked), 'mockSha256': digest(mocked.read_bytes()),
            'scope': 'Existing frozen LOAD Inter WOFF2 copied locally; Next font mock prevents node:https font download; no font provider execution'}

def child_environment():
    # Local credentials are copied from the existing stack, never generated.
    env = {key: value for key, value in os.environ.items()
           if not any(marker in key.upper() for marker in ('SUPABASE', 'GEMINI', 'TELEGRAM', 'MERCADO', 'MP_ACCESS', 'CRYPTOYA', 'CRIPTOYA', 'DOLARAPI', 'COINGECKO'))}
    env.pop('NODE_OPTIONS', None)
    env.pop('NODE_PATH', None)
    restore = private_values(runtime / 'restore.env')
    selected = private_values(private_env)
    assert selected['NEXT_PUBLIC_SUPABASE_URL'] == restore['ZARIX_RESTORE_SUPABASE_URL'] == 'http://127.0.0.1:55321'
    assert selected['NEXT_PUBLIC_SUPABASE_ANON_KEY'] == restore['ZARIX_RESTORE_ANON_KEY']
    assert selected['SUPABASE_SERVICE_ROLE_KEY'] == restore['ZARIX_RESTORE_SERVICE_ROLE_KEY']
    env.update(selected)
    env.update(NEXT_TELEMETRY_DISABLED='1', DEVELOPER_DIR='/Library/Developer/CommandLineTools', TZ='Etc/UTC')
    env['NODE_OPTIONS'] = '--max-old-space-size=2048 --import=' + str(repo / 'scripts/lib/restored-read-fetch-guard.mjs')
    env['UV_THREADPOOL_SIZE'] = '2'
    return env

if mode == 'build':
    assert not copy_root.exists(), 'Never overwrite a prior build/copy or data'
    sources = list(core['sourceManifest'])
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
            assert digest((repo / str(relative)).read_bytes()) == entry['sha256'], 'Product changed after CI3'
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
    restore = private_values(runtime / 'restore.env')
    assert restore['ZARIX_RESTORE_SUPABASE_URL'] == 'http://127.0.0.1:55321'
    values = {
        'NEXT_PUBLIC_APP_URL': 'http://127.0.0.1:3002',
        'NEXT_PUBLIC_SUPABASE_URL': restore['ZARIX_RESTORE_SUPABASE_URL'],
        'NEXT_PUBLIC_SUPABASE_ANON_KEY': restore['ZARIX_RESTORE_ANON_KEY'],
        'SUPABASE_SERVICE_ROLE_KEY': restore['ZARIX_RESTORE_SERVICE_ROLE_KEY'],
        'ZARIX_ISOLATED_TEST_BUILD': '1',
        'CRIPTOYA_API_URL': 'http://127.0.0.1:57910',
        'DOLARAPI_URL': 'http://127.0.0.1:57910',
        'COINGECKO_API_URL': 'http://127.0.0.1:57910',
        'ZARIX_RESTORE_FETCH_GUARD_LOG': '/tmp/zarix-restored-read-fetch-guard-20261015.jsonl',
    }
    fonts = offline_font_fixture()
    values['NEXT_FONT_GOOGLE_MOCKED_RESPONSES'] = fonts['mockPath']
    private_env.write_text(''.join(key + '=' + json.dumps(value) + '\n' for key, value in values.items()))
    os.chmod(private_env, 0o600)
    proof = {'revision': revision, 'copyRoot': str(copy_root), 'sourceCount': len(sources),
             'sources': sources, 'publicSupabaseOrigin': values['NEXT_PUBLIC_SUPABASE_URL'],
             'scope': 'Frozen CI3 Git product bytes plus the exact CI-captured ignored CLI version marker; later harness changes do not alter product or this copy',
             'manifestOnlyMetadata': metadata,
             'privateEnvSha256': digest(private_env.read_bytes()),
             'offlineFontFixture': fonts, 'fetchGuardBeforeBuildAndWorkers': True,
             'toolRuntimeLimits': {'v8MaxOldSpaceMiBPerProcess': 2048, 'uvThreadpoolSize': 2, 'scope': 'Tool environment only; no application config/source change or total-host-memory guarantee'},
             'fetchGuardSha256': digest((repo / 'scripts/lib/restored-read-fetch-guard.mjs').read_bytes()),
             'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    log_path = runtime / 'restored-read-build.private.log'
    with log_path.open('wb') as log:
        status = subprocess.call(['npm', 'run', 'build'], cwd=copy_root, env=child_environment(), stdout=log, stderr=log)
    proof.update(exitCode=status, finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    if status == 0:
        for entry in sources:
            assert digest((copy_root / entry['path']).read_bytes()) == entry['sha256']
        proof['buildId'] = (copy_root / '.next/BUILD_ID').read_text().strip()
    (runtime / 'restored-read-build-proof.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps({key: value for key, value in proof.items() if key != 'sources'}))
    raise SystemExit(status)

assert copy_root.exists() and private_env.exists() and not state_path.exists(), 'Do not replace a running app'
proof = json.loads((runtime / 'restored-read-build-proof.json').read_text())
assert proof['exitCode'] == 0 and proof['revision'] == revision
assert digest(private_env.read_bytes()) == proof['privateEnvSha256'], 'Do not start with changed build credentials/configuration'
for entry in proof['sources']:
    assert digest((copy_root / entry['path']).read_bytes()) == entry['sha256']
# Check the exact loopback port rather than adopting another process's health response.
import socket
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 3002))
guard = repo / 'scripts/lib/restored-read-fetch-guard.mjs'
assert guard.is_file()
assert digest(guard.read_bytes()) == proof['fetchGuardSha256'], 'Use the same reviewed guard for build and server'
fonts = proof['offlineFontFixture']
assert digest(pathlib.Path(fonts['mockPath']).read_bytes()) == fonts['mockSha256']
for name, sha256 in fonts['fontSha256'].items():
    assert digest((pathlib.Path(fonts['mockPath']).parent / name).read_bytes()) == sha256
log_path = runtime / 'restored-read-next.private.log'
with log_path.open('ab') as log:
    process = subprocess.Popen(['node', '--import', str(guard), str(repo / 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '3002'],
                               cwd=copy_root, env=child_environment(), stdout=log, stderr=log, start_new_session=True)
state = {'purpose': 'restored-ui-read-only', 'pid': process.pid, 'appOrigin': 'http://127.0.0.1:3002',
         'restoreOrigin': 'http://127.0.0.1:55321', 'copyRoot': str(copy_root), 'revision': revision,
         'buildId': proof['buildId'], 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
         'fetchGuardSha256': digest(guard.read_bytes()), 'guardInstalledBeforeNext': True}
state_path.write_text(json.dumps(state, indent=2) + '\n')
os.chmod(state_path, 0o600)
print(json.dumps(state))
