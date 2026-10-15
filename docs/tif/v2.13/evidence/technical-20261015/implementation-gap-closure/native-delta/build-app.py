#!/usr/bin/env python3
"""Build/start a new frozen Next copy for HTTP Auth/API/SSR; never opens a browser."""
import argparse
import datetime
import hashlib
import io
import json
import os
import pathlib
import re
import socket
import subprocess
import tarfile
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['build', 'start'])
    parser.add_argument('--private-directory', required=True)
    parser.add_argument('--revision', required=True)
    args = parser.parse_args()
    assert os.environ.get('ZARIX_DELTA_APP_WINDOW') == 'parent-released-frozen-delta-app'
    os.umask(0o077)
    private = pathlib.Path(args.private_directory)
    assert re.fullmatch(r'/tmp/zarix-runtime-20261015/implementation-delta-[0-9a-f-]{36}', str(private))
    assert not private.is_symlink() and private.stat().st_mode & 0o777 == 0o700
    target = json.loads((private / 'targets.metadata.json').read_text())
    services = json.loads((private / 'services.metadata.json').read_text())
    assert target['revision'] == services['revision'] and services['status'] == 'INFRA_READY_ACCEPTANCE_PENDING'
    repo = pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
    runtime = pathlib.Path('/tmp/zarix-runtime-20261015')
    copy = pathlib.Path('/tmp/zarix-app-delta-' + target['run'])
    git_env = {**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'}
    def git(*argv):
        result = subprocess.run(['git', *argv], cwd=repo, env=git_env, capture_output=True)
        assert result.returncode == 0, 'Frozen Git read failed; diagnostics withheld'
        return result.stdout
    def digest(path):
        return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
    def save(path, value):
        with path.open('x') as stream:
            os.chmod(path, 0o600)
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
    def child_environment(values):
        base = {key: value for key, value in os.environ.items() if key in ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL']}
        base.update(values)
        base.update(NEXT_TELEMETRY_DISABLED='1', DEVELOPER_DIR='/Library/Developer/CommandLineTools',
            TZ='Etc/UTC', UV_THREADPOOL_SIZE='2',
            NODE_OPTIONS='--max-old-space-size=2048 --import=' + str(repo / 'scripts/lib/restored-read-fetch-guard.mjs'))
        return base
    assert re.fullmatch('[0-9a-f]{40}', args.revision)
    assert git('rev-parse', 'HEAD').decode().strip() == args.revision
    if args.revision != target['revision']:
        assert git('diff', '--name-only', target['revision'], args.revision).decode().splitlines() == ['scripts/test-atomic-account-recompute.mjs']
    def private_values(path):
        path = pathlib.Path(path)
        assert not path.is_symlink() and path.stat().st_mode & 0o077 == 0
        return dict((key, json.loads(value)) for key, value in
            (line.split('=', 1) for line in path.read_text().splitlines() if line and not line.startswith('#')))
    def app_values():
        selected = private_values(target['existingEnvironmentFile'])
        cron = private_values(services['existingCronEnvironmentFile'])
        return {'NEXT_PUBLIC_APP_URL': target['plannedAppOrigin'], 'NEXT_PUBLIC_SUPABASE_URL': target['plannedApiOrigin'],
            'NEXT_PUBLIC_SUPABASE_ANON_KEY': selected['ZARIX_PROOF_ANON_KEY'],
            'SUPABASE_SERVICE_ROLE_KEY': selected['ZARIX_PROOF_SERVICE_ROLE_KEY'],
            'ZARIX_ISOLATED_TEST_BUILD': '1', 'CRIPTOYA_API_URL': services['providerOrigin'],
            'DOLARAPI_URL': services['providerOrigin'], 'COINGECKO_API_URL': services['providerOrigin'],
            'MP_API_BASE_URL': services['providerOrigin'],
            'MP_ACCESS_TOKEN': hashlib.sha256(('zarix-delta-mp-access:' + target['run']).encode()).hexdigest(),
            'MP_WEBHOOK_SECRET': hashlib.sha256(('zarix-delta-mp-webhook:' + target['run']).encode()).hexdigest(),
            'CRON_SECRET': cron['CRON_SECRET'], 'TELEGRAM_ADMIN_CHAT_ID': '',
            'NEXT_FONT_GOOGLE_MOCKED_RESPONSES': str(runtime / 'empty-proof-app-fonts/google-font-mock.cjs'),
            'ZARIX_RESTORE_FETCH_GUARD_LOG': '/tmp/zarix-restored-read-fetch-guard-delta-' + target['run'] + '.jsonl'}
    def safe_log(raw, values):
        # Redact selected credentials and JWT/connection forms in memory before
        # any build/server output can reach a new filesystem log.
        text = raw.decode(errors='replace')
        existing = private_values(target['existingEnvironmentFile'])
        login = json.loads(pathlib.Path(target['loginFile']).read_text())
        secrets = [values[key] for key in ['SUPABASE_SERVICE_ROLE_KEY','CRON_SECRET','MP_WEBHOOK_SECRET','MP_ACCESS_TOKEN']]
        secrets += [existing['ZARIX_PROOF_ANON_KEY']]
        secrets += [user['password'] for user in login['users']]
        for value in sorted(secrets, key=len, reverse=True):
            if value:
                text = text.replace(value, '[redacted]')
        text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[redacted-jwt]', text)
        text = re.sub(r'postgres(?:ql)?://[^\s"\']+', '[redacted-sql-url]', text)
        return text
    if args.phase == 'build':
        assert not copy.exists() and not (private / 'app-build.private.json').exists()
        names = git('ls-tree', '-r', '--name-only', args.revision).decode().splitlines()
        names = [name for name in names if not name.startswith('docs/') and
            (not pathlib.PurePosixPath(name).name.startswith('.env') or pathlib.PurePosixPath(name).name == '.env.example')]
        archive = git('archive', '--format=tar', args.revision, '--', *names)
        copy.mkdir(mode=0o700)
        with tarfile.open(fileobj=io.BytesIO(archive)) as members:
            for member in members:
                relative = pathlib.PurePosixPath(member.name)
                assert not relative.is_absolute() and '..' not in relative.parts
                if member.isdir():
                    (copy / member.name).mkdir(parents=True, exist_ok=True)
                else:
                    assert member.isfile(), 'Frozen copy cannot contain links or special files'
                    path = copy / member.name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(members.extractfile(member).read())
        sources = [{'path': name, 'sha256': digest(copy / name)} for name in names]
        assert all(digest(repo / entry['path']) == entry['sha256'] for entry in sources)
        os.symlink(repo / 'node_modules', copy / 'node_modules', target_is_directory=True)
        # Reuse and verify the seven actual existing Inter WOFF2s; no font network.
        font_proof = json.loads((runtime / 'empty-proof-build-proof.json').read_text())['offlineFontFixture']
        font_mock = pathlib.Path(font_proof['mockPath'])
        assert digest(font_mock) == font_proof['mockSha256']
        for name, value in font_proof['fontSha256'].items():
            assert digest(font_mock.parent / name) == value
        old_sources = json.loads((runtime / 'empty-proof-build-proof.json').read_text())['sources']
        assert digest(copy / 'app/layout.tsx') == next(entry['sha256'] for entry in old_sources if entry['path'] == 'app/layout.tsx')
        values = app_values()
        assert values['NEXT_FONT_GOOGLE_MOCKED_RESPONSES'] == str(font_mock)
        started = datetime.datetime.now(datetime.timezone.utc).isoformat()
        result = subprocess.run(['npm', 'run', 'build'], cwd=copy, env=child_environment(values),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=600)
        with (private / 'app-build.sanitized.log').open('x') as log:
            log.write(safe_log(result.stdout, values))
        stable = all(digest(copy / entry['path']) == entry['sha256'] and digest(repo / entry['path']) == entry['sha256'] for entry in sources)
        report = {'revision': args.revision, 'sqlApplicationBaseline': target['revision'], 'copyRoot': str(copy), 'exitCode': result.returncode,
            'sourceStable': stable, 'sources': sources, 'sourceCount': len(sources),
            'sourceManifestSha256': hashlib.sha256(json.dumps(sources, separators=(',', ':')).encode()).hexdigest(),
            'processEnvironmentInMemoryOnly': True, 'credentialValuesCopiedToFiles': False,
            'offlineFonts': {'files': 7, 'mockSha256': font_proof['mockSha256']},
            'fetchGuardSha256': digest(repo / 'scripts/lib/restored-read-fetch-guard.mjs'),
            'clockModified': False, 'browserUsed': False, 'startedAt': started,
            'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        if result.returncode == 0:
            report['buildId'] = (copy / '.next/BUILD_ID').read_text().strip()
            labels = ['SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'MP_WEBHOOK_SECRET', 'MP_ACCESS_TOKEN']
            matches = {label: [] for label in labels}
            assets = sorted(path for path in (copy / '.next/static').rglob('*') if path.is_file())
            assert assets
            for asset in assets:
                data = asset.read_bytes()
                for label in labels:
                    if values[label].encode() in data:
                        matches[label].append(str(asset.relative_to(copy)))
            report['browserAssetExactValueScan'] = {'files': len(assets), 'matchingPaths': matches,
                'status': 'PASS' if not any(matches.values()) else 'FAIL',
                'scope': 'Four complete selected private values in .next/static bytes only; not universal absence proof.'}
        save(private / 'app-build.private.json', report)
        assert result.returncode == 0 and stable and report['browserAssetExactValueScan']['status'] == 'PASS'
        print(json.dumps({key: value for key, value in report.items() if key != 'sources'}))
        return
    proof = json.loads((private / 'app-build.private.json').read_text())
    assert proof['exitCode'] == 0 and proof['sourceStable'] and proof['revision'] == args.revision
    assert proof['buildId'] == (copy / '.next/BUILD_ID').read_text().strip()
    assert all(digest(copy / entry['path']) == entry['sha256'] for entry in proof['sources'])
    assert digest(repo / 'scripts/lib/restored-read-fetch-guard.mjs') == proof['fetchGuardSha256']
    assert not (private / 'app-state.private.json').exists()
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 3006))
    values = app_values()
    argv = ['node', str(copy / 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '3006']
    # The server stays detached; its raw output is discarded before filesystem.
    # The request runner captures only allowlisted response/DB observations.
    child = subprocess.Popen(argv, cwd=copy, env=child_environment(values),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    state = {'revision': args.revision, 'sqlApplicationBaseline': target['revision'], 'buildId': proof['buildId'], 'nextPid': child.pid,
        'copyRoot': str(copy), 'appOrigin': target['plannedAppOrigin'], 'apiOrigin': target['plannedApiOrigin'],
        'rawOutputDisposition': 'discarded-before-filesystem',
        'argv': argv, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    save(private / 'app-state.private.json', state)
    for _ in range(80):
        assert child.poll() is None, 'Owned Next exited; private diagnostics retained'
        probe = subprocess.run(['/usr/sbin/lsof', '-nP', '-a', '-p', str(child.pid), '-iTCP:3006', '-sTCP:LISTEN', '-Fn'], capture_output=True, text=True)
        if probe.returncode == 0:
            assert [line[1:] for line in probe.stdout.splitlines() if line.startswith('n')] == ['127.0.0.1:3006']
            with urllib.request.urlopen(target['plannedAppOrigin'] + '/login', timeout=10) as response:
                assert response.status == 200
            print(json.dumps({**state, 'status': 'NEXT_HTTP_READY_ACCEPTANCE_PENDING', 'browserUsed': False}))
            return
        time.sleep(.25)
    raise AssertionError('Owned Next readiness timeout; no unrelated process touched')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'BLOCKED', 'errorType': type(error).__name__, 'rawDiagnosticsPublished': False}))
        raise SystemExit(1)
