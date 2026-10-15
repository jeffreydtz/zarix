"""Derive a new matrix from reviewed decisions without rewriting past evidence.

Run once to create files; --verify compares their bytes without replacing them.
"""
import collections
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = Path(__file__).resolve().parents[6]
CHECKPOINT = '7f71f2757a4decb0e0becbafb82860008b2f9185'
INITIAL = 'b40feeed28d6e9ea6e8b0b2f112119e2435de1df'
ORIGINAL_SHA = '887adbef81be56f781133ced65bee1c92effcf9af9a3e0b1b389eed0e4e2717d'
BASE = 'docs/tif/v2.13/evidence/technical-20261015/case-traceability.csv'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT,
        env={**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'})


def main():
    assert len(sys.argv) == 1 or sys.argv[1:] == ['--verify']
    verify = len(sys.argv) == 2
    decision_raw = (HERE / 'case-decisions.json').read_bytes()
    decisions = json.loads(decision_raw)
    baseline = git('show', CHECKPOINT + ':' + BASE)
    assert (ROOT / BASE).read_bytes() == baseline, 'Frozen matrix must stay unchanged.'
    original = ROOT / 'docs/tif/v2.13/casos_prueba.csv'
    assert digest(original.read_bytes()) == ORIGINAL_SHA
    original_rows = list(csv.DictReader(io.StringIO(original.read_text(encoding='utf-8-sig'))))
    reader = csv.DictReader(io.StringIO(baseline.decode()))
    fields = reader.fieldnames
    rows = list(reader)
    assert len(rows) == len(original_rows) == 273
    assert [row['case_id'] for row in rows] == [row['id'] for row in original_rows]
    before = collections.Counter(row['status'] for row in rows)
    assert dict(before) == {'PASS': 232, 'BLOCKED': 40, 'FAIL': 1}
    # The new CSV lives one directory below the frozen matrix. Preserve valid
    # relative links while retaining the original matrix bytes at CHECKPOINT.
    for row in rows:
        row['evidence'] = '; '.join('../' + entry.strip()
                                   for entry in row['evidence'].split(';') if entry.strip())
    indexed = {row['case_id']: row for row in rows}
    changed = []
    for decision in decisions['decisions']:
        case_id = decision['case_id']
        assert case_id in indexed and decision['status'] in {'PASS', 'FAIL', 'BLOCKED'}
        assert decision['reviews'], 'An updated contract requires explicit review pins.'
        for item in decision['reviews']:
            path = (HERE / item['path']).resolve()
            assert path.is_relative_to(ROOT)
            assert digest(path.read_bytes()) == item['sha256']
        old = indexed[case_id].copy()
        for field in ['status', 'scope', 'contract_revision', 'evidence', 'assertions', 'blocker']:
            indexed[case_id][field] = decision[field]
        changed.append({'case_id': case_id, 'before': old['status'],
                        'after': decision['status'], 'reviews': decision['reviews']})
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    matrix = stream.getvalue().encode()
    sources = []
    for name in ['20261006235424_fix_balance_update_old_new_impacts.sql',
                 '20261006235955_atomic_shared_expense.sql',
                 '20261007000231_preserve_transfer_destination_amount.sql',
                 '20260702120000_atomic_investment_sell.sql']:
        path = 'supabase/migrations/' + name
        raw = (ROOT / path).read_bytes()
        assert raw == git('show', INITIAL + ':' + path)
        sources.append({'path': path, 'sha256': digest(raw), 'unchangedSince': INITIAL})
    historical = 'docs/tif/v2.13/VERIFICACION-TECNICA-20261009.md'
    raw = (ROOT / historical).read_bytes()
    assert raw == git('show', CHECKPOINT + ':' + historical)
    sources.append({'path': historical, 'sha256': digest(raw), 'unchangedSince': CHECKPOINT})
    report = {'checkpoint': CHECKPOINT, 'productRevision': decisions['productRevision'],
              'originalCases': 273, 'originalCsvSha256': ORIGINAL_SHA,
              'baselineMatrixSha256': digest(baseline), 'decisionFileSha256': digest(decision_raw),
              'matrixSha256': digest(matrix), 'before': dict(before),
              'evidencePathsRelativeTo': 'implementation-gap-closure/',
              'after': dict(collections.Counter(row['status'] for row in rows)),
              'updatedContracts': changed, 'preservedSources': sources,
              'statusChanges': sum(item['before'] != item['after'] for item in changed),
              'statusesUnchanged': 273 - sum(item['before'] != item['after'] for item in changed),
              'scope': 'New derived matrix only. Historical matrix and original contracts remain '
                       'unchanged. Assertions, test files and protocol groups are not unique cases.'}
    outputs = {'case-traceability-delta.csv': matrix,
               'case-status-delta.json': (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode()}
    for name, raw in outputs.items():
        target = HERE / name
        if verify:
            assert target.read_bytes() == raw, 'Derived evidence changed: ' + name
        else:
            with target.open('xb') as output:
                output.write(raw)
    print(json.dumps({'mode': 'verify' if verify else 'create', 'counts': report['after'],
                      'matrixSha256': report['matrixSha256']}))


if __name__ == '__main__':
    main()
