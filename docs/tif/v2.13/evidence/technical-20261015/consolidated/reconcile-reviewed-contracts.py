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
# Additional parent-approved exact contract packets. No glob-based promotion.
def checked_json(relative, expected=None):
    file=BASE/relative
    if expected is not None:assert hashlib.sha256(file.read_bytes()).hexdigest()==expected
    return json.loads(file.read_text())
focal_review_path='focal-contracts/fresh-proof-review.json'
if (BASE/focal_review_path).exists():
    review=checked_json(focal_review_path,'303e5b13a56b1ee614468494c209a61862dd6617cecbe74c876da629905cc5ba')
    assert review['status']=='PASS' and review['checks']['assertionsPassed']==29 and not review['findings']
    for entry in review['artifacts']:assert hashlib.sha256((ROOT/entry['path']).read_bytes()).hexdigest()==entry['sha256']
    report=checked_json('focal-contracts/attempt-2-fresh-proof/verification.json')
    assert report['status']=='PASS' and report['sourceStable'] and report['protectedOriginalRowsVerified']
    approved={row['id']:row for row in review['originalCases']}
    assert set(approved)=={'CP1-06','CP1-10','CP1-13','CP4-03'}
    for row in report['results']:
        assert row['id'] in approved and row['status']=='PASS' and row['complete_original_contract'] is True
        assert len(row['assertions'])==approved[row['id']]['assertions'] and all(a['status']=='PASS' for a in row['assertions'])
        merged[row['id']]={'case_id':row['id'],'status':'PASS','complete_original_contract':True,
            'assertions':[a['name'] for a in row['assertions']],
            'evidence':'focal-contracts/attempt-2-fresh-proof/verification.json; '+focal_review_path+'; focal-contracts/attempt-2-fresh-proof/executed-run.mjs',
            'scope':report['scope']+' Independent exact-contract review and protected original rows preserved; no later formatter/export-fix acceptance.',
            'executed_revision':review['executionBinding'],'source_review_sha256':hashlib.sha256((BASE/focal_review_path).read_bytes()).hexdigest()}
shared_review_path='shared-contract-review/acceptance.json'
if (BASE/shared_review_path).exists():
    review=checked_json(shared_review_path,'db058fbe987aa0793d8ec777265b3b2f24d710b5a1d2f576e01f247439917e58')
    assert review['status']=='PASS_SCOPED' and {r['id'] for r in review['originalCases']}=={'CP1-37','CP1-38'}
    evidence=review['evidence'];assert hashlib.sha256((ROOT/evidence['path']).read_bytes()).hexdigest()==evidence['sha256']
    report=json.loads((ROOT/evidence['path']).read_text());assert report['passed']==11 and report['total']==11
    binding=review['executionBinding'];assert hashlib.sha256((ROOT/binding['coreVerificationPath']).read_bytes()).hexdigest()==binding['coreVerificationSha256']
    for entry in binding['sourceManifest']:assert hashlib.sha256((ROOT/entry['path']).read_bytes()).hexdigest()==entry['sha256']
    for row in review['originalCases']:
        assert row['status']=='PASS' and row['complete_original_contract'] is True
        for name in row['evidenceChecks']:assert any(r['id']==name and r['status']=='PASS' for r in report['results'])
        merged[row['id']]={'case_id':row['id'],'status':'PASS','complete_original_contract':True,
            'assertions':row['evidenceChecks'],'evidence':'core-reliability/shared-sql.json; '+shared_review_path,
            'scope':row['scope']+' '+evidence['scope'],'executed_revision':{'product':binding['revision']},
            'source_review_sha256':hashlib.sha256((BASE/shared_review_path).read_bytes()).hexdigest(),'new_execution':False}
