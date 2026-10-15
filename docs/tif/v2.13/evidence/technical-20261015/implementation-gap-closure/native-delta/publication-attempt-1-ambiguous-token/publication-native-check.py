#!/usr/bin/env python3
"""Compare this evidence tree with selected existing private values in memory."""
import hashlib
import json
from pathlib import Path
import urllib.parse


def main():
    base = Path(__file__).resolve().parent
    runtime = Path('/tmp/zarix-runtime-20261015')
    needles = set()
    for name in ['proof.env', 'e2e-app.env']:
        source = runtime / name
        assert not source.is_symlink() and source.stat().st_mode & 0o077 == 0
        values = dict((key, json.loads(value)) for key, value in
            (line.split('=', 1) for line in source.read_text().splitlines() if line and not line.startswith('#')))
        for key, value in values.items():
            if isinstance(value, str) and any(word in key for word in ['SECRET', 'KEY', 'PASSWORD', 'TOKEN']):
                needles.add(value)
            if key.endswith('DATABASE_URL'):
                needles.add(value)
                if urllib.parse.urlparse(value).password:
                    needles.add(urllib.parse.unquote(urllib.parse.urlparse(value).password))
    users = json.loads((runtime / 'proof-logins.json').read_text())['users']
    needles.update(user['password'] for user in users)
    state = json.loads((runtime / 'home/stacks/c23a7df7600999c31f2d8435146f55289db07f9f62dfc5d6f08b2562a1529a09/state.json').read_text())
    def collect(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key in ['jwtSecret', 'd', 'k', 'privateKey'] and isinstance(child, str):
                    needles.add(child)
                if key == 'gotrueJwtKeys' and isinstance(child, str):
                    collect(json.loads(child))
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)
    collect(state)
    selected = [value.encode() for value in needles if isinstance(value, str) and len(value) >= 8]
    files = sorted(path for path in base.rglob('*') if path.is_file() and path.name not in
                   ['publication-selected-private-values.json', 'native-delta-manifest.json'])
    matches = []
    for path in files:
        assert not path.is_symlink()
        content = path.read_bytes()
        if any(value in content for value in selected):
            matches.append(str(path.relative_to(base)))
    report = {'status': 'PASS' if not matches else 'FAIL', 'scope': 'native-delta evidence files only',
        'filesCompared': len(files), 'selectedPrivateValues': len(selected), 'matchingFiles': matches,
        'valuesPublished': False,
        'limits': 'Selected existing config/signing values and two synthetic passwords only; tokens/cookies remain memory-only and are checked by their runtime harnesses. No universal secret-absence claim.'}
    (base / 'publication-selected-private-values.json').write_text(json.dumps(report, indent=2) + '\n')
    entries = [{'path': str(path.relative_to(base)), 'bytes': path.stat().st_size,
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in files]
    entries.append({'path': 'publication-selected-private-values.json',
                    'sha256': hashlib.sha256((base / 'publication-selected-private-values.json').read_bytes()).hexdigest()})
    (base / 'native-delta-manifest.json').write_text(json.dumps({'selfExcluded': True, 'files': entries}, indent=2) + '\n')
    print(json.dumps(report))
    if matches:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
