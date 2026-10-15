#!/usr/bin/env python3
"""Read-only comparison of the final checkout with the executed CI6 freeze."""
import csv
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[6]
HERE = Path(__file__).resolve().parent
FREEZE = 'd9501a795b88a0627d01426cb2c45f1cc848fd2b'
RUNTIME_BASELINE = '84df929ab2f169251a49f3e95d0e0c148dfcb87c'
ORIGINAL = 'b40feeed28d6e9ea6e8b0b2f112119e2435de1df'
CSV_HASH = '887adbef81be56f781133ced65bee1c92effcf9af9a3e0b1b389eed0e4e2717d'
MIGRATIONS = [
    '20261006235424_fix_balance_update_old_new_impacts.sql',
    '20261006235955_atomic_shared_expense.sql',
    '20261007000231_preserve_transfer_destination_amount.sql',
    '20260702120000_atomic_investment_sell.sql',
]


def sha(value):
    return hashlib.sha256(value).hexdigest()


def git(*args, optional=False):
    result = subprocess.run(
        ['git', *args], cwd=ROOT,
        env={**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'},
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if result.returncode and not optional:
        raise RuntimeError('Read-only Git comparison failed')
    return None if result.returncode else result.stdout


def main():
    output = HERE / 'final-source-and-case-integrity.json'
    assert not output.exists(), 'Preserve this checkpoint; use a new filename for another phase'
    core_path = HERE.parent / 'documentation-build-closure/executed/verification.json'
    core = json.loads(core_path.read_text())
    assert core['codeRevision'] == FREEZE and core['sourceStable'] and core['sourceWorkingTreeClean']
    assert core['runtimeCodeBaseline'] == RUNTIME_BASELINE and core['onlyBaselineDifference'] == ['tsconfig.json']
    checked = []
    for item in core['sourceManifest']:
        file = ROOT / item['path']
        assert not file.is_symlink() and file.is_file()
        current = sha(file.read_bytes())
        assert current == item['sha256'], 'Source changed since CI6: ' + item['path']
        frozen = git('show', FREEZE + ':' + item['path'], optional=True)
        if frozen is None:
            assert item['path'] == 'supabase/.temp/cli-latest', 'Undeclared non-Git source'
        else:
            assert sha(frozen) == current, 'Frozen Git blob differs: ' + item['path']
        checked.append({'path': item['path'], 'sha256': current, 'gitTrackedAtFreeze': frozen is not None})
    changed = git('diff', '--name-only', '-z', FREEZE, 'HEAD').decode().split('\0')
    changed = [name for name in changed if name]
    assert all(name.startswith('docs/') for name in changed), 'Non-documentation commits after CI6'
    working = git('diff', '--name-only', '-z', 'HEAD').decode().split('\0')
    untracked = git('ls-files', '--others', '--exclude-standard', '-z').decode().split('\0')
    assert all(name.startswith('docs/') for name in working + untracked if name), 'Unreviewed non-documentation file'
    cases_path = ROOT / 'docs/tif/v2.13/casos_prueba.csv'
    cases = cases_path.read_bytes()
    assert sha(cases) == CSV_HASH
    rows = list(csv.DictReader(io.StringIO(cases.decode('utf-8-sig'))))
    assert len(rows) == 273 and len({row['id'] for row in rows}) == 273
    migrations = []
    for name in MIGRATIONS:
        path = 'supabase/migrations/' + name
        current = sha((ROOT / path).read_bytes())
        assert current == sha(git('show', ORIGINAL + ':' + path))
        migrations.append({'path': path, 'sha256': current, 'unchangedFromOriginalHead': True})
    report = {
        'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'status': 'PASS', 'sourceRevisionExecuted': FREEZE,
        'runtimeCodeBaseline': RUNTIME_BASELINE,
        'onlyBaselineDifference': ['tsconfig.json: exclude archived evidence; application roots/options unchanged'],
        'checkoutHeadBeforeThisDocumentationCheckpoint': git('rev-parse', 'HEAD').decode().strip(),
        'coreReportSha256': sha(core_path.read_bytes()),
        'coreSourceManifestSha256': core['sourceManifestSha256'],
        'sourcesCompared': len(checked),
        'gitSourcesCompared': sum(row['gitTrackedAtFreeze'] for row in checked),
        'allCurrentSourceBytesMatchExecutedFreeze': True,
        'postFreezeChangedPathsAreDocumentationOnly': True,
        'postFreezeDocumentationPathCount': len(changed),
        'originalCases': {'count': len(rows), 'sha256': CSV_HASH, 'unchanged': True},
        'fourRequestedOriginalMigrations': migrations,
        'scope': 'Source and case integrity only. This read-only checkpoint compares the final required npm-gate freeze and records its sole compiler exclusion relative to runtime proofs at CI6. It does not rerun browsers, providers or the acceptance matrix. Later documentation commits require the same source comparison before publication.',
    }
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['status', 'sourceRevisionExecuted', 'sourcesCompared', 'gitSourcesCompared', 'allCurrentSourceBytesMatchExecutedFreeze']}))


if __name__ == '__main__':
    main()