roundtrip='account-analysis-contracts/executed-cp2-07'
if (BASE/roundtrip/'system-case-results.json').exists():
    packet=checked_json(roundtrip+'/manifest.json','3db849a1c528999f0a7f66dc812a3919705c2ac5435c45c9351dbbc45e344cc1')
    assert packet['status']=='PASS' and packet['complete_original_contract'] and packet['sameIdentity']
    assert packet['source']['assertionsPassed']==9 and packet['target']['assertionsPassed']==12
    assert packet['target']['sourceStable'] and packet['target']['allOriginalTablesUnchanged']
    for entry in packet['files']:assert hashlib.sha256((BASE/roundtrip/entry['path']).read_bytes()).hexdigest()==entry['sha256']
    accepted=checked_json(roundtrip+'/system-case-results.json')['results'];assert len(accepted)==1
    row=accepted[0];assert row['case_id']=='CP2-07' and row['status']=='PASS' and row['complete_original_contract']
    actual=checked_json(roundtrip+'/target-import.json');assert actual['status']=='PASS' and actual['sourceStable']
    assert row['assertion_names']==[a['name'] for a in actual['case']['assertions']]
    merged['CP2-07']={**row,'assertions':row['assertion_names'],'evidence':'; '.join(row['evidence']),
        'executed_revision':{'source':packet['source'],'target':packet['target']},
        'adapter_scope':'Parent-approved complete same-identity JSON export and empty-target import packet; original source PARTIAL export is not accepted alone.',
        'source_packet_sha256':hashlib.sha256((BASE/roundtrip/'manifest.json').read_bytes()).hexdigest()}

cp136_review_path='focal-contracts/cp1-36-review.json'
if (BASE/cp136_review_path).exists():
    review=checked_json(cp136_review_path,'eece47ba80abb2d54901fcf84a6d881235c2701eb4cfa2f3a9d6a2d646cc3cbf')
    assert review['status']=='PASS' and not review['findings'] and review['acceptedCase']['id']=='CP1-36'
    for entry in review['reviewedArtifacts']:assert hashlib.sha256((ROOT/entry['path']).read_bytes()).hexdigest()==entry['sha256']
    accepted=review['acceptedCase'];assert accepted['assertions']==12 and accepted['splitAmounts']==['33.34','33.33','33.33']
    assert accepted['exactExpenseNetSum']==accepted['originalGroupNetSum']=='0.00' and accepted['mutations']==0
    report=checked_json('focal-contracts/attempt-1-existing-full-plan/verification.json')
    row=next(row for row in report['results'] if row['id']=='CP1-36')
    assert row['status']=='PASS' and row['complete_original_contract'] and len(row['assertions'])==12 and all(a['status']=='PASS' for a in row['assertions'])
    merged['CP1-36']={'case_id':'CP1-36','status':'PASS','complete_original_contract':True,
      'assertions':[a['name'] for a in row['assertions']],
      'evidence':'focal-contracts/attempt-1-existing-full-plan/verification.json; '+cp136_review_path+'; e2e/api/api-verification.json',
      'scope':accepted['scope']+' Exact100/3/netzero original contract; archived group remains preserved. The four independent capacity-blocked cases from that attempt do not constrain this case.',
      'executed_revision':review['executionBinding'],'source_review_sha256':hashlib.sha256((BASE/cp136_review_path).read_bytes()).hexdigest(),'new_execution':False}


# Normal-Auth investment packets have explicit original-contract acceptance.
# Derived concurrency/downgrade/restart scopes never create or promote CSV rows.
investment_packets=[
 ('investment-contracts/independent-review.json','2ae3c0664250c255156f2dd7214f4d0b9b7ef925796f4d804150db6c694b615e',{'CP4-02','CP4-04','CP4-05','CP4-10','CP4-11','CP4-12'}),
 ('investment-contracts/independent-cp4-07-concurrent-http-review.json','327117751d66431661cc55c0a717952d1349dd86c207c2333d44bcab786899bd',{'CP4-07'})]
