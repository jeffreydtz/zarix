#!/usr/bin/env python3
"""Release-gated official PROOF reopen; SQL in this controller is read only."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
sys.dont_write_bytecode = True
from common import DATABASE, RUNTIME, check_copy, guard_module, invariant_files, metadata, read_env, save, sha, worktree_guard


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--targets', required=True)
    args = parser.parse_args()
    assert os.environ.get('ZARIX_CNF11_EXTENSION_WINDOW') == 'parent-released-cnf11-extension'
    os.umask(0o077)
    private, target = metadata(Path(args.targets).parent)
    assert Path(args.targets).name == 'targets.metadata.json'
    invariant_files()
    check_copy(target)
    head = worktree_guard()
    guard = guard_module()
    plan = guard.load_plan()
    stack = next(item for item in plan['stacks'] if item['name'] == 'proof')
    assert not guard.listeners(port=58321) and not guard.listeners(port=58322)
    save(private / 'reopen-intent.metadata.json', {'purpose': 'cnf11-extension', 'stackId': stack['stackId'],
        'existingDatabase': DATABASE, 'sourceSha256': sha(__file__), 'commonSha256': sha(Path(__file__).with_name('common.py')),
        'sourceRevision': target['sourceRevision'], 'checkoutHead': head,
        'existingStateReference': target['existingNativeStateFile'], 'rawOutputDisposition': 'discarded-before-filesystem'})
    cli = RUNTIME / 'bin/supabase'
    env = {**os.environ, 'SUPABASE_HOME': str(RUNTIME / 'home'), 'SUPABASE_EXPERIMENTAL_STACK': '1', 'SUPABASE_NO_UPDATE_NOTIFIER': '1'}
    for argv in [[cli, 'stack', 'restart', '--help'],
                 [cli, 'stack', 'restart', '--workdir', RUNTIME / 'proof', '--stack-id', stack['stackId'], '--output-format', 'json']]:
        child = subprocess.run([str(value) for value in argv], env=env,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        assert child.returncode == 0, 'Official CLI failed; intent/state references retained'
    native = guard.preflight(plan, stack)
    # Preserve owned process identity immediately, before any later SQL gate.
    save(private / 'native-original-preflight.private.json', native)
    prior = json.loads(Path(target['priorNativePreflightFile']).read_text())
    for key in ['stableStateSha256', 'configSha256', 'fingerprint']:
        assert native[key] == prior[key], 'Native invariant changed'
    values = read_env(target['existingEnvironmentFile'])
    url = urllib.parse.urlparse(values['ZARIX_PROOF_DATABASE_URL'])
    assert url.hostname == '127.0.0.1' and url.port == 58322 and url.path == '/postgres'
    pg_env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    pg_env.update(PGHOST='127.0.0.1', PGHOSTADDR='127.0.0.1', PGPORT='58322', PGUSER='supabase_admin',
        PGPASSWORD=urllib.parse.unquote(url.password), PGOPTIONS='-c default_transaction_read_only=on', PGCONNECT_TIMEOUT='10')
    def query(sql, database=DATABASE):
        child = subprocess.run([str(Path(target['pgBin']) / 'psql'), '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql],
            env={**pg_env, 'PGDATABASE': database}, capture_output=True, text=True, timeout=30)
        assert child.returncode == 0, 'Readonly SQL gate failed; raw diagnostics withheld'
        return child.stdout.strip()
    checks = []
    for table, expected in target['originalFingerprints'].items():
        assert re.fullmatch(r'[a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*', table)
        actual = query("SELECT count(*)||':'||md5(COALESCE(string_agg(j::text,E'\\n' ORDER BY j::text),''))FROM(SELECT to_jsonb(t)j FROM " + table + ' t)x', 'postgres')
        checks.append({'table': table, 'unchanged': actual == expected})
    assert len(checks) == 39 and all(item['unchanged'] for item in checks)
    assert query('SELECT count(*) FROM auth.sessions') == query('SELECT count(*) FROM auth.refresh_tokens') == '0'
    login_users = json.loads(Path(target['loginFile']).read_text())['users']
    assert all(re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', user['id']) for user in login_users)
    expected_ids = sorted(user['id'] for user in login_users)
    assert len(expected_ids) == 2 and json.loads(query('SELECT json_agg(id::text ORDER BY id::text)FROM auth.users')) == expected_ids
    owner_a = login_users[0]['id']
    capacity = json.loads(query("SELECT json_build_object('activeAccounts',count(*)FILTER(WHERE is_active)," +
        "'activeMovementAccounts',count(*)FILTER(WHERE is_active AND movement_enabled))FROM public.accounts WHERE user_id='" + owner_a + "'"))
    capacity_passed = capacity['activeMovementAccounts'] <= 18
    invariant_files()
    result = {'status': 'EXISTING_CLONE_REOPEN_READY' if capacity_passed else 'BLOCKED_FIXTURE_CAPACITY', 'sourceRevision': target['sourceRevision'],
        'sourceSha256': sha(__file__), 'commonSha256': sha(Path(__file__).with_name('common.py')),
        'privateDirectory': str(private), 'originalIntegrity': checks, 'authSessionsRemaining': 0,
        'authRefreshTokensRemaining': 0, 'newDatabaseCreated': False, 'newUsersCreated': 0,
        'newCredentialFiles': 0, 'sqlWrites': 0, 'nativeOwnerPid': native['ownerPid'],
        'nativeListeners': native['listeners'], 'priorArchivesUnchanged': True,
        'ownerAFixtureCapacity': {**capacity, 'maximumBaselineMovementAccounts': 18,
            'temporaryConcurrentAccountSlotsRequired': 2, 'passed': capacity_passed},
        'workerOrPlanMutationsExecuted': False, 'nativeStackStillOwned': True,
        'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    save(private / 'reopen-readiness.sanitized.json', result)
    print(json.dumps(result))
    return 0 if capacity_passed else 2


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False,
            'sqlWrites': 0, 'officialStateAndIntentReferencesRetained': True}))
        raise SystemExit(1)
