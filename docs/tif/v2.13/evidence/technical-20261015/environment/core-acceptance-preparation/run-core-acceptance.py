"""Prepared private CI5 wrapper. Import does nothing; explicit frozen revision/window required."""
import argparse,datetime,hashlib,json,os,pathlib,re,subprocess,sys
ROOT=pathlib.Path('/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix')
RUNTIME=pathlib.Path('/tmp/zarix-runtime-20261015')
OUT=ROOT/'docs/tif/v2.13/evidence/technical-20261015/core-acceptance'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def values(path):
 assert path.is_file() and path.stat().st_mode&0o077==0,'Expected private0600 environment'
 return dict((k,json.loads(v)) for k,v in (line.split('=',1) for line in path.read_text().splitlines() if line and not line.startswith('#')))
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--revision',required=True);args=parser.parse_args()
 assert re.fullmatch('[0-9a-f]{40}',args.revision)
 assert os.environ.get('ZARIX_CI5_WINDOW_CONFIRM')=='parent-released-core-acceptance','Parent must release RF11/runtime writers, Next consumers of rootnode_modules and source freeze first'
 os.umask(0o077)
 env={k:v for k,v in os.environ.items() if not any(marker in k.upper() for marker in ['SUPABASE','GEMINI','GOOGLE_API_KEY','TELEGRAM','MERCADO','MP_','CRIPTOYA','CRYPTOYA','DOLARAPI','COINGECKO'])}
 env.pop('NODE_OPTIONS',None);env.pop('NODE_PATH',None)
 gitEnv={**env,'DEVELOPER_DIR':'/Library/Developer/CommandLineTools'}
 actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,env=gitEnv,text=True).strip();assert actual==args.revision,'Frozen revision mismatch'
 version=subprocess.check_output(['node','--version'],text=True).strip();assert re.fullmatch(r'v22\..+',version),'Node22 required'
 selected=values(RUNTIME/'contract-clock-app.env');proof=values(RUNTIME/'proof.env')
 assert selected['NEXT_PUBLIC_SUPABASE_URL']==proof['ZARIX_PROOF_SUPABASE_URL']=='http://127.0.0.1:58321'
 assert selected['NEXT_PUBLIC_SUPABASE_ANON_KEY']==proof['ZARIX_PROOF_ANON_KEY']
 assert selected['SUPABASE_SERVICE_ROLE_KEY']==proof['ZARIX_PROOF_SERVICE_ROLE_KEY']
 assert selected['CRON_SECRET']==values(RUNTIME/'e2e-app.env')['CRON_SECRET'] and selected['CRON_SECRET']
 assert selected['TELEGRAM_ADMIN_CHAT_ID']==''
 build=json.loads((RUNTIME/'contract-clock-build-proof.json').read_text());fonts=build['offlineFontFixture'];mock=pathlib.Path(selected['NEXT_FONT_GOOGLE_MOCKED_RESPONSES'])
 assert sha(mock.read_bytes())==fonts['mockSha256'] and len(fonts['fontSha256'])==7
 for name,digest in fonts['fontSha256'].items():assert sha((mock.parent/name).read_bytes())==digest
 guard=ROOT/'scripts/lib/restored-read-fetch-guard.mjs';assert sha(guard.read_bytes())==build['fetchGuardSha256']
 assert not OUT.exists(),'Never overwrite an earlier core phase'
 audit=pathlib.Path('/tmp/zarix-restored-read-fetch-guard-core-acceptance-20261015.jsonl');assert not audit.exists(),'Use fresh trace for this final global phase'
 env.update(selected)
 # Real-time global gates; neither clock nor Gemini runtime preload is installed.
 for key in list(env):
  if key.startswith(('ZARIX_FINAL_CLOCK','ZARIX_FINAL_GEMINI','ZARIX_ACCEPTANCE_RUNTIME_PROFILE')):env.pop(key)
 env.update(DEVELOPER_DIR='/Library/Developer/CommandLineTools',npm_config_cache='/tmp/zarix-npm-cache-20261015',NEXT_TELEMETRY_DISABLED='1',TZ='Etc/UTC',ZARIX_EVIDENCE_DIR=str(OUT),NEXT_PUBLIC_APP_URL='http://127.0.0.1:3000',ZARIX_RESTORE_FETCH_GUARD_LOG=str(audit),UV_THREADPOOL_SIZE='2',NODE_OPTIONS='--max-old-space-size=2048 --import='+str(guard))
 for key in ['CRIPTOYA_API_URL','DOLARAPI_URL','COINGECKO_API_URL']:env[key]='http://127.0.0.1:57910'
 record={'status':'RESERVED_NOT_EXECUTED','revision':args.revision,'node':version,'outputDirectory':str(OUT),'backendOrigin':'http://127.0.0.1:58321','privateEnvironmentSha256':sha((RUNTIME/'contract-clock-app.env').read_bytes()),'fontMockSha256':fonts['mockSha256'],'fontFiles':7,'fetchGuardSha256':sha(guard.read_bytes()),'adminAlertsDisabled':True,'normalWallClock':True,'rootRuntimeWritersReleasedByParent':True,'heapMiBPerProcess':2048,'uvThreadpoolSize':2,'expectedCommandCount':17,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'npmci and all17 standard verification commands. Guard restricts globalfetch only, not npmhttps or universal network. No nativeSQL or newAuth fixtures are added by this wrapper; local/synthetic harnesses in standard runner retain their declared scopes. Existing local cron/service values never printed.'}
 checkpoint=RUNTIME/'core-acceptance-wrapper.private.json'
 with checkpoint.open('x') as f:json.dump(record,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 result=subprocess.call(['node','scripts/run-technical-verification.mjs'],cwd=ROOT,env=env)
 record.update(status='COMMANDS_FINISHED',runnerExitCode=result,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
 assets=[];matches={'SUPABASE_SERVICE_ROLE_KEY':[],'CRON_SECRET':[]}
 for path in sorted((ROOT/'.next/static').rglob('*')):
  if not path.is_file():continue
  raw=path.read_bytes();rel=str(path.relative_to(ROOT));assets.append({'path':rel,'sha256':sha(raw),'bytes':len(raw)})
  for label in matches:
   if selected[label].encode() in raw:matches[label].append(rel)
 assert assets,'No browser build assets to scan'
 report={'status':'PASS' if not any(matches.values()) else 'FAIL','exactMatchCounts':{key:len(paths) for key,paths in matches.items()},'matchingAssetPaths':matches,'assetFiles':len(assets),'assetManifestSha256':sha(json.dumps(assets,separators=(',',':')).encode()),'buildId':(ROOT/'.next/BUILD_ID').read_text().strip(),'revision':args.revision,'scope':'Exact full service-role and local CRON_SECRET comparisons only against every .next/static file; anon key is public config and intentionally excluded. No bundles/dumps/raw credential values published; no encoded/transformed/universal absence claim.'}
 (RUNTIME/'core-acceptance-browser-assets-manifest.private.json').write_text(json.dumps(assets,indent=2)+'\n')
 (OUT/'browser-secret-scan.json').write_text(json.dumps(report,indent=2)+'\n')
 record['browserSecretScan']=report
 checkpoint.write_text(json.dumps(record,indent=2)+'\n')
 print(json.dumps({'wrapperStatus':record['status'],'runnerExitCode':result,'browserSecretScan':report['status'],'exactMatches':report['exactMatchCounts'],'outputDirectory':str(OUT)}))
 return result if result else (0 if report['status']=='PASS' else 1)
if __name__=='__main__':sys.exit(main())
