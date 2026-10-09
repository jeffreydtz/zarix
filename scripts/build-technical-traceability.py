"""Reconcile original 273 technical cases with executed evidence, without upgrading UI claims."""
import csv,json,pathlib,sys,re,datetime
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'docs/tif/v2.13/evidence/technical-20261009'
vitest=json.loads((out/'final-vitest.json').read_text())
assertions=[{**a,'file':r['name']} for r in vitest['testResults'] for a in r.get('assertionResults',[])]
reports={name:json.loads((out/name).read_text()) for name in ['balance-sql.json','shared-sql.json','database-verification.json']}
rows=list(csv.DictReader((root/'docs/tif/v2.13/casos_prueba.csv').open(encoding='utf-8-sig')))
result=[]
oq=['removes only acknowledged items, in order']+[f'retains the queue on HTTP {status} and stops the batch' for status in [400,401,403,408,409,422,429,500,503]]+['retains an unconfirmed item after a connection failure','reports local storage failure after acknowledgment and stops before the next item']
for row in rows:
 id=row['id']; matches=[];evidence='';scope='';blocker=''
 if id.startswith('CB-') and id!='CB-P03':
  matches=[a for a in assertions if re.search(r'(?<![A-Z0-9-])'+re.escape(id)+r'(?![0-9])',a['fullName'])];evidence='final-vitest.json';scope='Exact explicit contract fixture; unit/service doubles, not UI/API acceptance'
 elif id=='CB-P03':
  matches=[r for r in reports['database-verification.json']['results'] if id in r['name']];evidence='database-verification.json';scope='Real isolated PostgreSQL full-close sale, both normal-grant profiles; synthetic Auth fixture'
 elif id.startswith('RTV-'):
  matches=[a for a in assertions if a['file'].endswith(row['unidad_o_componente']) and a['fullName']==row['entrada']];evidence='final-vitest.json';scope='Reexecuted original named unit/service regression; provider/database calls may be doubles'
 elif id.startswith('SQL-'):
  matches=[r for r in reports['balance-sql.json']['results'] if r['id'].split()[0]==id];evidence='balance-sql.json';scope='Minimal-schema real PostgreSQL WASM regression; separate full-schema evidence also supplied'
 elif id.startswith('SGSQL-'):
  name='SH-SQL-'+id.split('-')[1];matches=[r for r in reports['shared-sql.json']['results'] if r['id'].split()[0]==name];evidence='shared-sql.json';scope='Minimal-schema atomic shared-expense SQL regression'
 elif id.startswith('OQ-'):
  name=oq[int(id.split('-')[1])-1];matches=[a for a in assertions if a['file'].endswith('/offline-queue-sync.test.ts') and a['title']==name];evidence='final-vitest.json';scope='Original queue transport/storage-double contract; new IndexedDB-double regressions reported separately'
 else:
  scope='Complete documented integration/system journey remains unexecuted'
  if id=='CNF-02':blocker='No identified month-long authenticated observation series; a short synthetic run cannot establish monthly availability.'
  elif id=='CNF-12':blocker='Full isolated SQL restore passed, but genuine Supabase Auth/Storage files and post-restore browser/API check require a socket-capable test runtime.'
  elif id=='CNF-01':blocker='100 serial SQL microbenchmark observations exist; canonical20 authenticated browser sessions/20Mbps/50ms profile requires a socket-capable runtime.'
  else:blocker='Local socket creation denied (EPERM), including reviewed escalation: genuine Supabase Auth/PostgREST and authenticated browser path unavailable. Related unit/SQL checks do not complete this case.'
  if 'IA' in row['entrada'] or 'OCR' in row['entrada'] or 'Telegram' in row['entrada'] or id in ['CP2-13','CP2-14','CP2-15']:
   blocker+=' Real provider sandbox credentials/configuration are also absent; provider doubles are reported separately.'
  evidence='environment-and-blockers.json; final-vitest.json; database-verification.json'
 status='BLOCKED'
 if matches:
  status='PASS' if all(str(m['status']).lower() in ['pass','passed'] for m in matches) else 'FAIL'
 elif not blocker:
  blocker='No exact executed assertion matched this original case. Do not infer a pass from a neighboring test.'
 result.append({'case_id':id,'use_case':row['cu'].replace('-',''),'requirements':row['requisitos'],'status':status,'scope':scope,'evidence':evidence,'assertions':' | '.join(m.get('fullName',m.get('name',m.get('id',''))) for m in matches),'blocker':blocker})
assert len({r['case_id'] for r in result})==len(rows)
assert {r['use_case'] for r in result}=={'CU001','CU002','CU003','CU004'}
with (out/'case-traceability.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(result[0]));w.writeheader();w.writerows(result)
summary={'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'original_cases':len(rows),'use_cases':sorted({r['use_case'] for r in result}),'counts':{s:sum(r['status']==s for r in result) for s in ['PASS','FAIL','BLOCKED']},'rule':'PASS requires an exact named executed contract assertion. Complete UI/API/system cases stay blocked despite related partial evidence.'}
(out/'traceability-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
