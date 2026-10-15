#!/usr/bin/env python3
"""Prepared release-gated nine-only supplement. No new persisted secrets."""
import argparse
import datetime
import hashlib
import io
import json
import os
import pathlib
import re
import subprocess
import sys
import tarfile

REPO = pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
PRIOR = pathlib.Path('/tmp/zarix-runtime-20261015/implementation-delta-db3cf513-b7ad-4f2b-abcd-a2a44aeed27b')
COPY = pathlib.Path('/tmp/zarix-app-delta-db3cf513-b7ad-4f2b-abcd-a2a44aeed27b')
FREEZE = '730767b1723502b495d371e69c44df31eb230b56'
DATABASE = 'zarix_delta_e4bd026f703549bfa24de940134184b8'
REL = pathlib.Path('docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/native-delta/runnernative/cnf13-robust-only')


def private_json(file):
    assert not file.is_symlink() and file.stat().st_mode & 0o077 == 0
    return json.loads(file.read_text())


def read_env(file):
    assert not file.is_symlink() and file.stat().st_mode & 0o077 == 0
    values = {}
    for line in file.read_text().splitlines():
        if line and not line.startswith('#'):
            key, value = line.split('=', 1)
            try:
                values[key] = json.loads(value)
            except json.JSONDecodeError:
                values[key] = value.strip("'")
    return values


def save(file, value):
    with file.open('x') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--targets', required=True)
    parser.add_argument('--attempt', default='attempt-1')
    args = parser.parse_args()
    assert os.environ.get('ZARIX_DELTA_NATIVE_WINDOW') == 'parent-released-frozen-delta'
    assert os.environ.get('ZARIX_ISOLATED_DATABASE_CONFIRM') == 'synthetic-only'
    assert re.fullmatch('attempt-[1-9][0-9]*', args.attempt)
    os.umask(0o077)
    target_file = pathlib.Path(args.targets)
    assert target_file.name == 'targets.metadata.json'
    directory = target_file.parent
    assert re.fullmatch('/tmp/zarix-runtime-20261015/[a-z0-9-]{10,120}', str(directory))
    assert not directory.is_symlink() and directory.stat().st_mode & 0o077 == 0
    target = private_json(target_file)
    services = private_json(directory / 'services.metadata.json')
    assert target['newDatabaseName'] == DATABASE
    assert target['existingEnvironmentFile'] == '/tmp/zarix-runtime-20261015/proof.env'
    assert pathlib.Path(target['sourceCopyRoot']) == COPY and target['sourceRevision'] == FREEZE
    build_file = pathlib.Path(target['existingApplicationBuildProofFile'])
    assert build_file == PRIOR / 'app-build.private.json'
    build = private_json(build_file)
    assert build['revision'] == FREEZE and build['copyRoot'] == str(COPY) and build['exitCode'] == 0
    sources = build['sources']
    assert all(hashlib.sha256((COPY / item['path']).read_bytes()).hexdigest() == item['sha256'] for item in sources)
    git_env = {**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'}
    archive = subprocess.check_output(['git', 'archive', '--format=tar', FREEZE, '--', *[item['path'] for item in sources]], cwd=REPO, env=git_env)
    with tarfile.open(fileobj=io.BytesIO(archive)) as stream:
        files = {item.name: item for item in stream.getmembers() if item.isfile()}
        assert all(hashlib.sha256(stream.extractfile(files[item['path']]).read()).hexdigest() == item['sha256'] for item in sources)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, env=git_env, text=True).strip()
    delta = subprocess.check_output(['git', 'diff', '--name-only', FREEZE, head], cwd=REPO, env=git_env, text=True).splitlines()
    folder = directory / ('cnf13-robust-only-' + args.attempt)
    assert not folder.exists(), 'Previous attempt must be preserved'
    folder.mkdir(mode=0o700)
    snapshot_dir = folder / 'sources'
    snapshot_dir.mkdir(mode=0o700)
    worker_sources = []
    for name in ['run-robust.py', 'vitest.config.mjs', 'robust.test-source.ts']:
        content = (REPO / REL / name).read_bytes()
        with (snapshot_dir / name).open('xb') as stream:
            stream.write(content)
        worker_sources.append({'path': name, 'sha256': hashlib.sha256(content).hexdigest()})
    save(snapshot_dir / 'manifest.json', {'sourceRevision': FREEZE, 'files': worker_sources})
    existing = read_env(pathlib.Path(target['existingEnvironmentFile']))
    cron = read_env(pathlib.Path('/tmp/zarix-runtime-20261015/e2e-app.env'))
    assert services['providerOrigin'] == 'http://127.0.0.1:61329'
    env = {key: value for key, value in os.environ.items() if not key.startswith(('PG', 'MP_', 'MERCADOPAGO_', 'SUPABASE_', 'NEXT_PUBLIC_SUPABASE_', 'TELEGRAM_'))}
    env.update({'ZARIX_CNF13_ROBUST_META_DIR': str(directory), 'ZARIX_CNF13_ROBUST_OUTPUT': str(folder),
        'ZARIX_CNF13_ROBUST_CACHE': str(folder / 'cache'),
        'NEXT_PUBLIC_SUPABASE_URL': 'http://127.0.0.1:61321',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY': existing['ZARIX_PROOF_ANON_KEY'],
        'SUPABASE_SERVICE_ROLE_KEY': existing['ZARIX_PROOF_SERVICE_ROLE_KEY'], 'CRON_SECRET': cron['CRON_SECRET'],
        'MP_WEBHOOK_SECRET': hashlib.sha256(('zarix-delta-mp-webhook:' + target['run']).encode()).hexdigest(),
        'MP_ACCESS_TOKEN': hashlib.sha256(('zarix-delta-mp-access:' + target['run']).encode()).hexdigest(),
        'MP_API_BASE_URL': services['providerOrigin'], 'CRIPTOYA_API_URL': services['providerOrigin'],
        'DOLARAPI_URL': services['providerOrigin'], 'COINGECKO_API_URL': services['providerOrigin'], 'CI': 'true'})
    command = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', str(REL / 'vitest.config.mjs')]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    child = subprocess.run(command, cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
    copy_stable = all(hashlib.sha256((COPY / item['path']).read_bytes()).hexdigest() == item['sha256'] for item in sources)
    worker_stable = all(hashlib.sha256((REPO / REL / item['path']).read_bytes()).hexdigest() == item['sha256'] for item in worker_sources)
    report = {'status': 'PASS' if child.returncode == 0 and copy_stable and worker_stable else 'FAIL',
        'sourceRevision': FREEZE, 'sourceCopyRoot': str(COPY), 'sourceCount': len(sources),
        'copyMatchesGitBeforeRun': True, 'copySourceStable': copy_stable, 'workerSourceStable': worker_stable,
        'sources': sources, 'workerSources': worker_sources, 'checkoutHeadBeforeRun': head,
        'checkoutPathsChangedVsCopy': delta, 'checkoutProductEditsExecuted': False,
        'command': command, 'exitCode': child.returncode, 'startedAt': started,
        'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'stdoutBytes': len(child.stdout), 'stderrBytes': len(child.stderr), 'rawConsolePersisted': False,
        'credentialValuesCopied': False, 'envFilesCreated': False, 'sessionsPersisted': False,
        'existingDatabaseReused': DATABASE, 'newAuthIdentitiesCreated': 0, 'nextOrBrowserStarted': False}
    save(folder / 'execution.json', report)
    print(json.dumps({key: report[key] for key in ['status', 'sourceRevision', 'exitCode', 'copySourceStable', 'workerSourceStable']}))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False}))
        sys.exit(1)
