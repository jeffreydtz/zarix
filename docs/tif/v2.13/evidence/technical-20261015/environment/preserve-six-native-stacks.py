#!/usr/bin/env python3
"""Separate, opt-in six-stack retention and official stop. Never run on import.

No mode means NO_ACTION. Preparation was checked with AST only. Archives are
retention evidence, not a successful restore. No raw active PG tree is copied.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
import traceback
import urllib.parse

SELF = Path(__file__).resolve()
PLAN = SELF.with_name('native-retention-six-plan.json')
REPO = SELF.parents[6]
RUNTIME = Path('/tmp/zarix-runtime-20261015')
EXPECTED = [
    ('source', '76703b1117a0712bb00c79764637c08b8886ad7851dd9b3306d649e081412dd9', 54322, 'ZARIX_LOCAL'),
    ('restore', 'eba0705e785c32981474ff420bc2da819e603fce4e36d2c4d244f9cbfab7dcb5', 55322, 'ZARIX_RESTORE'),
    ('load', 'a45abaa43633f9c7178168b599d5e0d10d64fde22f8c0f9af3d7a11f6e80c5e8', 56322, 'ZARIX_LOAD'),
    ('e2e', 'c79b2630488b3fa65beb7c0e4e349cefee720ffc64e30aeeeb30ca2fba66f68d', 57322, 'ZARIX_E2E'),
    ('proof', 'c23a7df7600999c31f2d8435146f55289db07f9f62dfc5d6f08b2562a1529a09', 58322, 'ZARIX_PROOF'),
    ('import-target', '464ddf6b0b5a668c62673d1cd02948d93a11b7007d902ee0d40388058ac95f44', 59322, 'ZARIX_IMPORT'),
]
EXCLUDED = {'home', 'bin', 'node_modules', '.git', '.next', 'downloads', '__pycache__', 'cache'}
PRIVATE_TAGS = ('private', 'auth', 'session')
SENSITIVE_TAGS = ('cookie', 'session', 'login', 'recovery', '.env')
CONFIRMATIONS = {
    'retain': {'ZARIX_SIX_NATIVE_RETAIN_CONFIRM': 'retain-six-task-owned-stacks',
               'ZARIX_SIX_NATIVE_WRITERS_RELEASED': 'all-six-fixtures-quiesced'},
    'stop': {'ZARIX_SIX_NATIVE_STOP_CONFIRM': 'stop-six-after-complete-retention',
             'ZARIX_SIX_NATIVE_WRITERS_RELEASED': 'all-six-fixtures-quiesced',
             'ZARIX_SIX_NATIVE_ROOT_RELEASED': 'root-released-six-fixtures'},
}


class Blocked(Exception):
    """Public output includes only this controlled reason code."""


def require(condition, code):
    if not condition:
        raise Blocked(code)


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def sha_json(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def normalize_tmp(path):
    p = Path(path)
    return Path('/private/tmp') / p.relative_to('/tmp') if str(p).startswith('/tmp/') else p


def inside(path, anchor, missing=False):
    """Allow macOS /tmp alias only; reject links below the chosen owned anchor."""
    anchor = Path(anchor).resolve()
    p = normalize_tmp(path).absolute()
    try:
        parts = p.relative_to(anchor).parts
    except ValueError:
        raise Blocked('path_outside_owned_anchor') from None
    require(all(x not in ('.', '..') for x in parts), 'unsafe_path_component')
    current = anchor
    for part in parts:
        current /= part
        try:
            info = current.lstat()
        except FileNotFoundError:
            require(missing, 'required_path_missing')
            break
        require(not stat.S_ISLNK(info.st_mode), 'symlink_rejected')
    return p


def regular(path, private=False):
    info = Path(path).lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.getuid(), 'unsafe_regular_file')
    if private:
        require(stat.S_IMODE(info.st_mode) == 0o600, 'private_file_not_0600')
    return info


def read_json(path, private=False):
    regular(path, private)
    return json.loads(Path(path).read_text())


def mkdir_private(path):
    path = Path(path)
    if path.exists():
        info = path.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700, 'unsafe_private_directory')
    else:
        if not path.parent.exists():
            mkdir_private(path.parent)
        path.mkdir(mode=0o700)


def write_json(path, value, replace=False):
    path = Path(path)
    mkdir_private(path.parent)
    target = path.with_name(path.name + '.new-' + str(os.getpid())) if replace else path
    with target.open('x') as stream:
        os.chmod(target, 0o600)
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    if replace:
        os.replace(target, path)
    descriptor = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def copy_file(source, target, storage_object=False):
    source, target = Path(source), Path(target)
    require(storage_object or source.name not in ('PG_VERSION', 'postmaster.pid', 'pg_control'), 'raw_pg_copy_rejected')
    info = regular(source)
    mkdir_private(target.parent)
    descriptor = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        current = os.fstat(descriptor)
        require((current.st_dev, current.st_ino) == (info.st_dev, info.st_ino), 'source_file_changed')
        with os.fdopen(descriptor, 'rb', closefd=False) as src, target.open('xb') as dst:
            os.chmod(target, 0o600)
            for chunk in iter(lambda: src.read(1024 * 1024), b''):
                dst.write(chunk)
            dst.flush()
            os.fsync(dst.fileno())
    finally:
        os.close(descriptor)
    require(sha_file(source) == sha_file(target), 'copy_digest_mismatch')


def walk_files(root, skip=(), exclude_runtime=True, reject_raw_pg=True):
    root = Path(root)
    def walk_error(_error):
        raise Blocked('artifact_walk_failed')
    for current, directories, files in os.walk(root, followlinks=False, onerror=walk_error):
        current = Path(current)
        kept = []
        for name in sorted(directories):
            p = current / name
            if (exclude_runtime and (name in EXCLUDED or name.endswith('-cache'))) or any(p == s or s in p.parents for s in skip):
                continue
            require(not p.is_symlink(), 'directory_link_rejected')
            kept.append(name)
        directories[:] = kept
        require(not reject_raw_pg or 'PG_VERSION' not in files, 'raw_pg_tree_rejected')
        for name in sorted(files):
            p = current / name
            regular(p)
            yield p


def inventory(root):
    root = Path(root)
    if not root.exists():
        return {'exists': False, 'files': {}}
    require(root.is_dir() and not root.is_symlink(), 'unsafe_storage_directory')
    # Storage keys can legitimately contain names such as cache or PG_VERSION.
    return {'exists': True, 'files': {str(p.relative_to(root)): {'bytes': p.stat().st_size, 'sha256': sha_file(p)}
                                    for p in walk_files(root, exclude_runtime=False, reject_raw_pg=False)}}


def stable_state(state):
    return {key: ([{'id': i['id'], 'creation': i['creation']} for i in state[key]] if key == 'instances' else state[key])
            for key in ('id', 'identity', 'runtime', 'instances', 'composition', 'credentials', 'ports')}


def command(argv, env=None, log=None, output=None, input_text=None, timeout=600):
    # Never include stdout, stderr, argv or environment in an exception/public log.
    handles = []
    try:
        stderr = open(log, 'xb') if log else subprocess.PIPE
        if log:
            handles.append(stderr)
            os.chmod(log, 0o600)
        stdout = open(output, 'xb') if output else subprocess.PIPE
        if output:
            handles.append(stdout)
            os.chmod(output, 0o600)
        result = subprocess.run([str(x) for x in argv], env=env, stdout=stdout, stderr=stderr,
                                input=None if input_text is None else input_text.encode(), timeout=timeout)
        require(result.returncode == 0, 'private_command_failed')
        return result.stdout.decode() if output is None else ''
    finally:
        for stream in handles:
            stream.flush()
            os.fsync(stream.fileno())
            stream.close()


def processes():
    env = dict(os.environ, TZ='Etc/UTC', LC_ALL='C', LANG='C')
    text = command(['/bin/ps', '-axo', 'pid=,ppid=,uid=,lstart=,comm='], env=env, timeout=20)
    result = {}
    for line in text.splitlines():
        fields = line.split(None, 8)
        if len(fields) == 9 and all(x.isdigit() for x in fields[:3]):
            pid, ppid, uid = map(int, fields[:3])
            result[pid] = {'pid': pid, 'ppid': ppid, 'uid': uid, 'start': ' '.join(fields[3:8]), 'comm': fields[8]}
    return result


def same_process(a, b):
    return b is not None and all(a[k] == b[k] for k in ('pid', 'uid', 'start', 'comm'))


def same_bindings(current, previous):
    # SQL backends/autovacuum can come and go during a read-only dump. Pin the
    # owner and postmaster identities and every listener; capture fresh owned
    # descendants immediately before stop instead of demanding frozen backends.
    if any(current[k] != previous[k] for k in ('stableStateSha256', 'configSha256', 'listeners', 'fingerprint', 'ownerPid', 'postmasterPid')):
        return False
    old = {p['pid']: p for p in previous['ownedProcesses']}
    new = {p['pid']: p for p in current['ownedProcesses']}
    return all(pid in old and same_process(old[pid], new.get(pid)) for pid in (previous['ownerPid'], previous['postmasterPid']))


def listeners(pids=None, port=None):
    argv = ['/usr/sbin/lsof', '-nP', '-a']
    if pids:
        argv += ['-p', ','.join(str(p) for p in sorted(pids))]
    argv += ['-iTCP' + (':' + str(port) if port else ''), '-sTCP:LISTEN', '-Fpn']
    raw = subprocess.run(argv, capture_output=True, timeout=20)
    require(raw.returncode in (0, 1), 'listener_probe_failed')
    result, pid = [], None
    for line in raw.stdout.decode().splitlines():
        if line.startswith('p'):
            pid = int(line[1:])
        elif line.startswith('n') and pid is not None:
            result.append({'pid': pid, 'address': line[1:]})
    return sorted(result, key=lambda x: (x['pid'], x['address']))


def pg_environment(entry):
    path = inside(RUNTIME / (entry['name'] + '.env'), RUNTIME)
    regular(path, private=True)
    values = {}
    for line in path.read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        key, value = line.split('=', 1)
        values[key] = json.loads(value) if value.startswith('"') else value.strip("'")
    prefix = next(x[3] for x in EXPECTED if x[0] == entry['name'])
    url = urllib.parse.urlparse(values[prefix + '_DATABASE_URL'])
    require(url.scheme in ('postgres', 'postgresql') and url.hostname == '127.0.0.1'
            and url.port == entry['expectedPostgresPort'] and url.path == '/postgres'
            and not url.query and not url.fragment, 'database_env_target_mismatch')
    user = urllib.parse.unquote(url.username or '')
    require(user in ('postgres', 'supabase_admin'), 'unexpected_database_user')
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env.update(PGHOST='127.0.0.1', PGHOSTADDR='127.0.0.1', PGPORT=str(url.port), PGDATABASE='postgres',
               PGUSER=user, PGPASSWORD=urllib.parse.unquote(url.password or ''), PGCONNECT_TIMEOUT='10',
               PGOPTIONS='-c default_transaction_read_only=on', PGAPPNAME='zarix-six-private-retention')
    return env


def sql(plan, entry, query):
    text = command([Path(plan['postgresBin']) / 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
                   env=pg_environment(entry), input_text='BEGIN READ ONLY;SET LOCAL TIME ZONE \'UTC\';' + query + ';COMMIT;')
    return json.loads(text.strip())


def fingerprint(plan, entry):
    tables = sql(plan, entry, "SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'")
    require(len(tables) == 27 and all(re.fullmatch('[a-z_]+', t) for t in tables), 'public_table_set_mismatch')
    names = ['public.' + t for t in tables] + ['auth.users', 'auth.identities', 'storage.objects']
    pairs = []
    for name in names:
        pairs.append("'" + name + "',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')) FROM " + name + ' t)')
    return sql(plan, entry, 'SELECT jsonb_build_object(' + ','.join(pairs) + ')')


def preflight(plan, entry):
    expected_state = RUNTIME / 'home/stacks' / entry['stackId'] / 'state.json'
    require(normalize_tmp(entry['statePath']) == normalize_tmp(expected_state)
            and entry['configPath'] == str(Path(entry['workdir']) / 'supabase/config.toml'), 'state_or_config_path_mismatch')
    state_path = inside(entry['statePath'], RUNTIME)
    state = read_json(state_path)
    require(state['id'] == entry['stackId'] and state['runtime'] == 'native', 'native_identity_mismatch')
    workdir = inside(entry['workdir'], RUNTIME)
    require(normalize_tmp(state['identity']['projectRoot']) == workdir, 'project_root_mismatch')
    db = [i for i in state['instances'] if i['creation']['service'] == 'database']
    storage = [i for i in state['instances'] if i['creation']['service'] == 'storage']
    require(len(db) == len(storage) == 1 and db[0]['id'] == entry['databaseInstanceId'], 'service_identity_mismatch')
    data = inside(entry['dataDirectory'], RUNTIME)
    require(data == state_path.parent / 'data' / db[0]['id'] / 'data', 'pg_data_directory_mismatch')
    version = inside(data / 'PG_VERSION', RUNTIME)
    regular(version)
    require(version.read_text().strip() == '17', 'pg_version_mismatch')
    ports = {p['key']: (p['host'], p['port']) for p in state['ports']}
    require(ports['api'] == ('127.0.0.1', entry['expectedPublicApiPort'])
            and ports[db[0]['id'] + ':sql'] == ('127.0.0.1', entry['expectedPostgresPort']), 'state_ports_mismatch')
    storage_root = inside(storage[0]['creation']['config']['filePath'], RUNTIME, missing=True)
    require(storage_root == workdir / 'supabase/.temp/stack-uploads' / entry['stackId']
            and storage_root == normalize_tmp(entry['storageFilePath']), 'storage_path_mismatch')
    owner_path = inside(state_path.parent / 'owner.json', RUNTIME)
    owner = read_json(owner_path)
    postmaster_file = inside(data / 'postmaster.pid', RUNTIME)
    regular(postmaster_file)
    pm = postmaster_file.read_text().splitlines()
    require(len(pm) >= 4 and normalize_tmp(pm[1]) == data and int(pm[3]) == entry['expectedPostgresInternalPort'], 'postmaster_metadata_mismatch')
    all_processes = processes()
    owner_pid = owner['pid']
    require(isinstance(owner_pid, int) and owner_pid in all_processes and all_processes[owner_pid]['uid'] == os.getuid(), 'owner_not_live_owned_process')
    owned = {owner_pid}
    while True:
        new = {pid for pid, p in all_processes.items() if p['ppid'] in owned}
        if new <= owned:
            break
        owned |= new
    require(int(pm[0]) in owned and all(all_processes[p]['uid'] == os.getuid() for p in owned), 'postgres_not_owned_descendant')
    owned_listeners = listeners(owned)
    for port in (entry['expectedPostgresPort'], entry['expectedPublicApiPort']):
        actual = listeners(port=port)
        require(actual and all(p['pid'] in owned and p['address'] == '127.0.0.1:' + str(port) for p in actual), 'expected_listener_not_exactly_owned')
    # Native SQL's owned TCP frontend forwards to this cluster's Unix socket.
    # inet_server_port is then NULL; current_setting('port') remains 5432.
    identity = sql(plan, entry, "SELECT json_build_object('database',current_database(),'port',inet_server_port(),'configuredPort',current_setting('port')::integer,'dataDirectory',current_setting('data_directory'))")
    require(identity['database'] == 'postgres' and identity['port'] in (None, entry['expectedPostgresInternalPort'])
            and identity['configuredPort'] == entry['expectedPostgresInternalPort']
            and normalize_tmp(identity['dataDirectory']) == data, 'sql_identity_mismatch')
    started = read_json(inside(RUNTIME / (entry['name'] + '-start.json'), RUNTIME), private=True)
    require(started['id'] == entry['stackId'] and started['runtime'] == 'native'
            and started['env']['API_URL'] == 'http://127.0.0.1:' + str(entry['expectedPublicApiPort']), 'start_metadata_mismatch')
    return {'stack': entry['name'], 'stackId': entry['stackId'], 'stateSha256': sha_file(state_path),
            'stableStateSha256': sha_json(stable_state(state)), 'configSha256': sha_file(entry['configPath']),
            'dataDirectory': str(data), 'pgVersionSha256': sha_file(version), 'storageRoot': str(storage_root),
            'ownerPid': owner_pid, 'postmasterPid': int(pm[0]), 'ownedProcesses': [all_processes[p] for p in sorted(owned)],
            'listeners': owned_listeners, 'fingerprint': fingerprint(plan, entry)}


def selected_artifacts(plan):
    selected = set()
    projects = {normalize_tmp(s['workdir']) for s in plan['stacks']}
    for child in RUNTIME.iterdir():
        p = normalize_tmp(child)
        if child.name in EXCLUDED or child.name.endswith('-cache') or p in projects:
            continue
        require(not child.is_symlink(), 'runtime_artifact_link_rejected')
        if child.is_file():
            selected.add(p)
        elif child.is_dir():
            full = any(tag in child.name.lower() for tag in PRIVATE_TAGS) or child.name.startswith(('proof-', 'import-target-'))
            for file in walk_files(p):
                if full or any(tag in str(file.relative_to(RUNTIME.resolve())).lower() for tag in SENSITIVE_TAGS):
                    selected.add(file)
    for entry in plan['stacks']:
        project = inside(entry['workdir'], RUNTIME)
        uploads = inside(project / 'supabase/.temp/stack-uploads', RUNTIME, missing=True)
        selected.update(walk_files(project, skip=(uploads,)))
        state = inside(entry['statePath'], RUNTIME)
        root_key = inside(Path(entry['dataDirectory']).parent / 'pgsodium_root.key', RUNTIME)
        regular(root_key, private=True)
        selected.update((state, state.parent / 'owner.json', root_key))
    required = [RUNTIME / (s['name'] + suffix) for s in plan['stacks'] for suffix in ('.env', '-start.json')]
    required += [RUNTIME / name for name in ('source-native-logins.json', 'e2e-logins.json', 'proof-logins.json', 'import-target-logins.json')]
    require(all(normalize_tmp(p) in selected for p in required), 'required_credential_artifact_missing')
    for name in ('proof-private', 'import-target-private', 'proof-recovery-private', 'proof-auth-expiry-private-attempt-2', 'proof-auth-expiry-resume'):
        require((RUNTIME / name).is_dir(), 'required_nested_auth_directory_missing')
    return sorted(selected)


def artifact_inventory(root):
    return {str(p.relative_to(root)): {'bytes': p.stat().st_size, 'sha256': sha_file(p)}
            for p in walk_files(root, exclude_runtime=False, reject_raw_pg=False)}


def sync_private_tree(root):
    # Finish all retained bytes and directory entries before the complete
    # checkpoint can authorize a later stop. This never copies active PG data.
    root = Path(root)
    def walk_error(_error):
        raise Blocked('artifact_walk_failed')
    directories = {Path(current) for current, _, _ in os.walk(root, followlinks=False, onerror=walk_error)}
    for p in walk_files(root, exclude_runtime=False, reject_raw_pg=False):
        regular(p, private=True)
        descriptor = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        directories.update(parent for parent in p.parents if parent == root or root in parent.parents)
    directories.add(Path(root).parent)
    for directory in sorted(directories, key=lambda p: len(p.parts), reverse=True):
        if directory != Path(root).parent:
            mkdir_private(directory)
        descriptor = os.open(directory, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def retention_directory(plan, value=None, create=False):
    parent = Path(plan['retentionParent']).resolve()
    p = Path(value) if value else parent / ('zarix-private-final-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    require(p.is_absolute() and p.parent == parent and re.fullmatch(r'zarix-private-final-[0-9]{8}T[0-9]{6}Z', p.name), 'retention_directory_outside_allowed_sibling')
    require(REPO.resolve() not in p.parents, 'retention_directory_inside_git')
    if create:
        require(not p.exists() and not p.is_symlink(), 'retention_directory_already_exists')
        p.mkdir(mode=0o700)
    inside(p, parent)
    mkdir_private(p)
    return p


def retain(plan, value):
    snapshots = {s['name']: preflight(plan, s) for s in plan['stacks']}
    root = retention_directory(plan, value, create=True)
    report = {'status': 'RETAIN_RUNNING', 'createdAt': utc(), 'privateDirectory': str(root), 'planSha256': sha_file(PLAN),
              'controllerSha256': sha_file(SELF), 'restoreAcceptanceClaimed': False, 'stacks': [], 'sourceArtifacts': []}
    try:
        for entry in plan['stacks']:
            name = entry['name']
            target = root / 'stacks' / name
            mkdir_private(target)
            original = snapshots[name]
            before_storage = inventory(original['storageRoot'])
            require(before_storage['exists'] or original['fingerprint']['storage.objects']['rows'] == 0, 'storage_bytes_missing_for_metadata')
            dump = target / 'database.dump'
            command([Path(plan['postgresBin']) / 'pg_dump', '-Fc', '--file', dump], env=pg_environment(entry), log=target / 'dump.stderr.private.log')
            regular(dump, private=True)
            require(dump.stat().st_size > 0, 'empty_archive')
            with dump.open('rb') as stream:
                require(stream.read(5) == b'PGDMP', 'archive_not_custom_format')
            command([Path(plan['postgresBin']) / 'pg_restore', '--list', dump], output=target / 'archive-toc.private.txt', log=target / 'archive-list.stderr.private.log')
            require((target / 'archive-toc.private.txt').stat().st_size > 0, 'empty_archive_toc')
            command([Path(plan['postgresBin']) / 'pg_restore', '--file=/dev/null', dump], log=target / 'archive-decode.stderr.private.log')
            globals_file = target / 'globals.private.sql'
            command([Path(plan['postgresBin']) / 'pg_dumpall', '--globals-only', '--file', globals_file], env=pg_environment(entry), log=target / 'globals.stderr.private.log')
            regular(globals_file, private=True)
            require(globals_file.stat().st_size > 0, 'empty_globals_archive')
            storage_target = target / 'storage-bytes'
            mkdir_private(storage_target)
            if before_storage['exists']:
                for p in walk_files(original['storageRoot'], exclude_runtime=False, reject_raw_pg=False):
                    copy_file(p, storage_target / p.relative_to(original['storageRoot']), storage_object=True)
            require(inventory(original['storageRoot']) == before_storage, 'storage_changed_during_retention')
            require(inventory(storage_target)['files'] == before_storage['files'], 'retained_storage_bytes_mismatch')
            require(fingerprint(plan, entry) == original['fingerprint'], 'logical_data_changed_during_retention')
            report['stacks'].append({'name': name, 'status': 'PASS', 'snapshot': original, 'storageInventory': before_storage,
                                     'archive': str(dump.relative_to(root)), 'archiveSha256': sha_file(dump),
                                     'archiveListValidation': True, 'archivePayloadDecodeValidation': True,
                                     'restoreExecuted': False, 'globals': str(globals_file.relative_to(root))})
            write_json(root / 'retention-progress.private.json', report, replace=(root / 'retention-progress.private.json').exists())
        for source in selected_artifacts(plan):
            relative = source.relative_to(RUNTIME.resolve())
            destination = root / 'runtime-artifacts' / relative
            copy_file(source, destination)
            report['sourceArtifacts'].append({'source': str(source), 'retained': str(destination.relative_to(root)), 'sha256': sha_file(destination),
                                              'criticalBeforeStop': source.suffix not in ('.log', '.stderr')})
        # Recheck all six after every archive and artifact has been retained.
        for entry in plan['stacks']:
            current = preflight(plan, entry)
            original = snapshots[entry['name']]
            require(same_bindings(current, original), 'final_retention_binding_changed')
        require(len(report['stacks']) == 6 and all(s['status'] == 'PASS' for s in report['stacks']), 'all_six_archives_required')
        sync_private_tree(root)
        report.update(status='RETAIN_PASS', completedAt=utc())
        # Progress is private diagnostic history; checkpoint binds all other bytes.
        report['retainedFiles'] = {k: v for k, v in artifact_inventory(root).items() if k != 'retention-progress.private.json'}
        write_json(root / 'checkpoint.private.json', report)
        print(json.dumps({'status': 'RETAIN_PASS', 'stacks': 6, 'privateDirectory': str(root), 'checkpointSha256': sha_file(root / 'checkpoint.private.json'), 'restoreAcceptanceClaimed': False, 'stopped': 0}))
    except Exception:
        report.update(status='RETAIN_FAIL', failedAt=utc())
        write_json(root / 'retention-failure.private.json', report)
        raise


def validate_retained(plan, root, report):
    require(report['status'] == 'RETAIN_PASS' and report['planSha256'] == sha_file(PLAN)
            and report['controllerSha256'] == sha_file(SELF), 'checkpoint_not_complete_or_code_changed')
    require(len(report['stacks']) == 6 and all(s['status'] == 'PASS' and s['archiveListValidation'] and s['archivePayloadDecodeValidation'] for s in report['stacks']), 'six_validated_archives_missing')
    for relative, expected in report['retainedFiles'].items():
        p = inside(root / relative, root)
        regular(p, private=True)
        require(p.stat().st_size == expected['bytes'] and sha_file(p) == expected['sha256'], 'retained_artifact_changed')
    for artifact in report['sourceArtifacts']:
        if artifact['criticalBeforeStop']:
            source = inside(artifact['source'], RUNTIME)
            regular(source)
            require(sha_file(source) == artifact['sha256'], 'source_credential_or_config_changed_after_retention')
    previous_critical = {a['source'] for a in report['sourceArtifacts'] if a['criticalBeforeStop']}
    current_critical = {str(p) for p in selected_artifacts(plan) if p.suffix not in ('.log', '.stderr')}
    require(current_critical == previous_critical, 'auth_or_configuration_artifact_set_changed_after_retention')


def after_stop(entry, retained, shutdown_snapshot):
    previous = retained['snapshot']
    seen_processes = previous['ownedProcesses'] + shutdown_snapshot['ownedProcesses']
    deadline = time.monotonic() + 45
    while True:
        table = processes()
        survivors = [p for p in seen_processes if same_process(p, table.get(p['pid']))]
        ports = {int(x['address'].rsplit(':', 1)[1]) for x in previous['listeners']}
        remaining = [item for port in ports for item in listeners(port=port)]
        if not survivors and not remaining:
            break
        require(time.monotonic() < deadline, 'owned_process_or_listener_still_present')
        time.sleep(0.5)
    state = read_json(inside(entry['statePath'], RUNTIME))
    require(sha_json(stable_state(state)) == previous['stableStateSha256'], 'retained_state_or_credentials_changed_after_stop')
    require(sha_file(entry['configPath']) == previous['configSha256'], 'project_config_changed_after_stop')
    data = inside(entry['dataDirectory'], RUNTIME)
    require(data.is_dir() and sha_file(data / 'PG_VERSION') == previous['pgVersionSha256'], 'native_pg_data_not_retained')
    require(inventory(previous['storageRoot']) == retained['storageInventory'], 'owned_storage_changed_after_stop')
    return {'oldOwnedProcessIdentitiesExited': True, 'capturedListenersGone': True, 'nativePgDataDirectoryRetained': True,
            'pgVersionRetained': True, 'stateConfigurationCredentialsRetained': True, 'storageBytesRetained': True,
            'walAndPgControlByteEqualityClaimed': False}


def stop(plan, value):
    require(value is not None, 'stop_requires_exact_retention_root')
    root = retention_directory(plan, value)
    checkpoint_path = inside(root / 'checkpoint.private.json', root)
    report = read_json(checkpoint_path, private=True)
    validate_retained(plan, root, report)
    # Do not automatically retry a partial stop; the parent must inspect outcomes.
    require(not (root / 'stop-results.private.json').exists(), 'previous_stop_attempt_requires_review')
    records = {s['name']: s for s in report['stacks']}
    require(set(records) == {e['name'] for e in plan['stacks']}, 'checkpoint_stack_set_mismatch')
    for entry in plan['stacks']:
        current = preflight(plan, entry)
        expected = records[entry['name']]['snapshot']
        require(same_bindings(current, expected), 'prestop_binding_or_data_changed')
        require(inventory(current['storageRoot']) == records[entry['name']]['storageInventory'], 'prestop_storage_changed')
    result = {'status': 'STOP_RUNNING', 'startedAt': utc(), 'checkpointSha256': sha_file(checkpoint_path), 'stacks': [], 'dataDeleted': False, 'restoreAcceptanceClaimed': False}
    write_json(root / 'stop-results.private.json', result)
    base = {k: v for k, v in os.environ.items() if not k.startswith(('SUPABASE_', 'PG'))}
    base.update(SUPABASE_HOME=plan['supabaseHome'], SUPABASE_EXPERIMENTAL_STACK='1', SUPABASE_NO_UPDATE_NOTIFIER='1')
    for entry in plan['stacks']:
        item = {'name': entry['name'], 'stackId': entry['stackId'], 'status': 'BLOCKED'}
        try:
            # Revalidate immediately before each independently scoped stop too.
            current = preflight(plan, entry)
            expected = records[entry['name']]['snapshot']
            require(same_bindings(current, expected), 'binding_or_data_changed_before_this_stop')
            require(inventory(current['storageRoot']) == records[entry['name']]['storageInventory'], 'storage_changed_before_this_stop')
            command(entry['stopArgv'], env=base, output=root / ('stop-' + entry['name'] + '.stdout.private.json'),
                    log=root / ('stop-' + entry['name'] + '.stderr.private.log'), timeout=120)
            item.update(status='PASS', officialCliExitCode=0, postconditions=after_stop(entry, records[entry['name']], current))
        except Exception as error:
            item['reason'] = str(error) if isinstance(error, Blocked) else type(error).__name__
            with (root / ('stop-' + entry['name'] + '.diagnostic.private.log')).open('x') as stream:
                os.chmod(stream.name, 0o600)
                traceback.print_exc(file=stream)
        result['stacks'].append(item)
        write_json(root / 'stop-results.private.json', result, replace=True)
    result.update(status='STOP_PASS' if all(s['status'] == 'PASS' for s in result['stacks']) else 'STOP_PARTIAL_OR_BLOCKED', finishedAt=utc())
    write_json(root / 'stop-results.private.json', result, replace=True)
    print(json.dumps({'status': result['status'], 'privateDirectory': str(root), 'stoppedAndVerified': sum(s['status'] == 'PASS' for s in result['stacks']), 'dataDeleted': False, 'restoreAcceptanceClaimed': False}))
    return 0 if result['status'] == 'STOP_PASS' else 1


def load_plan():
    plan = read_json(PLAN)
    require(plan['repositoryRoot'] == str(REPO) and plan['runtimeRoot'] == str(RUNTIME), 'plan_root_mismatch')
    require(len(plan['stacks']) == 6, 'plan_must_have_six_stacks')
    for entry, (name, stack_id, port, _) in zip(plan['stacks'], EXPECTED):
        require((entry['name'], entry['stackId'], entry['expectedPostgresPort'], entry['expectedPublicApiPort'], entry['workdir'])
                == (name, stack_id, port, port - 1, str(RUNTIME / name)), 'plan_stack_pin_mismatch')
        require(entry['expectedPostgresInternalPort'] == 5432, 'plan_internal_postgres_port_mismatch')
        require(entry['stopArgv'] == [str(RUNTIME / 'bin/supabase'), 'stack', 'stop', '--workdir', entry['workdir'], '--stack-id', stack_id, '--output-format', 'json'], 'official_stop_argv_mismatch')
    require(plan['cliPath'] == str(RUNTIME / 'bin/supabase') and plan['supabaseHome'] == str(RUNTIME / 'home')
            and plan['retentionParent'] == str(REPO.parent)
            and plan['postgresBin'] == str(RUNTIME / 'home/cache/stack/slim-services/postgres/17.11.0.004-r1/darwin-arm64/bin'), 'plan_tool_path_mismatch')
    require(plan['confirmations'] == CONFIRMATIONS, 'operational_confirmation_contract_changed')
    return plan


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', nargs='?', choices=('retain', 'stop'))
    parser.add_argument('--retention-root')
    args = parser.parse_args()
    if args.phase is None:
        print(json.dumps({'status': 'NO_ACTION', 'phases': ['retain', 'stop'], 'plan': str(PLAN), 'runtimeActionsPerformed': False}))
        return 0
    plan = load_plan()
    for name, value in plan['confirmations'][args.phase].items():
        require(os.environ.get(name) == value, 'operational_phase_confirmation_missing')
    if args.phase == 'retain':
        retain(plan, args.retention_root)
        return 0
    return stop(plan, args.retention_root)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        # No raw errors, URLs, credentials, Auth values or command output.
        print(json.dumps({'status': 'BLOCKED', 'reason': str(error) if isinstance(error, Blocked) else type(error).__name__,
                          'dataDeleted': False, 'restoreAcceptanceClaimed': False}))
        sys.exit(1)