for review_path,expected_hash,accepted_ids in investment_packets:
    if not (BASE/review_path).exists():continue
    review=checked_json(review_path,expected_hash)
    assert not review.get('findings',[])
    for artifact in review['artifacts']:assert hashlib.sha256((ROOT/artifact['path']).read_bytes()).hexdigest()==artifact['sha256']
    rows=[row for row in review['originalCases'] if row['id'] in accepted_ids]
    assert {row['id'] for row in rows}==accepted_ids
    for row in rows:
        assert row['status']=='PASS' and row['complete_original_contract'] is True
        path=ROOT/row['report'];assert hashlib.sha256(path.read_bytes()).hexdigest()==row['reportSha256']
        report=json.loads(path.read_text());case=report['case']
        assert report['status']=='PASS' and report['sourceStable'] and report['servedSourceStable']
        assert case['case_id']==row['id'] and case['status']=='PASS' and case['complete_original_contract']
        assert len(case['assertions'])==row['assertions'] and all(a['status']=='PASS' for a in case['assertions'])
        merged[row['id']]={'case_id':row['id'],'status':'PASS','complete_original_contract':True,
          'assertions':[a['name'] for a in case['assertions']],
          'evidence':str(path.relative_to(BASE))+'; '+review_path,
          'scope':row.get('acceptedScope',row.get('review',''))+' '+report['scope']+' Protected originals cover exactly twelve public tables; no full grants/Auth/Storage or later CI5 attribution.',
          'executed_revision':report['buildBinding'],'source_review_sha256':expected_hash,
          'adapter_scope':'Only the explicitly reviewed original case is accepted. Historical failed probes and separately reviewed derived tests remain distinct; no new execution.'}


quote_review_path='quote-contracts/independent-composite-review.json'
if (BASE/quote_review_path).exists():
    review=checked_json(quote_review_path,'d473740e0a48dc78ecaee1f0017fb9cb6a508571331f8ddd1730247a6c8344a6')
    assert review['status']=='PASS_COMPOSITE_SCOPED' and not review['findings'] and not review['blockers']
    for artifact in review['artifacts']:assert hashlib.sha256((ROOT/artifact['path']).read_bytes()).hexdigest()==artifact['sha256']
    assert {row['id'] for row in review['originalCases']}=={'CP3-01','CP3-02'}
    quote_reports={'CP3-01':['attempt-1/mapping.json'],'CP3-02':['attempt-1/hit299.json','attempt-1/refresh300.json','attempt-1/refresh301.json','attempt-1/failure300.json','ssr-followup-after-fix.json']}
    for row in review['originalCases']:
        assert row['status']=='PASS' and row['complete_original_contract'] is True
        assertions=[]
        for relative in quote_reports[row['id']]:
            report=checked_json('quote-contracts/'+relative)
            # failure300 preserves its late harness JSX FAIL; its nine service
            # assertions pass and corrected captured-response SSR is separate.
            assert all(a['status']=='PASS' for a in report['assertions'])
            assertions.extend(a['name'] for a in report['assertions'])
        assert len(assertions)==row['assertions']
        merged[row['id']]={'case_id':row['id'],'status':'PASS','complete_original_contract':True,'assertions':assertions,
          'evidence':'; '.join(str((ROOT/path).relative_to(BASE)) for path in row['evidence'])+'; '+quote_review_path+'; quote-contracts/postfix-contracts.json',
          'scope':row['acceptedScope']+' '+review['scope']+' '+review['revisionBoundary'],
          'executed_revision':{'service':'836fd18b310a51cced9074b372a80ce5d7e1a870','presentation':'528116753d2f13c4d705b7e2a3ed0d4808e1d9a9' if row['id']=='CP3-02' else None},
          'source_review_sha256':hashlib.sha256((BASE/quote_review_path).read_bytes()).hexdigest(),
          'adapter_scope':'Explicit composite acceptance of original service/fixture/visible-label contract; no new service/SQL execution or claim that old Next836 contains formatter528. Historical FAIL artifacts preserved.'}


