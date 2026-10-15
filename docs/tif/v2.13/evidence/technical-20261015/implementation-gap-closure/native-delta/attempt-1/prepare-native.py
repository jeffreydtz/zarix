#!/usr/bin/env python3
"""Explicit-release-only local clone. Importing this file performs no operation."""
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

REPO = pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
RUNTIME = pathlib.Path('/tmp/zarix-runtime-20261015')
BACKUP = REPO.parent / 'zarix-private-final-20261015T070553Z'
STACK = 'c23a7df7600999c31f2d8435146f55289db07f9f62dfc5d6f08b2562a1529a09'
CHECKPOINT_SHA = 'f378869280ad473b096630ed45ac839fcf822a6735f9dea1598dffaf3ca41a24'
DUMP_SHA = 'b2006c91a87a039e9cfa5d87995c622d62dd8a59596f916718f356383a350a0a'


def sha(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def save(path, value):
    with pathlib.Path(path).open('x') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())


def load_env(path):
    assert not path.is_symlink() and path.stat().st_mode & 0o077 == 0
    result = {}
    for line in path.read_text().splitlines():
        if line and not line.startswith('#'):
            key, value = line.split('=', 1)
            result[key] = json.loads(value)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', required=True)
    parser.add_argument('--migration', action='append', default=[])
    args = parser.parse_args()
    assert os.environ.get('ZARIX_DELTA_NATIVE_WINDOW') == 'parent-released-frozen-delta'
    assert re.fullmatch('[0-9a-f]{40}', args.revision)
    os.umask(0o077)
    git_env = {**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'}
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, env=git_env, text=True).strip()
    assert head == args.revision, 'Revision changed before native release'
    changed = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=REPO, env=git_env, text=True).splitlines()
    assert all(p.startswith('docs/') for p in changed), 'Application freeze requires clean non-documentation sources'
    untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=REPO, env=git_env, text=True).splitlines()
    assert all(p.startswith('docs/') for p in untracked), 'Application freeze requires no untracked non-documentation sources'
    allowed = {'supabase/migrations/20261015072636_audit_transaction_deletions.sql',
               'supabase/migrations/20261015072807_presentation_preferences.sql'}
    assert set(args.migration) == allowed and len(args.migration) == 2
    migrations = []
    for name in args.migration:
        assert re.fullmatch(r'supabase/migrations/20261015[0-9]{6}_[a-z_]+\.sql', name)
        content = subprocess.check_output(['git', 'show', args.revision + ':' + name], cwd=REPO, env=git_env)
        assert content == (REPO / name).read_bytes(), 'Migration differs from frozen Git source'
        migrations.append({'path': name, 'sha256': hashlib.sha256(content).hexdigest()})
    assert len(migrations) == len(set(x['path'] for x in migrations))
    assert sha(BACKUP / 'checkpoint.private.json') == CHECKPOINT_SHA
    archive = BACKUP / 'stacks/proof/database.dump'
    assert not archive.is_symlink() and archive.stat().st_mode & 0o077 == 0 and sha(archive) == DUMP_SHA
    values = load_env(RUNTIME / 'proof.env')
    database = urllib.parse.urlparse(values['ZARIX_PROOF_DATABASE_URL'])
    assert database.hostname == '127.0.0.1' and database.port == 58322 and database.path == '/postgres'
    assert not database.query and not database.fragment
    pg_bin = pathlib.Path(values['ZARIX_PG_BIN'])
    assert pg_bin.resolve().is_relative_to((RUNTIME / 'home/cache').resolve())
    state_file = RUNTIME / 'home/stacks' / STACK / 'state.json'
    state_bytes = state_file.read_bytes()
    state = json.loads(state_bytes)
    assert state['id'] == STACK and state['lifetime'] == 'detached'
    assert pathlib.Path(state['identity']['projectRoot']).resolve() == (RUNTIME / 'proof').resolve()
    creation = {entry['creation']['service']: entry['creation']['config'] for entry in state['instances']}
    assert set(creation) == {'database', 'auth', 'rest', 'storage'}
    user_file = RUNTIME / 'proof-logins.json'
    users = json.loads(user_file.read_text())['users']
    ids = sorted(str(uuid.UUID(user['id'])) for user in users)
    assert len(ids) == 2 and len(set(ids)) == 2
    assert all(re.fullmatch(r'zarix-.+@example\.invalid', user['email']) for user in users)
    run = str(uuid.uuid4())
    private = RUNTIME / ('implementation-delta-' + run)
    private.mkdir(mode=0o700)
    save(private / 'reservation.private.json', {'run': run, 'revision': head, 'migrations': migrations,
        'archiveSha256': DUMP_SHA, 'stateSha256Before': hashlib.sha256(state_bytes).hexdigest(),
        'stateFile': str(state_file), 'loginFile': str(user_file), 'newUsersCreated': 0})
    count = 0
    def command(argv, *, env=None, data=None, timeout=120):
        nonlocal count
        count += 1
        with (private / ('command-%03d.stderr.private.log' % count)).open('xb') as err:
            child = subprocess.run([str(x) for x in argv], input=data, stdout=subprocess.PIPE,
                                   stderr=err, env=env, timeout=timeout, cwd=REPO)
        assert child.returncode == 0, 'Native command failed; private diagnostics retained'
        return child.stdout
    # Help discovery precedes any lifecycle call. Its telemetry is confined to
    # the already-owned runtime HOME; the user's ~/.supabase is not a target.
    cli = RUNTIME / 'bin/supabase'
    cli_env = {**os.environ, 'SUPABASE_HOME': str(RUNTIME / 'home'),
        'SUPABASE_EXPERIMENTAL_STACK': '1', 'SUPABASE_NO_UPDATE_NOTIFIER': '1'}
    for argv in [[cli, '--help'], [cli, 'stack', '--help'], [cli, 'stack', 'restart', '--help']]:
        command(argv, env=cli_env)
    # A saved detached composition retains identity, data and endpoints on restart.
    # This does not reset, destroy, migrate or seed the original application DB.
    original_start = command([cli, 'stack', 'restart', '--workdir', RUNTIME / 'proof',
        '--stack-id', STACK, '--output-format', 'json'], env=cli_env)
    with (private / 'native-reopen.stdout.private.json').open('xb') as stream:
        stream.write(original_start)
    native_after = json.loads(state_file.read_text())
    assert native_after['id'] == STACK
    assert [x['id'] for x in native_after['instances']] == [x['id'] for x in state['instances']]
    guard_path = REPO / 'docs/tif/v2.13/evidence/technical-20261015/environment/preserve-six-native-stacks-final.py'
    assert sha(guard_path) == 'bab8ac98200fde1eea5bbce532ef28e97348e7976c02adf434bef0d42db48688'
    spec = importlib.util.spec_from_file_location('delta_native_owned_guards', guard_path)
    guard = importlib.util.module_from_spec(spec)
    sys.dont_write_bytecode = True
    spec.loader.exec_module(guard)
    plan = guard.load_plan()
    entry = next(item for item in plan['stacks'] if item['name'] == 'proof')
    native_before = guard.preflight(plan, entry)
    save(private / 'native-original-preflight.private.json', native_before)
    new_name = 'zarix_delta_' + uuid.uuid4().hex
    base = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    base.update(PGHOST='127.0.0.1', PGHOSTADDR='127.0.0.1', PGPORT='58322',
        PGUSER='supabase_admin', PGPASSWORD=urllib.parse.unquote(database.password),
        PGCONNECT_TIMEOUT='10', PGAPPNAME='zarix-implementation-delta')
    def pg(argv, db='postgres', *, data=None, write=False):
        assert not write or db == new_name or pathlib.Path(argv[0]).name == 'createdb'
        return command(argv, env={**base, 'PGDATABASE': db,
            'PGOPTIONS': '-c default_transaction_read_only=' + ('off' if write else 'on')}, data=data)
    def query(sql, db='postgres', *, write=False):
        return pg([pg_bin / 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql],
                  db, write=write).decode().strip()
    # Dynamic discovery includes new private audit tables instead of relying on
    # historical 27/64 table counts. Here originals are baseline checkpoint only.
    fingerprints = '''SELECT json_agg(row_to_json(x) ORDER BY x.name) FROM (
      SELECT schemaname||'.'||tablename AS name FROM pg_tables
      WHERE schemaname IN ('public','auth','storage','transaction_audit_private')) x'''
    original_tables = json.loads(query(fingerprints))
    def snapshot_original():
        result = {}
        for item in original_tables:
            name = item['name']
            assert re.fullmatch(r'[a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*', name)
            # Session cleanup is a normal GoTrue lifecycle effect, recorded
            # separately; business/profile/Auth identity/Storage rows are frozen.
            if name.startswith('auth.') and name not in ['auth.users','auth.identities']:
                continue
            result[name] = query("SELECT count(*)||':'||md5(COALESCE(string_agg(j::text,E'\\n' ORDER BY j::text),'')) FROM (SELECT to_jsonb(t)j FROM " + name + ' t)x')
        return result
    original_before = snapshot_original()
    save(private / 'original-fingerprints-before.private.json', original_before)
    assert query("SELECT count(*) FROM pg_database WHERE datname='" + new_name + "'") == '0'
    save(private / 'database-reservation.private.json', {'newDatabaseName': new_name, 'originalDatabaseName': 'postgres'})
    pg([pg_bin / 'createdb', '--maintenance-db=postgres', '--template=template0', new_name], write=True)
    assert query("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN('pg_catalog','information_schema')", new_name) == '0'
    pg([pg_bin / 'pg_restore', '--exit-on-error', '--section=pre-data', '--dbname=' + new_name, archive], new_name, write=True)
    # Table selection is constrained by schema; only these existing identities
    # and profiles are restored, never previous financial or session data.
    for schema, tables in [('auth', ['users', 'identities', 'schema_migrations']), ('public', ['users'])]:
        pg([pg_bin / 'pg_restore', '--exit-on-error', '--section=data', '--schema=' + schema,
            *['--table=' + table for table in tables], '--dbname=' + new_name, archive], new_name, write=True)
    pg([pg_bin / 'pg_restore', '--exit-on-error', '--section=post-data', '--dbname=' + new_name, archive], new_name, write=True)
    for table in ['auth.users', 'public.users']:
        assert json.loads(query('SELECT json_agg(id::text ORDER BY id::text) FROM ' + table, new_name)) == ids
    for table in ['accounts', 'transactions', 'investments', 'investment_sales', 'recurring_rules', 'net_worth_snapshots']:
        assert query('SELECT count(*) FROM public.' + table, new_name) == '0'
    assert query('SELECT count(*) FROM auth.sessions', new_name) == '0'
    for entry in migrations:
        assert sha(REPO / entry['path']) == entry['sha256']
        pg([pg_bin / 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', REPO / entry['path']], new_name, write=True)
    original_after = snapshot_original()
    assert original_after == original_before
    native_after = guard.preflight(plan, entry)
    assert guard.same_bindings(native_after, native_before)
    assert sha(BACKUP / 'checkpoint.private.json') == CHECKPOINT_SHA and sha(archive) == DUMP_SHA
    db_url = database._replace(netloc='supabase_admin:' + database.password + '@127.0.0.1:58322', path='/' + new_name)
    rest_url = urllib.parse.urlparse(creation['rest']['databaseUrl'])._replace(path='/' + new_name)
    auth_url = urllib.parse.urlparse(creation['auth']['databaseUrl'])._replace(path='/' + new_name)
    for url in [db_url, rest_url, auth_url]:
        assert url.hostname == '127.0.0.1' and url.port == 58322 and url.path == '/' + new_name
    config = {'purpose': 'zarix-implementation-delta', 'run': run, 'revision': head,
        'newDatabaseName': new_name, 'databaseUrl': urllib.parse.urlunparse(db_url),
        'restDatabaseUrl': urllib.parse.urlunparse(rest_url), 'authDatabaseUrl': urllib.parse.urlunparse(auth_url),
        'jwtSecret': creation['auth']['jwtSecret'], 'gotrueJwtKeys': creation['auth']['gotrueJwtKeys'],
        'jwks': creation['rest']['jwks'], 'anonKey': values['ZARIX_PROOF_ANON_KEY'],
        'serviceRoleKey': values['ZARIX_PROOF_SERVICE_ROLE_KEY'], 'loginFile': str(user_file),
        'pgBin': str(pg_bin), 'originalFingerprints': original_before,
        'apiOrigin': 'http://127.0.0.1:61321', 'restOrigin': 'http://127.0.0.1:61323',
        'authOrigin': 'http://127.0.0.1:61327', 'appOrigin': 'http://127.0.0.1:3006',
        'nativeOriginalPreflightFile': str(private / 'native-original-preflight.private.json')}
    save(private / 'targets.private.json', config)
    report = {'status': 'CLONE_READY_NOT_ACCEPTED', 'run': run, 'revision': head,
        'privateDirectory': str(private), 'newDatabaseName': new_name, 'clonedIdentities': 2,
        'newUsersCreated': 0, 'newKeysCreated': 0, 'financialTablesInitiallyEmpty': True,
        'originalTablesCompared': len(original_before), 'originalRowsUnchanged': True,
        'backupUnchanged': True, 'dumpSha256': DUMP_SHA, 'migrations': migrations,
        'authSessionRowsInitially': 0, 'nativeStackReopened': 'proof',
        'nativeOwnedProcessCount': len(native_before['ownedProcesses']),
        'nativeOwnedListeners': native_before['listeners'],
        'originalComparisonStartsAfterStackStartup': True,
        'originalAuthStartupHousekeepingNotClaimedAbsent': True,
        'temporaryHttpServicesStarted': 0, 'browserUsed': False,
        'completeAuthStorageRestoreClaimed': False,
        'preparedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    save(private / 'preparation.json', report)
    print(json.dumps(report))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No raw DB/CLI diagnostics, URLs or exception text reach the transcript.
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__,
            'rawDiagnosticsPublished': False, 'databaseDropped': False, 'originalTablesWritten': False}))
        sys.exit(1)
