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
# A complete negative execution can FAIL. Coverage is not acceptance.
negative_dir = BASE / 'fresh-proof/auth-negative-contract'
negative_review = negative_dir / 'independent-review.json'
if negative_review.exists():
    review_hash = hashlib.sha256(negative_review.read_bytes()).hexdigest()
    assert review_hash == 'ccc9f82887cc80e47ea9ad0a45252ec86b77c2df035e5559dfe93b2b6a3abf59'
    review = json.loads(negative_review.read_text())
    assert review['caseId'] == 'CP2-09' and review['status'] == 'FAIL'
    assert review['complete_original_contract'] is True and review['acceptancePassed'] is False
    assert review['reviewVerdict'] == 'SUFFICIENT_INTEGRATION_COVERAGE_TO_RECORD_LITERAL_FAIL'
    for entry in review['evidence'].values():
        assert hashlib.sha256((ROOT / entry['path']).read_bytes()).hexdigest() == entry['sha256']
    report = json.loads((negative_dir / 'verification.json').read_text())
    assert report['status'] == 'FAIL' and report['complete_original_contract'] is False
    assert len(report['checks']) == 10 and sum(check['status'] == 'PASS' for check in report['checks']) == 9
    failures = [check for check in report['checks'] if check['status'] == 'FAIL']
    assert len(failures) == 1 and failures[0]['observed']['httpStatus'] == 400
    assert failures[0]['observed']['errorCode'] == 'invalid_credentials'
    assert failures[0]['expectedHttp'] == [401, 403] and failures[0]['credentialRejected'] is True
    metadata = json.loads((negative_dir / 'verified-system-case-result.json').read_text())
    assert len(metadata) == 1
    item = metadata[0]
    assert item['case_id'] == 'CP2-09' and item['status'] == 'FAIL'
    assert item['complete_original_contract'] is True and item['accepted_original_contract'] is False
    assert item['independent_review_sha256'] == review_hash
    assert item['assertions'] == [check['name'] for check in report['checks']]
    assert item['report_sha256'] == hashlib.sha256((negative_dir / 'verification.json').read_bytes()).hexdigest()
    assert item['harness_sha256'] == hashlib.sha256((BASE / 'fresh-proof/verify-auth-negative-contract.mjs').read_bytes()).hexdigest()
    item['adapter_scope'] = 'Original recorded FAIL and independent complete negative execution preserved. No HTTP remapping, vendor change, browser claim or acceptance PASS.'
    merged[item['case_id']] = item
target.write_text(json.dumps([merged[key] for key in sorted(merged)], indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'reviewed_contracts': sorted(item['case_id'] for item in reviewed), 'total_reviewed_entries': len(merged), 'negative_contract_failures': [key for key in merged if merged[key]['status']=='FAIL'], 'source_review_sha256': source_hash, 'new_execution': False}))