cp119_review_path='remaining-cu001/cp1-19-semantic-review.json'
if (BASE/cp119_review_path).exists():
    review=checked_json(cp119_review_path,'72a4f1cc27dbd7b64054876a4a65a59b2505af8ca6a768242306ccc32600a355')
    assert review['status']=='PASS_BY_EXPLICIT_SEMANTIC_RECONCILIATION' and not review['findings'] and not review['blockers']
    for artifact in review['artifacts']:assert hashlib.sha256((ROOT/artifact['path']).read_bytes()).hexdigest()==artifact['sha256']
    accepted=review['originalCases'];assert len(accepted)==1
    row=accepted[0];assert row['id']=='CP1-19' and row['status']=='PASS' and row['complete_original_contract'] is True
    report=json.loads((ROOT/review['rawHistory']['path']).read_text());case=next(c for c in report['results'] if c.get('case_id',c.get('id'))=='CP1-19')
    assert case['status']=='PARTIAL' and len(case['assertions'])==row['assertions'] and all(a['status']=='PASS' for a in case['assertions'])
    assert review['semanticMapping']['observedActualResponse']=={'imported':2,'skipped':1,'pending':0,'total':3,'skipTitles':['Fila omitida — monto inválido']}
    assert review['semanticMapping']['closedPartition']=={'validImports':2,'invalidAmountRejections':1,'otherOmissionsIncludingDuplicates':0,'unconfirmed':0,'total':3}
    merged['CP1-19']={'case_id':'CP1-19','status':'PASS','complete_original_contract':True,
      'assertions':[a['name'] for a in case['assertions']],
      'evidence':'; '.join(str((ROOT/path).relative_to(BASE)) for path in row['evidence'])+'; '+cp119_review_path,
      'scope':row['acceptedScope']+' '+review['scope']+' Literal original does not require invented response keys. RawPARTIAL nomenclature and other whole-run failures remain unchanged.',
      'executed_revision':review['executionBinding'],'source_review_sha256':hashlib.sha256((BASE/cp119_review_path).read_bytes()).hexdigest(),
      'adapter_scope':'Explicit independently reviewed semantic partition only; no new execution, response fields or CP1-20 acceptance inferred.'}


rf11_review_path='account-analysis-contracts/independent-rf11-review.json'
if (BASE/rf11_review_path).exists():
    review=checked_json(rf11_review_path,'a6a2a00a03cb7ef0d78f5d44d85c427474c64131ab72831b4249285130e9eea6')
    assert review['status']=='PASS_SCOPED_RF11' and not review['findings'] and not review['blockers']
    for artifact in review['artifacts']:assert hashlib.sha256((ROOT/artifact['path']).read_bytes()).hexdigest()==artifact['sha256']
    packet=checked_json('account-analysis-contracts/executed-rf11/manifest.json','27ae86099bd6157bda6ba0c9744f17720a8ae444b613dacfb4beae12b86f2634')
    assert {row['id'] for row in review['originalCases']}=={'CP3-13','CP3-14','CP3-15','CP3-16'}
    for recorded in packet['reports']:
        for source in recorded['sourceSnapshots']:assert hashlib.sha256((ROOT/source['snapshot']).read_bytes()).hexdigest()==source['sha256']
    for row in review['originalCases']:
        assert row['status']=='PASS' and row['complete_original_contract'] is True
        path=ROOT/row['evidence'][0];assert hashlib.sha256(path.read_bytes()).hexdigest()==row['reportSha256']
        report=json.loads(path.read_text());case=report['case']
        assert report['status']=='PASS' and report['sourceStable'] and report['servedBuildStable']
        assert case['case_id']==row['id'] and case['status']=='PASS' and case['complete_original_contract']
        assert len(case['assertions'])==row['assertions'] and all(a['status']=='PASS' for a in case['assertions'])
        merged[row['id']]={'case_id':row['id'],'status':'PASS','complete_original_contract':True,
          'assertions':[a['name'] for a in case['assertions']],
          'evidence':'; '.join(str((ROOT/path).relative_to(BASE)) for path in row['evidence'])+'; '+rf11_review_path,
          'scope':report['scope']+' '+review['scope']+' Normal real-time Auth60s, only Nextfixed6Oct; real Google outage/integration and final compiled7c3 are not asserted by this historical836 run.',
          'executed_revision':report['buildBinding'],'source_review_sha256':hashlib.sha256((BASE/rf11_review_path).read_bytes()).hexdigest(),
          'adapter_scope':'Four explicit independently reviewed RF11 original contracts only. No new execution or promotion of other account/analysis/UI cases.'}


