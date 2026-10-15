"""Read-only current primary metadata; no npm install, credentials or runtime."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
OUT = HERE / 'dependencies-current'
SOURCES = {
    'braces-latest': 'https://registry.npmjs.org/braces/latest',
    'micromatch-latest': 'https://registry.npmjs.org/micromatch/latest',
    'fast-glob-latest': 'https://registry.npmjs.org/fast-glob/latest',
    'tailwind-3': 'https://registry.npmjs.org/tailwindcss/3.4.19',
    'next-eslint-15': 'https://registry.npmjs.org/@next%2feslint-plugin-next/15.5.28',
    'github-advisory': 'https://api.github.com/advisories/GHSA-vfj7-8cjw-p6xm',
}


def main():
    assert not OUT.exists(), 'Preserve earlier retrieval; choose a new phase.'
    OUT.mkdir()
    records = []
    for name, url in SOURCES.items():
        target = OUT / (name + '.json')
        at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        command = ['curl', '--silent', '--show-error', '--fail', '--location',
                   '--connect-timeout', '15', '--max-time', '45',
                   '--output', str(target), '--write-out', '%{http_code}', url]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        raw = target.read_bytes() if target.exists() else b''
        parsed = json.loads(raw) if result.returncode == 0 and raw else None
        record = {'name': name, 'url': url, 'startedAt': at,
                  'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'command': command, 'exitCode': result.returncode,
                  'httpStatus': result.stdout, 'stderr': result.stderr,
                  'sha256': hashlib.sha256(raw).hexdigest() if raw else None,
                  'version': parsed.get('version') if isinstance(parsed, dict) else None,
                  'dependencies': parsed.get('dependencies') if isinstance(parsed, dict) else None}
        if name == 'github-advisory' and isinstance(parsed, dict):
            record['vulnerabilities'] = parsed.get('vulnerabilities')
            record['updatedAt'] = parsed.get('updated_at')
        records.append(record)
        print(json.dumps({key: record[key] for key in ['name', 'exitCode', 'httpStatus', 'version']}), flush=True)
    report = {'readOnly': True, 'credentials': 'No authorization header or credential is used.',
              'sources': records,
              'scope': 'Primary publication metadata only. The required npm gates independently '
                       'query the installed lock. No package, lock or node_modules mutation.'}
    (OUT / 'retrieval.json').write_text(json.dumps(report, indent=2) + '\n')
    return 0 if all(row['exitCode'] == 0 and row['httpStatus'] == '200' for row in records) else 1


if __name__ == '__main__':
    raise SystemExit(main())
