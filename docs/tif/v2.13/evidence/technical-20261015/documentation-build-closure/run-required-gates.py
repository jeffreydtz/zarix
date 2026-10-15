"""Repeat required gates after excluding archived evidence from application tsc."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[6]
OUT = Path(__file__).resolve().parent / 'executed'
RUNTIME = Path('/tmp/zarix-runtime-20261015')
BASELINE = '84df929ab2f169251a49f3e95d0e0c148dfcb87c'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    assert os.environ.get('ZARIX_DOCUMENTATION_BUILD_WINDOW') == 'owned-http-stopped'
    os.umask(0o077)
    stop = json.loads((RUNTIME / 'owned-final-http-services-stop.json').read_text())
    assert stop['status'] == 'PASS' and len(stop['targets']) == 9
    assert all(row['status'] in ['STOPPED_OWN_PROCESS', 'ALREADY_ABSENT'] for row in stop['targets'])
    env = {key: value for key, value in os.environ.items() if not any(
        marker in key.upper() for marker in ['SUPABASE', 'GEMINI', 'GOOGLE_API', 'TELEGRAM', 'MERCADO', 'MP_', 'CRON', 'DATABASE_URL', 'CRIPTOYA', 'CRYPTOYA', 'DOLARAPI', 'COINGECKO'])}
    env.pop('NODE_OPTIONS', None)
    env.pop('NODE_PATH', None)
    env.update(DEVELOPER_DIR='/Library/Developer/CommandLineTools')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, env=env, text=True).strip()
    node = subprocess.check_output(['node', '--version'], env=env, text=True).strip()
    npm = subprocess.check_output(['npm', '--version'], env=env, text=True).strip()
    assert node.startswith('v22.')
    assert not OUT.exists(), 'Never replace an executed phase'
    core = json.loads((OUT.parents[1] / 'core-closure/verification.json').read_text())

    def sources():
        return [{'path': row['path'], 'sha256': sha((ROOT / row['path']).read_bytes())} for row in core['sourceManifest']]

    before = sources()
    dirty = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=ROOT, env=env, text=True).splitlines()
    source_clean = not any(row['path'] in dirty for row in before)
    assert source_clean, 'Commit the exact compiler change before these gates'
    changes = [row['path'] for row, old in zip(before, core['sourceManifest']) if row['sha256'] != old['sha256']]
    assert changes == ['tsconfig.json'], 'Only the documented compiler exclusion may differ from CI6'
    old = json.loads(subprocess.check_output(['git', 'show', BASELINE + ':tsconfig.json'], cwd=ROOT, env=env))
    current = json.loads((ROOT / 'tsconfig.json').read_text())
    expected = {**old, 'exclude': old['exclude'] + ['docs/tif/v2.13/evidence']}
    assert current == expected
    proof = json.loads((RUNTIME / 'contract-clock-build-proof.json').read_text())
    font = proof['offlineFontFixture']
    selected = dict((key, json.loads(value)) for key, value in (line.split('=', 1) for line in (RUNTIME / 'contract-clock-app.env').read_text().splitlines() if line and not line.startswith('#')))
    mock = Path(selected['NEXT_FONT_GOOGLE_MOCKED_RESPONSES'])
    assert sha(mock.read_bytes()) == font['mockSha256']
    for name, digest in font['fontSha256'].items():
        assert sha((mock.parent / name).read_bytes()) == digest
    guard = ROOT / 'scripts/lib/restored-read-fetch-guard.mjs'
    assert sha(guard.read_bytes()) == proof['fetchGuardSha256']
    audit = Path('/tmp/zarix-restored-read-fetch-guard-documentation-build-closure.jsonl')
    assert not audit.exists()
    env.update(npm_config_cache='/tmp/zarix-npm-cache-20261015', NEXT_TELEMETRY_DISABLED='1', TZ='Etc/UTC',
               NEXT_PUBLIC_SUPABASE_URL='https://placeholder.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY='placeholder-anon-key',
               SUPABASE_SERVICE_ROLE_KEY='placeholder-service-role-key', NEXT_FONT_GOOGLE_MOCKED_RESPONSES=str(mock),
               ZARIX_RESTORE_FETCH_GUARD_LOG=str(audit), UV_THREADPOOL_SIZE='2',
               NODE_OPTIONS='--max-old-space-size=2048 --import=' + str(guard))
    OUT.mkdir()
    commands = [
        ('npm-ci', ['npm', 'ci']), ('typecheck', ['npm', 'run', 'typecheck']), ('lint', ['npm', 'run', 'lint']),
        ('coverage', ['npm', 'run', 'test:coverage', '--', '--reporter=json', '--outputFile=' + str(OUT / 'final-vitest.json')]),
        ('test-db', ['npm', 'run', 'test:db']), ('build', ['npm', 'run', 'build']),
        ('dependency-audit', ['npm', 'audit', '--json']), ('production-audit', ['npm', 'audit', '--omit=dev', '--json']),
    ]
    records = []
    for name, command in commands:
        start = time.monotonic()
        at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with (OUT / (name + '.log')).open('x') as stdout, (OUT / (name + '.stderr.log')).open('x') as stderr:
            result = subprocess.run(command, cwd=ROOT, env=env, stdout=stdout, stderr=stderr, check=False)
        records.append({'name': name, 'command': command, 'startedAt': at, 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        'durationMs': round((time.monotonic() - start) * 1000), 'exitCode': result.returncode, 'status': 'PASS' if result.returncode == 0 else 'FAIL'})
        print(json.dumps(records[-1]), flush=True)
    shutil.copyfile(ROOT / 'coverage/coverage-summary.json', OUT / 'coverage-summary.json')
    report = {'runAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'codeRevision': revision, 'runtimeCodeBaseline': BASELINE,
              'node': node, 'npm': npm, 'sourceWorkingTreeClean': source_clean, 'sourceStable': sources() == before, 'sourceManifest': before,
              'sourceManifestSha256': sha(json.dumps(before, separators=(',', ':')).encode()), 'onlyBaselineDifference': changes,
              'compilerOptionsAndApplicationRootsUnchanged': True, 'commands': records,
              'buildId': (ROOT / '.next/BUILD_ID').read_text().strip(), 'fontMockSha256': font['mockSha256'], 'fetchGuardSha256': sha(guard.read_bytes()),
              'scope': 'Six required npm gates plus fresh full/production audits. Only tsconfig excludes immutable archived evidence. Application/SQL/dependency bytes match CI6; no browser, native API/DB, Auth or real provider acceptance is rerun or inferred. Build uses explicit dummy Supabase values and existing local font fixtures. Fetch preload restricts global fetch, not every network client.'}
    (OUT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    return 0 if report['sourceStable'] and all(row['status'] == 'PASS' for row in records if row['name'] != 'dependency-audit') else 1


if __name__ == '__main__':
    sys.exit(main())
