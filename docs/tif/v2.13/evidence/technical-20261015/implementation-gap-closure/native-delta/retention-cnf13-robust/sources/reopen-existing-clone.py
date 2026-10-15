#!/usr/bin/env python3
"""Reopen only PROOF and reference its already-retained clone; SQL is READ ONLY."""
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
import uuid


def main():
    assert os.environ.get('ZARIX_DELTA_REOPEN_WINDOW') == 'parent-released-cnf13-robust-only'
    os.umask(0o077)
    sys.dont_write_bytecode = True
    repo = Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
    runtime = Path('/tmp/zarix-runtime-20261015')
    prior = runtime / 'implementation-delta-db3cf513-b7ad-4f2b-abcd-a2a44aeed27b'
    previous_meta = json.loads((prior / 'targets.metadata.json').read_text())
    previous_stop = json.loads((prior / 'retention-stop.sanitized.json').read_text())
    assert previous_stop['status'] == 'RETAIN_AND_STOP_PASS'
    def sha(path):
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    previous_archive = Path(previous_stop['retention']['privateDirectory']) / 'database.dump'
    assert sha(previous_archive) == 'a9f03e0b2c4e91b30212fe8acda7267c64483d982b0b9971b3bf6317ef440bd1'
    assert previous_meta['newDatabaseName'] == 'zarix_delta_e4bd026f703549bfa24de940134184b8'
    helper = repo / 'docs/tif/v2.13/evidence/technical-20261015/environment/preserve-six-native-stacks-final.py'
    assert sha(helper) == 'bab8ac98200fde1eea5bbce532ef28e97348e7976c02adf434bef0d42db48688'
    spec = importlib.util.spec_from_file_location('robust_reopen_guards', helper)
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    plan = guard.load_plan()
    stack = next(entry for entry in plan['stacks'] if entry['name'] == 'proof')
    assert not guard.listeners(port=58321) and not guard.listeners(port=58322)
    run = str(uuid.uuid4())
    target = runtime / ('implementation-delta-' + run)
    target.mkdir(mode=0o700)
    def save(path, value):
        with path.open('x') as stream:
            os.chmod(path, 0o600)
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
    save(target / 'reopen-reservation.metadata.json', {'purpose': 'cnf13-robust-only', 'run': run,
        'existingDatabaseName': previous_meta['newDatabaseName'], 'priorRetentionSha256': previous_stop['retention']['archiveSha256'],
        'controllerSha256': sha(__file__), 'newDatabaseCreated': False, 'newUsersCreated': 0,
        'newCredentialFiles': 0, 'priorRuntimeDirectory': str(prior)})
    cli_env = {**os.environ, 'SUPABASE_HOME': str(runtime / 'home'),
        'SUPABASE_EXPERIMENTAL_STACK': '1', 'SUPABASE_NO_UPDATE_NOTIFIER': '1'}
    cli = runtime / 'bin/supabase'
    for argv in [[cli, 'stack', 'restart', '--help'], [cli, 'stack', 'restart', '--workdir', runtime / 'proof', '--stack-id', stack['stackId'], '--output-format', 'json']]:
        child = subprocess.run([str(value) for value in argv], env=cli_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        assert child.returncode == 0, 'Official reopen failed; no raw output persisted'
    native = guard.preflight(plan, stack)
    original_before = json.loads(Path(previous_meta['nativeOriginalPreflightFile']).read_text())
    for key in ['stableStateSha256', 'configSha256', 'fingerprint']:
        assert native[key] == original_before[key]
    env_file = Path(previous_meta['existingEnvironmentFile'])
    values = dict((key, json.loads(value)) for key, value in
        (line.split('=', 1) for line in env_file.read_text().splitlines() if line and not line.startswith('#')))
    url = urllib.parse.urlparse(values['ZARIX_PROOF_DATABASE_URL'])
    assert url.hostname == '127.0.0.1' and url.port == 58322 and url.path == '/postgres'
    pg_env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    pg_env.update(PGHOST='127.0.0.1', PGHOSTADDR='127.0.0.1', PGPORT='58322', PGUSER='supabase_admin',
        PGPASSWORD=urllib.parse.unquote(url.password), PGOPTIONS='-c default_transaction_read_only=on', PGCONNECT_TIMEOUT='10')
    def query(sql, database=previous_meta['newDatabaseName']):
        child = subprocess.run([str(Path(previous_meta['pgBin']) / 'psql'), '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql],
            env={**pg_env, 'PGDATABASE': database}, capture_output=True, text=True, timeout=30)
        assert child.returncode == 0
        return child.stdout.strip()
    checks = []
    for table, expected in previous_meta['originalFingerprints'].items():
        assert re.fullmatch(r'[a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*', table)
        actual = query("SELECT count(*)||':'||md5(COALESCE(string_agg(j::text,E'\\n' ORDER BY j::text),''))FROM(SELECT to_jsonb(t)j FROM " + table + ' t)x', 'postgres')
        checks.append({'table': table, 'unchanged': actual == expected})
    assert all(item['unchanged'] for item in checks)
    assert query('SELECT count(*) FROM auth.sessions') == query('SELECT count(*) FROM auth.refresh_tokens') == '0'
    expected_ids = sorted(user['id'] for user in json.loads(Path(previous_meta['loginFile']).read_text())['users'])
    assert json.loads(query('SELECT json_agg(id::text ORDER BY id::text)FROM auth.users')) == expected_ids
    assert query("SELECT count(*) FROM pg_trigger WHERE tgrelid='public.transactions'::regclass AND tgname='trigger_audit_transaction_deletion'") == '1'
    assert query("SELECT count(*) FROM information_schema.columns WHERE table_schema='public'AND table_name='users'AND column_name IN('default_currency','net_worth_widget_visible')") == '2'
    assert sha(previous_archive) == previous_stop['retention']['archiveSha256']
    save(target / 'native-original-preflight.private.json', native)
    meta = {**previous_meta, 'run': run, 'executionRevision': '730767b1723502b495d371e69c44df31eb230b56',
        'sourceCopyRoot': '/tmp/zarix-app-delta-db3cf513-b7ad-4f2b-abcd-a2a44aeed27b',
        'sourceRevision': '730767b1723502b495d371e69c44df31eb230b56',
        'nativeOriginalPreflightFile': str(target / 'native-original-preflight.private.json'),
        'existingApplicationBuildProofFile': str(prior / 'app-build.private.json'),
        'priorRuntimeDirectory': str(prior), 'purposeOfThisReopen': 'cnf13-robust-only', 'servicesStarted': False}
    save(target / 'targets.metadata.json', meta)
    result = {'status': 'EXISTING_CLONE_REOPEN_READY', 'run': run, 'privateDirectory': str(target),
        'newDatabaseName': meta['newDatabaseName'], 'newDatabaseCreated': False, 'newUsersCreated': 0,
        'newCredentialFiles': 0, 'sqlWrites': 0, 'originalIntegrity': checks,
        'authSessionsRemaining': 0, 'authRefreshTokensRemaining': 0, 'priorArchiveUnchanged': True,
        'nativeOwnerPid': native['ownerPid'], 'nativeListeners': native['listeners'],
        'sourceSha256': sha(__file__), 'executionRevision': meta['executionRevision'],
        'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    save(target / 'reopen-readiness.sanitized.json', result)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False,
            'newDatabaseCreated': False, 'sqlWrites': 0}))
        raise SystemExit(1)
