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

# Explicit CI6 closure and reviewed composites. Their historical phases remain intact.
closure_reviewed_packets=[
 ('account-analysis-contracts/independent-closure-review.json','92a5304c2f3687016f1171e80aacf25adf85c74af614f34e82a00f7e07fba826','account-analysis-contracts/executed-closure/system-case-results.json',{'CP2-05','CP3-04','CP3-05','CP3-06','CP3-08','CP3-18'}),
 ('remaining-seven-contracts/independent-review.json','9996d46627752a6ff86df1ed703045f28ca02c97503979ea6ed8bd1adb74ab0f','remaining-seven-contracts/system-case-results.json',{'CP1-05','CP1-21','CP1-28','CP1-30','CP1-31','CP4-01','CP4-06'}),
 ('notification-timeout-contract/independent-review.json','6fa05e94d7ebf623cc86f197121aa23dc545ad1d48afb371bd48aab60a1267b8','notification-timeout-contract/system-case-results.json',{'CP1-27'}),
]
for review_path,expected,packet_path,ids in closure_reviewed_packets:
    review=checked_json(review_path,expected)
    assert not review['findings']
    for artifact in review['artifacts']:
        path=ROOT/artifact['path']
        if not path.exists():path=BASE/artifact['path']
        assert hashlib.sha256(path.read_bytes()).hexdigest()==artifact['sha256']
    if 'manifest'in review:
        entry=review['manifest'];assert hashlib.sha256((ROOT/entry['path']).read_bytes()).hexdigest()==entry['sha256']
    accepted={row['id']:row for row in review['originalCases']}
    assert set(accepted)==ids and all(row['status']=='PASS'and row['complete_original_contract']for row in accepted.values())
    packet=checked_json(packet_path)['results'];assert {r['case_id']for r in packet}==ids
    for row in packet:
        assert row['status']=='PASS'and row['complete_original_contract']and row['assertion_names']and row['scope']
        assert all((BASE/path).is_file()for path in row['evidence'])
        merged[row['case_id']]={'case_id':row['case_id'],'status':'PASS','complete_original_contract':True,
          'assertions':row['assertion_names'],'evidence':'; '.join(row['evidence'])+'; '+review_path,
          'scope':row['scope']+' Independently reviewed exact original contract; accepted scopes and version distinctions in the pinned review remain binding. Historical failures are preserved; no new execution, browser or real-provider claim.',
          'executed_revision':review.get('sourceBinding',{'reviewedVersion':accepted[row['case_id']].get('version','Explicit composite; see pinned review')}),
          'source_review_sha256':expected,'adapter_scope':'Explicit independently reviewed packet only. Closure replaces CI5 FAIL306/318 with new CI6 evidence, while immutable CI5 raw failures and phase totals remain unchanged. Other packets may compose earlier native execution and current SSR/unit proofs; they are not attributed to one build.'}

