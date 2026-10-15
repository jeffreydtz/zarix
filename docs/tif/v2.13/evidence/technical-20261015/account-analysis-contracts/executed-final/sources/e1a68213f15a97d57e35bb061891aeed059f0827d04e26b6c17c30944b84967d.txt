// Ordinary authenticated SSR observation only. No HTML/Flight JavaScript is executed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const day='2026-10-06';
const runtime='/tmp/zarix-runtime-20261015';
const decode = text => text.replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#x([\da-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
export function parseFlight(html){
 const payload=[];
 for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
  const match=script[1].match(/^self\.__next_f\.push\(([\s\S]*)\);?$/);if(!match)continue;
  const value=JSON.parse(match[1]);if(value[0]===1&&typeof value[1]==='string')payload.push(value[1]);
 }
 assert.ok(payload.length,'No inline Flight JSON payload');
 const rows=new Map(),imports=new Map();
 for(const line of payload.join('').split('\n')){const m=line.match(/^([\da-f]+):(.*)$/i);if(!m)continue;try{if(m[2].startsWith('I'))imports.set(m[1],JSON.parse(m[2].slice(1)));else rows.set(m[1],JSON.parse(m[2]));}catch{/* Non-JSON protocol records are not evaluated. */}}
 return {rows,imports};
}
function componentProps(flight,moduleId,required){
 const refs=new Set([...flight.imports].filter(([,v])=>String(v[0])===String(moduleId)).map(([id])=>'$L'+id)),found=[];
 function visit(value,seen=new Set()){
  if(typeof value==='string'&&/^\$[\da-f]+$/i.test(value)){const id=value.slice(1);if(!seen.has(id)&&flight.rows.has(id))visit(flight.rows.get(id),new Set([...seen,id]));return;}
  if(Array.isArray(value)){if(value[0]==='$'&&refs.has(value[1])&&value[3]&&required(value[3]))found.push(value[3]);for(const x of value)visit(x,seen);}
  else if(value&&typeof value==='object')for(const x of Object.values(value))visit(x,seen);
 }
 for(const v of flight.rows.values())visit(v);
 const unique=[...new Map(found.map(v=>[JSON.stringify(v),v])).values()];assert.equal(unique.length,1,'Exactly one bound component payload required');return unique[0];
}
async function clientModule(c,route,component){
 const relative=`.next/server/app/(authenticated)/${route}/page_client-reference-manifest.js`,file=path.join(c.report.buildBinding.copyRoot,relative),bytes=await fs.readFile(file),text=bytes.toString(),marker=`globalThis.__RSC_MANIFEST["/(authenticated)/${route}/page"]=`;
 const at=text.indexOf(marker);assert.ok(at>=0);const raw=text.slice(at+marker.length).trim().replace(/;$/,'');const manifest=JSON.parse(raw);
 const entries=Object.entries(manifest.clientModules).filter(([key])=>key.endsWith('/'+component));assert.equal(entries.length,1);return {module:entries[0][1],manifestPath:relative,manifestSha256:c.digest(bytes),component};
}
export async function prepareSSR(c){
 assert.equal(c.report.runtimeProfile,'final-core-acceptance');assert.equal(c.report.runtimeMode,'clock');assert.equal(c.report.buildBinding.appOrigin,'http://127.0.0.1:3002');assert.equal(c.report.buildBinding.apiOrigin,'http://127.0.0.1:58321');
 const existing=c.rows(`SELECT * FROM net_worth_snapshots WHERE user_id=${c.lit(c.a.id)} AND snapshot_date='${day}'`);assert.ok(existing.length<=1);
 const file=process.env.ZARIX_ACCOUNT_ANALYSIS_SSR_OWNERSHIP_SOURCE;let own;
 if(existing.length){
  if(!file)c.block('Existing original6Oct net_worth_snapshot would be upserted by GET/dashboard. No SSR GET is issued without exact evidence that this UUID was newly created by this harness.');
  const absolute=path.resolve(file);assert.ok(absolute.startsWith(runtime+'/account-analysis-')&&absolute.endsWith('/verification.json'));assert.equal((await fs.stat(absolute)).mode&0o077,0);
  const bytes=await fs.readFile(absolute),prior=JSON.parse(bytes);assert.equal(prior.sourceStable,true);assert.equal(prior.servedBuildStable,true);assert.ok(prior.originalIntegrity.every(x=>x.unchanged));
  own=prior.ssrSnapshotOwnership;assert.ok(own&&own.initialCount===0&&own.createdByOrdinaryDashboardSSR===true);assert.equal(own.userId,c.a.id);assert.equal(own.snapshotDate,day);assert.equal(own.id,existing[0].id);assert.equal(own.projectId,c.report.nativePreparation.projectId);assert.equal(own.apiOrigin,c.apiUrl.origin);
  c.report.ssrOwnershipSource={sha256:c.digest(bytes),sourceRun:prior.run};
 }
 c.report.ssrSnapshotOwnership=own||null;
 c.report.ssrSnapshotInventoryBefore={table:'net_worth_snapshots',userId:c.a.id,snapshotDate:day,existing:existing.length,ownedExistingId:own?.id||null,beforeSha256:c.digest(JSON.stringify(existing)),before:existing};
 return own?.id;
}
export async function readDashboard(c,ars,usd,{liquidUSD,investmentsUSD}={}){
 const before=c.rows(`SELECT * FROM net_worth_snapshots WHERE user_id=${c.lit(c.a.id)} AND snapshot_date='${day}'`),owned=c.report.ssrSnapshotOwnership;
 assert.ok(before.length===0||(owned&&before.length===1&&before[0].id===owned.id),'Never overwrite an original snapshot');
 const compiled=await clientModule(c,'dashboard','components/dashboard/NetWorthHero.tsx');
 const response=await c.serverGet('/dashboard');const observation={path:'/dashboard',status:response.status,responseSha256:c.digest(response.body),compiled,scope:'Actual ordinary authenticated server response and client-component Flight props. No browser, hydration, animation, chart or visual acceptance claimed.'};
 (c.report.ssrObservations||=[]).push(observation);await c.checkpoint();c.check('Actual dashboard SSR200',response.status,200);
 const props=componentProps(parseFlight(response.body),compiled.module.id,p=>p.now&&typeof p.now==='object');
 observation.now=props.now;
 const section=[...response.body.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].find(m=>/<h2\b[^>]*>Patrimonio total<\/h2>/.test(m[1]));assert.ok(section,'SSR hero section must exist');
 const amounts=[...section[1].matchAll(/<data\b([^>]*)>([\s\S]*?)<\/data>/g)].map(m=>({value:m[1].match(/\bvalue="([^"]*)"/)?.[1],text:decode(m[2])}));assert.ok(amounts.length>=2);observation.amounts=amounts;
 const expectedUSDText='≈ US$ '+usd.toLocaleString('es-AR',{minimumFractionDigits:Number.isInteger(usd)?0:2,maximumFractionDigits:2});observation.expectedSecondaryText=expectedUSDText;
 // The dashboard launches a best-effort void upsert. Wait for its observed completion
 // before cleanup changes fixture balances; the desired row is computed by the server.
 let after;const stop=Date.now()+15000;
 do{after=c.rows(`SELECT * FROM net_worth_snapshots WHERE user_id=${c.lit(c.a.id)} AND snapshot_date='${day}'`);if(after.length===1&&['liquid_usd','investments_usd','total_usd','total_ars_blue'].every((key,i)=>Math.abs(Number(after[0][key])-Number([props.now.liquidUSD,props.now.investmentsUSD,props.now.totalUSD,props.now.totalARSBlue][i]))<1e-8))break;await new Promise(r=>setTimeout(r,200));}while(Date.now()<stop);
 assert.equal(after.length,1,'Owned snapshot completion not observed');for(const[key,expected]of Object.entries({liquid_usd:props.now.liquidUSD,investments_usd:props.now.investmentsUSD,total_usd:props.now.totalUSD,total_ars_blue:props.now.totalARSBlue}))assert.ok(Math.abs(Number(after[0][key])-Number(expected))<1e-8,'Snapshot completion must match actual server props');
 if(owned){assert.equal(after[0].id,owned.id);for(const key of['id','user_id','snapshot_date','created_at'])assert.deepEqual(after[0][key],before[0][key]);}
 else{c.report.ssrSnapshotOwnership={id:after[0].id,userId:c.a.id,snapshotDate:day,projectId:c.report.nativePreparation.projectId,apiOrigin:c.apiUrl.origin,initialCount:0,createdByOrdinaryDashboardSSR:true,createdDuringRun:c.run};}
 observation.snapshot={before,after,intendedOwnedUpsert:true,completedBeforeFixtureCleanup:true};await c.checkpoint();
 c.near('Actual SSR aggregate totalARSBlue',props.now.totalARSBlue,ars);c.near('Actual SSR aggregate totalUSD',props.now.totalUSD,usd);
 if(liquidUSD!==undefined)c.near('Actual SSR liquidUSD',props.now.liquidUSD,liquidUSD);if(investmentsUSD!==undefined)c.near('Actual SSR investmentsUSD',props.now.investmentsUSD,investmentsUSD);
 c.near('SSR secondary data numeric value',Number(amounts[1].value),usd);
 try{c.check('SSR secondary amount retains original documented precision',amounts[1].text,expectedUSDText);}catch{/* Preserve the concrete display failure and continue any original second financial phase. */}
 return observation;
}

export async function readAnalysis(c,categoryId){
 const chart=await clientModule(c,'analysis','components/analysis/AnalysisCharts.tsx'),picker=await clientModule(c,'analysis','components/analysis/AnalysisPeriodPicker.tsx');
 const response=await c.serverGet('/analysis?period=custom&startDate=2026-10-01&endDate=2026-10-06');const observation={path:'/analysis?period=custom&startDate=2026-10-01&endDate=2026-10-06',status:response.status,responseSha256:c.digest(response.body),compiled:{chart,picker},scope:'Actual normal-authenticated server HTML and compiled client-component Flight props. No browser, chart pixels, filter UI interaction or hydration acceptance claimed.'};
 (c.report.ssrAnalysisObservations||=[]).push(observation);await c.checkpoint();c.check('Actual analysis SSR200',response.status,200);
 const flight=parseFlight(response.body),period=componentProps(flight,picker.module.id,p=>p.period).period,expenses=componentProps(flight,chart.module.id,p=>p.title==='Gastos por categoría'),income=componentProps(flight,chart.module.id,p=>p.title==='Ingresos por categoría');
 observation.period=period;observation.expenseCategoryData=expenses.data;observation.incomeCategoryData=income.data;
 const summary={};for(const label of['Gastos','Ingresos']){const re=new RegExp('<div[^>]*>'+label+'<\\/div>\\s*<div[^>]*>([\\s\\S]*?)<\\/div>');const m=response.body.match(re);assert.ok(m,'Actual summary HTML card missing');summary[label]=decode(m[1]);}observation.summaryText=summary;await c.checkpoint();
 c.check('Actual server custom inclusive period',{preset:period.preset,start:period.startYmd,end:period.endYmd},{preset:'custom',start:'2026-10-01',end:'2026-10-06'});
 c.check('Actual server expense category aggregate excludes transfer, U2 and September',expenses.data.map(x=>({name:x.name,amount:x.amount,count:x.count})),[{name:c.rows(`SELECT name FROM categories WHERE id=${c.lit(categoryId)} AND user_id=${c.lit(c.a.id)}`)[0].name,amount:2000,count:3}]);
 c.near('Actual server income aggregate',income.data.reduce((n,x)=>n+Number(x.amount),0),5000);
 c.check('Actual server rendered period totals',summary,{Gastos:'$2.000',Ingresos:'$5.000'});
 return observation;
}
