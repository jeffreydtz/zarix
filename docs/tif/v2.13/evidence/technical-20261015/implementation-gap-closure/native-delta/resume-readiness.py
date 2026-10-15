#!/usr/bin/env python3
"""Resume final READ ONLY checks and target metadata; no lifecycle or SQL writes."""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.parse
import uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--private-directory', required=True)
    args = parser.parse_args()
    assert os.environ.get('ZARIX_DELTA_NATIVE_WINDOW') == 'parent-released-frozen-delta'
    os.umask(0o077)
    sys.dont_write_bytecode = True
    private = pathlib.Path(args.private_directory)
    assert private == pathlib.Path('/tmp/zarix-runtime-20261015/implementation-delta-db3cf513-b7ad-4f2b-abcd-a2a44aeed27b')
    assert not private.is_symlink() and private.stat().st_mode & 0o777 == 0o700
    assert not (private / 'targets.private.json').exists() and not (private / 'targets.metadata.json').exists()
    assert not (private / 'resume-readiness.json').exists()
    repo = pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
    runtime = pathlib.Path('/tmp/zarix-runtime-20261015')
    backup = repo.parent / 'zarix-private-final-20261015T070553Z'
    def sha(path):
        return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
    def save(path, value):
        with path.open('x') as stream:
            os.chmod(path, 0o600)
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
    source = pathlib.Path(__file__).with_name('attempt-1') / 'prepare-native.py'
    assert sha(source) == 'a4b3cae575e127a01e80c1ed1f48dc408d3ea3aafbc9f40ee2c15e6925a976a6'
    reservation = json.loads((private / 'reservation.private.json').read_text())
    assert reservation['revision'] == 'faae3a7858a6d4349e24880fc4858b826b9463bd'
    git_env = {**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'}
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, env=git_env, text=True).strip() == reservation['revision']
    changed = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=repo, env=git_env, text=True).splitlines()
    untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=repo, env=git_env, text=True).splitlines()
    assert all(path.startswith('docs/') for path in changed + untracked)
    assert sha(backup / 'checkpoint.private.json') == 'f378869280ad473b096630ed45ac839fcf822a6735f9dea1598dffaf3ca41a24'
    assert sha(backup / 'stacks/proof/database.dump') == 'b2006c91a87a039e9cfa5d87995c622d62dd8a59596f916718f356383a350a0a'
    for entry in reservation['migrations']:
        assert sha(repo / entry['path']) == entry['sha256']
    helper = repo / 'docs/tif/v2.13/evidence/technical-20261015/environment/preserve-six-native-stacks-final.py'
    assert sha(helper) == 'bab8ac98200fde1eea5bbce532ef28e97348e7976c02adf434bef0d42db48688'
    spec = importlib.util.spec_from_file_location('delta_readonly_guards', helper)
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    plan = guard.load_plan()
    stack = next(entry for entry in plan['stacks'] if entry['name'] == 'proof')
    native_before = json.loads((private / 'native-original-preflight.private.json').read_text())
    native_after = guard.preflight(plan, stack)
    assert guard.same_bindings(native_after, native_before)
    name = json.loads((private / 'database-reservation.private.json').read_text())['newDatabaseName']
    assert re.fullmatch('zarix_delta_[0-9a-f]{32}', name)
    values = dict((key, json.loads(value)) for key, value in
        (line.split('=', 1) for line in (runtime / 'proof.env').read_text().splitlines() if line and not line.startswith('#')))
    database = urllib.parse.urlparse(values['ZARIX_PROOF_DATABASE_URL'])
    assert database.hostname == '127.0.0.1' and database.port == 58322 and database.path == '/postgres'
    pg_bin = pathlib.Path(values['ZARIX_PG_BIN'])
    base = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    base.update(PGHOST='127.0.0.1', PGHOSTADDR='127.0.0.1', PGPORT='58322', PGUSER='supabase_admin',
        PGPASSWORD=urllib.parse.unquote(database.password), PGCONNECT_TIMEOUT='10',
        PGAPPNAME='zarix-delta-readonly-resume', PGOPTIONS='-c default_transaction_read_only=on')
    counter = 0
    def query(sql, db=name):
        nonlocal counter
        counter += 1
        with (private / ('resume-%03d.stderr.private.log' % counter)).open('xb') as err:
            child = subprocess.run([str(pg_bin / 'psql'), '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql],
                env={**base, 'PGDATABASE': db}, stdout=subprocess.PIPE, stderr=err, timeout=30)
        assert child.returncode == 0, 'Readonly resume query failed; diagnostics withheld'
        return child.stdout.decode().strip()
    original_before = json.loads((private / 'original-fingerprints-before.private.json').read_text())
    original_after = {}
    for table in original_before:
        assert re.fullmatch(r'[a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*', table)
        original_after[table] = query("SELECT count(*)||':'||md5(COALESCE(string_agg(j::text,E'\\n' ORDER BY j::text),'')) FROM (SELECT to_jsonb(t)j FROM " + table + ' t)x', 'postgres')
    assert original_after == original_before
    users = json.loads((runtime / 'proof-logins.json').read_text())['users']
    ids = sorted(str(uuid.UUID(user['id'])) for user in users)
    for table in ['auth.users', 'public.users']:
        assert json.loads(query('SELECT json_agg(id::text ORDER BY id::text) FROM ' + table)) == ids
    for table in ['accounts', 'transactions', 'investments', 'investment_sales', 'recurring_rules', 'net_worth_snapshots', 'transaction_deletion_audit']:
        assert query('SELECT count(*) FROM public.' + table) == '0'
    assert query('SELECT count(*) FROM auth.sessions') == '0'
    assert query("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN('default_currency','net_worth_widget_visible')") == '2'
    assert query("SELECT count(*) FROM pg_trigger WHERE tgrelid='public.transactions'::regclass AND tgname='trigger_audit_transaction_deletion'") == '1'
    # References only. Existing keys/passwords are consumed in memory for the
    # readonly SQL client above and are never copied into this new metadata.
    config = {'purpose': 'zarix-implementation-delta', 'run': reservation['run'], 'revision': reservation['revision'],
        'newDatabaseName': name, 'databaseHost': '127.0.0.1', 'databasePort': 58322,
        'existingEnvironmentFile': str(runtime / 'proof.env'),
        'existingNativeStateFile': str(runtime / 'home/stacks' / stack['stackId'] / 'state.json'),
        'loginFile': str(runtime / 'proof-logins.json'), 'pgBin': str(pg_bin), 'originalFingerprints': original_before,
        'plannedApiOrigin': 'http://127.0.0.1:61321', 'plannedRestOrigin': 'http://127.0.0.1:61323',
        'plannedAuthOrigin': 'http://127.0.0.1:61327', 'plannedAppOrigin': 'http://127.0.0.1:3006',
        'servicesStarted': False, 'credentialValuesCopied': False,
        'nativeOriginalPreflightFile': str(private / 'native-original-preflight.private.json')}
    save(private / 'targets.metadata.json', config)
    report = {'status': 'CLONE_READY_NOT_ACCEPTED', 'revision': reservation['revision'], 'run': reservation['run'],
        'privateDirectory': str(private), 'newDatabaseName': name, 'clonedIdentities': 2,
        'newUsersCreated': 0, 'newKeysCreated': 0, 'sqlWritesInThisResume': 0,
        'originalTablesCompared': len(original_before), 'originalRowsUnchanged': True,
        'nativeOriginalBindingsUnchanged': True, 'nativeOwnedListeners': native_after['listeners'],
        'originalComparisonStartsAfterStackStartup': True, 'originalAuthStartupHousekeepingNotClaimedAbsent': True,
        'backupUnchanged': True, 'financialTablesInitiallyEmpty': True, 'deltaMigrations': reservation['migrations'],
        'resumeSourceSha256': sha(__file__), 'originalFailedSourceSha256': sha(source),
        'temporaryHttpServicesStarted': 0, 'browserUsed': False, 'completeAuthStorageRestoreClaimed': False,
        'credentialValuesCopied': False,
        'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    save(private / 'resume-readiness.json', report)
    print(json.dumps(report))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__,
            'sqlWritesInThisResume': 0, 'rawDiagnosticsPublished': False}))
        raise SystemExit(1)
