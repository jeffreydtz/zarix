"""Derive the CNF-11 delta without replacing any earlier matrix or contract.

Create once after the reviewed decision exists; --verify compares bytes only.
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
ROOT = Path(__file__).resolve().parents[7]
CHECKPOINT = '23d91aeda8a22903d2bd795dd4ce9f3970ea1b5b'
INITIAL = 'b40feeed28d6e9ea6e8b0b2f112119e2435de1df'
ORIGINAL_SHA = '887adbef81be56f781133ced65bee1c92effcf9af9a3e0b1b389eed0e4e2717d'
BASE = 'docs/tif/v2.13/evidence/technical-20261015/implementation-gap-closure/case-traceability-delta.csv'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT,
        env={**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'})


def main():
    assert len(sys.argv) == 1 or sys.argv[1:] == ['--verify']
    verify = len(sys.argv) == 2
    decision_raw = (HERE / 'case-decision-cnf11.json').read_bytes()
    decision = json.loads(decision_raw)
    assert decision['case_id'] == 'CNF-11'
    assert decision['status'] in {'PASS', 'FAIL', 'BLOCKED'}
    assert decision['reviews'], 'A changed acceptance row needs pinned independent reviews.'
    for item in decision['reviews'] + decision['evidencePins']:
        file = (HERE / item['path']).resolve()
        assert file.is_relative_to(ROOT)
        assert digest(file.read_bytes()) == item['sha256'], 'Pinned evidence changed.'
    baseline = git('show', CHECKPOINT + ':' + BASE)
    assert (ROOT / BASE).read_bytes() == baseline, 'Keep the published matrix intact.'
    original = ROOT / 'docs/tif/v2.13/casos_prueba.csv'
    assert digest(original.read_bytes()) == ORIGINAL_SHA
    original_rows = list(csv.DictReader(io.StringIO(original.read_text(encoding='utf-8-sig'))))
    reader = csv.DictReader(io.StringIO(baseline.decode()))
    fields = reader.fieldnames
    rows = list(reader)
    assert len(rows) == len(original_rows) == 273
    assert [row['case_id'] for row in rows] == [row['id'] for row in original_rows]
    before = collections.Counter(row['status'] for row in rows)
    assert dict(before) == {'PASS': 238, 'BLOCKED': 34, 'FAIL': 1}
    for row in rows:
        row['evidence'] = '; '.join('../' + entry.strip()
            for entry in row['evidence'].split(';') if entry.strip())
    current = next(row for row in rows if row['case_id'] == 'CNF-11')
    prior_status = current['status']
    for field in ['status', 'scope', 'contract_revision', 'evidence', 'assertions', 'blocker']:
        current[field] = decision[field]
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    matrix = stream.getvalue().encode()
    preserved = []
    for name in ['20261006235424_fix_balance_update_old_new_impacts.sql',
                 '20261006235955_atomic_shared_expense.sql',
                 '20261007000231_preserve_transfer_destination_amount.sql',
                 '20260702120000_atomic_investment_sell.sql']:
        file = 'supabase/migrations/' + name
        raw = (ROOT / file).read_bytes()
        assert raw == git('show', INITIAL + ':' + file)
        preserved.append({'path': file, 'sha256': digest(raw), 'unchangedSince': INITIAL})
    historical = 'docs/tif/v2.13/VERIFICACION-TECNICA-20261009.md'
    raw = (ROOT / historical).read_bytes()
    assert raw == git('show', CHECKPOINT + ':' + historical)
    preserved.append({'path': historical, 'sha256': digest(raw), 'unchangedSince': CHECKPOINT})
    changed = int(prior_status != decision['status'])
    report = {'checkpoint': CHECKPOINT, 'productRevision': decision['productRevision'],
        'originalCases': 273, 'originalCsvSha256': ORIGINAL_SHA,
        'baselineMatrixSha256': digest(baseline), 'decisionFileSha256': digest(decision_raw),
        'matrixSha256': digest(matrix), 'before': dict(before),
        'after': dict(collections.Counter(row['status'] for row in rows)),
        'evidencePathsRelativeTo': 'implementation-gap-closure/cnf11-extension/',
        'updatedContracts': [{'case_id': 'CNF-11', 'before': prior_status,
                              'after': decision['status'], 'reviews': decision['reviews']}],
        'statusChanges': changed, 'statusesUnchanged': 273 - changed,
        'preservedSources': preserved,
        'scope': 'New derived matrix. Only CNF-11 acceptance is updated; original contracts, '
                 'published matrices and failed attempts remain intact. Assertion and invocation '
                 'counts are not unique acceptance cases.'}
    outputs = {'case-traceability-cnf11.csv': matrix,
        'case-status-cnf11.json': (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode()}
    for name, raw in outputs.items():
        file = HERE / name
        if verify:
            assert file.read_bytes() == raw, 'Derived evidence changed: ' + name
        else:
            with file.open('xb') as output:
                output.write(raw)
    print(json.dumps({'mode': 'verify' if verify else 'create', 'counts': report['after'],
                      'matrixSha256': report['matrixSha256']}))


if __name__ == '__main__':
    main()
