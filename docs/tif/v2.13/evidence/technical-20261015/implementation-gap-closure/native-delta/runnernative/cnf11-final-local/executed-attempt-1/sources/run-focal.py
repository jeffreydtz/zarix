#!/usr/bin/env python3
"""Release-gated COPY730 focal. Credentials, sessions and console stay in RAM."""
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
PRIVATE = pathlib.Path('/tmp/zarix-runtime-20261015/implementation-delta-db3cf513-b7ad-4f2b-abcd-a2a44aeed27b')
COPY = pathlib.Path('/tmp/zarix-app-delta-db3cf513-b7ad-4f2b-abcd-a2a44aeed27b')
FREEZE = '730767b1723502b495d371e69c44df31eb230b56'
REL = pathlib.Path('docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/native-delta/runnernative/cnf11-final-local')


def read_env(file):
    assert not file.is_symlink() and file.stat().st_mode & 0o077 == 0
    result = {}
    for line in file.read_text().splitlines():
        if line and not line.startswith('#'):
            key, value = line.split('=', 1)
            try:
                result[key] = json.loads(value)
            except json.JSONDecodeError:
                result[key] = value.strip("'")
    return result


def save(file, data):
    with file.open('x') as stream:
        json.dump(data, stream, indent=2)
        stream.write('\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--attempt', default='attempt-1')
    args = parser.parse_args()
    assert re.fullmatch(r'attempt-[1-9][0-9]*', args.attempt)
    assert os.environ.get('ZARIX_DELTA_NATIVE_WINDOW') == 'parent-released-frozen-delta'
    assert os.environ.get('ZARIX_ISOLATED_DATABASE_CONFIRM') == 'synthetic-only'
    os.umask(0o077)
    target = json.loads((PRIVATE / 'targets.metadata.json').read_text())
    services = json.loads((PRIVATE / 'services.metadata.json').read_text())
    build = json.loads((PRIVATE / 'app-build.private.json').read_text())
    assert target['purpose'] == 'zarix-implementation-delta'
    assert target['existingEnvironmentFile'] == '/tmp/zarix-runtime-20261015/proof.env'
    assert re.fullmatch('zarix_delta_[0-9a-f]{32}', target['newDatabaseName'])
    assert build['revision'] == FREEZE and build['copyRoot'] == str(COPY) and build['exitCode'] == 0
    sources = build['sources']
    assert all(hashlib.sha256((COPY / entry['path']).read_bytes()).hexdigest() == entry['sha256'] for entry in sources)
    git_env = {**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'}
    archive = subprocess.check_output(['git', 'archive', '--format=tar', FREEZE, '--', *[entry['path'] for entry in sources]], cwd=REPO, env=git_env)
    with tarfile.open(fileobj=io.BytesIO(archive)) as stream:
        members = {member.name: member for member in stream.getmembers() if member.isfile()}
        assert all(hashlib.sha256(stream.extractfile(members[entry['path']]).read()).hexdigest() == entry['sha256'] for entry in sources)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, env=git_env, text=True).strip()
    root_delta = subprocess.check_output(['git', 'diff', '--name-only', FREEZE, head], cwd=REPO, env=git_env, text=True).splitlines()
    root_dirty = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=REPO, env=git_env, text=True).splitlines()
    # Current checkout is only provenance: every @ import resolves to COPY730.
    folder = PRIVATE / ('cnf11-final-local-' + args.attempt)
    assert not folder.exists(), 'Refusing to overwrite a previous focal attempt'
    folder.mkdir(mode=0o700)
    snapshot_dir = folder / 'sources'
    snapshot_dir.mkdir(mode=0o700)
    worker_sources = []
    for name in ['run-focal.py', 'vitest.config.mjs', 'focal.test-source.ts']:
        content = (REPO / REL / name).read_bytes()
        with (snapshot_dir / name).open('xb') as stream:
            stream.write(content)
        worker_sources.append({'path': name, 'sha256': hashlib.sha256(content).hexdigest()})
    save(snapshot_dir / 'manifest.json', {'sourceRevision': FREEZE, 'cloneSchemaRevision': target['revision'], 'files': worker_sources})
    values = read_env(pathlib.Path(target['existingEnvironmentFile']))
    cron = read_env(pathlib.Path('/tmp/zarix-runtime-20261015/e2e-app.env'))
    env = {key: value for key, value in os.environ.items() if not key.startswith(('PG', 'MP_', 'MERCADOPAGO_', 'SUPABASE_', 'NEXT_PUBLIC_SUPABASE_', 'TELEGRAM_'))}
    env.update({'ZARIX_FOCAL_OUTPUT': str(folder), 'ZARIX_FOCAL_CACHE': str(folder / 'cache'),
        'NEXT_PUBLIC_SUPABASE_URL': 'http://127.0.0.1:61321',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY': values['ZARIX_PROOF_ANON_KEY'],
        'SUPABASE_SERVICE_ROLE_KEY': values['ZARIX_PROOF_SERVICE_ROLE_KEY'], 'CRON_SECRET': cron['CRON_SECRET'],
        'MP_WEBHOOK_SECRET': hashlib.sha256(('zarix-delta-mp-webhook:' + target['run']).encode()).hexdigest(),
        'MP_ACCESS_TOKEN': hashlib.sha256(('zarix-delta-mp-access:' + target['run']).encode()).hexdigest(),
        'MP_API_BASE_URL': services['providerOrigin'], 'CRIPTOYA_API_URL': services['providerOrigin'],
        'DOLARAPI_URL': services['providerOrigin'], 'COINGECKO_API_URL': services['providerOrigin'], 'CI': 'true'})
    command = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', str(REL / 'vitest.config.mjs')]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    child = subprocess.run(command, cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
    stable = all(hashlib.sha256((COPY / entry['path']).read_bytes()).hexdigest() == entry['sha256'] for entry in sources)
    worker_stable = all(hashlib.sha256((REPO / REL / entry['path']).read_bytes()).hexdigest() == entry['sha256'] for entry in worker_sources)
    execution = {'status': 'PASS' if child.returncode == 0 and stable and worker_stable else 'FAIL',
        'sourceRevision': FREEZE, 'cloneSchemaRevision': target['revision'], 'copyRoot': str(COPY),
        'sourceCount': len(sources), 'copyMatchesExactGitRevisionBeforeRun': True, 'copySourceStable': stable,
        'checkoutHeadBeforeRun': head, 'checkoutPathsChangedVsCopy': root_delta,
        'checkoutUncommittedPathsBeforeRun': [item for item in root_dirty if not item.startswith('docs/')],
        'checkoutEditsExecuted': False, 'command': command, 'exitCode': child.returncode,
        'workerSourceStable': worker_stable, 'workerSources': worker_sources, 'sources': sources,
        'startedAt': started, 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'rawConsolePersisted': False, 'stdoutBytes': len(child.stdout), 'stderrBytes': len(child.stderr),
        'credentialValuesCopied': False, 'envFilesCreated': False, 'sessionsPersisted': False, 'browserUsed': False}
    save(folder / 'execution.json', execution)
    print(json.dumps({key: execution[key] for key in ['status', 'sourceRevision', 'exitCode', 'copySourceStable', 'workerSourceStable', 'browserUsed']}))
    return 0 if execution['status'] == 'PASS' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False}))
        sys.exit(1)
