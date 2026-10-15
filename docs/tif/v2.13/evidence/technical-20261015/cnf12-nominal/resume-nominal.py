#!/usr/bin/env python3
"""Resume only read assertions and rollback probes; never seed/dump/restore DB."""
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import time

HERE=Path(__file__).resolve().parent
if os.environ.get('ZARIX_CNF12_RESUME')!='remaining-probes-only':
    print(json.dumps({'status':'PREPARED_NO_DATABASE_ACCESS','gate':'ZARIX_CNF12_RESUME=remaining-probes-only'}))
    sys.exit(0)
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('cnf12_read_helpers',HERE/'nominal-read-helpers.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
OUT=HERE/'resume-verification.json'
assert not OUT.exists(),'Preserve every prior resume report'
old_path=HERE/'attempt-1-parser-failure/verification.json'
assert h.digest(old_path.read_bytes())=='3a33400ef11c1cca00bfd57cf6fb1c842d72e61b37f109724822bebe051b365f'
old=json.loads(old_path.read_text())
assert old['status']=='FAIL' and len(old['assertions'])==20 and all(x['status']=='PASS' for x in old['assertions'])
assert old['error']['type']=='JSONDecodeError'
h.assert_private(h.TARGETS);target=json.loads(h.TARGETS.read_text())
assert target['purpose']==h.PURPOSE and target['httpReconfigured'] is False
assert target['sourceDatabaseName']==old['databases']['source'] and target['targetDatabaseName']==old['databases']['target']
SOURCE=h.connection(target['sourceDatabaseUrl'],target['sourceDatabaseName'])
DEST=h.connection(target['targetDatabaseUrl'],target['targetDatabaseName'])
h.BIN=Path(target['pgBin'])
archive=h.PRIVATE/'nominal-snapshot.dump'
assert h.digest(archive.read_bytes())==old['backup']['sha256']
snapshot=next(x['expected'] for x in old['assertions'] if x['name']=='All public Auth Storage table hashes match pre-loss snapshot')
catalog_sha=next(x['expected'] for x in old['assertions'] if x['name']=='Complete schema functions grants RLS indexes columns triggers match')
preservation_path=HERE/'original-preservation.json';preservation=json.loads(preservation_path.read_text())
assert preservation['status']=='PASS_ORIGINAL_RESTORE_PRESERVATION'
assert preservation['originalTableCount']==64
for flag in ['originalTableRowsEqual','originalCatalogueRolesEqual','originalStorageEqual','nativeStateConfigAndBindingsPreserved']:
    assert preservation[flag] is True
report={'status':'RUNNING','startedAt':h.utc(),'scope':'Guarded resume after a boolean/JSON harness parser error. No DB seed, dump, restore or committed financial operation. Original CNF12 remains BLOCKED.','completeOriginalContract':False,'assertions':[],
 'priorAttempt':{'path':str(old_path.relative_to(h.ROOT)),'sha256':h.digest(old_path.read_bytes()),'passedAssertions':20,'failure':'Preserved JSONDecodeError from PostgreSQL boolean text t; no DB error was observed.'},
 'originalPreservation':{'path':str(preservation_path.relative_to(h.ROOT)),'sha256':h.digest(preservation_path.read_bytes()),'status':preservation['status']},
 'sources':[{'path':str(p.relative_to(h.ROOT)),'sha256':h.digest(p.read_bytes())} for p in [Path(__file__),HERE/'nominal-read-helpers.py',HERE/'run-nominal.py',HERE/'plan.json']]}
def save():OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
def check(name,actual,expected):
    ok=actual==expected;report['assertions'].append({'name':name,'status':'PASS' if ok else 'FAIL','actual':actual,'expected':expected});save();assert ok,name
save();started=time.monotonic()
try:
    before_target=h.tables(DEST);before_source=h.tables(SOURCE)
    check('Resume target full64table hashes equal the already restored snapshot',before_target,snapshot)
    check('Resume target catalog equals the preserved snapshot',h.digest(h.catalog(DEST)),catalog_sha)
    check('Resume source catalog unchanged',h.digest(h.catalog(SOURCE)),catalog_sha)
    check('Source all tables except the exact account/ledger delta remain snapshot-identical',{k:v for k,v in before_source.items() if k not in ['public.accounts','public.transactions']},{k:v for k,v in snapshot.items() if k not in ['public.accounts','public.transactions']})
    target_rows=h.query('SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t',DEST)
    source_rows=h.query('SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t',SOURCE)
    lost=old['fixtureIds']['lost'];lost_rows=[x for x in source_rows if x['id']==lost]
    check('Only exact1500post-snapshot row distinguishes source ledger', [x for x in source_rows if x['id']!=lost],target_rows)
    check('The retained lost-row identity amount and date match the original command',[{k:x[k] for k in ['id','user_id','account_id','type','amount','currency','amount_in_account_currency','transaction_date']} for x in lost_rows],[{'id':lost,'user_id':old['owners'][0],'account_id':old['fixtureIds']['accountA'],'type':'expense','amount':1500,'currency':'ARS','amount_in_account_currency':1500,'transaction_date':'2026-10-06T11:00:00+00:00'}])
    aa=old['fixtureIds']['accountA'];source_accounts=h.query('SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM accounts a',SOURCE);target_accounts=h.query('SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM accounts a',DEST)
    check('Source own accountA remains8500 after one debit',[x['balance'] for x in source_accounts if x['id']==aa],[8500])
    normalized=[]
    for row in source_accounts:
        clone=dict(row)
        if row['id']==aa:
            previous=next(x for x in target_accounts if x['id']==aa);clone['balance']=previous['balance'];clone['updated_at']=previous['updated_at']
        normalized.append(clone)
    check('Complete source accounts differ only in the expected A balance/update timestamp',normalized,target_accounts)
    report['preflight']={'capturedAt':h.utc(),'sourceTables':before_source,'targetTables':before_target,'sourceCatalogSha256':catalog_sha,'targetCatalogSha256':catalog_sha,'privateTargetsSha256':h.digest(h.TARGETS.read_bytes()),'dumpSha256':h.digest(archive.read_bytes())};save()
    check('All three service RPCs still exist and deny authenticated execute',h.query("SELECT jsonb_build_array(count(*),bool_and(NOT has_function_privilege('authenticated',p.oid,'execute'))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('sell_investment_position','recompute_account_balance','create_account_with_opening_balance')",DEST),[3,True])
    owner=old['owners'][0];ab=old['fixtureIds']['accountB'];transfer=old['fixtureIds']['movements'][18]
    balances=f"SELECT jsonb_agg(balance::text ORDER BY CASE id WHEN {h.literal(aa)}::uuid THEN 0 ELSE 1 END) FROM accounts"
    result=h.owner_sql(f"UPDATE transactions SET amount=150,amount_in_account_currency=150,destination_amount_in_account_currency=150 WHERE id={h.literal(transfer)}; {balances}",owner,DEST,rollback=True)
    check('Restored transfer UPDATE trigger works within rollback',json.loads(result.splitlines()[-1]),['9950.00000000','2050.00000000'])
    result=h.owner_sql(f"DELETE FROM transactions WHERE id={h.literal(transfer)}; {balances}",owner,DEST,rollback=True)
    check('Restored transfer DELETE reverses both impacts within rollback',json.loads(result.splitlines()[-1]),['10100.00000000','1900.00000000'])
    sale=f"""BEGIN; SET LOCAL ROLE service_role;
     SELECT public.sell_investment_position(p_user_id=>{h.literal(owner)}::uuid,p_investment_id=>{h.literal(old['fixtureIds']['lots'][0])}::uuid,p_quantity=>1,p_price=>120,p_currency=>'USD',p_sold_at=>'2026-10-06'::date,p_realized_pnl_native=>20,p_realized_pnl_usd=>20,p_ars_per_usd=>1200);
     SELECT jsonb_build_array((SELECT quantity FROM investments WHERE id={h.literal(old['fixtureIds']['lots'][0])}),(SELECT count(*) FROM investment_sales),(SELECT sum(realized_pnl_usd) FROM investment_sales));ROLLBACK"""
    check('Sale RPC persists independently supplied20USD and decrements one unit within rollback',json.loads(h.sql(sale,DEST).splitlines()[-1]),[0,1,20])
    check('Target all64table hashes unchanged after every rollback probe',h.tables(DEST),before_target)
    check('Source all64table hashes unchanged throughout resume',h.tables(SOURCE),before_source)
    check('Target catalog permissions and sequence state unchanged',h.digest(h.catalog(DEST)),catalog_sha)
    if target.get('storageMetadataCloned'):
        source_dir=Path(target['sourceStorageBytesDirectory']);assert source_dir.is_relative_to(h.PRIVATE)
        def inventory(directory):
            result={}
            for path in directory.rglob('*'):
                assert not path.is_symlink()
                if path.is_file():result[str(path.relative_to(directory))]={'bytes':path.stat().st_size,'sha256':h.digest(path.read_bytes())}
            return result
        binary_before=inventory(source_dir);check('The declared source private Storage fixture has exactly34bytes',sum(x['bytes'] for x in binary_before.values()),34)
        restored=h.PRIVATE/'nominal-binary-restored';assert not restored.exists()
        shutil.copytree(source_dir,restored)
        for path in [restored,*restored.rglob('*')]:path.chmod(0o700 if path.is_dir() else 0o600)
        check('Standalone Storage bytes recovered exactly; no HTTP/API claim',inventory(restored),binary_before)
        check('Source private Storage bytes unchanged',inventory(source_dir),binary_before)
        report['storage']={'method':'Private backed-up fixture file tree copied to a new private restore tree; separately from database metadata restoration and never an HTTP Storage session','objects':binary_before,'restoredDirectoryName':restored.name}
    t0=dt.datetime.fromisoformat('2026-10-06T12:00:00+00:00');scenarios=[]
    for label,last,finish,expected in [('nominal','2026-10-05T13:00:00+00:00','2026-10-06T15:30:00+00:00',True),('inclusive-limits','2026-10-05T12:00:00+00:00','2026-10-06T16:00:00+00:00',True),('rpo-plus1s','2026-10-05T11:59:59+00:00','2026-10-06T16:00:00+00:00',False),('rto-plus1s','2026-10-05T12:00:00+00:00','2026-10-06T16:00:01+00:00',False)]:
        rpo=int((t0-dt.datetime.fromisoformat(last)).total_seconds());rto=int((dt.datetime.fromisoformat(finish)-t0).total_seconds());scenarios.append({'label':label,'rpoSeconds':rpo,'rtoSeconds':rto,'withinBothTargets':rpo<=86400 and rto<=14400,'expected':expected})
    check('Modeled23h3h30 and inclusive24h4h/+1s arithmetic',all(x['withinBothTargets']==x['expected'] for x in scenarios),True)
    report['timeModel']={'scope':'Model only; never observed backup age or a real3h30service outage','scenarios':scenarios}
    report['actualTiming']={'initialRestore':old['restore'],'initialParserFailureAt':old['finishedAt'],'resumeStartedAt':report['startedAt'],'resumeFinishedAt':h.utc(),'resumeSeconds':time.monotonic()-started,'scope':'First pg_restore timing stays unchanged. Resume is a later validation phase with a human/diagnostic gap; not an uninterrupted service RTO.'}
    report['lossReconciliation']={'lostTransactionId':lost,'amountARS':1500,'sourceRows':21,'restoredRows':20,'sourceBalanceA':8500,'restoredBalanceA':10000,'silentlyReapplied':False}
    report['sourceStable']=all(h.digest((h.ROOT/x['path']).read_bytes())==x['sha256'] for x in report['sources'])
    report['status']='PARTIAL_NOMINAL_SQL_RECOVERY_PASS_ORIGINAL_CNF12_BLOCKED'
except Exception as exc:
    report['status']='FAIL';report['error']={'type':type(exc).__name__,'message':str(exc) if isinstance(exc,AssertionError) else 'Bounded local validation failed; retain private diagnostics'}
finally:
    report['finishedAt']=h.utc();save()
print(json.dumps({'status':report['status'],'assertions':len(report['assertions']),'report':str(OUT.relative_to(h.ROOT))}))
sys.exit(1 if report['status']=='FAIL' else 0)
