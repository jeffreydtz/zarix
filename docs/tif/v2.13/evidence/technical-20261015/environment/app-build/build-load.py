import datetime, hashlib, json, os, pathlib, shutil, subprocess, sys

root=pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
runtime=pathlib.Path('/tmp/zarix-runtime-20261015')
dest=pathlib.Path('/tmp/zarix-app-load-20261015')
report=json.loads((root/'docs/tif/v2.13/evidence/technical-20261015/core/verification.json').read_text())
assert report['sourceStable'] and report['sourceWorkingTreeClean']
assert next(c for c in report['commands'] if c['name']=='build')['exitCode']==0
assert not dest.exists(), 'Never overwrite an existing test copy'
sources=list(report['sourceManifest'])
known={s['path'] for s in sources}
for file in sorted((root/'public').rglob('*')):
    if file.is_file() and file.relative_to(root).as_posix() not in known:
        sources.append({'path':file.relative_to(root).as_posix(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
sources.sort(key=lambda s:s['path'])
for source in sources:
    assert hashlib.sha256((root/source['path']).read_bytes()).hexdigest()==source['sha256']
frozen={'revision':report['codeRevision'],'sources':sources}
frozen_bytes=(json.dumps(frozen,indent=2)+'\n').encode()
(runtime/'frozen-load-source-manifest.json').write_bytes(frozen_bytes)
def ignore(directory, names):
    ignored=[]
    for name in names:
        if name in ('.git','.next','node_modules','coverage') or name.startswith('.env') and name!='.env.example': ignored.append(name)
    return ignored
shutil.copytree(root,dest,ignore=ignore)
os.symlink(root/'node_modules',dest/'node_modules',target_is_directory=True)
for source in sources:
    assert hashlib.sha256((dest/source['path']).read_bytes()).hexdigest()==source['sha256']
private=runtime/'load-app.env'
assert private.stat().st_mode &0o077==0
env=dict(os.environ)
for line in private.read_text().splitlines():
    if line and not line.startswith('#'):
        key,value=line.split('=',1); env[key]=json.loads(value)
assert env['NEXT_PUBLIC_SUPABASE_URL']=='http://127.0.0.1:56321'
env.update(DEVELOPER_DIR='/Library/Developer/CommandLineTools',NEXT_TELEMETRY_DISABLED='1',TZ='Etc/UTC')
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
began=now()
with open(runtime/'load-build-private.log','wb') as log:
    os.chmod(runtime/'load-build-private.log',0o600)
    status=subprocess.call(['npm','run','build'],cwd=dest,env=env,stdout=log,stderr=log)
ended=now()
proof={'startedAt':began,'finishedAt':ended,'exitCode':status,'sourceManifestSha256':hashlib.sha256(frozen_bytes).hexdigest()}
if status:
    (runtime/'load-build-failure.json').write_text(json.dumps(proof,indent=2)+'\n'); print('LOAD_BUILD_FAILED',flush=True); sys.exit(status)
for source in sources:
    assert hashlib.sha256((dest/source['path']).read_bytes()).hexdigest()==source['sha256']
copied={**frozen,'buildId':(dest/'.next/BUILD_ID').read_text().strip(),'buildProof':proof}
(dest/'copy-source-manifest.json').write_text(json.dumps(copied,indent=2)+'\n')
(runtime/'load-build-proof.json').write_text(json.dumps({k:v for k,v in copied.items() if k!='sources'},indent=2)+'\n')
print(json.dumps({'result':'PASS','sources':len(sources),'revision':frozen['revision'],'buildId':copied['buildId'],'buildProof':proof}),flush=True)
