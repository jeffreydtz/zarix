#!/usr/bin/env python3
"""Prepare one new UUID database; never reconfigure original Native services."""
import datetime,hashlib,importlib.util,json,os,pathlib,re,subprocess,sys,traceback,urllib.parse,uuid
sys.dont_write_bytecode=True
REPO=pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix');R=pathlib.Path('/tmp/zarix-runtime-20261015');D=R/'empty-account-private'
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def save(p,v):
 with pathlib.Path(p).open('x')as f:os.chmod(p,0o600);json.dump(v,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
def main():
 assert os.environ.get('ZARIX_EMPTY_DATABASE_WINDOW')=='parent-released-new-empty-database'
 os.umask(0o077);D.mkdir(mode=0o700,exist_ok=True);assert not D.is_symlink() and D.resolve()==pathlib.Path('/private/tmp/zarix-runtime-20261015/empty-account-private') and D.lstat().st_mode&0o777==0o700
 assert not(D/'database-preparation.json').exists() and not(D/'database-reservation.private.json').exists()
 h=REPO/'docs/tif/v2.13/evidence/technical-20261015/environment/preserve-six-native-stacks.py';assert sha(h)=='ec952cec38d711a10f2c64dd932c2823c3b2eaff93597dfc91a1e129bff535bb'
 s=importlib.util.spec_from_file_location('empty_owned_guards',h);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);plan=m.load_plan();entry=next(x for x in plan['stacks']if x['name']=='restore');before=m.preflight(plan,entry);storage=m.inventory(before['storageRoot'])
 base=m.pg_environment(entry);assert base['PGHOST']=='127.0.0.1'and base['PGPORT']=='55322'and base['PGDATABASE']=='postgres';admin={**base,'PGUSER':'supabase_admin'};bin=pathlib.Path(plan['postgresBin']);count=0;name='zarix_empty_'+uuid.uuid4().hex
 def cmd(args,db='postgres',data=None,write=False):
  nonlocal count
  if write:assert db==name or pathlib.Path(args[0]).name=='createdb'
  count+=1;env={**admin,'PGDATABASE':db,'PGOPTIONS':'-c default_transaction_read_only='+('off'if write else'on'),'PGAPPNAME':'zarix-empty-isolated-bootstrap'}
  with(D/('bootstrap-%03d.stderr.private.log'%count)).open('xb')as err:p=subprocess.run([str(x)for x in args],input=data,stdout=subprocess.PIPE,stderr=err,env=env,timeout=120)
  assert p.returncode==0,'private_bootstrap_command_%03d_failed'%count
  return p.stdout
 def sql(q,db='postgres'):return cmd([bin/'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',q],db).decode().strip()
 assert re.fullmatch(r'zarix_empty_[0-9a-f]{32}',name)and sql("SELECT count(*)FROM pg_database WHERE datname='"+name+"'")=='0'
 native=json.loads((R/'home/stacks'/entry['stackId']/'state.json').read_text());rest=next(x for x in native['instances']if x['creation']['service']=='rest')['creation']['config'];auth=next(x for x in native['instances']if x['creation']['service']=='auth')['creation']['config']
 original=urllib.parse.urlparse(rest['databaseUrl']);assert original.hostname=='127.0.0.1'and original.port==55322 and original.path=='/postgres'and original.username=='authenticator'
 admin_url=urllib.parse.urlparse(json.loads((R/'restore.env').read_text().split('ZARIX_RESTORE_DATABASE_URL=',1)[1].splitlines()[0]));admin_url=admin_url._replace(netloc='supabase_admin:'+admin_url.password+'@127.0.0.1:55322')
 config={'purpose':'empty-account-http-replica','status':'DATABASE_RESERVED','newDatabaseName':name,'newDatabaseUrl':urllib.parse.urlunparse(admin_url._replace(path='/'+name)),'originalDatabaseUrl':urllib.parse.urlunparse(admin_url),'apiOrigin':'http://127.0.0.1:60321','restOrigin':'http://127.0.0.1:60323','authUpstream':'http://127.0.0.1:60327','originalAuthUpstream':'http://127.0.0.1:55321','authIsolation':'separate-cache-binary-on-new-database','pgBin':str(bin),'authLoginFile':str(R/'source-native-logins.json'),'databaseRole':'supabase_admin'}
 save(D/'database-reservation.private.json',{'config':config,'nativeBefore':before,'originalStorage':storage})
 archive=R/'cnf12-private/original-schema.private.dump';checkpoint=json.loads((R/'cnf12-private/lifecycle-complete.private.json').read_text());assert sha(archive)==checkpoint['schemaArchiveSha256']
 cmd([bin/'createdb','--maintenance-db=postgres','--template=template0',name],write=True)
 assert sql("SELECT count(*)FROM pg_tables WHERE schemaname NOT IN('pg_catalog','information_schema')",name)=='0'
 cmd([bin/'pg_restore','--exit-on-error','--section=pre-data','--dbname='+name,archive],name,write=True)
 for table in['auth.users','auth.identities','public.users']:
  q="SELECT json_agg(attname ORDER BY attnum)FROM pg_attribute WHERE attrelid='"+table+"'::regclass AND attnum>0 AND NOT attisdropped AND attgenerated=''";cols=json.loads(sql(q));assert cols==json.loads(sql(q,name))and all(re.fullmatch('[a-z_0-9]+',x)for x in cols);names=','.join(chr(34)+x+chr(34)for x in cols)
  data=R/'cnf12-private'/('resume-4-'+table.replace('.','-')+'.copy.private.bin');assert data.is_file()
  cmd([bin/'psql','-X','-q','-v','ON_ERROR_STOP=1','-c','COPY '+table+'('+names+')FROM STDIN WITH(FORMAT binary)'],name,data.read_bytes(),True)
 cols=json.loads(sql("SELECT json_agg(attname ORDER BY attnum)FROM pg_attribute WHERE attrelid='auth.schema_migrations'::regclass AND attnum>0 AND NOT attisdropped AND attgenerated=''"));assert all(re.fullmatch('[a-z_0-9]+',x)for x in cols);names=','.join(chr(34)+x+chr(34)for x in cols)
 data=cmd([bin/'psql','-X','-q','-v','ON_ERROR_STOP=1','-c','COPY(SELECT '+names+' FROM auth.schema_migrations)TO STDOUT WITH(FORMAT binary)'])
 with(D/'auth-migrations.copy.private.bin').open('xb')as f:f.write(data);f.flush();os.fsync(f.fileno())
 cmd([bin/'psql','-X','-q','-v','ON_ERROR_STOP=1','-c','COPY auth.schema_migrations('+names+')FROM STDIN WITH(FORMAT binary)'],name,data,True)
 cmd([bin/'pg_restore','--exit-on-error','--section=post-data','--dbname='+name,archive],name,write=True)
 users=json.loads((R/'source-native-logins.json').read_text())['users'];ids=sorted(str(uuid.UUID(u['id']))for u in users);assert len(ids)==2
 for table in['auth.users','public.users']:assert sorted(json.loads(sql('SELECT json_agg(id::text ORDER BY id::text)FROM '+table,name)))==ids
 for table in['accounts','transactions','investments','net_worth_snapshots','exchange_rates','market_data_cache','shared_groups']:assert sql('SELECT count(*)FROM public.'+table,name)=='0'
 assert sql('SELECT count(*)FROM auth.sessions',name)=='0'
 assert sql('SELECT count(*)FROM auth.schema_migrations',name)==sql('SELECT count(*)FROM auth.schema_migrations')
 after=m.preflight(plan,entry);assert m.same_bindings(before,after)and m.inventory(before['storageRoot'])==storage
 config.update(status='DATABASE_READY_FINANCES_EMPTY',clonedUsers=2,newIdentitiesOrRoles=False,originalNativeDataStateAndStorageUnchanged=True,authMigrationRows=int(sql('SELECT count(*)FROM auth.schema_migrations',name)),databaseCreatedFromTemplate0=True)
 save(D/'database-preparation.json',config)
 # Secrets remain only in private configuration; no processes start here.
 save(D/'existing-native-service-material.private.json',{'restDatabaseUrl':urllib.parse.urlunparse(original._replace(path='/'+name)),'authDatabaseUrl':urllib.parse.urlunparse(urllib.parse.urlparse(auth['databaseUrl'])._replace(path='/'+name)),'jwtSecret':auth['jwtSecret'],'gotrueJwtKeys':auth['gotrueJwtKeys'],'jwks':rest['jwks']})
 values={}
 for line in(R/'restore.env').read_text().splitlines():
  if line and not line.startswith('#'):
   k,v=line.split('=',1);values[k]=json.loads(v)
 out={'ZARIX_EMPTY_SUPABASE_URL':config['apiOrigin'],'ZARIX_EMPTY_DATABASE_URL':config['newDatabaseUrl'],'ZARIX_EMPTY_ANON_KEY':values['ZARIX_RESTORE_ANON_KEY'],'ZARIX_EMPTY_SERVICE_ROLE_KEY':values['ZARIX_RESTORE_SERVICE_ROLE_KEY'],'ZARIX_PG_BIN':str(bin)}
 with(R/'empty-proof.env').open('x')as f:os.chmod(f.name,0o600);f.write(''.join(k+'='+json.dumps(v)+'\n'for k,v in out.items()));f.flush();os.fsync(f.fileno())
 print(json.dumps({'status':config['status'],'newDatabaseName':name,'clonedUsers':2,'authMigrationRows':config['authMigrationRows'],'financialAndFxRows':0,'originalNativeUnchanged':True,'servicesStarted':0}))
if __name__=='__main__':
 try:main()
 except Exception as e:
  if D.exists():
   p=D/'database-bootstrap-failure.private.log'
   if not p.exists():
    with p.open('x')as f:os.chmod(p,0o600);traceback.print_exc(file=f)
  print(json.dumps({'status':'BLOCKED','errorType':type(e).__name__,'privateDiagnostics':str(D),'databaseDropped':False,'originalTablesWritten':False}));sys.exit(1)
