"""Adapt explicitly reviewed whole original contracts; never infer them from partial runs."""
from pathlib import Path
import hashlib, json

BASE = Path(__file__).resolve().parent.parent
ROOT = BASE.parents[4]
source = BASE / 'review/verified-system-case-results.json'
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
assert source_hash == 'b81544f3d718d35f69ccf1c51e5ce5cf1e554d7d427f5bf24aa85fb930d4dd20'
reviewed = json.loads(source.read_text())
assert {item['case_id'] for item in reviewed} == {'CP4-08', 'CP4-09'}
original = ROOT / 'docs/tif/v2.13/casos_prueba.csv'
assert hashlib.sha256(original.read_bytes()).hexdigest() == '887adbef81be56f781133ced65bee1c92effcf9af9a3e0b1b389eed0e4e2717d'
target = BASE / 'system-case-results.json'
current = json.loads(target.read_text()) if target.exists() else []
assert len({item['case_id'] for item in current}) == len(current)
merged = {item['case_id']: item for item in current}
for item in reviewed:
    assert item['status'] == 'PASS' and item['complete_original_contract'] is True
    assert item['scope'] and item['assertions'] and item['executed_revision']['product'] == 'b456c4220ee524406670f65837fcd4fd6c4b8275'
    for relative, expected in item['evidence_sha256'].items():
        if relative.startswith('e2e/'):
            assert hashlib.sha256((BASE / relative).read_bytes()).hexdigest() == expected
    adapted = dict(item)
    adapted['evidence'] = '; '.join(
        '../../../../../' + reference.strip() if reference.strip().startswith('scripts/') else reference.strip()
        for reference in item['evidence'].split(';')
    ) + '; review/verified-system-case-results.json'
    adapted['source_review_sha256'] = source_hash
    adapted['adapter_scope'] = 'Metadata/path adaptation only; existing historical UI execution and independent complete-contract attestation retained. No rerun or current-CI3 attribution.'
    merged[item['case_id']] = adapted
target.write_text(json.dumps([merged[key] for key in sorted(merged)], indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'reviewed_contracts': sorted(item['case_id'] for item in reviewed), 'total_accepted_entries': len(merged), 'source_review_sha256': source_hash, 'new_execution': False}))
