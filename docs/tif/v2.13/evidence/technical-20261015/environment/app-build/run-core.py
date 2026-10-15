import json, os, pathlib, subprocess, sys

root = pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
private = pathlib.Path('/tmp/zarix-runtime-20261015/e2e-app.env')
assert private.stat().st_mode & 0o077 == 0
env = dict(os.environ)
for line in private.read_text().splitlines():
    if line and not line.startswith('#'):
        key, value = line.split('=', 1)
        env[key] = json.loads(value)
env.update(DEVELOPER_DIR='/Library/Developer/CommandLineTools',
           npm_config_cache='/tmp/zarix-npm-cache-20261015',
           NEXT_TELEMETRY_DISABLED='1', TZ='Etc/UTC',
           ZARIX_EVIDENCE_DIR=str(root / 'docs/tif/v2.13/evidence/technical-20261015/core'))
sys.exit(subprocess.call(['node', 'scripts/run-technical-verification.mjs'], cwd=root, env=env))
