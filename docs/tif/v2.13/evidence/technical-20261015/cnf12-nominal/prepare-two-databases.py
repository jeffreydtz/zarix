#!/usr/bin/env python3
"""Create two named, empty-template CNF12 DBs only in owned RESTORE. No DROP."""
import ast,datetime,hashlib,importlib.util,json,os,pathlib,re,subprocess,sys,traceback,urllib.parse,uuid
REPO=pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
sys.dont_write_bytecode=True
R=pathlib.Path('/tmp/zarix-runtime-20261015'); D=R/'cnf12-private'
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,v):
 with pathlib.Path(p).open('x') as f:os.chmod(p,0o600);json.dump(v,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
def main():
 assert os.environ.get('ZARIX_CNF12_DATABASE_PREPARE_CONFIRM')=='parent-released-two-new-databases'
 os.umask(0o077)
 helper=REPO/'docs/tif/v2.13/evidence/technical-20261015/environment/preserve-six-native-stacks.py'
 assert sha(helper)=='ec952cec38d711a10f2c64dd932c2823c3b2eaff93597dfc91a1e129bff535bb'
 spec=importlib.util.spec_from_file_location('cnf12_owned_native_guards',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 plan=m.load_plan();entry=next(x for x in plan['stacks']if x['name']=='restore');before=m.preflight(plan,entry)
 assert entry['expectedPostgresPort']==55322 and entry['expectedPublicApiPort']==55321
 D.mkdir(mode=0o700,exist_ok=True);assert D.stat().st_mode&0o077==0
 assert not (D/'targets.json').exists() and not (D/'reservation.private.json').exists(),'Never overwrite a prior lifecycle'
 pg=m.pg_environment(entry);assert pg['PGHOST']=='127.0.0.1' and pg['PGPORT']=='55322' and pg['PGDATABASE']=='postgres'
 bin=pathlib.Path(plan['postgresBin']);counter=0
 def command(args,db='postgres',data=None,writable=False,output=None):
  nonlocal counter
  if writable:assert re.fullmatch(r'cnf12_(source|target)_[0-9a-f]{32}',db) or pathlib.Path(args[0]).name=='createdb'
  env={**pg,'PGDATABASE':db,'PGAPPNAME':'zarix-cnf12-owned-lifecycle','PGOPTIONS':'-c default_transaction_read_only='+('off'if writable else'on')}
  counter+=1
  with (D/('command-%03d.stderr.private.log'%counter)).open('xb') as err:
   p=subprocess.run([str(a)for a in args],input=data,stdout=subprocess.PIPE,stderr=err,env=env,timeout=120)
  assert p.returncode==0,'private_command_failed_%03d'%counter
  if output:
   with pathlib.Path(output).open('xb')as f:f.write(p.stdout);f.flush();os.fsync(f.fileno())
  return p.stdout
 def sql(query,db='postgres',writable=False):return command([bin/'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',query],db,writable=writable).decode().strip()
 def js(query,db='postgres'):return json.loads(sql(query,db))
 def all_hashes():
  tables=js("SELECT json_agg(json_build_object('schema',schemaname,'table',tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname IN ('public','auth','storage')")
  assert len(tables)==64
  pairs=[]
  for t in tables:
   assert re.fullmatch(r'[a-z_]+',t['schema']) and re.fullmatch(r'[a-z_0-9]+',t['table'])
   name=t['schema']+'.'+t['table'];pairs.append("'"+name+"',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')) FROM "+name+' t)')
  return js('SELECT jsonb_object_agg(name,value) FROM (VALUES '+','.join('('+pair+')'for pair in pairs)+') AS x(name,value)')
 def catalogue_hash():
  value=js("SELECT jsonb_build_object('classes',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN ('public','auth','storage'))),'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid)FROM pg_proc p WHERE p.pronamespace IN(SELECT oid FROM pg_namespace WHERE nspname IN('public','auth','storage'))),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname)FROM pg_policies p),'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid)FROM pg_default_acl d),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname)FROM pg_roles r))")
  return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
 original_rows=all_hashes();original_catalogue=catalogue_hash();original_storage=m.inventory(before['storageRoot'])
 login=R/'source-native-logins.json';assert login.stat().st_mode&0o077==0
 users=json.loads(login.read_text())['users'];assert len(users)==2
 ids=[str(uuid.UUID(u['id']))for u in users];assert all(re.fullmatch(r'zarix-.+@example\.invalid',u['email'])for u in users)
 assert sorted(js('SELECT json_agg(id::text ORDER BY id::text) FROM auth.users'))==sorted(ids)
 literals=','.join("'"+i+"'"for i in ids);owner=ids[0]
 groups=js("SELECT COALESCE(json_agg(id::text ORDER BY id::text),'[]')FROM public.shared_groups WHERE owner_user_id='"+owner+"'")
 assert groups,'Existing synthetic A group required';group=str(uuid.UUID(groups[0]))
 source='cnf12_source_'+uuid.uuid4().hex;target='cnf12_target_'+uuid.uuid4().hex
 for name in [source,target]:assert js("SELECT count(*) FROM pg_database WHERE datname='"+name+"'")==0
 rawenv=dict((k,json.loads(v))for k,v in(l.split('=',1)for l in(R/'restore.env').read_text().splitlines()if l and not l.startswith('#')))
 url=urllib.parse.urlparse(rawenv['ZARIX_RESTORE_DATABASE_URL']);assert url.hostname=='127.0.0.1'and url.port==55322 and url.path=='/postgres'and not url.query
 targets={'purpose':'cnf12-nominal-two-database-recovery','status':'RESERVED_NOT_CREATED','sourceDatabaseName':source,'targetDatabaseName':target,'sourceDatabaseUrl':urllib.parse.urlunparse(url._replace(path='/'+source)),'targetDatabaseUrl':urllib.parse.urlunparse(url._replace(path='/'+target)),'originalDatabaseUrl':urllib.parse.urlunparse(url),'pgBin':str(bin),'authLoginFile':str(login),'clonedGroupId':group,'sourceSchemaArchive':str(D/'original-schema.private.dump'),'storageMetadataCloned':False,'originalStorageRoot':before['storageRoot'],'httpReconfigured':False}
 write(D/'reservation.private.json',{'targets':targets,'originalRows':original_rows,'originalCatalogueSha256':original_catalogue,'originalStorageInventory':original_storage,'nativeBefore':before})
 command([bin/'pg_dump','--format=custom','--schema-only','--file',D/'original-schema.private.dump'])
 for name in[source,target]:command([bin/'createdb','--maintenance-db=postgres','--template=template0',name],writable=True)
 for name in[source,target]:assert js("SELECT count(*)FROM pg_tables WHERE schemaname NOT IN('pg_catalog','information_schema')",name)==0
 command([bin/'pg_restore','--exit-on-error','--section=pre-data','--dbname='+source,D/'original-schema.private.dump'],source,writable=True)
 selected=[('auth.users','id IN('+literals+')'),('auth.identities','user_id IN('+literals+')'),('public.users','id IN('+literals+')'),('public.shared_groups',"id='"+group+"'"),('public.shared_group_members',"group_id='"+group+"'")]
 objects=js("SELECT COALESCE(json_agg(json_build_object('id',id::text,'bucket_id',bucket_id,'name',name)),'[]')FROM storage.objects o WHERE COALESCE(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')='"+owner+"'")
 if len(objects)==1:
  obj=objects[0];bucket=obj['bucket_id'];assert isinstance(bucket,str)
  # COPY selection uses a safely quoted literal from an existing private ID.
  literal="'"+bucket.replace("'","''")+"'"
  assert js('SELECT count(*)FROM storage.buckets WHERE id='+literal+' AND public IS FALSE')==1
  selected.extend([('storage.buckets','id='+literal),('storage.objects',"id='"+str(uuid.UUID(obj['id']))+"'")]);targets['storageMetadataCloned']=True
  target_bytes=D/'original-storage-bytes';target_bytes.mkdir(mode=0o700)
  for p in m.walk_files(before['storageRoot'],exclude_runtime=False,reject_raw_pg=False):m.copy_file(p,target_bytes/p.relative_to(before['storageRoot']),storage_object=True)
  targets['sourceStorageBytesDirectory']=str(target_bytes)
 for table,where in selected:
  data=command([bin/'psql','-X','-q','-v','ON_ERROR_STOP=1','-c','COPY(SELECT * FROM '+table+' WHERE '+where+')TO STDOUT WITH(FORMAT binary)'])
  path=D/(table.replace('.','-')+'.copy.private.bin')
  with path.open('xb')as f:f.write(data);f.flush();os.fsync(f.fileno())
  command([bin/'psql','-X','-q','-v','ON_ERROR_STOP=1','-c','COPY '+table+' FROM STDIN WITH(FORMAT binary)'],source,data,writable=True)
 command([bin/'pg_restore','--exit-on-error','--section=post-data','--dbname='+source,D/'original-schema.private.dump'],source,writable=True)
 assert js('SELECT count(*)FROM auth.users',source)==2 and js('SELECT count(*)FROM public.users',source)==2
 assert js('SELECT count(*)FROM public.shared_groups',source)==1
 for table in ['accounts','transactions','investments','recurring_rules']:assert js('SELECT count(*)FROM public.'+table,source)==0
 assert js("SELECT count(*)FROM pg_tables WHERE schemaname NOT IN('pg_catalog','information_schema')",target)==0
 assert all_hashes()==original_rows and catalogue_hash()==original_catalogue and m.inventory(before['storageRoot'])==original_storage
 after=m.preflight(plan,entry);assert m.same_bindings(after,before)
 targets.update(status='READY_EMPTY_NOMINAL_SOURCE_AND_LITERAL_EMPTY_TARGET',sourceOriginalTableCount=64,originalTablesSchemaRolesStorageUnchanged=True,clonedUsers=2,clonedGroupCount=1,newAuthIdentitiesCreated=False,newRolesOrCredentialsCreated=False)
 write(D/'targets.json',targets)
 write(D/'lifecycle-complete.private.json',{'status':'PASS','targets':targets,'originalRows':original_rows,'originalCatalogueSha256':original_catalogue,'originalStorageInventory':original_storage,'nativeAfter':after,'schemaArchiveSha256':sha(D/'original-schema.private.dump'),'retainedDatabasesNoDrop':True})
 print(json.dumps({'status':'PASS','sourceDatabaseName':source,'targetDatabaseName':target,'privateTargets':str(D/'targets.json'),'sourceFinancesEmpty':True,'targetNonSystemTables':0,'authUsersCloned':2,'groupCloned':1,'storageMetadataCloned':targets['storageMetadataCloned'],'original64TablesSchemaRolesStorageUnchanged':True,'httpReconfigured':False}))
if __name__=='__main__':
 try:main()
 except Exception as e:
  if D.exists():
   p=D/'lifecycle-failure.private.log'
   if not p.exists():
    with p.open('x')as f:os.chmod(p,0o600);traceback.print_exc(file=f)
  print(json.dumps({'status':'BLOCKED','errorType':type(e).__name__,'privateDiagnostics':str(D),'databasesDropped':False,'originalTablesWritten':False}));sys.exit(1)
