#!/usr/bin/env python3
"""Release-gated bot integration launcher; importing it performs no operation."""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

REPO = Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
BASE = REPO / 'docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/cnf11-extension'
REL = BASE.relative_to(REPO) / 'bot'


def private_json(file):
    assert not file.is_symlink() and file.stat().st_mode & 0o077 == 0
    return json.loads(file.read_text())


def save(file, value):
    with file.open('x') as stream:
        os.chmod(file, 0o600)
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--targets', required=True)
    parser.add_argument('--phase', required=True, choices=['prepare', 'replay'])
    parser.add_argument('--replay-fixture')
    parser.add_argument('--attempt', default='attempt-1')
    args = parser.parse_args()
    assert os.environ.get('ZARIX_CNF11_EXTENSION_WINDOW') == 'parent-released-cnf11-extension'
    assert os.environ.get('ZARIX_ISOLATED_DATABASE_CONFIRM') == 'synthetic-only'
    assert re.fullmatch('attempt-[1-9][0-9]*', args.attempt)
    assert (args.phase == 'replay') == bool(args.replay_fixture)
    os.umask(0o077)
    common_path = BASE / 'coordinator/common.py'
    spec = importlib.util.spec_from_file_location('cnf11_bot_owned_common', common_path)
    common = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(common)
    target_file = Path(args.targets)
    assert target_file.name == 'targets.metadata.json'
    directory, target = common.metadata(target_file.parent)
    private_json(target_file)
    services = private_json(directory / 'services.metadata.json')
    assert target['existingEnvironmentFile'] == '/tmp/zarix-runtime-20261015/proof.env'
    assert target['loginFile'] == '/tmp/zarix-runtime-20261015/proof-logins.json'
    assert target['databaseHost'] == '127.0.0.1' and int(target['databasePort']) == 58322
    assert target['apiOrigin'] == 'http://127.0.0.1:61321'
    assert target['providerOrigin'] == services['providerOrigin'] == 'http://127.0.0.1:61329'
    common.invariant_files()
    checkout = common.worktree_guard()
    proof = common.check_copy(target)
    replay_path = None
    if args.replay_fixture:
        replay_path = Path(args.replay_fixture)
        assert re.fullmatch(str(directory) + r'/bot-prepare-attempt-[1-9][0-9]*/replay-fixture.json', str(replay_path))
        replay = private_json(replay_path)
        assert replay['purpose'] == 'cnf11-bot-sanitized-process-replay'
        assert replay['sourceRevision'] == common.REVISION and replay['database'] == common.DATABASE
        assert replay['containsCredentials'] is False and len(replay['fixtures']) == 4
        prior = private_json(replay_path.parent / 'execution.json')
        prior_worker = private_json(replay_path.parent / 'bot-verification.json')
        assert prior['status'] == prior_worker['status'] == 'PASS'
        assert prior['phase'] == 'prepare' and prior['workerPid'] != os.getpid()
        assert prior['workerExited'] and prior['sourceManifestSha256'] == common.SOURCE_SHA
        assert common.sha(replay_path) == prior['replayFixtureSha256'], 'Replay fixture changed after successful prepare'
    folder = directory / ('bot-' + args.phase + '-' + args.attempt)
    folder.mkdir(mode=0o700)
    sources_dir = folder / 'sources'
    sources_dir.mkdir(mode=0o700)
    worker_sources = []
    for name in ['run-bot.py', 'vitest.config.mjs', 'bot.test-source.ts']:
        content = (BASE / 'bot' / name).read_bytes()
        (sources_dir / name).write_bytes(content)
        worker_sources.append({'path': name, 'sha256': hashlib.sha256(content).hexdigest()})
    common_sha = common.sha(common_path)
    save(sources_dir / 'manifest.json', {'sourceRevision': common.REVISION, 'files': worker_sources,
        'commonPath': str(common_path.relative_to(REPO)), 'commonSha256': common_sha})
    values = common.read_env(Path(target['existingEnvironmentFile']))
    env = {key: value for key, value in os.environ.items() if not key.startswith(('PG', 'MP_', 'MERCADOPAGO_', 'SUPABASE_', 'NEXT_PUBLIC_SUPABASE_', 'TELEGRAM_'))}
    env.update({'ZARIX_CNF11_BOT_TARGET': str(target_file), 'ZARIX_CNF11_BOT_OUTPUT': str(folder),
        'ZARIX_CNF11_BOT_PHASE': args.phase, 'ZARIX_CNF11_BOT_CACHE': str(folder / 'cache'),
        'ZARIX_CNF11_SOURCE_COPY': target['sourceCopyRoot'], 'CI': 'true',
        'NEXT_PUBLIC_SUPABASE_URL': target['apiOrigin'],
        'NEXT_PUBLIC_SUPABASE_ANON_KEY': values['ZARIX_PROOF_ANON_KEY'],
        'SUPABASE_SERVICE_ROLE_KEY': values['ZARIX_PROOF_SERVICE_ROLE_KEY'],
        'CRIPTOYA_API_URL': target['providerOrigin'], 'DOLARAPI_URL': target['providerOrigin'], 'COINGECKO_API_URL': target['providerOrigin']})
    if replay_path:
        env['ZARIX_CNF11_BOT_REPLAY_FIXTURE'] = str(replay_path)
    command = ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', str(REL / 'vitest.config.mjs')]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    child = subprocess.Popen(command, cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    identity = subprocess.check_output(['ps', '-p', str(child.pid), '-o', 'pid=,ppid=,lstart=,comm='], text=True).strip()
    save(folder / 'worker-owner.json', {'launcherPid': os.getpid(), 'workerPid': child.pid, 'workerIdentity': identity,
        'cwd': str(REPO), 'command': command, 'startedAt': started, 'workerSources': worker_sources,
        'sourceRevision': common.REVISION, 'phase': args.phase, 'killPolicy': 'No generic process killing; retain ownership and coordinate cleanup on timeout'})
    timed_out = False
    try:
        stdout, stderr = child.communicate(timeout=230)
    except subprocess.TimeoutExpired:
        # Do not kill the worker between a plan mutation and its finally cleanup.
        timed_out = True
        save(folder / 'worker-timeout.json', {'status': 'BLOCKED', 'workerPid': child.pid,
            'workerStillRunning': child.poll() is None, 'rootCleanupCoordinationRequired': True,
            'phase': args.phase, 'rawConsolePersisted': False})
        print(json.dumps({'status': 'BLOCKED', 'workerPid': child.pid, 'ownerJournal': str(folder / 'worker-owner.json'), 'reason': 'Timed out; root must coordinate owned worker cleanup'}), flush=True)
        stdout, stderr = child.communicate()  # Wait for normal finally; never return with a known owned worker active.
    copy_stable = all(common.sha(Path(target['sourceCopyRoot']) / item['path']) == item['sha256'] for item in proof['sources'])
    worker_stable = all(common.sha(BASE / 'bot' / item['path']) == item['sha256'] for item in worker_sources) and common.sha(common_path) == common_sha
    common.invariant_files()
    worker_report = private_json(folder / 'bot-verification.json') if (folder / 'bot-verification.json').exists() else {}
    report = {'status': 'PASS' if child.returncode == 0 and not timed_out and copy_stable and worker_stable and worker_report.get('status') == 'PASS' else 'FAIL',
        'phase': args.phase, 'sourceRevision': common.REVISION, 'sourceManifestSha256': common.SOURCE_SHA, 'sourceCount': len(proof['sources']),
        'sourceCopyRoot': target['sourceCopyRoot'], 'copyMatchesGitBeforeRun': True, 'copySourceStable': copy_stable, 'workerSourceStable': worker_stable,
        'workerSources': worker_sources, 'commonSha256': common_sha, 'checkoutHeadBeforeRun': checkout,
        'workerPid': child.pid, 'workerExited': child.poll() is not None, 'command': command,
        'exitCode': child.returncode, 'startedAt': started, 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'stdoutBytes': len(stdout), 'stderrBytes': len(stderr), 'rawConsolePersisted': False, 'timeoutObserved': timed_out,
        'newAuthIdentities': 0, 'newPersistentChatMappings': 0, 'tokenOrSessionFilesCreated': False,
        'existingDatabaseReused': common.DATABASE, 'nextOrBrowserStarted': False,
        'normalSessionCleanupObserved': worker_report.get('cleanup', {}).get('authSessions') == 0 and worker_report.get('cleanup', {}).get('authRefreshTokens') == 0,
        'replayFixtureSha256': common.sha(replay_path) if replay_path else common.sha(folder / 'replay-fixture.json') if (folder / 'replay-fixture.json').exists() else None}
    save(folder / 'execution.json', report)
    print(json.dumps({key: report[key] for key in ['status', 'phase', 'exitCode', 'workerExited', 'copySourceStable', 'workerSourceStable', 'normalSessionCleanupObserved']}))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False}))
        sys.exit(1)
