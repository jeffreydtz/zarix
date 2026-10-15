#!/usr/bin/env python3
"""Retain the new synthetic DB and close exact owned actors after test release."""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import signal
import subprocess
import sys
import time
import urllib.parse
sys.dont_write_bytecode = True
from common import check_copy, invariant_files, worktree_guard


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--private-directory', required=True)
    args = parser.parse_args()
    assert os.environ.get('ZARIX_CNF11_EXTENSION_WINDOW') == 'parent-released-cnf11-extension'
    assert os.environ.get('ZARIX_CNF11_EXTENSION_STOP') == 'parent-released-after-both-workers-and-auth-zero'
    os.umask(0o077)
    sys.dont_write_bytecode = True
    root = pathlib.Path(args.private_directory)
    assert re.fullmatch(r'/tmp/zarix-runtime-20261015/cnf11-extension-[0-9a-f-]{36}', str(root))
    assert not root.is_symlink() and root.stat().st_mode & 0o777 == 0o700
    repo = pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
    runtime = pathlib.Path('/tmp/zarix-runtime-20261015')
    meta = json.loads((root / 'targets.metadata.json').read_text())
    assert meta['purpose'] == 'zarix-cnf11-extension'
    invariant_files()
    check_copy(meta)
    worktree_guard()
    services = json.loads((root / 'services.metadata.json').read_text())
    app = {'revision': meta['executionRevision']}
    assert meta['newDatabaseName'].startswith('zarix_delta_')
    assert not (root / 'retention-stop.sanitized.json').exists()
    def digest(path):
        return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
    def save(path, value):
        with path.open('x') as stream:
            os.chmod(path, 0o600)
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
    helper = repo / 'docs/tif/v2.13/evidence/technical-20261015/environment/preserve-six-native-stacks-final.py'
    assert digest(helper) == 'bab8ac98200fde1eea5bbce532ef28e97348e7976c02adf434bef0d42db48688'
    spec = importlib.util.spec_from_file_location('delta_final_owned_guards', helper)
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    plan = guard.load_plan()
    stack = next(entry for entry in plan['stacks'] if entry['name'] == 'proof')
    original = json.loads((root / 'native-original-preflight.private.json').read_text())
    native = guard.preflight(plan, stack)
    assert guard.same_bindings(native, original)
    env_file = pathlib.Path(meta['existingEnvironmentFile'])
    values = dict((key, json.loads(value)) for key, value in
        (line.split('=', 1) for line in env_file.read_text().splitlines() if line and not line.startswith('#')))
    url = urllib.parse.urlparse(values['ZARIX_PROOF_DATABASE_URL'])
    assert url.hostname == '127.0.0.1' and url.port == 58322 and url.path == '/postgres'
    pg_env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    pg_env.update(PGHOST='127.0.0.1', PGHOSTADDR='127.0.0.1', PGPORT='58322', PGUSER='supabase_admin',
        PGPASSWORD=urllib.parse.unquote(url.password), PGDATABASE=meta['newDatabaseName'],
        PGOPTIONS='-c default_transaction_read_only=on', PGCONNECT_TIMEOUT='10')
    pg_bin = pathlib.Path(meta['pgBin'])
    def query(sql, database=None):
        child = subprocess.run([str(pg_bin / 'psql'), '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql],
            env={**pg_env, 'PGDATABASE': database or meta['newDatabaseName']}, capture_output=True, text=True, timeout=30)
        assert child.returncode == 0, 'Readonly closure query failed; raw diagnostics withheld'
        return child.stdout.strip()
    assert query('SELECT count(*) FROM auth.sessions') == '0'
    assert query('SELECT count(*) FROM auth.refresh_tokens') == '0'
    original_checks = []
    for table, expected in meta['originalFingerprints'].items():
        assert re.fullmatch(r'[a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*', table)
        actual = query("SELECT count(*)||':'||md5(COALESCE(string_agg(j::text,E'\\n' ORDER BY j::text),''))FROM(SELECT to_jsonb(t)j FROM " + table + ' t)x', 'postgres')
        original_checks.append({'table': table, 'unchanged': actual == expected})
    assert all(item['unchanged'] for item in original_checks)
    baseline_backup = repo.parent / 'zarix-private-final-20261015T070553Z'
    prior_delta_archive = repo.parent / 'zarix-private-delta-20261015T081955Z/database.dump'
    prior_delta_sha256 = 'a9f03e0b2c4e91b30212fe8acda7267c64483d982b0b9971b3bf6317ef440bd1'
    assert digest(baseline_backup / 'checkpoint.private.json') == 'f378869280ad473b096630ed45ac839fcf822a6735f9dea1598dffaf3ca41a24'
    assert digest(baseline_backup / 'stacks/proof/database.dump') == 'b2006c91a87a039e9cfa5d87995c622d62dd8a59596f916718f356383a350a0a'
    assert digest(prior_delta_archive) == prior_delta_sha256
    actors = list(reversed(services['children']))
    assert len(actors) == 4 and {item['port'] for item in actors} == {61321, 61323, 61327, 61329}
    process_env = {**os.environ, 'TZ': 'Etc/UTC', 'LC_ALL': 'C', 'LANG': 'C'}
    captured = {}
    # Every actor is verified before the first signal. Never signal a stale PID.
    for actor in actors:
        pid = str(actor['pid'])
        status = subprocess.check_output(['/bin/ps', '-p', pid, '-o', 'uid=,lstart=,comm='], env=process_env, text=True).strip()
        uid, started_and_comm = status.split(None, 1)
        assert int(uid) == os.getuid()
        fields = started_and_comm.split(None, 5)
        started = datetime.datetime.strptime(' '.join(fields[:5]), '%a %b %d %H:%M:%S %Y').replace(tzinfo=datetime.timezone.utc)
        assert abs((started - datetime.datetime.fromisoformat(actor['startedAt'])).total_seconds()) < 2
        cwd = subprocess.check_output(['/usr/sbin/lsof', '-a', '-p', pid, '-d', 'cwd', '-Fn'], text=True)
        assert any(line.startswith('n') and pathlib.Path(line[1:]).resolve() == pathlib.Path(actor['cwd']).resolve() for line in cwd.splitlines())
        listeners = guard.listeners(pids={actor['pid']}, port=actor['port'])
        assert listeners == [{'pid': actor['pid'], 'address': '127.0.0.1:' + str(actor['port'])}]
        captured[actor['pid']] = status
    # The archive is an explicitly requested synthetic Auth/data/schema backup,
    # not a credential/config copy. It stays outside Git with 0700/0600 modes.
    destination = repo.parent / ('zarix-private-cnf11-extension-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    destination.mkdir(mode=0o700)
    dump = destination / 'database.dump'
    child = subprocess.run([str(pg_bin / 'pg_dump'), '-Fc', '--file', str(dump)], env=pg_env,
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=120)
    assert child.returncode == 0, 'Synthetic archive failed; no stop attempted'
    os.chmod(dump, 0o600)
    toc = subprocess.run([str(pg_bin / 'pg_restore'), '--list', str(dump)], capture_output=True, timeout=30)
    decoded = subprocess.run([str(pg_bin / 'pg_restore'), '--file=/dev/null', str(dump)], capture_output=True, timeout=30)
    assert toc.returncode == decoded.returncode == 0 and toc.stdout
    assert guard.same_bindings(guard.preflight(plan, stack), native)
    # Capture inventories as counts/hashes, never rows or Auth credentials.
    table_rows = json.loads(query("SELECT json_agg(json_build_object('schema',schemaname,'table',tablename)ORDER BY schemaname,tablename)FROM pg_tables WHERE schemaname IN('public','auth','storage','transaction_audit_private')"))
    retention = {'status': 'RETAIN_PASS', 'privateDirectory': str(destination), 'databaseName': meta['newDatabaseName'],
        'archiveBytes': dump.stat().st_size, 'archiveSha256': digest(dump), 'customTocValidated': True,
        'payloadDecoded': True, 'tablesInventoried': len(table_rows), 'schemaAuthDataIncluded': True,
        'authSessionsRemaining': 0, 'authRefreshTokensRemaining': 0, 'newRestoreClaimed': False,
        'sourceRevision': app['revision'], 'archiveContainsSensitiveSyntheticAuthData': True,
        'storageBytes': 'Database archive includes Storage metadata only; no Storage-object backup or restore is claimed by this extension.'}
    save(destination / 'retention-metadata.json', retention)
    stops = []
    journal = (root / 'stop-journal.metadata.jsonl').open('x')
    os.chmod(root / 'stop-journal.metadata.jsonl', 0o600)
    def event(value):
        journal.write(json.dumps(value) + '\n')
        journal.flush()
        os.fsync(journal.fileno())
    for actor in actors:
        current = subprocess.check_output(['/bin/ps', '-p', str(actor['pid']), '-o', 'uid=,lstart=,comm='], env=process_env, text=True).strip()
        assert current == captured[actor['pid']]
        event({'status': 'STOP_RESERVED', 'name': actor['name'], 'pid': actor['pid'], 'port': actor['port']})
        os.kill(actor['pid'], signal.SIGTERM)
        for _ in range(80):
            probe = subprocess.run(['/bin/ps', '-p', str(actor['pid']), '-o', 'stat='], capture_output=True, text=True)
            if probe.returncode != 0 or probe.stdout.strip().startswith('Z'):
                break
            time.sleep(.25)
        else:
            raise AssertionError('Exact owned actor did not exit; no force signal sent')
        assert not guard.listeners(port=actor['port'])
        stops.append({'name': actor['name'], 'pid': actor['pid'], 'port': actor['port'], 'status': 'STOP_PASS'})
        event(stops[-1])
    assert guard.same_bindings(guard.preflight(plan, stack), native)
    cli_env = {**os.environ, 'SUPABASE_HOME': str(runtime / 'home'), 'SUPABASE_EXPERIMENTAL_STACK': '1', 'SUPABASE_NO_UPDATE_NOTIFIER': '1'}
    help_result = subprocess.run([str(runtime / 'bin/supabase'), 'stack', 'stop', '--help'], env=cli_env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    assert help_result.returncode == 0
    event({'status': 'PROOF_OFFICIAL_STOP_RESERVED', 'nativeOwnerPid': native['ownerPid']})
    child = subprocess.run(stack['stopArgv'], env=cli_env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=120)
    assert child.returncode == 0, 'Official PROOF stop failed; originals retained'
    current_processes = guard.processes()
    assert all(not guard.same_process(process, current_processes.get(process['pid'])) for process in native['ownedProcesses'])
    assert not guard.listeners(port=58321) and not guard.listeners(port=58322)
    assert pathlib.Path(stack['dataDirectory']).is_dir() and (pathlib.Path(stack['dataDirectory']) / 'PG_VERSION').read_text().strip() == '17'
    assert digest(baseline_backup / 'checkpoint.private.json') == 'f378869280ad473b096630ed45ac839fcf822a6735f9dea1598dffaf3ca41a24'
    assert digest(baseline_backup / 'stacks/proof/database.dump') == 'b2006c91a87a039e9cfa5d87995c622d62dd8a59596f916718f356383a350a0a'
    assert digest(prior_delta_archive) == prior_delta_sha256
    invariant_files()
    check_copy(meta)
    event({'status': 'PROOF_STOP_PASS', 'cliExitCode': child.returncode})
    journal.close()
    result = {'status': 'RETAIN_AND_STOP_PASS', 'sourceRevision': app['revision'], 'retention': retention,
        'originalIntegrity': original_checks, 'temporaryActorStops': stops, 'nativeStack': 'proof',
        'officialCliExitCode': child.returncode, 'originalNativeActorsExited': True,
        'originalDataDirectoryRetained': True, 'clonedDatabaseNotDropped': True,
        'originalBackupUnchanged': True, 'priorDeltaArchiveUnchanged': True,
        'priorDeltaArchiveSha256': prior_delta_sha256, 'credentialsCopied': False, 'browserTouched': False,
        'controllerSha256': digest(__file__), 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    save(root / 'retention-stop.sanitized.json', result)
    print(json.dumps({'status': result['status'], 'privateBackup': str(destination), 'archiveSha256': retention['archiveSha256'],
        'originalTablesUnchanged': len(original_checks), 'temporaryActorsStopped': len(stops), 'nativeStackStopped': 'proof'}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False,
            'forceSignalsSent': False, 'dataDropped': False}))
        raise SystemExit(1)
