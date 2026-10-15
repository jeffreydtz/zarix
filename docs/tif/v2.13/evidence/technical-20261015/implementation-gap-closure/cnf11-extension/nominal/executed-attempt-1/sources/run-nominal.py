#!/usr/bin/env python3
"""Prepared nominal CNF11 launcher. Importing this file performs no operation."""
import argparse
import datetime
import hashlib
import io
import json
import os
import pathlib
import re
import signal
import subprocess
import sys
import tarfile

REPO = pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
FREEZE = 'f5f362ee9dbb81da5268049cab41b357d90eccf1'
SOURCE_MANIFEST_SHA = '6c108712a7d338b4c6c1d14dca798921637abc9e5f2aa3009318fdf7b24e3a29'
DATABASE = 'zarix_delta_e4bd026f703549bfa24de940134184b8'
REL = pathlib.Path('docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/cnf11-extension/nominal')


def private_json(file):
    assert not file.is_symlink() and file.stat().st_mode & 0o077 == 0
    return json.loads(file.read_text())


def existing_env(file):
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
    assert os.environ.get('ZARIX_CNF11_EXTENSION_WINDOW') == 'parent-released-cnf11-extension'
    assert os.environ.get('ZARIX_ISOLATED_DATABASE_CONFIRM') == 'synthetic-only'
    assert re.fullmatch('attempt-[1-9][0-9]*', args.attempt)
    os.umask(0o077)
    target_file = pathlib.Path(args.targets)
    assert target_file.name == 'targets.metadata.json'
    directory = target_file.parent
    assert re.fullmatch('/tmp/zarix-runtime-20261015/[a-z0-9-]{10,140}', str(directory))
    assert not directory.is_symlink() and directory.stat().st_mode & 0o077 == 0
    target = private_json(target_file)
    services = private_json(directory / 'services.metadata.json')
    assert target['purpose'] == 'zarix-cnf11-extension' and target['newDatabaseName'] == DATABASE
    assert target['sourceRevision'] == target['executionRevision'] == FREEZE
    assert target['existingEnvironmentFile'] == '/tmp/zarix-runtime-20261015/proof.env'
    assert target['existingCronEnvironmentFile'] == '/tmp/zarix-runtime-20261015/e2e-app.env'
    assert target['loginFile'] == '/tmp/zarix-runtime-20261015/proof-logins.json'
    assert target['databaseHost'] == '127.0.0.1' and int(target['databasePort']) == 58322
    assert target['apiOrigin'] == 'http://127.0.0.1:61321'
    assert target['providerOrigin'] == services['providerOrigin'] == 'http://127.0.0.1:61329'
    copy = pathlib.Path(target['sourceCopyRoot'])
    assert str(copy).startswith('/tmp/zarix-') and not copy.is_symlink()
    proof = private_json(pathlib.Path(target['sourceProofFile']))
    assert proof['sourceRevision'] == FREEZE and proof['sourceCount'] == 517
    assert proof['sourceManifestSha256'] == SOURCE_MANIFEST_SHA
    sources = proof['sources']
    assert len(sources) == 517
    assert len({item['path'] for item in sources}) == 517
    assert all(not pathlib.PurePosixPath(item['path']).is_absolute() and '..' not in pathlib.PurePosixPath(item['path']).parts for item in sources)
    assert hashlib.sha256(json.dumps(sources, separators=(',', ':')).encode()).hexdigest() == SOURCE_MANIFEST_SHA
    assert proof['sourceCopyRoot'] == str(copy)
    assert all(hashlib.sha256((copy / item['path']).read_bytes()).hexdigest() == item['sha256'] for item in sources)
    git_env = {**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'}
    archive = subprocess.check_output(['git', 'archive', '--format=tar', FREEZE, '--', *[item['path'] for item in sources]], cwd=REPO, env=git_env)
    with tarfile.open(fileobj=io.BytesIO(archive)) as stream:
        files = {item.name: item for item in stream.getmembers() if item.isfile()}
        assert all(hashlib.sha256(stream.extractfile(files[item['path']]).read()).hexdigest() == item['sha256'] for item in sources)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, env=git_env, text=True).strip()
    delta = subprocess.check_output(['git', 'diff', '--name-only', FREEZE, head], cwd=REPO, env=git_env, text=True).splitlines()
    folder = directory / ('nominal-' + args.attempt)
    assert not folder.exists(), 'Preserve previous attempts'
    folder.mkdir(mode=0o700)
    snapshot_dir = folder / 'sources'
    snapshot_dir.mkdir(mode=0o700)
    worker_sources = []
    for name in ['run-nominal.py', 'vitest.config.mjs', 'held-acknowledgement.ts', 'nominal.test-source.ts']:
        content = (REPO / REL / name).read_bytes()
        with (snapshot_dir / name).open('xb') as stream:
            stream.write(content)
        worker_sources.append({'path': name, 'sha256': hashlib.sha256(content).hexdigest()})
    save(snapshot_dir / 'manifest.json', {'sourceRevision': FREEZE, 'files': worker_sources})
    values = existing_env(pathlib.Path(target['existingEnvironmentFile']))
    cron = existing_env(pathlib.Path(target['existingCronEnvironmentFile']))
    env = {key: value for key, value in os.environ.items() if not key.startswith(('PG', 'MP_', 'MERCADOPAGO_', 'SUPABASE_', 'NEXT_PUBLIC_SUPABASE_', 'TELEGRAM_'))}
    env.update({'ZARIX_CNF11_NOMINAL_TARGET': str(target_file), 'ZARIX_CNF11_NOMINAL_OUTPUT': str(folder),
        'ZARIX_CNF11_NOMINAL_CACHE': str(folder / 'cache'), 'ZARIX_CNF11_SOURCE_COPY': str(copy),
        'NEXT_PUBLIC_SUPABASE_URL': target['apiOrigin'],
        'NEXT_PUBLIC_SUPABASE_ANON_KEY': values['ZARIX_PROOF_ANON_KEY'],
        'SUPABASE_SERVICE_ROLE_KEY': values['ZARIX_PROOF_SERVICE_ROLE_KEY'], 'CRON_SECRET': cron['CRON_SECRET'],
        'MP_WEBHOOK_SECRET': hashlib.sha256(('zarix-cnf11-extension-mp-webhook:' + target['run']).encode()).hexdigest(),
        'MP_ACCESS_TOKEN': hashlib.sha256(('zarix-cnf11-extension-mp-access:' + target['run']).encode()).hexdigest(),
        'MP_API_BASE_URL': target['providerOrigin'], 'CRIPTOYA_API_URL': target['providerOrigin'],
        'DOLARAPI_URL': target['providerOrigin'], 'COINGECKO_API_URL': target['providerOrigin'], 'CI': 'true'})
    command = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', str(REL / 'vitest.config.mjs')]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    child = subprocess.Popen(command, cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    own_group = os.getpgid(child.pid)
    assert own_group == child.pid and os.getsid(child.pid) == child.pid
    save(folder / 'process-journal.json', {'purpose': 'cnf11-extension-owned-worker-process',
        'pid': child.pid, 'processGroupId': own_group, 'sourceRevision': FREEZE, 'startedAt': started,
        'workerSourceSha256': next(item['sha256'] for item in worker_sources if item['path'] == 'nominal.test-source.ts'),
        'deadlineSeconds': 240, 'cleanupOwnerIfTimeoutOrResidue': 'root',
        'automaticDatabaseRecovery': False, 'containsCredentials': False})
    timed_out = False
    termination = 'not-needed'
    stdout = stderr = b''
    try:
        stdout, stderr = child.communicate(timeout=240)
    except subprocess.TimeoutExpired:
        timed_out = True
        # Only the newly created, still identified process group is owned here.
        # SIGTERM requests termination; JavaScript finally is not guaranteed.
        # Any timeout requires root to inspect the safe checkpoints and SQL.
        assert child.poll() is None and os.getpgid(child.pid) == own_group and os.getsid(child.pid) == child.pid
        os.killpg(own_group, signal.SIGTERM)
        termination = 'own-group-sigterm'
        try:
            stdout, stderr = child.communicate(timeout=15)
        except subprocess.TimeoutExpired:
            assert child.poll() is None and os.getpgid(child.pid) == own_group and os.getsid(child.pid) == child.pid
            os.killpg(own_group, signal.SIGKILL)
            termination = 'own-group-sigkill-after-sigterm-deadline'
            stdout, stderr = child.communicate(timeout=5)
    copy_stable = all(hashlib.sha256((copy / item['path']).read_bytes()).hexdigest() == item['sha256'] for item in sources)
    worker_stable = all(hashlib.sha256((REPO / REL / item['path']).read_bytes()).hexdigest() == item['sha256'] for item in worker_sources)
    report = {'status': 'BLOCKED' if timed_out else ('PASS' if child.returncode == 0 and copy_stable and worker_stable else 'FAIL'),
        'sourceRevision': FREEZE, 'sourceCopyRoot': str(copy), 'sourceCount': len(sources),
        'sourceManifestSha256': SOURCE_MANIFEST_SHA, 'copyMatchesGitBeforeRun': True,
        'copySourceStable': copy_stable, 'workerSourceStable': worker_stable,
        'sources': sources, 'workerSources': worker_sources, 'checkoutHeadBeforeRun': head,
        'checkoutPathsChangedVsCopy': delta, 'checkoutProductEditsExecuted': False,
        'command': command, 'exitCode': child.returncode, 'startedAt': started,
        'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'stdoutBytes': len(stdout), 'stderrBytes': len(stderr), 'rawConsolePersisted': False,
        'timedOut': timed_out, 'processGroupOwnAndVerified': True, 'termination': termination,
        'cleanupOwnerIfTimeoutOrResidue': 'root', 'automaticDatabaseRecovery': False,
        'credentialValuesCopied': False, 'envFilesCreated': False, 'sessionsPersisted': False,
        'existingDatabaseReused': DATABASE, 'newAuthIdentitiesCreated': 0,
        'newChatMappingsCreated': 0, 'nextOrBrowserStarted': False}
    save(folder / 'execution.json', report)
    print(json.dumps({key: report[key] for key in ['status', 'sourceRevision', 'exitCode', 'copySourceStable', 'workerSourceStable']}))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False}))
        sys.exit(1)
