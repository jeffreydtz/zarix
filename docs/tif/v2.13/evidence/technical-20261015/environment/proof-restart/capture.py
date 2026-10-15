import datetime,hashlib,json,os,pathlib,subprocess,sys,urllib.parse
root=pathlib.Path('/tmp/zarix-runtime-20261015')
private=root/'proof-restart-private'
mode=sys.argv[1]
assert mode in ('before','after')
def sha(data):return hashlib.sha256(data).hexdigest()
def readjson(path):return json.loads(path.read_text())
values={}
for line in (root/'proof.env').read_text().splitlines():
 if '=' in line:
  k,v=line.split('=',1);values[k]=json.loads(v)
url=urllib.parse.urlsplit(values['ZARIX_PROOF_DATABASE_URL'])
assert url.scheme in ('postgres','postgresql') and url.hostname=='127.0.0.1' and url.port==58322 and url.path=='/postgres'
assert values['ZARIX_PROOF_SUPABASE_URL']=='http://127.0.0.1:58321'
start=readjson(root/'proof-start.json')
manifest=readjson(root/'proof-private/preparation.json')
stackid=manifest['target']['stackId']
assert start['id']==stackid
stackpath=root/'home/stacks'/stackid
state=readjson(stackpath/'state.json')
assert state['id']==stackid and pathlib.Path(state['identity']['projectRoot']).resolve()==(root/'proof').resolve()
assert state['runtime']=='native'
assert start['env']['API_URL']=='http://127.0.0.1:58321'
assert urllib.parse.urlsplit(start['env']['DB_URL']).port==58322
ids={v['creation']['service']:v['id'] for v in state['instances']}
assert set(ids)=={'database','rest','auth','storage'}
pg=pathlib.Path(values['ZARIX_PG_BIN'])
env=os.environ.copy();env.update(PGHOST=url.hostname,PGPORT=str(url.port),PGUSER=urllib.parse.unquote(url.username or ''),PGPASSWORD=urllib.parse.unquote(url.password or ''),PGDATABASE='postgres',PGCONNECT_TIMEOUT='5',PGSSLMODE='disable',PGOPTIONS='-c default_transaction_read_only=on')
def psql(query):
 p=subprocess.run([str(pg/'psql'),'-X','-A','-t','-c',query],env=env,capture_output=True,text=True)
 if p.returncode:
  path=private/(mode+'-capture.stderr');path.write_text(p.stderr);os.chmod(path,0o600)
  raise RuntimeError('psql capture failed; private stderr saved')
 return p.stdout.strip()
login=readjson(root/'proof-logins.json')
actual=json.loads(psql("SELECT json_agg(id::text ORDER BY id::text) FROM auth.users"))
expected=sorted(row['id'] for row in login['users'])
assert actual==expected and len(actual)==2
meta=json.loads(psql("SELECT json_build_object('postmasterStartTime',pg_postmaster_start_time(),'dataDirectory',current_setting('data_directory'),'version',current_setting('server_version'),'users',(SELECT count(*) FROM auth.users),'storageObjects',(SELECT count(*) FROM storage.objects))"))
assert meta['users']==2 and meta['storageObjects']==0
expecteddata=stackpath/'data'/ids['database']/'data'
assert pathlib.Path(meta['dataDirectory']).resolve()==expecteddata.resolve()
meta['postmasterPid']=int((expecteddata/'postmaster.pid').read_text().splitlines()[0])
meta.pop('dataDirectory')
tables=json.loads(psql("SELECT json_agg(json_build_object('schema',schemaname,'table',tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname IN ('public','auth','storage')"))
rows=[]
def ident(s):return '"'+s.replace('"','""')+'"'
for table in tables:
 qualified=ident(table['schema'])+'.'+ident(table['table'])
 row=json.loads(psql("SELECT json_build_object('count',count(*),'canonicalRowsMd5',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''))) FROM "+qualified+' t'))
 rows.append({**table,**row})
dump=subprocess.run([str(pg/'pg_dump'),'--schema-only','--no-password'],env=env,capture_output=True)
assert dump.returncode==0
normalized=b'\n'.join(line for line in dump.stdout.splitlines() if not line.startswith((b'\\restrict ',b'\\unrestrict ')))+b'\n'
privatepath=private/(mode+'-schema.sql');privatepath.write_bytes(normalized);os.chmod(privatepath,0o600)
other={}
for name in ('source','restore','load','e2e','import-target'):
 s=readjson(root/(name+'-start.json'))
 other[name]={'id':s['id'],'stateSha256':sha((root/'home/stacks'/s['id']/'state.json').read_bytes())}
report={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':mode,'stackId':stackid,'projectRoot':'/tmp/zarix-runtime-20261015/proof','publicApi':'http://127.0.0.1:58321','postgresHost':'127.0.0.1','postgresPort':58322,'database':'postgres','guardResults':{'exactLoopbackEndpoints':True,'manifestStartAndStateIdentityMatch':True,'datadirMatchesE2eInstance':True,'authUserIdsExactlyMatchPrivateE2eLogins':True,'authUserCount':2,'storageObjectCount':0,'onlyExpectedFourServiceKinds':True},'postgres':meta,'instanceIds':ids,'schemaSha256':sha(normalized),'tableRows':rows,'credentialsSha256':sha(json.dumps(state['credentials'],sort_keys=True,separators=(',',':')).encode()),'serviceConfigurationSha256':sha(json.dumps([v['creation'] for v in state['instances']],sort_keys=True,separators=(',',':')).encode()),'privateEnvFileSha256':sha((root/'proof.env').read_bytes()),'privateLoginFileSha256':sha((root/'proof-logins.json').read_bytes()),'projectConfigSha256':sha((root/'proof/supabase/config.toml').read_bytes()),'otherStackStateFiles':other,'fingerprintAlgorithm':'per table count and md5 of ordered canonical PostgreSQL JSONB row text; schema pg_dump SHA256 after removing random restrict tokens','secretsIncluded':False}

if mode=='before':
 dump_path=private/'before-full.dump'
 with dump_path.open('xb') as fd:
  result=subprocess.run([str(pg/'pg_dump'),'--format=custom','--no-password'],env=env,stdout=fd,stderr=subprocess.PIPE)
 assert result.returncode==0, 'Private full dump failed'
 os.chmod(dump_path,0o600)
 toc=subprocess.run([str(pg/'pg_restore'),'--list',str(dump_path)],capture_output=True)
 assert toc.returncode==0
 (private/'before-full.toc.private').write_bytes(toc.stdout);os.chmod(private/'before-full.toc.private',0o600)
 report['privateFullDump']={'sha256':sha(dump_path.read_bytes()),'bytes':dump_path.stat().st_size,'archiveTocReadable':True,'restoreExecuted':False}
path=private/(mode+'-restart-snapshot.json');path.write_text(json.dumps(report,indent=2)+'\n');os.chmod(path,0o600)
print(json.dumps({'phase':mode,'guardResults':report['guardResults'],'postmaster':meta,'tableCount':len(rows),'publicTables':sum(t['schema']=='public' for t in rows),'snapshotPath':str(path),'schemaSha256':report['schemaSha256']}))
