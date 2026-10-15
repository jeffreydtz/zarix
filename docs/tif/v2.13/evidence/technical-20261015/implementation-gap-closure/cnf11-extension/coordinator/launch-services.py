#!/usr/bin/env python3
"""Start dedicated loopback Auth/REST/provider/gateway only after explicit release."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import socket
import subprocess
import time
import urllib.parse
import urllib.request
import sys
sys.dont_write_bytecode = True
from common import check_copy, guard_module, invariant_files, worktree_guard


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--private-directory', required=True)
    args = parser.parse_args()
    assert os.environ.get('ZARIX_CNF11_EXTENSION_WINDOW') == 'parent-released-cnf11-extension'
    os.umask(0o077)
    root = pathlib.Path(args.private_directory)
    assert re.fullmatch(r'/tmp/zarix-runtime-20261015/cnf11-extension-[0-9a-f-]{36}', str(root))
    assert not root.is_symlink() and root.stat().st_mode & 0o777 == 0o700
    config = json.loads((root / 'targets.metadata.json').read_text())
    assert config['purpose'] == 'zarix-cnf11-extension'
    invariant_files()
    check_copy(config)
    worktree_guard()
    assert json.loads((root / 'reopen-readiness.sanitized.json').read_text())['status'] == 'EXISTING_CLONE_REOPEN_READY'
    guard = guard_module()
    native_plan = guard.load_plan()
    native_stack = next(item for item in native_plan['stacks'] if item['name'] == 'proof')
    native_before = json.loads((root / 'native-original-preflight.private.json').read_text())
    assert guard.same_bindings(guard.preflight(native_plan, native_stack), native_before)
    assert re.fullmatch('zarix_delta_[0-9a-f]{32}', config['newDatabaseName'])
    assert config['databaseHost'] == '127.0.0.1' and config['databasePort'] == 58322
    state = json.loads(pathlib.Path(config['existingNativeStateFile']).read_text())
    assert state['id'] == 'c23a7df7600999c31f2d8435146f55289db07f9f62dfc5d6f08b2562a1529a09'
    creation = {entry['creation']['service']: entry['creation']['config'] for entry in state['instances']}
    material = {}
    for kind, key in [('rest', 'restDatabaseUrl'), ('auth', 'authDatabaseUrl')]:
        url = urllib.parse.urlparse(creation[kind]['databaseUrl'])
        assert url.hostname == '127.0.0.1' and url.port == 58322 and url.path == '/postgres'
        material[key] = urllib.parse.urlunparse(url._replace(path='/' + config['newDatabaseName']))
    assert not (root / 'services.metadata.json').exists() and not (root / 'services-attempt.private.json').exists()
    for port in [61321, 61323, 61327, 61329]:
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', port))
    def save(path, value):
        with path.open('x') as stream:
            os.chmod(path, 0o600)
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
    def digest(path):
        return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
    existing = pathlib.Path('/tmp/zarix-runtime-20261015/e2e-app.env')
    env_values = dict((key, json.loads(value)) for key, value in
        (line.split('=', 1) for line in existing.read_text().splitlines() if line and not line.startswith('#')))
    assert existing.stat().st_mode & 0o077 == 0 and len(env_values['CRON_SECRET']) >= 20
    # No new copy of a credential or process environment is persisted. The
    # runners derive their local provider-double HMAC placeholders in memory.
    users = json.loads(pathlib.Path(config['loginFile']).read_text())['users']
    provider_control = root / 'provider-control.private.json'
    save(provider_control, {'purpose': 'zarix-cnf11-extension-provider-control', 'mp': 'valid',
        'resources': {
            'zarix-cnf11-extension-nominal': {'status': 'authorized', 'userId': users[0]['id'], 'nextPaymentDate': '2026-11-06T12:00:00.000Z'},
            'zarix-cnf11-extension-db-failure': {'status': 'cancelled', 'userId': users[0]['id'], 'nextPaymentDate': '2026-11-06T12:00:00.000Z'},
        }})
    rest_env = {'PGRST_DB_URI': material['restDatabaseUrl'] + '?sslmode=disable', 'PGRST_DB_SCHEMAS': 'public',
        'PGRST_DB_EXTRA_SEARCH_PATH': 'public,extensions', 'PGRST_DB_ANON_ROLE': 'anon',
        'PGRST_JWT_SECRET': creation['rest']['jwks'], 'PGRST_SERVER_HOST': '127.0.0.1',
        'PGRST_SERVER_PORT': '61323', 'PGRST_DB_MAX_ROWS': '1000', 'PGRST_DB_POOL': '4',
        'PGRST_DB_CONFIG': 'false', 'PGRST_LOG_LEVEL': 'error'}
    auth_env = {'GOTRUE_API_HOST': '127.0.0.1', 'GOTRUE_API_PORT': '61327', 'API_HOST': '127.0.0.1',
        'PORT': '61327', 'API_EXTERNAL_URL': 'http://127.0.0.1:61321/auth/v1',
        'GOTRUE_SITE_URL': 'http://127.0.0.1:3006', 'GOTRUE_URI_ALLOW_LIST': 'http://127.0.0.1:3006/**',
        'GOTRUE_DB_DRIVER': 'postgres', 'GOTRUE_DB_DATABASE_URL': material['authDatabaseUrl'] + '?sslmode=disable',
        'GOTRUE_DB_NAMESPACE': 'auth', 'GOTRUE_JWT_SECRET': creation['auth']['jwtSecret'],
        'GOTRUE_JWT_KEYS': creation['auth']['gotrueJwtKeys'], 'GOTRUE_JWT_EXP': '3600',
        'GOTRUE_JWT_AUD': 'authenticated', 'GOTRUE_JWT_DEFAULT_GROUP_NAME': 'authenticated',
        'GOTRUE_JWT_ADMIN_ROLES': 'service_role', 'GOTRUE_DISABLE_SIGNUP': 'true',
        'GOTRUE_EXTERNAL_EMAIL_ENABLED': 'true', 'GOTRUE_MAILER_AUTOCONFIRM': 'true', 'GOTRUE_LOG_LEVEL': 'warn'}
    cache = pathlib.Path('/tmp/zarix-runtime-20261015/home/cache/stack/slim-services')
    auth_bin = cache / 'auth/v2.197.0-r0/darwin-arm64/bin/auth'
    rest_bin = cache / 'postgrest/v16.4-r0/darwin-arm64/bin/postgrest'
    http_script = pathlib.Path(__file__).with_name('local-http.mjs').resolve()
    repo = pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
    base = {key: value for key, value in os.environ.items() if key in ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL']}
    base.update(TZ='Etc/UTC', ZARIX_CNF11_EXTENSION_WINDOW='parent-released-cnf11-extension', ZARIX_CNF11_EXTENSION_PRIVATE=str(root))
    record = {'status': 'START_RESERVED', 'children': [], 'revision': config['revision'],
        'newDatabaseName': config['newDatabaseName'], 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    save(root / 'services-attempt.private.json', record)
    journal = (root / 'service-launch-journal.metadata.jsonl').open('x')
    os.chmod(root / 'service-launch-journal.metadata.jsonl', 0o600)
    def event(value):
        journal.write(json.dumps(value) + '\n')
        journal.flush()
        os.fsync(journal.fileno())
    def checkpoint():
        pending = root / 'services-attempt.private.new.json'
        save(pending, record)
        os.replace(pending, root / 'services-attempt.private.json')
    children = []
    def launch(name, argv, port, extra=None):
        intent = {'name': name, 'argv': [str(x) for x in argv], 'port': port, 'cwd': str(repo),
            'status': 'SPAWN_RESERVED', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        event(intent)
        child = subprocess.Popen([str(x) for x in argv], cwd=repo, env={**base, **(extra or {})},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        children.append(child)
        item = {'name': name, 'pid': child.pid, 'port': port, 'argv': [str(x) for x in argv],
            'cwd': str(repo), 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'rawOutputDisposition': 'discarded-before-filesystem'}
        record['children'].append(item)
        event({**item, 'status': 'SPAWNED_OWN_CHILD'})
        checkpoint()
        for _ in range(80):
            assert child.poll() is None, 'Owned service exited; diagnostics retained privately'
            probe = subprocess.run(['/usr/sbin/lsof', '-nP', '-a', '-p', str(child.pid),
                '-iTCP:' + str(port), '-sTCP:LISTEN', '-Fn'], capture_output=True, text=True)
            if probe.returncode == 0:
                assert [line[1:] for line in probe.stdout.splitlines() if line.startswith('n')] == ['127.0.0.1:' + str(port)]
                item['exactOwnLoopbackListener'] = True
                event({'name': name, 'pid': child.pid, 'port': port, 'status': 'OWN_LOOPBACK_READY'})
                checkpoint()
                return
            time.sleep(.25)
        raise AssertionError('Owned service readiness timed out')
    try:
        launch('postgrest', [rest_bin], 61323, rest_env)
        launch('auth', [auth_bin], 61327, auth_env)
        launch('gateway', ['node', http_script, 'gateway'], 61321)
        launch('provider', ['node', http_script, 'provider'], 61329)
        for url in ['http://127.0.0.1:61327/health', 'http://127.0.0.1:61321/auth/v1/health', 'http://127.0.0.1:61329/health']:
            with urllib.request.urlopen(url, timeout=10) as response:
                assert response.status == 200
        result = {**record, 'status': 'INFRA_READY_ACCEPTANCE_PENDING',
            'providerControlFile': str(provider_control), 'providerJournalFile': str(root / 'provider-journal.private.jsonl'),
            'providerOrigin': 'http://127.0.0.1:61329', 'existingCronEnvironmentFile': str(existing),
            'originalAuthRequests': 0, 'newExternalCredentials': False,
            'authBinarySha256': digest(auth_bin), 'restBinarySha256': digest(rest_bin),
            'httpSourceSha256': digest(http_script), 'processSecretsPassedViaEphemeralEnvironmentOnly': True,
            'credentialValuesCopiedToFiles': False, 'rawOutputDisposition': 'discarded-before-filesystem'}
        save(root / 'services.metadata.json', result)
        record['status'] = result['status']
        checkpoint()
        invariant_files()
        journal.close()
        print(json.dumps({'status': result['status'], 'privateDirectory': str(root),
            'newDatabaseName': config['newDatabaseName'], 'services': [{'name': x['name'], 'pid': x['pid'], 'port': x['port']} for x in record['children']],
            'realProviders': False, 'browserUsed': False}))
    except BaseException:
        record['status'] = 'FAILED_OWN_CHILD_CLEANUP'
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    pass
        checkpoint()
        event({'status': 'FAILED_OWN_CHILD_CLEANUP', 'childrenStillRunning': [child.pid for child in children if child.poll() is None],
            'originalNativeStateReference': config['existingNativeStateFile']})
        # No test worker has run here. Close the exact unchanged PROOF only if
        # all temporary children exited; never hide an unowned running actor.
        if all(child.poll() is not None for child in children) and guard.same_bindings(guard.preflight(native_plan, native_stack), native_before):
            stop_env = {**os.environ, 'SUPABASE_HOME': '/tmp/zarix-runtime-20261015/home', 'SUPABASE_EXPERIMENTAL_STACK': '1', 'SUPABASE_NO_UPDATE_NOTIFIER': '1'}
            stopped = subprocess.run(native_stack['stopArgv'], env=stop_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
            event({'status': 'FAILED_LAUNCH_PROOF_OFFICIAL_STOP', 'cliExitCode': stopped.returncode})
        journal.close()
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False}))
        raise SystemExit(1)
