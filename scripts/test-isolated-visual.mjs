// Read-only visual submatrix for exactly CU001-CU004; no complete CNF approval.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isolatedNativeTargets, isolatedPgEnvironment } from './lib/test-isolated-native-target.mjs';
const output=path.resolve(process.env.ZARIX_VISUAL_OUTPUT || '/tmp/zarix-isolated-visual');
const hash=value=>createHash('sha256').update(value).digest('hex');
const report={startedAt:new Date().toISOString(),status:'RUNNING',scope:'Exactly four CU; installed Chrome responsive read/unsaved form keyboard probes and ordinary JSON download. Partial visual scope; no OCR, budget, reset, AI chat or completed purchase/sale across each viewport.',cells:[],screenshots:[],blockers:[]};
await fs.mkdir(output,{recursive:true,mode:0o700}); let context,profile;
try{
 const {apiUrl,databaseUrl}=isolatedNativeTargets(); assert.equal(apiUrl.port,'57321');assert.equal(databaseUrl.port,'57322');
 assert.equal(process.env.ZARIX_API_TARGET_PURPOSE,'isolated-api-e2e-replica');
 const appUrl=new URL(process.env.ZARIX_E2E_APP_URL || 'http://127.0.0.1:3000');assert.equal(appUrl.hostname,'127.0.0.1');
 const privateFile=process.env.ZARIX_TEST_LOGIN_FILE;assert.equal((await fs.stat(privateFile)).mode &0o077,0);
 const fixture=JSON.parse(await fs.readFile(privateFile,'utf8'));assert.equal(fixture.purpose,'isolated-api-e2e-replica');assert.equal(fixture.users.length,2);const user=fixture.users[0];assert.match(user.email,/^zarix-e2e-.+@example\.invalid$/);
 const pgEnv={...isolatedPgEnvironment(databaseUrl),PGOPTIONS:'-c default_transaction_read_only=on'};
 const sql=statement=>{const r=spawnSync(path.join(process.env.ZARIX_PG_BIN,'psql'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',statement],{encoding:'utf8',env:pgEnv,maxBuffer:16*1024*1024});assert.equal(r.status,0,'Private SQL assertion failed');return r.stdout.trim();};
 assert.equal(sql(`SELECT email FROM auth.users WHERE id='${user.id}'`),user.email);
 const finance=()=>hash(sql(`SELECT jsonb_build_object('accounts',(SELECT jsonb_agg(jsonb_build_array(id,balance,is_active,movement_enabled) ORDER BY id) FROM accounts WHERE user_id='${user.id}'),'transactions',(SELECT jsonb_agg(jsonb_build_array(id,account_id,type,amount,currency,amount_in_account_currency,destination_account_id,destination_amount_in_account_currency) ORDER BY id) FROM transactions WHERE user_id='${user.id}'),'investments',(SELECT jsonb_agg(jsonb_build_array(id,quantity,purchase_price,current_price,is_active) ORDER BY id) FROM investments WHERE user_id='${user.id}'),'sales',(SELECT jsonb_agg(jsonb_build_array(id,investment_id,quantity,price,realized_pnl_native) ORDER BY id) FROM investment_sales WHERE user_id='${user.id}'))`));
 const before=finance(); const files=['scripts/test-isolated-visual.mjs','docs/testing/isolated-e2e.md','components/accounts/CreateAccountButton.tsx','components/settings/ExportImport.tsx','components/investments/AddInvestmentPanel.tsx','components/investments/InvestmentSimulationPanel.tsx','app/globals.css','package-lock.json'];
 report.sourceManifest=await Promise.all(files.map(async file=>({path:file,sha256:hash(await fs.readFile(file))})));
 report.revision=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'}}).stdout.trim();
 const {chromium}=await import(pathToFileURL(process.env.ZARIX_PLAYWRIGHT_MODULE).href);
 profile=await fs.mkdtemp('/tmp/zarix-visual-profile-');context=await chromium.launchPersistentContext(profile,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,viewport:{width:1440,height:900},serviceWorkers:'block'});
 report.browser={product:'Installed Google Chrome',version:context.browser().version(),headless:true,profile:'New ephemeral dedicated profile; removed after run',node:process.version};
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost','[::1]'].includes(u.hostname)||['data:','blob:','chrome:'].includes(u.protocol)?route.continue():route.abort('blockedbyclient');});
 const settings=await context.newPage();await settings.goto('chrome://settings/appearance');await settings.locator('#zoomLevel').selectOption('1');
 const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(new URL('/login',appUrl).href);await page.getByLabel('Email',{exact:true}).fill(user.email);await page.locator('#password').fill(user.password);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.waitForURL('**/dashboard');
 const probeControl=async locator=>{await locator.scrollIntoViewIfNeeded();await locator.waitFor({state:'visible'});return locator.evaluate(element=>{const b=element.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {visible:!!b.width&&!!b.height,horizontalBounds:b.left>=-1&&b.right<=innerWidth+1,centerReachable:hit===element||element.contains(hit),left:b.left,right:b.right};});};
 const capture=async name=>{const file=`${name}.png`;await page.screenshot({path:path.join(output,file),fullPage:true});report.screenshots.push({path:file,sha256:hash(await fs.readFile(path.join(output,file)))});};
 for(const viewport of [{width:320,height:568},{width:375,height:812},{width:768,height:1024},{width:1440,height:900}]) for(const zoom of [1,2]){
  await page.setViewportSize(viewport);await settings.locator('#zoomLevel').selectOption(String(zoom));
  for(const cu of ['CU001','CU002','CU003','CU004']){
   const cell={cu,viewport,zoomPercent:zoom*100,status:'RUNNING',actions:[]};report.cells.push(cell);
   try{
    await page.goto(new URL({CU001:'/expenses',CU002:'/accounts',CU003:'/analysis',CU004:'/investments'}[cu],appUrl).href,{waitUntil:'domcontentloaded'});
    if(cu==='CU001'){await page.getByRole('button',{name:'Nuevo',exact:true}).click();await page.getByPlaceholder('0',{exact:true}).fill('1250');await page.getByPlaceholder('ej: Compra en el súper').fill('Visual sintética sin guardar');await page.keyboard.press('Tab');cell.actions.push('open/fill expense; Tab; no submit');cell.control=await probeControl(page.getByRole('button',{name:'Guardar',exact:true}));}
    if(cu==='CU002'){await page.getByRole('button',{name:'Nueva Cuenta',exact:true}).click();const panel=page.locator('div.bg-card.rounded-3xl').filter({has:page.getByRole('heading',{name:'Nueva Cuenta',exact:true})});await panel.getByPlaceholder('Ej: Banco Galicia, Mercado Pago',{exact:true}).fill('Visual sintética sin guardar');await page.keyboard.press('Tab');cell.actions.push('open/fill account; Tab; no submit');cell.control=await probeControl(panel.getByRole('button',{name:'Crear Cuenta',exact:true}));}
    if(cu==='CU003'){await page.getByRole('heading',{name:'Análisis financiero',exact:true}).waitFor();await page.keyboard.press('Tab');cell.actions.push('analysis loaded; keyboard focus and page scroll');await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));}
    if(cu==='CU004'){await page.getByRole('button',{name:'Simular escenario',exact:true}).click();const form=page.locator('#investment-simulation-form');await form.getByLabel('Variación del precio (%)',{exact:true}).fill('10');await form.getByRole('button',{name:'Simular',exact:true}).click();await page.getByTestId('investment-simulation-result').waitFor();cell.actions.push('actual pure simulation10%; keyboard focus; no financial write');cell.control=await probeControl(form.getByRole('button',{name:'Simular',exact:true}));}
    cell.metrics=await page.evaluate(()=>({innerWidth,outerWidth,devicePixelRatio,visualViewportWidth:visualViewport.width,visualViewportScale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,focusedTag:document.activeElement.tagName}));
    assert.equal(cell.metrics.devicePixelRatio,zoom,'Actual browser zoom must change CSS pixel ratio');assert.ok(Math.abs(cell.metrics.innerWidth*zoom-viewport.width)<=2,'Actual browser zoom must halve layout viewport at200%');assert.ok(cell.metrics.scrollWidth<=cell.metrics.clientWidth+1,'Global horizontal overflow');if(cell.control)assert.ok(cell.control.visible&&cell.control.horizontalBounds&&cell.control.centerReachable,'Action clipped or covered');
    await capture(`${cu}-${viewport.width}x${viewport.height}-zoom${zoom*100}`);
    if(cu==='CU002'){await page.goto(new URL('/settings',appUrl).href);const button=page.getByRole('button',{name:/JSON/}).first();cell.downloadControl=await probeControl(button);assert.ok(cell.downloadControl.centerReachable&&cell.downloadControl.horizontalBounds);const pending=page.waitForEvent('download');await button.click();const download=await pending;assert.equal(await download.failure(),null);cell.download={status:'PASS',sha256:hash(await fs.readFile(await download.path()))};cell.actions.push('JSON download through settingsUI normal session');}
    cell.status='PASS';
   }catch(error){cell.status='FAIL';cell.errorType=error.name;await capture(`${cu}-${viewport.width}x${viewport.height}-zoom${zoom*100}-failure`).catch(()=>{});}
   await fs.writeFile(path.join(output,'visual-verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  }
 }
 const after=finance();report.financeIntegrity={beforeSha256:before,afterSha256:after,status:before===after?'PASS':'FAIL'};report.sourceStable=(await Promise.all(report.sourceManifest.map(async f=>hash(await fs.readFile(f.path))===f.sha256))).every(Boolean);
 report.blockers=[{ids:['CNF-05','CNF-06','CNF-07','CNF-08'],reason:'This submatrix proves only listed visible/read/unsaved-form/simulation/download actions. OCRpreview, budget rules, login/reset, AI chat/anomalies and actual buy/sell completion per viewport remain separate.'},{id:'CNF-09',reason:'Only installed Chrome executed; real Safari, Firefox and Edge have separate cells and are never inferred.'}];
 report.status=report.cells.some(c=>c.status==='FAIL')||before!==after||!report.sourceStable?'FAIL':'PARTIAL';
}catch(error){report.status='FAIL';report.errorType=error.name;report.failureLocation=error.stack?.match(/test-isolated-visual\.mjs:(\d+):\d+/)?.[1]||null;}
finally{if(context)await context.close();if(profile)await fs.rm(profile,{recursive:true,force:true});report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(output,'visual-verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({status:report.status,report:path.join(output,'visual-verification.json'),cells:report.cells.length,failures:report.cells.filter(c=>c.status==='FAIL').length},null,2));if(report.status==='FAIL')process.exitCode=1;}