recurring_review_path='remaining-cu001/independent-recurring-amount-review.json'
if (BASE/recurring_review_path).exists():
    expected='fd305dfcc8541485ed44323ba4a6d692ed1ce1848d5ac2e2d229cfa147e3b340'
    review=checked_json(recurring_review_path,expected);assert not review['findings']
    for artifact in review['artifacts']:
        path=ROOT/artifact['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==artifact['sha256']
    accepted=[r for r in review['originalCases']if r['status']=='PASS'];assert {r['id']for r in accepted}=={'CP1-23','CP1-34'}
    for row in accepted:
        assert row['complete_original_contract'];entry=row['runtimeEvidence'];path=ROOT/entry['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']
        report=json.loads(path.read_text());case=next(r for r in report['results']if r.get('case_id',r.get('id'))==row['id'])
        assert len(case['assertions'])==entry['passedAssertions']and all(a['status']=='PASS'for a in case['assertions'])
        merged[row['id']]={'case_id':row['id'],'status':'PASS','complete_original_contract':True,'assertions':[a['name']for a in case['assertions']],
          'evidence':str(path.relative_to(BASE))+'; '+recurring_review_path,'scope':row['provedRuntime']+' '+ ' '.join(row['limits'])+' '+row.get('nanTransport','')+' '+str(row.get('nextOccurrenceSourceProof',{})),
          'executed_revision':{'product':entry['revision'],'buildId':entry['buildId']},'source_review_sha256':expected,'adapter_scope':'Explicit independent semantic/native plus source-control-flow composite; no browser required by CSV, no rendered schedule assertion or additional runtime invented. CP124/125 remain unpromoted; CP127 has a separate later reviewed packet.'}

# Newly completed empty-replica contracts: exact review/artifact pins, no status prediction.
empty_reviewed_packets=[
 ('empty-account-contracts','independent-composed-review.json','2c366dd562d1fe889988cd37b8da9381a742ae8f9e468479817ad1b076a0ef91','verified-system-case-result.json',{'CP2-01','CP3-03','CP3-07'}),
 ('empty-followup-contracts','independent-executed-review.json','9d640a07d730b11a3718953c60214a3d1d12c2f670e4cbfc6968c45cde5f3d8d','system-case-results.json',{'CP1-01','CP1-24'}),
]
for directory,review_file,expected,metadata_file,ids in empty_reviewed_packets:
    review_path=directory+'/'+review_file;review=checked_json(review_path,expected)
    assert not review['materialFindings']
    for artifact in review['artifacts']:assert hashlib.sha256((BASE/directory/artifact['path']).read_bytes()).hexdigest()==artifact['sha256']
    assert {r['case_id']for r in review['cases']}==ids and all(r['opinion'].startswith('PASS')for r in review['cases'])
    packet=checked_json(directory+'/'+metadata_file);rows=packet.get('results',packet.get('cases'))
    assert {r['case_id']for r in rows}==ids
    for row in rows:
        assert row['status']=='PASS'and row['complete_original_contract']
        evidence=row['evidence']if isinstance(row['evidence'],list)else[directory+'/'+row['evidence']]
        assert all((BASE/f).is_file()for f in evidence)
        assertions=row.get('assertion_names',row.get('assertions'))
        if row['case_id']=='CP3-07':
            component=checked_json(directory+'/cp307-composition/verification.json');assert component['status']=='PASS'and component['complete_original_contract']and len(component['actualEmptyAssertions'])==15
            assert all(r['status']=='PASS'for r in component['actualEmptyAssertions'])
            ssr=checked_json(directory+'/cp307-composition/ssr-results.json');assert ssr['numPassedTests']==ssr['numTotalTests']==3
            assertions=[r['name']for r in component['actualEmptyAssertions']]+[a['fullName']for t in ssr['testResults']for a in t['assertionResults']if a['status']=='passed']
        assert isinstance(assertions,list)and assertions
        opinion=next(r for r in review['cases']if r['case_id']==row['case_id'])
        merged[row['case_id']]={'case_id':row['case_id'],'status':'PASS','complete_original_contract':True,'assertions':assertions,
          'evidence':'; '.join(evidence)+'; '+review_path,'scope':row['scope']+' '+opinion.get('basis',' '.join(opinion.get('proof',[])))+' '+ ' '.join(opinion.get('limits',[])),
          'executed_revision':{'product':'84df929ab2f169251a49f3e95d0e0c148dfcb87c','buildId':'Yi9bH3FttO71PxvY-EwCH','appOrigin':'http://127.0.0.1:3004','apiOrigin':'http://127.0.0.1:60321'},
          'source_review_sha256':expected,'adapter_scope':'Independently reviewed new-replica API/native/compiledSSR scope. CP307 explicitly composes the preserved fifteen empty observations and frozen real componentSSR/wiring, not another native rerun. CP124 worker uses real local service client and a provider captor double, not Telegram. No browser acceptance inferred.'}
cp107='remaining-cu001/cp1-07-sql-composite-review.json'
if(BASE/cp107).exists():
    expected='4976c53613f15b0082c0b9a2e160396f44d599604b589fc406b59dea8ea31e93';review=checked_json(cp107,expected)
    assert not review['findings']and len(review['originalCases'])==1
    for artifact in review['artifacts']:
        path=ROOT/artifact['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==artifact['sha256']
    row=review['originalCases'][0];assert row['id']=='CP1-07'and row['status']=='PASS'and row['complete_original_contract']
    merged['CP1-07']={'case_id':'CP1-07','status':'PASS','complete_original_contract':True,'assertions':[a['id']for a in row['assertions']],
      'evidence':cp107+'; '+ '; '.join(str((ROOT/a['path']).relative_to(BASE))for a in review['artifacts']if (ROOT/a['path']).is_relative_to(BASE)),
      'scope':row['basis']+' '+ ' '.join(review['limits'])+' Literal is Normal UPDATE SQL; API type immutability was not a blocker. SQL1500→11500 and actual nativeJWT100→10100 remain separate fixtures.',
      'executed_revision':review['executionBindings'],'source_review_sha256':expected,'adapter_scope':'Explicit independently reviewed SQL numeric plus separate native session composite only; no new runtime or new API support.'}

auth_recovery_review_path='auth-recovery-valid/independent-executed-review.json'
if(BASE/auth_recovery_review_path).exists():
    expected='1cd5b17c09ddf293be5dac6d1421e2b6b7011897a2ab97335d8ac49c2d608d4b';review=checked_json(auth_recovery_review_path,expected)
    assert review['status']=='PASS_INDEPENDENT_API_RECOVERY_REVIEW_SCOPED'and review['case_id']=='CP2-10'and review['complete_original_contract']and not review['findings']
    addon_path='auth-recovery-valid/independent-executed-review-addendum.json'
    addon=checked_json(addon_path,'356f8a3842c5f0b71582c4a25228f3594a27e442d5872d6da6609b783f736435')
    assert addon['status']=='PASS_EXPLICIT_SCAN_METADATA_ADDENDUM'and addon['originalReview']['sha256']==expected and addon['originalReview']['preservedUnchanged']
    change=addon['detectedChange'];assert change['path']=='docs/tif/v2.13/evidence/technical-20261015/auth-recovery-valid/private-value-scan.json'
    assert change['originalPeerExpectedSha256']=='4af2e16c9f3b6a14cc2d34f3eea34ce927d97b42974bb050d9cc7b8d521b0cf7'and change['currentSha256']=='195321ee6e92baba3adab242ab06a1112215647c01786edeefda768411b6055c'
    changed=[]
    for pin in review['pins']:
        actual=hashlib.sha256((ROOT/pin['path']).read_bytes()).hexdigest()
        if actual!=pin['sha256']:
            assert pin['path']==change['path']and pin['sha256']==change['originalPeerExpectedSha256']and actual==change['currentSha256'];changed.append(pin['path'])
    assert changed==[change['path']]
    assert len(addon['currentPins'])==17
    for pin in addon['currentPins']:assert hashlib.sha256((ROOT/pin['path']).read_bytes()).hexdigest()==pin['sha256']
    entry=addon['revalidation']['finalAuthManifest'];manifest_path=ROOT/entry['path'];assert hashlib.sha256(manifest_path.read_bytes()).hexdigest()==entry['sha256']=='8b938c940cb62d2c84f0dee0ae69eb62147eea000888887850e0bfca8884e07e'
    manifest=__import__('json').loads(manifest_path.read_text());assert len(manifest['artifacts'])==34
    for artifact in manifest['artifacts']:assert hashlib.sha256((manifest_path.parent/artifact['path']).read_bytes()).hexdigest()==artifact['sha256']
    result=review['result'];assert result['assertionsPassed']==18 and result['smtpAcceptedTotal']==1 and result['sameRetainedMessageNoSecondRecover']
    assert result['originalRestored200']and result['temporaryDenied400']and result['remainingOwnSessions']==result['unrevokedOwnRefreshGrants']==result['ordinaryLogSecretMatches']==0
    assert result['logoutHttpStatuses']==[403,403,204,204]
    row=checked_json('auth-recovery-valid/verified-system-case-result.json','24944198b4df1f834613fd12ed28cc70efbcbd79909f2899c556f037d32d0665')
    report=checked_json('auth-recovery-valid/resume/verification.json','ae3c4747fd9da45af01ce9cb7000e95aa027fec906931451730230c866402b9e')
    assert row['status']==report['status']=='PASS'and row['complete_original_contract']and report['complete_original_contract']
    assert row['passwordRestorationConfirmed']and report['passwordRestorationConfirmed']and report['sourceStable']
    assert len(report['assertions'])==18 and all(a['status']=='PASS'for a in report['assertions'])and row['assertions']==[a['name']for a in report['assertions']]
    merged['CP2-10']={'case_id':'CP2-10','status':'PASS','complete_original_contract':True,'assertions':row['assertions'],
      'evidence':'auth-recovery-valid/resume/verification.json; auth-recovery-valid/recovery-attempt-1/verification.json; '+auth_recovery_review_path+'; '+addon_path,
      'scope':row['scope']+' '+review['scope']+' Password restoration confirmed: original200 and temporary400. Four own sessions have zero rows/unrevoked refresh grants; logoutHTTP403/403/204/204, not four204. One real localSMTP message only; no second recover, browser/UI reset, email-link routing or external-mail acceptance.',
      'executed_revision':{'authImplementation':'cached official GoTrue2.197.0; same existing signing material','binding':report['binding'],'nextProductCodeExecutedForThisProtocol':False},
      'source_review_sha256':expected,'source_review_addendum_sha256':'356f8a3842c5f0b71582c4a25228f3594a27e442d5872d6da6609b783f736435','adapter_scope':'Explicit complete original API/Auth recovery acceptance only; one changed scan pin is accepted solely through the separately pinned addendum, preserving the original review.  failed preflight/parser phases remain preserved. Native GoTrue/source hashes are binding; no current Git-head Next execution or UI acceptance inferred.'}

target.write_text(json.dumps([merged[key] for key in sorted(merged)], indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'historical_reviewed_contracts': sorted(item['case_id'] for item in reviewed), 'reviewed_contracts': sorted(merged), 'total_reviewed_entries': len(merged), 'negative_contract_failures': [key for key in merged if merged[key]['status']=='FAIL'], 'source_review_sha256': source_hash, 'new_execution': False}))
