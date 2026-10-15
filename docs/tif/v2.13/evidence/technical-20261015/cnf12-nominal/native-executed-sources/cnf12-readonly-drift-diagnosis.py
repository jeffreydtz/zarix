#!/usr/bin/env python3
"""Resume only the two already reserved CNF12 DBs; preserve attempt1. No DROP."""
import ast,datetime,hashlib,importlib.util,json,os,pathlib,re,subprocess,sys,traceback,urllib.parse,uuid
REPO=pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
sys.dont_write_bytecode=True
R=pathlib.Path('/tmp/zarix-runtime-20261015'); D=R/'cnf12-private'
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,v):
 with pathlib.Path(p).open('x') as f:os.chmod(p,0o600);json.dump(v,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
def main():
 assert os.environ.get('ZARIX_CNF12_DATABASE_PREPARE_CONFIRM')=='parent-released-resume-existing-two-databases'
 os.umask(0o077)
 helper=REPO/'docs/tif/v2.13/evidence/technical-20261015/environment/preserve-six-native-stacks.py'
 assert sha(helper)=='ec952cec38d711a10f2c64dd932c2823c3b2eaff93597dfc91a1e129bff535bb'
 spec=importlib.util.spec_from_file_location('cnf12_owned_native_guards',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 plan=m.load_plan();entry=next(x for x in plan['stacks']if x['name']=='restore');before=m.preflight(plan,entry)
 assert entry['expectedPostgresPort']==55322 and entry['expectedPublicApiPort']==55321
 D.mkdir(mode=0o700,exist_ok=True);assert D.stat().st_mode&0o077==0
 assert not (D/'targets.json').exists() and not (D/'resume-1-reservation.private.json').exists(),'Never overwrite a prior completed/resumed lifecycle'
 initial=json.loads((D/'reservation.private.json').read_text())
 pg=m.pg_environment(entry);assert pg['PGHOST']=='127.0.0.1' and pg['PGPORT']=='55322' and pg['PGDATABASE']=='postgres'
 pg['PGUSER']='supabase_admin'
 bin=pathlib.Path(plan['postgresBin']);counter=200
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

 print(json.dumps({'status':'READONLY_DRIFT_DIAGNOSIS','adminRowsEqual':original_rows==initial['originalRows'],'adminCatalogueEqual':original_catalogue==initial['originalCatalogueSha256'],'adminStorageEqual':original_storage==initial['originalStorageInventory'],'adminRowDriftTables':[k for k in original_rows if original_rows[k]!=initial['originalRows'][k]]}))
 pg['PGUSER']='postgres'
 rows2=all_hashes();cat2=catalogue_hash()
 print(json.dumps({'postgresRowsEqual':rows2==initial['originalRows'],'postgresCatalogueEqual':cat2==initial['originalCatalogueSha256'],'postgresRowDriftTables':[k for k in rows2 if rows2[k]!=initial['originalRows'][k]],'adminAndPostgresRowsEqual':rows2==original_rows,'adminAndPostgresCatalogueEqual':cat2==original_catalogue}))
if __name__=='__main__':main()
