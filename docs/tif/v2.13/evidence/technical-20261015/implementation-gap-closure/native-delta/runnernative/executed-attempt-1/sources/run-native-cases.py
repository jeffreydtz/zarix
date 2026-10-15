#!/usr/bin/env python3
"""Prepared, release-gated focal runner. Importing it performs no operation."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.parse

REPO = pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
RELATIVE = pathlib.Path('docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/native-delta/runnernative')


def load_private(path):
    assert not path.is_symlink() and path.stat().st_mode & 0o077 == 0
    return json.loads(path.read_text())


def save(path, value):
    with path.open('x') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2)
        stream.write('\n')


def existing_env(path):
    """Read an existing dotenv file without creating a credentials copy."""
    assert not path.is_symlink() and path.stat().st_mode & 0o077 == 0
    result = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        key, value = line.split('=', 1)
        if key.startswith('export '):
            key = key[7:]
        try:
            result[key] = json.loads(value)
        except json.JSONDecodeError:
            result[key] = value.strip("'")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--targets', required=True)
    parser.add_argument('--revision', required=True)
    args = parser.parse_args()
    assert os.environ.get('ZARIX_DELTA_NATIVE_WINDOW') == 'parent-released-frozen-delta'
    assert os.environ.get('ZARIX_ISOLATED_DATABASE_CONFIRM') == 'synthetic-only'
    os.umask(0o077)
    assert re.fullmatch('[0-9a-f]{40}', args.revision)
    target_path = pathlib.Path(args.targets)
    assert re.fullmatch(r'/tmp/zarix-runtime-20261015/implementation-delta-[0-9a-f-]{36}/targets\.metadata\.json', str(target_path))
    directory = target_path.parent
    assert not directory.is_symlink() and directory.stat().st_mode & 0o077 == 0
    target = load_private(target_path)
    services = load_private(directory / 'services.metadata.json')
    assert target['purpose'] == 'zarix-implementation-delta'
    assert re.fullmatch(r'zarix_delta_[0-9a-f]{32}', target['newDatabaseName'])
    assert target['existingEnvironmentFile'] == '/tmp/zarix-runtime-20261015/proof.env'
    assert services.get('existingCronEnvironmentFile', '/tmp/zarix-runtime-20261015/e2e-app.env') == '/tmp/zarix-runtime-20261015/e2e-app.env'
    values = existing_env(pathlib.Path(target['existingEnvironmentFile']))
    cron_values = existing_env(pathlib.Path('/tmp/zarix-runtime-20261015/e2e-app.env'))
    database = urllib.parse.urlparse(values['ZARIX_PROOF_DATABASE_URL'])
    assert database.hostname == '127.0.0.1' and database.port == 58322
    assert database.path == '/postgres' and not database.query and not database.fragment
    assert target['plannedApiOrigin'] == 'http://127.0.0.1:61321'
    assert services['providerOrigin'] == 'http://127.0.0.1:61329'
    assert pathlib.Path(services['providerControlFile']).parent == directory
    assert pathlib.Path(services['providerJournalFile']).parent == directory
    git_env = {**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'}
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, env=git_env, text=True).strip()
    assert head == args.revision
    if target['revision'] != args.revision:
        assert re.fullmatch('[0-9a-f]{40}', target['revision'])
        delta = subprocess.check_output(['git', 'diff', '--name-only', target['revision'], args.revision], cwd=REPO, env=git_env, text=True).splitlines()
        # Parent-authorized isolated test harness compatibility fix only.
        assert set(delta) <= {'scripts/test-atomic-account-recompute.mjs'}, 'Clone revision differs beyond the authorized test-only delta'
    dirty = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=REPO, env=git_env, text=True).splitlines()
    assert all(path.startswith('docs/') for path in dirty), 'Frozen application sources changed'
    untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=REPO, env=git_env).decode().split('\0')
    assert all(not path or path.startswith('docs/') for path in untracked), 'Untracked application source outside the freeze'
    paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=REPO, env=git_env).decode().split('\0')
    paths = [path for path in paths if path and not path.startswith('docs/')]
    sources = {path: hashlib.sha256((REPO / path).read_bytes()).hexdigest() for path in paths}
    output = directory / 'native-cases-result.private.json'
    execution = directory / 'native-cases-execution.private.json'
    assert not output.exists() and not execution.exists(), 'Refusing to overwrite a previous attempt'
    worker_sources = ['run-native-cases.py', 'native-cases.vitest.config.mjs', 'native-cases.test-source.ts', 'README.md']
    snapshots = directory / 'native-cases-executed-sources'
    snapshots.mkdir(mode=0o700)
    worker_hashes = {}
    for name in worker_sources:
        source = REPO / RELATIVE / name
        destination = snapshots / name
        with destination.open('xb') as stream:
            stream.write(source.read_bytes())
        worker_hashes[name] = hashlib.sha256(destination.read_bytes()).hexdigest()
    save(snapshots / 'manifest.json', {'revision': args.revision, 'cloneSchemaRevision': target['revision'],
        'files': [{'path': name, 'sha256': digest} for name, digest in worker_hashes.items()],
        'credentialValuesCopied': False})
    env = {key: value for key, value in os.environ.items() if not key.startswith(('PG', 'MP_', 'MERCADOPAGO_', 'TELEGRAM_', 'NEXT_PUBLIC_SUPABASE_', 'SUPABASE_'))}
    env.update({
        'DEVELOPER_DIR': '/Library/Developer/CommandLineTools',
        'ZARIX_DELTA_NATIVE_TARGET': str(target_path),
        'ZARIX_DELTA_EXPECTED_REVISION': args.revision,
        'ZARIX_DELTA_NATIVE_OUTPUT': str(output),
        'ZARIX_DELTA_NATIVE_CACHE': str(directory / 'vitest-cache'),
        'NEXT_PUBLIC_SUPABASE_URL': target['plannedApiOrigin'],
        'NEXT_PUBLIC_SUPABASE_ANON_KEY': values['ZARIX_PROOF_ANON_KEY'],
        'SUPABASE_SERVICE_ROLE_KEY': values['ZARIX_PROOF_SERVICE_ROLE_KEY'],
        'CRON_SECRET': cron_values['CRON_SECRET'],
        'MP_WEBHOOK_SECRET': hashlib.sha256(('zarix-delta-mp-webhook:' + target['run']).encode()).hexdigest(),
        'MP_ACCESS_TOKEN': hashlib.sha256(('zarix-delta-mp-access:' + target['run']).encode()).hexdigest(),
        'CRIPTOYA_API_URL': services['providerOrigin'],
        'DOLARAPI_URL': services['providerOrigin'],
        'COINGECKO_API_URL': services['providerOrigin'],
        'MP_API_BASE_URL': services['providerOrigin'],
        'CI': 'true',
    })
    command = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', str(RELATIVE / 'native-cases.vitest.config.mjs')]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    child = subprocess.run(command, cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
    stable = all(hashlib.sha256((REPO / path).read_bytes()).hexdigest() == digest for path, digest in sources.items())
    worker_stable = all(hashlib.sha256((REPO / RELATIVE / name).read_bytes()).hexdigest() == digest for name, digest in worker_hashes.items())
    # Console output is not copied: third-party diagnostics could contain auth
    # material. The worker writes only allowlisted observations and safe checks.
    report = {'status': 'PASS' if child.returncode == 0 and stable and worker_stable and output.exists() else 'FAIL',
        'revision': head, 'startedAt': started, 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'command': command, 'exitCode': child.returncode, 'sourceStable': stable, 'workerSourceStable': worker_stable,
        'cloneSchemaRevision': target['revision'], 'workerSources': worker_hashes,
        'sourceCount': len(sources), 'sources': [{'path': path, 'sha256': digest} for path, digest in sources.items()],
        'workerReportPresent': output.exists(), 'rawConsolePublished': False,
        'stdoutBytes': len(child.stdout), 'stderrBytes': len(child.stderr),
        'browserUsed': False, 'newUsersCreated': 0, 'externalCredentialsCreated': 0, 'credentialValuesCopied': False,
        'sessionsPersisted': False, 'envFilesCreated': False}
    save(execution, report)
    print(json.dumps({key: report[key] for key in ['status', 'revision', 'exitCode', 'sourceStable', 'workerReportPresent', 'browserUsed']}))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False}))
        sys.exit(1)
