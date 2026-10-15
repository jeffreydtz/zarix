"""Rebuild scoped documentation from public reports; never changes the original cases."""
from pathlib import Path
import csv, datetime, hashlib, json, runpy
OUT = Path(__file__).resolve().parent
BASE = OUT.parent
ROOT = OUT.parents[5]
runpy.run_path(str(OUT/'reconcile-blocker-reasons.py'),run_name='__main__')
rows, inputs = [], {}
def read(rel):
    file = BASE / rel
    if not file.exists(): return None
    raw = file.read_bytes()
    inputs[rel] = {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
    return json.loads(raw)
def add(key, status, proved, scope, evidence='', assertions='', revision='', blocker='', cu='CU001–CU004', implemented=None):
    if implemented is None:
        implemented = ('Fuente/fixture probado sólo dentro del alcance citado' if status == 'PASS'
                       else 'Corrección compatible pendiente' if key == 'CORE-DEPENDENCY-AUDIT'
                       else 'Preparado parcialmente; implementación integral no acreditada')
    rows.append(dict(check_id=key,use_cases=cu,status=status,implemented=implemented,proved=proved,scope=scope,evidence=evidence,assertions=assertions,evidence_revision=revision,blocker=blocker,original_contract_promotion='NONE: alcance técnico separado; contrato original exige aserción exacta'))
native = read('native-full/native-verification.json')
assert native['status'] == 'PASS' and native['passed'] == len(native['results']) == 22
for index, item in enumerate(native['results'], 1):
    add(f'NATIVE-{index:02}',item['status'],'Grupo real Auth/PostgREST/PostgreSQL17.11',json.dumps(item.get('evidence',{}),ensure_ascii=False),'../native-full/native-verification.json',item['name'],native.get('sourceRevision',''))
read('native-full/manifest.json')
at_rest = read('environment/at-rest.json')
if at_rest:
    add('LOCAL-AT-REST','PASS' if at_rest.get('status') == 'PASS_LOCAL_VOLUME_ENCRYPTION_OBSERVED' else 'BLOCKED',
        at_rest.get('status','Sin resultado'),json.dumps(at_rest.get('scope',{}),ensure_ascii=False),
        '../environment/at-rest.json',implemented='FileVault/configuración del volumen local observados; no garantía de despliegue remoto')
for rel,key,proved,scope in [
 ('account-recompute/account-recompute-pglite.json','RECOMPUTE-SQL','18/18 grupos PASS','PGlite18.3 y roles/GUC sintéticos; no Auth/concurrencia nativa'),
 ('account-recompute/account-recompute-native.json','RECOMPUTE-NATIVE','7/7 grupos PASS','E2E57321/57322; Auth normal/servicio, precisión/rollback y locks de conexiones independientes'),
 ('account-recompute/account-recompute-types.json','RECOMPUTE-TYPES','27tablas/30funciones','Tipos CLI sobre public; modelos manuales de presentación no son catálogo exhaustivo'),
 ('account-recompute/account-recompute-advisors.json','RECOMPUTE-ADVISORS','RPCnueva0hallazgos; catálogo61INFO/31WARN/0ERROR','PASS sólo nueva RPC; advertencias restantes preservadas'),
 ('documented-gaps/manifest.json','FX-PAGINATION-FOCALS','55/55 Vitest y typecheck/lint0','Dobles explícitos; no recorridos UI/API completos'),
 ('offline-durability/quick-create-late-completion/verification.json','QUICK-CREATE-FOCALS','42/42 focales y76/76 reejecutadas','Dobles React/Auth/HTTP/IndexedDB; no sumar corridas solapadas'),
 ('e2e/setup/normal-auth-users-and-guest.json','E2E-FIXTURE','2usuarios normales nuevos y capacidad invitado','Setup aislado; no aprobación de recorridos'),
 ('load/setup/canonical-load.json','LOAD-FIXTURE','Por identidad10cuentas/5000movimientos/100posiciones; 2identidades','Setup/oráculos SQL; no latencia de navegador')]:
    item=read(rel)
    if not item: status='BLOCKED'
    elif rel=='documented-gaps/manifest.json': status='PASS' if item['sourceStable'] and item['results']['focusedVitest']['failed']==0 else 'FAIL'
    else: status=item.get('status','BLOCKED')
    add(key,status,proved if item else 'Sin informe actual',scope,'../'+rel if item else '',revision=(item or {}).get('revision',(item or {}).get('baseRevision','')),blocker='' if item else 'Informe actual faltante')
quotes=read('public-quote-providers.json')
for item in quotes['checks']:
    add('PUBLIC-QUOTE-'+item['provider'].upper(),item['status'],'GET públicoHTTP'+str(item['httpStatus']),item['scope'],'../public-quote-providers.json',item['provider']+' JSON/schema/hash observado')
core=read('core/verification.json')
core_final=read('core-final/verification.json')
core_responsive=read('core-responsive/verification.json')
core_reliability=read('core-reliability/verification.json')
core_acceptance=read('core-acceptance/verification.json')
core_closure=read('core-closure/verification.json')
for prefix in ['core','core-final','core-responsive','core-reliability','core-acceptance','core-closure']:
    for name in ['final-vitest','coverage-summary','dependency-audit','balance-sql','shared-sql',
                 'plan-sql','durable-sql','import-sql','account-recompute-sql','database-verification']:
        read(prefix+'/'+name+'.json')
for rel in ['dependencies/metadata.json','review/source-manifest-final.json','review/source-manifest-global2.json']:
    read(rel)
for label, report, prefix in [('PHASE1',core,'core'),('PHASE2',core_final,'core-final'),('PHASE3',core_responsive,'core-responsive'),('PHASE4',core_reliability,'core-reliability'),('PHASE5',core_acceptance,'core-acceptance'),('PHASE6',core_closure,'core-closure')]:
    if report:
        for command in report['commands']:
            scope=report['buildEnvironment'] if command['name']=='build' else 'Comando global de fase identificada; no sustituye aceptación UI/proveedor'
            if label=='PHASE5' and command['name']=='dependency-audit':scope='Consulta audit inicial falló sinmetadata; no trasplantar conteos previos. Reconsultaactual en dependencies/ci5-current separada. '+scope
            if label=='PHASE1':scope='Fase b456 anterior al defecto HTTP derivado; preservada. '+scope
            add('CORE-'+label+'-'+command['name'].upper(),command['status'],'exitCode='+str(command.get('exitCode')),scope,'../'+prefix+'/verification.json',' '.join(command.get('command',[])),report.get('codeRevision',''),blocker='' if command['status']=='PASS' else 'Ver comando/log de esta fase')
if not core_final:
    add('GLOBAL2-FINAL','BLOCKED','Corrida final posterior al fix HTTP pendiente','npmci/typecheck/lint/coverage/testdb/build/audit sobre nuevo freeze exacto',blocker='Preservar core/ anterior; esperar core-final/ y seleccionar --core-dir core-final')
if not core_responsive:
    add('GLOBAL3-RESPONSIVE','BLOCKED','CI3 posterior al ajuste responsive pendiente',
        'Preservar GLOBAL1/GLOBAL2; no atribuir sus tests al ajuste posterior',blocker='Esperar core-responsive/ completo')
for key,pattern,scope in [
 ('API-FOUR-CU','e2e/api/api-verification.json','API→DB con sesiones normales; no UI ni contrato CP integral'),
 ('API-REPLAY-AFTER-RESTART','e2e/api-replay-after-restart/api-verification.json','Recibo anterior repetido tras reinicios separados Next y stackE2E/PG; normalAuth y un efecto/hash/saldo conservados; no browser'),
 ('CHROME-FOUR-CU','e2e/ui/e2e-verification.json','CU001movimientos/CU002cuentas/CU003análisis/CU004inversiones; cobertura parcial declarada'),
 ('SAFARI-READ','e2e/**/browser-read-verification.json','Safari real lectura parcial; no suiteCP integral ni matriz4navegadores')]:
    candidates=list(BASE.glob(pattern))
    if not candidates: add(key,'BLOCKED','Informe final pendiente',scope,blocker='No inferir browser/DB real a partir de foci/setup')
    else:
        for file in candidates:
            rel=str(file.relative_to(BASE)); item=read(rel); status=item.get('status','BLOCKED')
            scoped=item.get('cases',item.get('results',[]))
            if status=='PARTIAL' and scoped and all(result.get('status')=='PASS' for result in scoped):status='PASS'
            if status not in ['PASS','FAIL','BLOCKED']: status='BLOCKED'
            add(key,status,'Resultado del informe: '+str(item.get('status'))+'; grupos acotados='+str(len(scoped)),scope+'; PASS sólo del alcance declarado, originales completos permanecen BLOCKED','../'+rel,revision=item.get('revision',''),blocker='Lectura parcial no cierra contrato original' if key=='SAFARI-READ' else '')
            for number,result in enumerate(scoped,1):
                value=result.get('status','BLOCKED');value=value if value in ['PASS','FAIL','BLOCKED'] else 'BLOCKED'
                add(key+'-'+str(number),value,'Grupo acotado ejecutado',result.get('coverage',scope),'../'+rel,result.get('name',''),item.get('revision',''),cu=result.get('cu','CU001–CU004'))
offline_rel='offline-durability/browser-real-20261015-02/composite-verification.json'
offline=read(offline_rel)
if offline:
    matrix=offline.get('matrix',[])
    passed=(len(matrix)==4 and all(item.get('status')=='PASS' for item in matrix)
            and offline.get('sourceContinuity',{}).get('applicationManifestUnchanged') is True)
    add('OFFLINE-CHROME-COMPOSITE','PASS' if passed else 'BLOCKED',offline['scopedOutcome'],
        'Resultado general PARTIAL; cuatro comprobaciones CU001/CU002 únicamente. Chrome y Next reiniciados de verdad; no PG ni máquina. Resume FAIL selector y final source guard no alcanzado se conservan',
        '../'+offline_rel,revision=offline.get('originalRevision',''),cu='CU001;CU002')
    for number,item in enumerate(matrix,1):
        report_rel=str(Path(offline_rel).parent/item['evidence']);read(report_rel)
        add('OFFLINE-CHROME-CHECK-'+str(number),item['status'],'Comprobación Chrome/UI→API→DB nativa acotada',
            item.get('scope','IndexedDB/recibo/saldo y proceso real según fase citada'),
            '../'+report_rel,item['check'],offline.get('originalRevision','') if item['cu']=='CU001' else offline.get('identityRevision',''),cu=item['cu'])
    for number,item in enumerate(offline.get('historicalFailures',[]),1):
        report_rel=str(Path(offline_rel).parent/item['report']);read(report_rel)
        add('OFFLINE-HISTORICAL-FAILURE-'+str(number),'BLOCKED' if 'BLOCKED executor' in item['classification'] else 'FAIL',
            'Reporte original '+item['originalStatus']+' conservado',item['classification'],
            '../'+report_rel,cu='CU001;CU002')
    read('offline-durability/browser-real-20261015-02/post-run-auth-and-cleanup.json')
else:
    add('OFFLINE-CHROME-COMPOSITE','BLOCKED','Informe compuesto actual pendiente',
        'IndexedDB/reaperturaChrome/pérdidarespuesta/reinicio aplicación; no inferir desde foci',blocker='Sin informe compuesto actual')
for file in sorted(BASE.glob('e2e/ui-*/e2e-verification.json')):
    rel=str(file.relative_to(BASE));item=read(rel);status=item.get('status','BLOCKED')
    add('HISTORICAL-'+file.parent.name.upper(),status if status in ['PASS','FAIL','BLOCKED'] else 'BLOCKED',
        'Intento previo conservado; no clasificar automáticamente como defecto de producto',
        'Fase/harness previo separado. La causa debe leerse en el informe y README E2E, sin borrar observaciones',
        '../'+rel,revision=item.get('revision',''))
binding=read('e2e/ui/build-binding.json')
read('consolidated/blocked-contract-reasons.json')
read('e2e/browser-preflight/current-user-browser-steering.json')
reviewed_system=read('review/verified-system-case-results.json')
accepted_system=read('system-case-results.json')
if accepted_system:
    for item in accepted_system:
        assert item.get('complete_original_contract') is True and item.get('assertions')
        add('ORIGINAL-'+item['case_id'],item['status'],'Contrato original completo reconciliado con evidencia ejecutada',
            item['scope'],'; '.join('../'+reference.strip() for reference in item['evidence'].split(';'))+'; ../system-case-results.json',
            ' | '.join(item['assertions']),json.dumps(item.get('executed_revision',{}),ensure_ascii=False),
            cu={'CP1':'CU001','CP2':'CU002','CP3':'CU003','CP4':'CU004'}.get(item['case_id'].split('-')[0],'CU001–CU004'))
        rows[-1]['original_contract_promotion']='EXPLICIT: original execution coverage and independently reviewed status; no acceptance PASS inferred from the complete flag'
security=read('security-matrix/review-reconciliation-before-http-fix.json')
if security:
    add('SECURITY-MATRIX-BEFORE-HTTP-FIX',security['status'],json.dumps(security['counts']),
        security['scope']+'; tres HTTP500 derivados son FAIL ejecutados, seis celdas sin requisito/oráculo completo quedan BLOCKED',
        '../security-matrix/review-reconciliation-before-http-fix.json')
    add('SECURITY-FACTS-INTEGRITY-BEFORE','PASS' if security.get('snapshotIntegrity') else 'FAIL',
        'snapshotIntegrity='+str(security.get('snapshotIntegrity')),
        'Integridad financiera de B separada del contrato HTTP; no cambia el FAIL de respuesta500',
        '../security-matrix/review-reconciliation-before-http-fix.json')
http_fix=read('review/http-contracts/verification.json')
if http_fix:
    add('HTTP-ERROR-FOCALS-AFTER','PASS' if http_fix['after']['failed']==0 else 'FAIL',
        str(http_fix['after']['passed'])+'/'+str(http_fix['after']['total'])+' focales',
        'Handlers/servicios reales con dobles Auth/DB/proveedor; no sustituye el retest nativo de tres rutas sobre build nuevo',
        '../review/http-contracts/verification.json',revision=http_fix.get('fixCommit',''))
    http_native=read('security-matrix/foreign-updates-corrected.json')
    if http_native:
        passed=(http_native.get('sourceStable') is True and len(http_native.get('results',[]))==3
                and all(item.get('status')=='PASS' and item.get('httpStatus')==404
                        and item.get('bSnapshotUnchanged') is True for item in http_native['results']))
        add('HTTP-FOREIGN-UUID-NATIVE-RETEST','PASS' if passed else 'FAIL',
            'Tres UPDATE ajenos válidos HTTP404 y snapshots completos B intactos',
            http_native['scope'],'../security-matrix/foreign-updates-corrected.json',
            revision=http_native.get('revision',''))
    else:
        add('HTTP-FOREIGN-UUID-NATIVE-RETEST','BLOCKED','Retest final todavía no registrado',
            'Tres rutas UPDATE antes500, después deben tener rechazoHTTPcontrolado y datosBintactos',
            blocker='Esperar build nuevo y archivo final de la repetición normal Auth→API→DB')
composite=read('security-matrix/cp2-19-composite.json')
if composite:
    add('SECURITY-MATRIX-COMPOSITE',composite['status'],json.dumps(composite['counts']),
        composite['executionScope']+'; 48 celdas únicas, seis límites explícitos; no otra corrida completa final',
        '../security-matrix/cp2-19-composite.json',revision=composite.get('targetedUpdateRevision',''),
        blocker=json.dumps(composite.get('blockers',[]),ensure_ascii=False),cu='CU002')
restart=read('environment/e2e-stack-restart.json')
if restart:
    add('E2E-OFFICIAL-STACK-RESTART',restart['status'],
        str(len(restart['comparison']['checks']))+' comparaciones; 64 tablas y esquema/ACL/claves conservados; PID/startTime distintos',
        restart['scope']+'; login/getUser normal posterior y local signout de nueva sesión. No fallo de host ni pérdida de energía',
        '../environment/e2e-stack-restart.json')
inspection=read('environment/native-lifecycle-inspection.json')
if inspection:
    add('NATIVE-NETWORK-BINDING','BLOCKED','Gateway público loopback; listener REST interno wildcard observado',
        'CLI2.120.0 no expone serverHost/env adicional; launcher no hereda PGRST_SERVER_HOST. Sin cambio de binarios/state/firewall',
        '../environment/native-lifecycle-inspection.json',
        blocker='No aislamiento LAN comprobado ni ajuste soportado del CLI para restringir el REST interno del stack existente')
for file in sorted(BASE.glob('e2e/visual-attempt-*/visual-verification.json')):
    rel=str(file.relative_to(BASE));visual=read(rel);cells=visual.get('cells',[])
    summary={status:sum(cell.get('status')==status for cell in cells) for status in ('PASS','FAIL','BLOCKED')}
    key='VISUAL-'+file.parent.name.upper()
    add(key,visual['status'],json.dumps(summary),visual['scope']+'; intento anterior al ajuste responsive, no retest del build posterior',
        '../'+rel,revision=visual.get('revision',''))
    for cell in cells:
        vp=cell['viewport'];suffix=cell['cu']+'-'+str(vp['width'])+'X'+str(vp['height'])+'-ZOOM'+str(cell['zoomPercent'])
        add(key+'-'+suffix,cell['status'],'Celda Chrome acotada ejecutada',
            json.dumps({'actions':cell.get('actions',[]),'metrics':cell.get('metrics',{})},ensure_ascii=False),
            '../'+rel,revision=visual.get('revision',''),cu=cell['cu'])
calibration=read('e2e/capture-calibration/calibration.json')
if calibration:
    add('VISUAL-BITMAP-CALIBRATION','BLOCKED','16 bitmap200 anteriores limitados; DOM/viewport medidos por separado',
        'El recorte de fullPage a200% pertenece al compositor de capturas; no se usa para negar o aprobar geometría DOM. Retest de captura corregida pendiente',
        '../e2e/capture-calibration/calibration.json',blocker='Ver alcance/calibración y futuras capturas finales')
visual_final=read('e2e/visual/visual-verification.json')
if visual_final:
    cells=visual_final.get('cells',[])
    summary={status:sum(cell.get('status')==status for cell in cells) for status in ('PASS','FAIL','BLOCKED')}
    status=visual_final['status']
    if status=='PARTIAL':
        status='PASS' if len(cells)==32 and summary['PASS']==32 and visual_final.get('sourceStable') is True and visual_final.get('financeIntegrity',{}).get('status')=='PASS' else 'BLOCKED'
    add('VISUAL-AFTER-RESPONSIVE',status,'Resultado general '+visual_final['status']+'; '+json.dumps(summary),visual_final['scope'],
        '../e2e/visual/visual-verification.json',revision=visual_final.get('revision',''))
    for cell in cells:
        vp=cell['viewport'];suffix=cell['cu']+'-'+str(vp['width'])+'X'+str(vp['height'])+'-ZOOM'+str(cell['zoomPercent'])
        add('VISUAL-AFTER-'+suffix,cell['status'],'Celda Chrome acotada después del ajuste responsive',
            json.dumps({'actions':cell.get('actions',[]),'metrics':cell.get('metrics',{})},ensure_ascii=False),
            '../e2e/visual/visual-verification.json',revision=visual_final.get('revision',''),cu=cell['cu'])
else:
    add('VISUAL-AFTER-RESPONSIVE','BLOCKED','32celdas/40capturas finales pendientes',
        'Esperar build CI3 y corrección de captura separada; no heredar28PASS4FAIL anteriores',blocker='Sin informe visual posterior actual')
loads=list(BASE.glob('load/**/browser-load.json'))
for rel in ['load/browser-attempt-1-interrupted/interruption.json','load/browser-attempt-1-interrupted/cleanup.json',
            'environment/load-native-log-aggregate.json','review/visual-responsive-20-review.json',
            'review/visual-responsive-cu001-cu003-review.json']:
    read(rel)
if loads:
    for file in loads:
        rel=str(file.relative_to(BASE)); item=read(rel)
        for name,profile in item['profiles'].items():
            observations=profile.get('observations',[])
            observed={value:sum(entry.get('status')==value for entry in observations) for value in ['PASS','FAIL','BLOCKED']}
            status=profile.get('status','BLOCKED')
            if observed['FAIL']:status='FAIL'
            elif status not in ['PASS','FAIL','BLOCKED']:status='BLOCKED'
            add('LOAD-'+name.upper(),status,json.dumps({'rawStatus':profile.get('status'),'observations':len(observations),'counts':observed,'summary':profile.get('summary',{})},ensure_ascii=False),
                'Perfil local; denominadores separados/Chrome20contextos/CDP20Mbps50ms por target. RUNNING crudo conservado; cualquier FAIL observado permanece FAIL incluso si se interrumpió el resto',
                '../'+rel,revision=item.get('revision',''),blocker=profile.get('reason',''))
            planned=profile.get('scheduledObservations',0)
            if planned and len(observations)<planned:
                add('LOAD-'+name.upper()+'-UNOBSERVED','BLOCKED',str(planned-len(observations))+' observaciones programadas no ejecutadas',
                    'Interrupción del perfil separada de las observaciones FAIL ya conservadas','../'+rel,blocker='Sin datos; no imputar PASS ni FAIL a las observaciones ausentes')
else:
    for name in ['WARM','COLD','OUTAGE']: add('LOAD-'+name,'BLOCKED','Perfil final pendiente','100observaciones/20contextos/CDP20Mbps50ms por target; freshNode solamente en cold; proveedoresdobles en outage',blocker='No informe final de perfil')
# Scoped restore functioning is executed; it does not replace nominal CNF12.
restored=read('restored-ui/restored-ui-read.json')
if restored:
    for item in restored.get('cases',[]):
        add('RESTORED-UI-'+item['cu'],item['status'],'Lectura normal UI→API→SQL restaurados',
            item['scope']+'; ocho FX auxiliares sintéticas posteriores al restore declaradas, sin mutación financiera',
            '../restored-ui/restored-ui-read.json',json.dumps(item.get('evidence',{}),ensure_ascii=False),
            restored.get('buildBinding',{}).get('revision',''),cu=item['cu'])
    for rel in ['restored-ui/manifest.json','restored-ui/screenshot-review.json','restored-ui/next-cleanup.json']:
        read(rel)
for folder in ['fresh-proof','import-target']:
    prep=read(folder+'/preparation.json')
    if prep:
        add(folder.upper()+'-PREPARATION','PASS' if prep.get('status')=='PASS_PREPARED' else 'FAIL',
            'Dos grupos de preparación; dos identidades clonadas sin sesiones; 12tablas financieras vacías inicialmente',
            prep['scope']+'; Free/Premium administrativos de prueba, sin proveedor de cobro',
            '../'+folder+'/preparation.json')
    build=read(folder+'/build-proof.json')
    if build:
        add(folder.upper()+'-BUILD','PASS' if build.get('exitCode')==0 else 'FAIL',
            str(build.get('sourceCount'))+'fuentes; build'+str(build.get('buildId')),
            'Copia CI4 independiente, dependencias existentes/Inter7offline/guardglobalfetchloopback; no firewall ni todoTCP',
            '../'+folder+'/build-proof.json',revision=build.get('revision',''))
for rel,key in [('fresh-proof/auth-expiry.json','PROOF-AUTH-EXPIRY'),('fresh-proof/auth-recovery.json','PROOF-AUTH-RECOVERY'),
                ('fresh-proof/auth-negative-contract/verification.json','PROOF-CP2-09-NEGATIVE')]:
    report=read(rel)
    if report:
        status='FAIL' if report.get('status')=='FAIL' else 'PASS' if report.get('status','').startswith('PASS_SCOPED_') else 'BLOCKED'
        for number,item in enumerate(report.get('checks',[]),1):
            add(key+'-'+str(number),item['status'],'Comprobación Auth de alcance declarado',report['scope'],
                '../'+rel,item['name'],cu='CU002')
        add(key,status,'Resultado general '+report['status'],report['scope'],'../'+rel,cu='CU002')
for rel in ['fresh-proof/auth-expiry-attempt-1/verification.json','fresh-proof/auth-expiry-attempt-2/verification.json']:
    prior=read(rel)
    if prior:
        add('HISTORICAL-'+rel.split('/')[1].upper(),'FAIL','FAIL original del arnés preservado',
            'Oráculo incorrecto anterior: Auth/session revocada o ventana exp+2dentro skew30s; no convertir en fallo de producto',
            '../'+rel,cu='CU002')
for profile in ['real','fallback-real']:
    rel='public-quotes/'+profile+'/public-quotes.json';quotes=read(rel)
    if quotes:
        add('PUBLIC-QUOTES-APP-'+profile.upper(),quotes['status'],'HTTP'+str(quotes.get('httpStatus'))+'; FXnuevas'+str(quotes.get('newPublicFxRows')),
            quotes['scope']+'; posible NextDataCache, no socket externo nuevo garantizado por respuesta ni SLO proveedor',
            '../'+rel,revision=quotes.get('revision',''))


fifth_restart=read('environment/proof-stack-restart.json')
if fifth_restart:
    ok=(len(fifth_restart['comparisons'])==11 and all(fifth_restart['comparisons'].values()) and len(fifth_restart['after']['tableRows'])==64)
    add('PROOF-STACK-RESTART','PASS' if ok else 'FAIL','11comparaciones;64tablas; PostgreSQL48287→98670; Next52579→99286',
        fifth_restart['scope']+' Otros5statefiles únicamente; dump privadoTOClegible no nueva restauración; replayAuth en informe separado.',
        '../environment/proof-stack-restart.json',revision='836fd18b310a51cced9074b372a80ce5d7e1a870')
clock=read('acceptance-final/intermediate-clock-executed/verification.json')
if clock:
    add('CLOCK-INTERMEDIATE-READINESS','PASS' if clock['status']=='PASS_PREPARATION_AND_SCOPED_RUNTIME_READINESS' else 'FAIL',
        'BuildaqWYS/copia836;Next1822;2controlesAuthreal+API200;135assetsservice/cron0matches',
        clock['scope']+' SóloDateNext06Oct12Z; GoTrue/OS/runner reales.21modelo+11fixture no se suman862Vitest; Gemini cálculo aún no ejecutado por estecontrolador.',
        '../acceptance-final/intermediate-clock-executed/verification.json',revision='836fd18b310a51cced9074b372a80ce5d7e1a870')
clock_fail=read('acceptance-final/attempt-1-clock-preload-failure/sanitized-diagnosis.json')
if clock_fail:
    add('CLOCK-SHIM-ATTEMPT1','FAIL','HTTP500HTML en dos controles; Date.parse no es función',
        'Fallo del shim del arnés: Next15 copia descriptores propios y heredados parse/UTC se perdían. Preload corregido+misma copia/build; código original preservado porSHA, no defecto de producto.',
        '../acceptance-final/attempt-1-clock-preload-failure/sanitized-diagnosis.json')
restart_review=read('investment-contracts/independent-restart-review.json')
if restart_review:
    add('INVESTMENT-REAL-RESTART-REPLAY','PASS' if restart_review['status']=='PASS_FOR_DERIVED_RESTART_REPLAY' else 'BLOCKED',
        'Replaydurable40aserciones; comparación11nativa revisada aparte',
        restart_review['scope']+' Derivado separado de originales y de carga: mismo recibo/efecto/posición tras reinicio realPG+Next, mismoBUILD836.',
        '../investment-contracts/independent-restart-review.json',revision='836fd18b310a51cced9074b372a80ce5d7e1a870',cu='CU004')


final_copy=read('acceptance-final/final-clock-executed/final-proof-build-proof.json')
final_auth=read('acceptance-final/final-clock-executed/final-proof-clock-auth-ready.json')
if final_copy and final_auth:
    scan=final_copy['browserAssetSecretScan'];ok=final_copy['exitCode']==0 and scan['status']=='PASS' and final_auth['status']=='PASS_SCOPED_READINESS'
    add('CI5-FINAL-COPY-READINESS','PASS' if ok else 'FAIL','480fuentes/build'+final_copy['buildId']+';2Authnormal/API200;135assetsservice/cron0',
        final_auth['scope']+' CopyGit7c3/core-acceptance; financialrequests posteriores tienen informes propios. No aceptación porreadiness.',
        '../acceptance-final/final-clock-executed/README.md',revision=final_copy['revision'])
full_retry=read('dependencies/ci5-current/audit-full.json')
prod_retry=read('dependencies/ci5-current/audit-production.json')
if full_retry and prod_retry and 'metadata' in full_retry and 'metadata' in prod_retry:
    full=full_retry['metadata']['vulnerabilities'];prod=prod_retry['metadata']['vulnerabilities']
    add('CI5-AUDIT-RETRY-FULL','FAIL' if full['total'] else 'PASS',json.dumps(full),
        'Reconsulta actual independiente del error de consulta preservado en core-acceptance/dependency-audit.json; mismo package/lock. No remediación compatible inventada.',
        '../dependencies/ci5-current/audit-full.json',revision='7c3e8722d8fcdc5d95d205e9a12eb856647e0e06')
    add('CI5-AUDIT-RETRY-PRODUCTION','FAIL' if prod['total'] else 'PASS',json.dumps(prod),
        'npm audit --omit=dev solamente; no cambiaFAILcompleto ni prueba ausencia universal de código vulnerable.',
        '../dependencies/ci5-current/audit-production.json',revision='7c3e8722d8fcdc5d95d205e9a12eb856647e0e06')

# Current CI6 and later infrastructure are separate scoped evidence, never original-case promotion.
ci6_assessment=read('dependencies/ci6-current/assessment.json')
if ci6_assessment:
    for label,key in [('FULL','freshFullAudit'),('PRODUCTION','freshProductionAudit')]:
        count=ci6_assessment[key]['vulnerabilities']
        add('CI6-AUDIT-RETRY-'+label,'FAIL' if count['total'] else 'PASS',json.dumps(count),
            'Fresh valid audit after the preserved CI6 query failure; same exact package/lock. Production omission does not change the full FAIL.',
            '../dependencies/ci6-current/assessment.json',revision=ci6_assessment['revision'])
ci6_copy=read('closure-final-preparation/clock-executed/closure-proof-build-proof.json')
ci6_auth=read('closure-final-preparation/clock-executed/closure-proof-clock-auth-ready.json')
if ci6_copy and ci6_auth:
    ok=ci6_copy['exitCode']==0 and ci6_copy['browserAssetSecretScan']['status']=='PASS'and ci6_auth['status']=='PASS_SCOPED_READINESS'
    add('CI6-COPY-READINESS','PASS'if ok else'FAIL','483 exact frozen sources; two normal Auth/API200;135assets service/cron0',
        ci6_auth['scope']+' Acceptance requests are separate compiled SSR reports, not inferred from startup.',
        '../closure-final-preparation/clock-executed/README.md',revision=ci6_copy['revision'])
nominal=read('cnf12-nominal/summary.json')
if nominal:
    read('cnf12-nominal/independent-review.json');read('cnf12-nominal/original-preservation-final.json')
    add('CNF12-NOMINAL-SQL-SUBSCOPE','PASS'if nominal['status']=='PASS_NOMINAL_SQL_SUBSCOPE_ORIGINAL_CNF12_BLOCKED'else'BLOCKED',
        '20pass before harness parser failure;19resumePASS; actual restore0.469s; source21/target20; Storage34B',
        nominal['counting']+' No nominal HTTPAuth/Storage or four-UI claim. Timestamp RPO/RTO boundaries are models, not observed hours. FullCNF12 staysBLOCKED.',
        '../cnf12-nominal/summary.json')
empty=read('empty-account-runtime/executed/readiness.json')
if empty:
    add('EMPTY-REPLICA-READINESS','PASS'if empty['status']=='READY_SCOPED_NEW_EMPTY_REPLICA'else'BLOCKED',
        'Same two identities/keys; normal Auth/API200/RLSownerforeignanon;14tables0/provider0 before cases',
        empty['scope']+' New cached GoTrue/PostgREST, local SMTP and quote doubles; exact CI6 copy/build. Readiness does not accept subsequent original contracts.',
        '../empty-account-runtime/executed/readiness.json',revision=empty['revision'])
for review in ['account-analysis-contracts/independent-closure-review.json','remaining-seven-contracts/independent-review.json','remaining-cu001/independent-recurring-amount-review.json','notification-timeout-contract/independent-review.json']:
    read(review)

for key,cu,scope,blocker in [
 ('CNF-01-INTEGRAL','CU001–CU004','Carga canónica equivalente al despliegue','No equivalencia hardware/topología/dispositivo; tanda cálida100 con p95 incumplido y tanda fría60observadas/40sin observar preservadas;outage sin completar. No perfilesPASS integrales ni repetición masiva autorizada'),
 ('CNF-02','CU001–CU004','Disponibilidad mensual≥99,5%; sonda autenticada5min','Sin serie real mensual; las muestras ausentes no cuentan satisfactorias'),
 ('CNF-03','CU001–CU004','HTTPS/TLS/certificado/redirect en solicitudes financieras','EntornoHTTPloopback; no endpointHTTPS de prueba identificado/verificado'),
 ('CNF-04','CU001–CU004','Contrato original cifrado/aislamiento integral','FileVault local observado aparte; falta aceptación exacta del contrato provider/config y CP2-19 API/JWT completo' if at_rest else 'Sin evidencia del cifrado de esta instancia; RLS es control separado'),
 ('CNF-05','CU001','Contrato visual original movimientos en todos los viewports/acciones','Falta suite exacta completa; capturas o subrecorridos visuales parciales quedan separados'),
 ('CNF-06','CU002','Contrato visual original cuentas/perfil/exportación','Falta suite exacta completa con controles y descarga operables; lecturas no la sustituyen'),
 ('CNF-07','CU003','Contrato visual original análisis/chat/números/fechas','Falta suite exacta completa de análisis y chat, incluidos proveedores necesarios'),
 ('CNF-08','CU004','Contrato visual original inversiones/operaciones/simulación','Falta suite exacta completa en los viewports/acciones originales'),
 ('CNF-09','CU001–CU004','Chrome/Firefox/Safari/Edge reales con versiones estables exactas al ensayo y perfil fresco (CSV no exige versión anterior adicional)','Matriz crítica completa no ejecutada; usuario rechazó instalarFirefox/Edge; SafariWebDriverdisabled; Arc AutomationCodex→Arc autorizada/habilitada por intervención humana, pero primera ventana con cierre UNKNOWN; no aceptación UI ni nuevas acciones sobre perfil personal; WebKit no es Safari'),
 ('CNF-10','CU001–CU004','Credenciales en todos los canales originales, sin efectos no autorizados','Auth/grants y guards parciales tienen evidencia separada; faltan todos los canales/proveedores y fixture original exacto'),
 ('CNF-11','CU001–CU004','Idempotencia/rollback/concurrencia manual/bot/importación/cron/venta/pago originales','Recibos/locks/rollback nativos y dobles tienen evidencia separada; no todos los canales originales incluidos pago/proveedor real'),
 ('CNF-12-ORIGINAL','CU001–CU004','Fixture2cuentas/20movimientos/3lotes/1regla/1grupo; snapshot y gasto1500 posterior; RPO23h/RTO3h30/fronteras24h/4h/+1s y lectura4CU restaurados','Recuperación64tablas/Auth/Storage y cuatro lecturas UI restauradas acotadas probadas aparte, con ocho FX auxiliares posteriores declaradas. Fixture nominal/snapshot/gasto1500/restoreSQL y fronteras modelo ya ejecutados aparte; faltan respaldo del plan real contratado, cuatro lecturas UI nominales y RTO3h30 observado. No confundir modelos de timestamps con tiempo transcurrido real'),
 ('CNF-13','CU001–CU004','Correlación request→servicio→efecto/rechazo y ausencia de marcadores secretos originales','Scan heurístico no prueba fixture completo de correlación, errores de proveedores y ausencia de los marcadores de datos privados originales'),
 ('CP3-19-ORIGINAL','CU003','MEP seleccionable original','ContradiceRN08blue.sell; evidencia derivada blue no aprueba fixtureMEP'),
 ('PROVIDER-GEMINI','CU001;CU003','OCR y IA reales','GEMINI_API_KEY ausente; dobles no validan proveedor/cuota real. CP3-09 requiere proveedor'),
 ('PROVIDER-TELEGRAM','CU001;CU002','Bot/chat/HTTPS de pruebas y vinculación/unlink/entrega','FaltanTELEGRAM_BOT_TOKEN/TELEGRAM_WEBHOOK_SECRET y bot/chat/endpointHTTPS de pruebas; CP2-17/18 requieren proveedor'),
 ('PROVIDER-MERCADOPAGO','CU002','Factura/webhook/suscripción sandbox real con importe/moneda/período','FaltanMP_ACCESS_TOKEN de pruebas/MP_WEBHOOK_SECRET y recursos sandbox autorizados; sin cobros reales')]: add(key,'BLOCKED','No prueba integral actual',scope,blocker=blocker,cu=cu)
with (OUT/'technical-evidence-matrix.csv').open('w',newline='') as stream:
    writer=csv.DictWriter(stream,fieldnames=list(rows[0]),lineterminator='\n');writer.writeheader();writer.writerows(rows)
original=ROOT/'docs/tif/v2.13/casos_prueba.csv'
original_rows=list(csv.DictReader(original.open(encoding='utf-8-sig')))
assert len(original_rows)==273
traceability=read('traceability-summary.json')
index=dict(generated_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),draft=True,original_cases=dict(path='../../../casos_prueba.csv',count=273,sha256=hashlib.sha256(original.read_bytes()).hexdigest(),modified=False),input_reports=inputs,technical_rows=len(rows),original_derived_summary=traceability,rule='Technical rows are scoped assertions, not unique original cases; no promotion from foci. Historical runs stay separate. Pending reports remain blocked.')
(OUT/'evidence-index.json').write_text(json.dumps(index,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'technical_rows':len(rows),'original_cases':273,'inputs':len(inputs),'core_available':bool(core),'original_derived_summary':traceability},ensure_ascii=False))
