"""Required npm gates for the bounded implementation delta; no native lifecycle."""
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
HERE = Path(__file__).resolve().parent
RUNTIME = Path('/tmp/zarix-runtime-20261015')
CHECKPOINT = '7f71f2757a4decb0e0becbafb82860008b2f9185'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    assert os.environ.get('ZARIX_IMPLEMENTATION_GATES_WINDOW') == 'frozen-synthetic-delta'
    phase = sys.argv[1] if len(sys.argv) == 2 else 'required-gates-attempt-1'
    assert phase.startswith('required-gates-') and all(c.isalnum() or c == '-' for c in phase)
    out = HERE / phase
    assert not out.exists(), 'Preserve earlier gate output; select a new phase'
    os.umask(0o077)
    env = {key: value for key, value in os.environ.items() if not any(marker in key.upper()
        for marker in ['SUPABASE', 'GEMINI', 'GOOGLE_API', 'TELEGRAM', 'MERCADO', 'MP_', 'CRON',
                       'DATABASE_URL', 'CRIPTOYA', 'CRYPTOYA', 'DOLARAPI', 'COINGECKO'])}
    env.pop('NODE_OPTIONS', None)
    env.pop('NODE_PATH', None)
    env['DEVELOPER_DIR'] = '/Library/Developer/CommandLineTools'

    def git(*args):
        return subprocess.check_output(['git', *args], cwd=ROOT, env=env)

    revision = git('rev-parse', 'HEAD').decode().strip()
    node = subprocess.check_output(['node', '--version'], env=env, text=True).strip()
    npm = subprocess.check_output(['npm', '--version'], env=env, text=True).strip()
    assert node.startswith('v22.')
    names = sorted(set(git('ls-files', '-z', 'app', 'components', 'lib', 'types', 'scripts',
        'supabase', '__tests__', '.github', 'package.json', 'package-lock.json', 'tsconfig.json',
        'next.config.js', 'vitest.config.ts', 'vercel.json', '.env.example', 'middleware.ts',
        'tailwind.config.ts', 'postcss.config.js', '.eslintrc.json').decode().strip('\0').split('\0')))

    def sources():
        return [{'path': name, 'sha256': sha((ROOT / name).read_bytes())} for name in names]

    dirty = [name for name in git('diff', '--name-only', '-z', 'HEAD').decode().split('\0') if name]
    unknown = [name for name in git('ls-files', '--others', '--exclude-standard', '-z').decode().split('\0') if name]
    assert all(name.startswith('docs/') for name in dirty + unknown), 'Commit all application inputs first'
    before = sources()
    assert all(sha(git('show', revision + ':' + row['path'])) == row['sha256'] for row in before)
    proof = json.loads((RUNTIME / 'contract-clock-build-proof.json').read_text())
    font = proof['offlineFontFixture']
    selected = [line.split('=', 1)[1] for line in (RUNTIME / 'contract-clock-app.env').read_text().splitlines()
                if line.startswith('NEXT_FONT_GOOGLE_MOCKED_RESPONSES=')]
    assert len(selected) == 1
    mock = Path(json.loads(selected[0]))
    assert sha(mock.read_bytes()) == font['mockSha256']
    for name, digest in font['fontSha256'].items():
        assert sha((mock.parent / name).read_bytes()) == digest
    guard = ROOT / 'scripts/lib/restored-read-fetch-guard.mjs'
    assert sha(guard.read_bytes()) == proof['fetchGuardSha256']
    audit = Path('/tmp/zarix-restored-read-fetch-guard-implementation-gap-' + phase + '.jsonl')
    assert not audit.exists()
    env.update(npm_config_cache='/tmp/zarix-npm-cache-20261015', NEXT_TELEMETRY_DISABLED='1', TZ='Etc/UTC',
        NEXT_PUBLIC_SUPABASE_URL='https://placeholder.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY='placeholder-anon-key',
        SUPABASE_SERVICE_ROLE_KEY='placeholder-service-role-key', NEXT_FONT_GOOGLE_MOCKED_RESPONSES=str(mock),
        ZARIX_RESTORE_FETCH_GUARD_LOG=str(audit), UV_THREADPOOL_SIZE='2',
        NODE_OPTIONS='--max-old-space-size=2048 --import=' + str(guard))
    for key in ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'TELEGRAM_BOT_TOKEN',
                'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_ADMIN_CHAT_ID', 'MP_ACCESS_TOKEN',
                'MP_WEBHOOK_SECRET', 'MERCADOPAGO_ACCESS_TOKEN', 'CRON_SECRET']:
        env[key] = ''
    out.mkdir()
    commands = [('npm-ci', ['npm', 'ci']), ('typecheck', ['npm', 'run', 'typecheck']),
        ('lint', ['npm', 'run', 'lint']),
        ('coverage', ['npm', 'run', 'test:coverage', '--', '--reporter=json', '--outputFile=' + str(out / 'final-vitest.json')]),
        ('test-db', ['npm', 'run', 'test:db']), ('build', ['npm', 'run', 'build']),
        ('dependency-audit', ['npm', 'audit', '--json']), ('production-audit', ['npm', 'audit', '--omit=dev', '--json'])]
    records = []
    for name, command in commands:
        start = time.monotonic()
        at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with (out / (name + '.log')).open('x') as stdout, (out / (name + '.stderr.log')).open('x') as stderr:
            result = subprocess.run(command, cwd=ROOT, env=env, stdout=stdout, stderr=stderr, check=False)
        records.append({'name': name, 'command': command, 'startedAt': at,
            'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'durationMs': round((time.monotonic() - start) * 1000), 'exitCode': result.returncode,
            'status': 'PASS' if result.returncode == 0 else 'FAIL'})
        print(json.dumps(records[-1]), flush=True)
    coverage_passed = next(row for row in records if row['name'] == 'coverage')['status'] == 'PASS'
    build_passed = next(row for row in records if row['name'] == 'build')['status'] == 'PASS'
    if coverage_passed and (ROOT / 'coverage/coverage-summary.json').is_file():
        shutil.copyfile(ROOT / 'coverage/coverage-summary.json', out / 'coverage-summary.json')
    report = {'runAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'codeRevision': revision,
        'publishedCheckpoint': CHECKPOINT, 'node': node, 'npm': npm, 'sourceWorkingTreeClean': True,
        'sourceStable': sources() == before, 'sourceManifest': before,
        'sourceManifestSha256': sha(json.dumps(before, separators=(',', ':')).encode()),
        'commands': records, 'fontMockSha256': font['mockSha256'], 'fetchGuardSha256': sha(guard.read_bytes()),
        'buildId': (ROOT / '.next/BUILD_ID').read_text().strip() if build_passed else None,
        'scope': 'Six required npm gates and fresh full/production audits after the implementation delta. '
                 'Dummy Supabase values and local font fixtures; global fetch preload is not a universal network firewall. '
                 'No native lifecycle, Auth, browser, UI journey or real provider acceptance is inferred. '
                 'Audit failures remain explicit. Source manifest covers tracked application/test/SQL/build inputs.'}
    (out / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    return 0 if report['sourceStable'] and all(row['status'] == 'PASS' for row in records if row['name'] != 'dependency-audit') else 1


if __name__ == '__main__':
    sys.exit(main())