ten_review_path='remaining-cu001/independent-review-ten-cases.json'
if (BASE/ten_review_path).exists():
    review=checked_json(ten_review_path,'06d1d8c9f7be08fcb4a3d9682dc5a78555ffc921b254031d339b413e78a1616d')
    assert review['status']=='TEN_HISTORICAL_ORIGINAL_CONTRACTS_SUPPORTED_ONE_BY_EXPLICIT_COMPOSITE_DECISION'
    assert {row['id'] for row in review['originalCases']}=={'CP1-02','CP1-03','CP1-09','CP1-11','CP1-33','CP1-04','CP1-12','CP1-22','CP1-29','CP1-35'}
    for artifact in review['artifacts']:assert hashlib.sha256((ROOT/artifact['path']).read_bytes()).hexdigest()==artifact['sha256']
    details={row['id']:row for row in review['caseReviews']}
    for row in review['originalCases']:
        assert row['status']=='PASS' and row['complete_original_contract'] is True and not row['claimFinalCI5Runtime']
        evidence=row['evidence'][0];path=ROOT/evidence['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==evidence['sha256']
        report=json.loads(path.read_text());case=report
        for part in evidence['jsonPointer'].strip('/').split('/'):case=case[int(part)] if isinstance(case,list) else case[part]
        assert case.get('case_id',case.get('id'))==row['id'] and case['status']=='PASS' and all(a['status']=='PASS' for a in case['assertions'])
        assert row['runtimeRevision']=='836fd18b310a51cced9074b372a80ce5d7e1a870' and details[row['id']]['reviewCompleteOriginalContract']
        scope=details[row['id']]['reviewRationale']+' '+review['scope']+' Exact historical836 binding, not finalCI5 compiled acceptance.'
        if row['id']=='CP1-22':
            assert row['directNativeImportBatchesObservation'] is False
            scope+=' Raw no-batch assertion measures transaction_requests only. No direct native import_batches observation; full clause uses reviewed malformed input+runtime400+immutable early-return code before batch creation.'
        merged[row['id']]={'case_id':row['id'],'status':'PASS','complete_original_contract':True,'assertions':[a['name'] for a in case['assertions']],
          'evidence':str(path.relative_to(BASE))+'; '+ten_review_path+'; remaining-cu001/attempt-1-eight-cases/executed-harness/run-basic.mjs',
          'scope':scope,'executed_revision':{'product':row['runtimeRevision'],'buildId':row['runtimeBuildId']},
          'source_review_sha256':hashlib.sha256((BASE/ten_review_path).read_bytes()).hexdigest(),'acceptance_basis':row['acceptanceBasis'],'new_execution':False}
cp120_review_path='remaining-cu001/independent-final-cp1-20-review.json'
if (BASE/cp120_review_path).exists():
    review=checked_json(cp120_review_path,'bcea76b311dba45feb87867282e6e764a597dd8cbcbc619e3a044474258a8858')
    assert review['status']=='PASS_SCOPED_FINAL_CP1_20' and len(review['originalCases'])==1
    for artifact in review['artifacts']:assert hashlib.sha256((ROOT/artifact['path']).read_bytes()).hexdigest()==artifact['sha256']
    report=checked_json('remaining-cu001/attempt-5-final-cp1-20-and-replay/verification.json')
    assert report['sourceStable'] and report['servedCopyStable']
    row=next(r for r in report['results'] if r.get('case_id',r.get('id'))=='CP1-20');accepted=review['originalCases'][0]
    assert row['status']=='PASS' and accepted['status']=='PASS' and accepted['complete_original_contract'] and len(row['assertions'])==accepted['assertions']==6 and all(a['status']=='PASS' for a in row['assertions'])
    merged['CP1-20']={'case_id':'CP1-20','status':'PASS','complete_original_contract':True,'assertions':[a['name'] for a in row['assertions']],
      'evidence':'remaining-cu001/attempt-5-final-cp1-20-and-replay/verification.json; '+cp120_review_path,
      'scope':' '.join(accepted['proof'])+' Final compiled7c3 with independent JSON fixture. Historical503 remains preserved; nine replay assertions are a separate derived probe, not another original case.',
      'executed_revision':report['buildBinding'],'source_review_sha256':hashlib.sha256((BASE/cp120_review_path).read_bytes()).hexdigest()}

ci5_accounts_review_path='account-analysis-contracts/independent-executed-final-review.json'
if (BASE/ci5_accounts_review_path).exists():
    review_hash='ed780d153721fccef63eb605e566cacc218c271f55a2f757bac7e1a5bcbd2474'
    review=checked_json(ci5_accounts_review_path,review_hash)
    assert review['status']=='REVIEW_COMPLETE_8_ORIGINAL_PASS_2_CONFIRMED_PRODUCT_FAIL'
    assert not review['newMaterialEvidenceDefects'] and not review['rawFilesModified']
    packet=checked_json('account-analysis-contracts/executed-final/manifest.json','424e0b050f9d8ce4c60e00a34a6b0b4702fa86689de57f1acf3163c7854dd481')
    assert hashlib.sha256((ROOT/review['manifest']['path']).read_bytes()).hexdigest()==review['manifest']['sha256']
    assert packet['sourceRevision']==review['binding']['revision']=='7c3e8722d8fcdc5d95d205e9a12eb856647e0e06'
    assert packet['buildId']==review['binding']['buildId']=='vPLjt1QViugJhUWR62DPp'
    reports={}
    for recorded in packet['reports']:
        path=ROOT/recorded['report'];assert hashlib.sha256(path.read_bytes()).hexdigest()==recorded['sha256']
        assert recorded['sourceStable'] and recorded['servedBuildStable'] and recorded['originalTablesUnchanged'] and not recorded['cleanupFailure']
        for source in recorded['sourceSnapshots']:assert hashlib.sha256((ROOT/source['snapshot']).read_bytes()).hexdigest()==source['sha256']
        reports[str(path.relative_to(BASE))]=json.loads(path.read_text())
    accepted={row['id']:row['status'] for row in review['acceptedOriginals']}
    assert accepted=={'CP2-02':'PASS','CP2-03':'PASS','CP2-05':'PASS','CP2-06':'PASS','CP2-20':'PASS','CP3-04':'PASS','CP3-05':'PASS','CP3-06':'FAIL','CP3-08':'PASS','CP3-18':'FAIL'}
    rows=checked_json('account-analysis-contracts/executed-final/system-case-results.json')['results']
    assert len(rows)==len(accepted) and {row['case_id'] for row in rows}==set(accepted)
    for row in rows:
        case_id=row['case_id'];assert row['status']==accepted[case_id]
        if row['status']=='PASS':assert row['complete_original_contract']
        report=reports[row['evidence'][0]];case=report['case']
        assert case['case_id']==case_id and report['sourceStable'] and report['servedBuildStable']
        passed=[a['name'] for a in case['assertions'] if a['status']=='PASS']
        failures=[a for a in case['assertions'] if a['status']=='FAIL']
        assert row['assertion_names']==passed
        if row['status']=='FAIL':assert report['status']=='FAIL' and failures
        elif case_id=='CP2-05':assert report['status']=='FAIL' and len(failures)==2 and row['derived_failures_preserved']==failures
        else:assert report['status']=='PASS' and not failures
        scope=row['semantic_attestation']+' '+review['caseInterpretations'].get(case_id,'')+' '+review['scope']+' Exact CI5 7c/buildvPLj execution, no CI6 acceptance.'
        if row['status']=='FAIL':scope+=' Observed original failures: '+json.dumps(failures,ensure_ascii=False)
        merged[case_id]={'case_id':case_id,'status':row['status'],'complete_original_contract':True,
          'assertions':[a['name'] for a in case['assertions']] if row['status']=='FAIL' else passed,
          'failed_original_assertions':failures if row['status']=='FAIL' else [],
          'preserved_derived_failures':row.get('derived_failures_preserved',[]),
          'evidence':'; '.join(row['evidence'])+'; '+ci5_accounts_review_path,
          'scope':scope,'executed_revision':report['buildBinding'],'source_review_sha256':review_hash,
          'raw_execution_status':report['status'],'raw_complete_original_contract_flag':row['complete_original_contract'],'new_execution':False,
          'adapter_scope':'Ten explicitly independently reviewed original contracts; recorded FAIL is preserved as FAIL. CP2-05 original calculation PASS does not hide the two additional text-format FAIL assertions. No browser/hydration or future fix acceptance.'}

target.write_text(json.dumps([merged[key] for key in sorted(merged)], indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'historical_reviewed_contracts': sorted(item['case_id'] for item in reviewed), 'reviewed_contracts': sorted(merged), 'total_reviewed_entries': len(merged), 'negative_contract_failures': [key for key in merged if merged[key]['status']=='FAIL'], 'source_review_sha256': source_hash, 'new_execution': False}))
