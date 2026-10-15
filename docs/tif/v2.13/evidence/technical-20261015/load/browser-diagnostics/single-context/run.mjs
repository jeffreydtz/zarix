import fs from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {createProfileController} from '/Users/jeffreydietz/Documents/Codex/2026-10-13/task/zarix/scripts/lib/test-isolated-browser-profile-controller.mjs';
const root='/tmp/zarix-runtime-20261015',output=root+'/load-diagnostic';
const previous=JSON.parse(await fs.readFile(root+'/browser-load-responsive/browser-load.json'));
const fixture=JSON.parse(await fs.readFile(root+'/load-fixture.json'));
const appUrl=new URL('http://127.0.0.1:3101');
const report={startedAt:new Date().toISOString(),scope:'One ordinary normal UI session; read-only diagnostic after interrupted load attempt. Not an observation of the canonical20-session profile.',priorAttempt:{warm:previous.profiles.warm.summary,coldRecorded:previous.profiles.coldStart.observations.length},phases:[]};
let controller,browser;
async function save(){await fs.writeFile(output+'/diagnostic.json',JSON.stringify(report,null,2)+'\n',{mode:0o600})}
try{
 controller=await createProfileController({appUrl,output,fx:previous.fixture.fx});report.process=await controller.start('normal');
 const {chromium}=await import('/tmp/zarix-e2e-20261015/node_modules/playwright/index.mjs');
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block',timezoneId:'Etc/UTC'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost','[::1]'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort('blockedbyclient')});
 await context.addInitScript(()=>{localStorage.setItem('zarix.networth.view','ars');localStorage.setItem('zarix.privacy','0')});
 const page=await context.newPage();page.setDefaultTimeout(30000);
 let phase;const events=[];
 page.on('response',r=>{const u=new URL(r.url());if(u.origin===appUrl.origin)events.push({phase,path:u.pathname,status:r.status(),type:r.request().resourceType()})});
 page.on('requestfailed',r=>{const u=new URL(r.url());events.push({phase,path:u.pathname,type:r.resourceType(),failure:r.failure()?.errorText})});
 async function dom(){return page.evaluate(()=>({path:location.pathname,readyState:document.readyState,title:document.title,heading:[...document.querySelectorAll('h1,h2,h3')].map(n=>n.textContent?.trim()),data:[...document.querySelectorAll('data')].map(n=>({value:n.getAttribute('value'),text:n.textContent})),skeletons:document.querySelectorAll('[class*=animate-pulse]').length,links:document.querySelectorAll('a[aria-label^="Ver movimientos de "]').length}))}
 phase='login';await page.goto(new URL('/login',appUrl).href,{waitUntil:'domcontentloaded'});await page.getByLabel('Email',{exact:true}).fill(fixture.users[0].email);await page.locator('#password').fill(fixture.users[0].password);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.waitForURL('**/dashboard',{timeout:60000});
 report.login=await dom();await save();
 for(const shaped of [false,true]){
   phase=shaped?'one-context-cdp-20Mbps-50ms':'one-context-unshaped';
   if(shaped){const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:50,downloadThroughput:20000000/8,uploadThroughput:20000000/8,connectionType:'wifi'})}
   const result={phase,startedAt:new Date().toISOString()},start=performance.now();
   try{result.httpStatus=(await page.goto(new URL('/dashboard',appUrl).href,{waitUntil:'domcontentloaded',timeout:30000}))?.status();result.goto='PASS'}catch(error){result.goto=error.name}
   result.gotoDurationMs=performance.now()-start;
   try{await page.getByRole('heading',{name:'Patrimonio total',exact:true}).waitFor({state:'visible',timeout:10000});result.hero='visible'}catch(error){result.hero=error.name}
   result.dom=await dom();result.events=events.filter(e=>e.phase===phase);await page.screenshot({path:path.join(output,shaped?'shaped.png':'unshaped.png'),fullPage:false});report.phases.push(result);await save();
 }
 report.status='DIAGNOSED';
}catch(error){report.status='FAIL';report.failureName=error.name;report.failurePhase=report.phases.at(-1)?.phase??'setup'}finally{if(browser)await browser.close();if(controller)await controller.close();report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({report:output+'/diagnostic.json',status:report.status,phases:report.phases.map(p=>({phase:p.phase,goto:p.goto,duration:p.gotoDurationMs,hero:p.hero,dom:p.dom}))}))}
