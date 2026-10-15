#!/usr/bin/env python3
"""Opt-in SQL-only nominal recovery; URLs, Auth rows and dumps stay private."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
from urllib.parse import unquote, urlparse
import uuid

ROOT = Path(__file__).resolve().parents[6]
HERE = Path(__file__).resolve().parent
PRIVATE = Path('/tmp/zarix-runtime-20261015/cnf12-private')
TARGETS = PRIVATE / 'targets.json'
PURPOSE = 'cnf12-nominal-two-database-recovery'
REPORT = HERE / 'verification.json'
STAMP = '2026-10-05T13:00:00Z'

def digest(data):
    return hashlib.sha256(data if isinstance(data, bytes) else json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def literal(value):
    return "'" + str(value).replace("'", "''") + "'"

def assert_private(path):
    info = path.stat()
    assert stat.S_ISREG(info.st_mode) and info.st_mode & 0o077 == 0, 'Private input must be a regular0600 file'

def connection(url, expected):
    u = urlparse(url)
    name = unquote(u.path[1:])
    assert u.scheme in ('postgres', 'postgresql') and u.hostname == '127.0.0.1' and u.port == 55322
    assert not u.query and not u.fragment and name == expected
    assert re.fullmatch(r'cnf12_[a-z]+_[0-9a-f]{32}', name), 'New exact UUID database only'
    clean = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    return {**clean, 'PGHOST': '127.0.0.1', 'PGHOSTADDR': '127.0.0.1', 'PGPORT': '55322',
            'PGDATABASE': name, 'PGUSER': unquote(u.username or ''), 'PGPASSWORD': unquote(u.password or ''),
            'PGCONNECT_TIMEOUT': '10', 'PGAPPNAME': 'zarix-cnf12-nominal',
            'PGOPTIONS': '-c statement_timeout=45000 -c lock_timeout=5000'}

def command(name, args, env, timeout=60):
    result = subprocess.run([str(BIN / name), *args], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        location = PRIVATE / ('error-' + uuid.uuid4().hex + '.log')
        location.write_bytes(result.stderr)
        location.chmod(0o600)
        raise RuntimeError(name + ' failed; private diagnostic retained')
    return result.stdout.decode().strip()

def sql(statement, env):
    return command('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', statement], env)

def query(statement, env):
    return json.loads(sql(statement, env))

def tables(env):
    names = query("SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname IN ('public','auth','storage')", env) or []
    data = {}
    for row in names:
        schema, table = row['schema'], row['table']
        assert re.fullmatch(r'[A-Za-z0-9_]+', schema) and re.fullmatch(r'[A-Za-z0-9_]+', table)
        data[schema + '.' + table] = query(f'''SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text,'UTF8')),'hex')) FROM "{schema}"."{table}" t''', env)
    return data

CATALOG = """SELECT jsonb_build_object(
 'schemas',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl) ORDER BY n.nspname) FROM pg_namespace n WHERE n.nspname IN ('public','auth','storage','extensions')),
 'extensions',(SELECT jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) ORDER BY e.extname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),
 'enums',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'type',t.typname,'order',e.enumsortorder,'label',e.enumlabel) ORDER BY n.nspname,t.typname,e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','storage')),
 'views',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid,true)) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('v','m')),
 'sequences',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.schemaname,s.sequencename) FROM pg_sequences s WHERE s.schemaname IN ('public','auth','storage')),
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'acl',c.relacl,'options',c.reloptions) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','v','S','m')),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage') AND p.prokind<>'a'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname) FROM pg_policies p WHERE p.schemaname IN ('public','auth','storage')),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.schemaname,i.tablename,i.indexname) FROM pg_indexes i WHERE i.schemaname IN ('public','auth','storage')),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',r.relname,'name',c.conname,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid)) ORDER BY n.nspname,r.relname,c.conname) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname IN ('public','auth','storage')),
 'columns',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY n.nspname,c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','v') AND a.attnum>0 AND NOT a.attisdropped),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',r.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY n.nspname,r.relname,t.tgname) FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname IN ('public','auth','storage') AND NOT t.tgisinternal),
 'defaultPrivileges',(SELECT jsonb_agg(jsonb_build_object('role',d.defaclrole::regrole::text,'schema',d.defaclnamespace::regnamespace::text,'kind',d.defaclobjtype,'acl',d.defaclacl) ORDER BY d.defaclrole::regrole::text,d.defaclnamespace::regnamespace::text,d.defaclobjtype) FROM pg_default_acl d)
)"""

def catalog(env):
    data = query(CATALOG, env)
    for rows in data.values():
        for row in rows or []:
            for field in ['acl', 'options']:
                if isinstance(row.get(field), list):
                    row[field].sort()
    return data

def save():
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

def check(name, actual, expected):
    passed = actual == expected
    report['assertions'].append({'name': name, 'actual': actual, 'expected': expected, 'status': 'PASS' if passed else 'FAIL'})
    save()
    assert passed, name

def owner_sql(statement, owner, env, rollback=False):
    # SQL claims exercise actual RLS roles; this is deliberately not an HTTP/JWT session.
    claims = json.dumps({'sub': owner, 'role': 'authenticated'})
    return sql("BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub'," + literal(owner) + ",true); SELECT set_config('request.jwt.claims'," + literal(claims) + ",true); " + statement + ('; ROLLBACK' if rollback else '; COMMIT'), env)

if os.environ.get('ZARIX_CNF12_EXECUTE') != 'nominal-synthetic-only':
    print(json.dumps({'status': 'PREPARED_NO_DATABASE_ACCESS', 'gate': 'ZARIX_CNF12_EXECUTE=nominal-synthetic-only', 'purpose': PURPOSE}))
    sys.exit(0)

report = {'status': 'RUNNING', 'startedAt': utc(), 'scope': 'Nominal SQL-only additional recovery; complete original CNF12 remains BLOCKED', 'completeOriginalContract': False, 'assertions': [], 'harnessSha256': digest(Path(__file__).read_bytes())}
assert not REPORT.exists(), 'Preserve any prior attempt: choose a new output file before rerun'
assert_private(TARGETS)
target = json.loads(TARGETS.read_text())
assert target['purpose'] == PURPOSE
assert target['sourceDatabaseName'] != target['targetDatabaseName']
SOURCE = connection(target['sourceDatabaseUrl'], target['sourceDatabaseName'])
DEST = connection(target['targetDatabaseUrl'], target['targetDatabaseName'])
BIN = Path(target['pgBin'])
assert BIN.is_absolute() and str(BIN).startswith('/tmp/zarix-runtime-20261015/')
assert_private(Path(target['authLoginFile']))
logins = json.loads(Path(target['authLoginFile']).read_text())
owners = [entry['id'] for entry in logins['users']]
assert len(owners) == 2 and owners[0] != owners[1]
for owner in owners:
    uuid.UUID(owner)
owner = owners[0]
run = uuid.uuid4().hex
ids = {name: str(uuid.uuid4()) for name in ['accountA','accountB','incomeCategory','expenseCategory','rule','lost']}
ids['movements'] = [str(uuid.uuid4()) for _ in range(20)]
ids['lots'] = [str(uuid.uuid4()) for _ in range(3)]
report['fixtureIds'] = ids
report['owners'] = owners
report['databases'] = {'source': target['sourceDatabaseName'], 'target': target['targetDatabaseName'], 'port': 55322}
revision = subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,env={**os.environ,'DEVELOPER_DIR':'/Library/Developer/CommandLineTools'},stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout.decode().strip()
assert re.fullmatch(r'[0-9a-f]{40}',revision)
report['checkoutRevision'] = revision
report['executionMethod'] = 'Direct SQL fixture and real PostgreSQL tools; no application build or HTTP normal session is attributed to this harness.'
report['versions'] = {tool:command(tool,['--version'],SOURCE) for tool in ['psql','pg_dump','pg_restore']}
report['sources'] = [{'path': str(p.relative_to(ROOT)), 'sha256': digest(p.read_bytes())} for p in [Path(__file__), HERE/'plan.json']]
save()
try:
    check('Both names identify the exact new databases', [sql('SELECT current_database()', SOURCE), sql('SELECT current_database()', DEST)], [target['sourceDatabaseName'], target['targetDatabaseName']])
    check('Target has no user tables before restore', int(sql("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')", DEST)), 0)
    check('Source has exactly the existing two Auth IDs', query('SELECT jsonb_agg(id::text ORDER BY id::text) FROM auth.users', SOURCE), sorted(owners))
    check('Source financial tables are empty', query("SELECT jsonb_build_array((SELECT count(*) FROM accounts),(SELECT count(*) FROM transactions),(SELECT count(*) FROM investments),(SELECT count(*) FROM recurring_rules))", SOURCE), [0,0,0,0])
    check('Exactly one existing group reused', int(sql('SELECT count(*) FROM shared_groups', SOURCE)), 1)
    check('Existing guest retained without new identity', int(sql('SELECT count(*) FROM shared_group_members WHERE user_id IS NULL', SOURCE)) >= 1, True)
    check('Anon and authenticated do not bypass RLS', int(sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)", SOURCE)), 0)
    aa, ab = ids['accountA'], ids['accountB']
    seed = f"INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES({literal(aa)},{literal(owner)},'CNF12 A','investment','ARS',0),({literal(ab)},{literal(owner)},'CNF12 B','bank','ARS',0);"
    seed += f"INSERT INTO categories(id,user_id,name,type) VALUES({literal(ids['incomeCategory'])},{literal(owner)},'CNF12 ingreso','income'),({literal(ids['expenseCategory'])},{literal(owner)},'CNF12 gasto','expense');"
    movements = [('income',aa,None,10000),('income',ab,None,2000)]
    movements += [(kind,aa,None,100) for _ in range(8) for kind in ['income','expense']]
    movements += [('transfer',aa,ab,100),('transfer',ab,aa,100)]
    for i,(kind,account,destination,amount) in enumerate(movements):
        date = (dt.datetime(2026,10,5,12,0,tzinfo=dt.timezone.utc)+dt.timedelta(minutes=3*(i+1))).isoformat()
        category = ids['incomeCategory'] if kind=='income' else ids['expenseCategory'] if kind=='expense' else None
        seed += "INSERT INTO transactions(id,user_id,type,account_id,destination_account_id,amount,currency,amount_in_account_currency,destination_amount_in_account_currency,category_id,description,transaction_date) VALUES(" + ','.join([literal(ids['movements'][i]),literal(owner),literal(kind),literal(account),literal(destination) if destination else 'NULL',str(amount),"'ARS'",str(amount),str(amount) if destination else 'NULL',literal(category) if category else 'NULL',literal('CNF12 movimiento '+str(i+1)),literal(date)]) + ');'
    for i,(quantity,purchase,current) in enumerate([(1,100,110),(2,50,55),(4,25,27.5)]):
        seed += f"INSERT INTO investments(id,user_id,account_id,type,name,quantity,purchase_price,purchase_currency,purchase_date,current_price,market_currency,is_manual_price) VALUES({literal(ids['lots'][i])},{literal(owner)},{literal(aa)},'stock_us','CNF12 lote {i+1}',{quantity},{purchase},'USD','2026-10-05',{current},'USD',true);"
    seed += f"INSERT INTO recurring_rules(id,user_id,account_id,type,amount,currency,category_id,description,frequency,start_date,last_executed_date,is_active,notification_enabled) VALUES({literal(ids['rule'])},{literal(owner)},{literal(aa)},'expense',1000,'ARS',{literal(ids['expenseCategory'])},'CNF12 regla','daily','2026-10-01','2026-10-05',false,false)"
    owner_sql(seed, owner, SOURCE)
    snapshot_tables = tables(SOURCE)
    snapshot_catalog = catalog(SOURCE)
    expected_counts = {'public.accounts':2,'public.transactions':20,'public.investments':3,'public.recurring_rules':1,'public.shared_groups':1,'auth.users':2}
    check('Exact nominal counts include every economic ledger row; no opening adjustment hidden', {k:snapshot_tables[k]['count'] for k in expected_counts}, expected_counts)
    balances_sql = f"SELECT jsonb_agg(balance::text ORDER BY CASE id WHEN {literal(aa)}::uuid THEN 0 ELSE 1 END) FROM accounts"
    check('Nominal source balances', query(balances_sql,SOURCE), ['10000.00000000','2000.00000000'])
    check('Nominal income expense net transfer totals', query("SELECT jsonb_build_array(sum(amount) FILTER(WHERE type='income'),sum(amount) FILTER(WHERE type='expense'),sum(CASE WHEN type='income' THEN amount WHEN type='expense' THEN -amount ELSE 0 END),count(*) FILTER(WHERE type='transfer')) FROM transactions",SOURCE), [12800,800,12000,2])
    check('All three lots have independent exact cost/value/PnL', query("SELECT jsonb_build_array(sum(quantity*purchase_price),sum(quantity*current_price),sum(quantity*(current_price-purchase_price))) FROM investments",SOURCE), [300,330,30])
    check('Model last business movement is exactly05Oct13Z', sql("SELECT to_char(max(transaction_date) AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') FROM transactions",SOURCE), STAMP)
    archive = PRIVATE/'nominal-snapshot.dump'
    assert not archive.exists(), 'Never overwrite a prior private backup'
    archive.touch(mode=0o600)
    report['backup']={'startedAt':utc(),'format':'pg_dump custom','privateFileName':archive.name}
    started=time.monotonic();command('pg_dump',['--format=custom','--file',str(archive)],SOURCE)
    report['backup'].update({'finishedAt':utc(),'actualSeconds':time.monotonic()-started,'sha256':digest(archive.read_bytes()),'bytes':archive.stat().st_size,'tocSha256':digest(command('pg_restore',['--list',str(archive)],SOURCE).encode())})
    check('Source unchanged during dump', tables(SOURCE), snapshot_tables)
    owner_sql(f"INSERT INTO transactions(id,user_id,type,account_id,amount,currency,amount_in_account_currency,category_id,description,transaction_date) VALUES({literal(ids['lost'])},{literal(owner)},'expense',{literal(aa)},1500,'ARS',1500,{literal(ids['expenseCategory'])},'CNF12 posterior perdido','2026-10-06T11:00:00Z')",owner,SOURCE)
    check('Post-snapshot source has21rows and1500debit', query(f"SELECT jsonb_build_array((SELECT count(*) FROM transactions),(SELECT balance FROM accounts WHERE id={literal(aa)}))",SOURCE), [21,8500])
    report['restore']={'startedAt':utc()};started=time.monotonic();save()
    command('pg_restore',['--exit-on-error','--dbname',DEST['PGDATABASE'],str(archive)],DEST,timeout=120)
    report['restore']['pgRestoreFinishedAt']=utc();report['restore']['pgRestoreSeconds']=time.monotonic()-started
    check('All public Auth Storage table hashes match pre-loss snapshot',tables(DEST),snapshot_tables)
    check('Complete schema functions grants RLS indexes columns triggers match',digest(catalog(DEST)),digest(snapshot_catalog))
    check('Restored snapshot excludes exact post-snapshot lost UUID',int(sql(f"SELECT count(*) FROM transactions WHERE id={literal(ids['lost'])}",DEST)),0)
    check('Restored two account balances remain10000/2000',query(balances_sql,DEST),['10000.00000000','2000.00000000'])
    for actor,expected in [(owner,[2,20,3,1,1]),(owners[1],[0,0,0,0,0])]:
        result=owner_sql("SELECT jsonb_build_array((SELECT count(*) FROM accounts),(SELECT count(*) FROM transactions),(SELECT count(*) FROM investments),(SELECT count(*) FROM recurring_rules),(SELECT count(*) FROM shared_groups))",actor,DEST,rollback=True).splitlines()[-1]
        check('Actual SQL authenticated RLS counts for '+('ownerA' if actor==owner else 'foreignB'),json.loads(result),expected)
    check('Protected service RPC execute remains denied to authenticated',query("SELECT bool_and(NOT has_function_privilege('authenticated',p.oid,'execute')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('sell_investment_position','recompute_account_balance','create_account_with_opening_balance')",DEST),True)
    transfer=ids['movements'][18]
    output=owner_sql(f"UPDATE transactions SET amount=150,amount_in_account_currency=150,destination_amount_in_account_currency=150 WHERE id={literal(transfer)}; {balances_sql}",owner,DEST,rollback=True)
    check('Restored transfer UPDATE trigger functions then rolls back',json.loads(output.splitlines()[-1]),['9950.00000000','2050.00000000'])
    output=owner_sql(f"DELETE FROM transactions WHERE id={literal(transfer)}; {balances_sql}",owner,DEST,rollback=True)
    check('Restored transfer DELETE reverses both impacts then rolls back',json.loads(output.splitlines()[-1]),['10100.00000000','1900.00000000'])
    sale_probe = f"""BEGIN; SET LOCAL ROLE service_role;
      SELECT public.sell_investment_position(p_user_id=>{literal(owner)}::uuid,
       p_investment_id=>{literal(ids['lots'][0])}::uuid,p_quantity=>1,p_price=>120,
       p_currency=>'USD',p_sold_at=>'2026-10-06'::date,p_realized_pnl_native=>20,
       p_realized_pnl_usd=>20,p_ars_per_usd=>1200);
      SELECT jsonb_build_array((SELECT quantity FROM investments WHERE id={literal(ids['lots'][0])}),
       (SELECT count(*) FROM investment_sales),(SELECT sum(realized_pnl_usd) FROM investment_sales));
      ROLLBACK"""
    check('Restored service-only sale RPC persists independently supplied20USD and quantity then rolls back',json.loads(sql(sale_probe,DEST).splitlines()[-1]),[0,1,20])
    check('Rollback probes preserve complete restored snapshot',tables(DEST),snapshot_tables)
    check('Rollback probes preserve restored catalog and permissions',digest(catalog(DEST)),digest(snapshot_catalog))
    report['restore'].update({'validatedAt':utc(),'actualThroughValidationSeconds':time.monotonic()-started})
    boundaries=[]
    t0=dt.datetime.fromisoformat('2026-10-06T12:00:00+00:00')
    for label,last,finish,expected in [('nominal','2026-10-05T13:00:00+00:00','2026-10-06T15:30:00+00:00',True),('inclusive-limits','2026-10-05T12:00:00+00:00','2026-10-06T16:00:00+00:00',True),('rpo-one-second-over','2026-10-05T11:59:59+00:00','2026-10-06T16:00:00+00:00',False),('rto-one-second-over','2026-10-05T12:00:00+00:00','2026-10-06T16:00:01+00:00',False)]:
        rpo=int((t0-dt.datetime.fromisoformat(last)).total_seconds());rto=int((dt.datetime.fromisoformat(finish)-t0).total_seconds());passed=rpo<=86400 and rto<=14400
        boundaries.append({'label':label,'rpoSeconds':rpo,'rtoSeconds':rto,'withinBothTargets':passed,'expected':expected,'status':'PASS' if passed==expected else 'FAIL'})
    check('Independent modeled boundary calculations',all(x['status']=='PASS' for x in boundaries),True)
    report['timeModel']={'scope':'Contract arithmetic only; not an aged operational backup or observed3h30outage','t0':'2026-10-06T12:00:00Z','scenarios':boundaries}
    report['lossReconciliation']={'transactionId':ids['lost'],'amountARS':1500,'sourceAfterSnapshotBalanceA':8500,'restoredBalanceA':10000,'reapplied':False,'action':'Record the1500loss for independent review; never invent recovered data or silently replay it.'}
    report['snapshotTables']=snapshot_tables
    report['snapshotCatalogSha256']=digest(snapshot_catalog)
    report['limits']=['No HTTP Auth login or browser against these additional databases; SQL role/claim fixtures are explicitly separate.','No observed backup entitlement of the contracted remote plan.','Modeled23h/3h30 and boundary arithmetic do not establish an observed service RPO/RTO.','Storage SQL metadata does not establish binary/API recovery; existing native-full evidence remains separate.','Both new databases and private dumps remain retained; no cleanup DROP is performed.']
    report['sourceStable']=all(digest((ROOT/row['path']).read_bytes())==row['sha256'] for row in report['sources'])
    report['status']='PARTIAL_NOMINAL_SQL_PASS_ORIGINAL_CNF12_BLOCKED'
except Exception as exc:
    report['status']='FAIL'
    report['error']={'type':type(exc).__name__,'message':str(exc) if isinstance(exc,AssertionError) else 'Bounded local command failed; inspect private diagnostic, no secrets published'}
finally:
    report['finishedAt']=utc();save()
print(json.dumps({'status':report['status'],'assertions':len(report['assertions']),'report':str(REPORT.relative_to(ROOT))}))
sys.exit(1 if report['status']=='FAIL' else 0)
