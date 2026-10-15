import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {createRequire}from'node:module';
import {createHash}from'node:crypto';
import React from 'react';
import {renderToStaticMarkup}from'react-dom/server';
// tsx's CJS transform can retain classic JSX for the Next source. Supply the
// actual React runtime in this worker without changing the component.
globalThis.React=React;
const root=process.cwd(),scenario=process.env.ZARIX_QUOTE_CONTRACT_SCENARIO,clock=globalThis.__zarixQuoteClock;
const require=createRequire(path.join(root,'package.json'));
assert.ok(clock);assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:58321');
assert.equal(process.env.EXCHANGE_RATE_CACHE_TTL,'300');
const hash=x=>createHash('sha256').update(x).digest('hex');
const counters={primary:0,secondary:0,crypto:{bitcoin:0,ethereum:0,tether:0}};
let round=0;
const rates=()=>scenario==='mapping'?{blue:1300,oficial:1000,mep:1250,ccl:1280}:Object.fromEntries(['blue','oficial','mep','ccl'].map(s=>[s,round?1300:1200]));
const fixture=()=>{const r=rates(),timestamp=Date.now()/1000;return{blue:{bid:r.blue,ask:r.blue,timestamp},oficial:{bid:r.oficial,ask:r.oficial,timestamp},mep:{al30:{'24hs':{price:r.mep,timestamp}}},ccl:{al30:{'24hs':{price:r.ccl,timestamp}}}};};
const served=[];
const server=http.createServer((request,response)=>{
  const u=new URL(request.url,'http://127.0.0.1:57911');let data,status=200;
  if(u.pathname==='/dolar'){counters.primary++;data=fixture();}
  else if(u.pathname==='/dolares'){counters.secondary++;data=[];}
  else if(u.pathname==='/simple/price'){
    const id=u.searchParams.get('ids');assert.ok(Object.hasOwn(counters.crypto,id));counters.crypto[id]++;
    const usd={bitcoin:60000,ethereum:2500,tether:1}[id];data={[id]:{usd,ars:usd*1300,usd_24h_change:0,last_updated_at:Date.now()/1000}};
  }else{status=404;data={error:'Unknown fixed fixture route'};}
  if(scenario==='failure300'&&round&&['/dolar','/dolares'].includes(u.pathname)){status=503;data={error:'Synthetic provider unavailable'};}
  const body=JSON.stringify(data);served.push({path:u.pathname,status,bodySha256:hash(body),sourceTimestamp:new Date().toISOString()});
  response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(body);
});
const report={scenario,status:'RUNNING',t0:clock.start,counters,served,assertions:[],scope:'Actual CI4 quote service and Supabase persistence, explicit loopback HTTP provider doubles. No Next HTTP route, browser, real provider or OS-clock test.'};
function check(name,actual,expected){assert.deepEqual(actual,expected,name);report.assertions.push({name,status:'PASS',actual,expected});}
let listening=false;
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(57911,'127.0.0.1',resolve);});listening=true;
  const {cotizacionesService:service}=require(path.join(root,'lib/services/cotizaciones.ts'));assert.ok(service);
  const initial=scenario==='mapping'?await service.getAllQuotes():await service.getDolarQuotes();
  if(scenario==='mapping'){
    const expected={blue:1300,oficial:1000,mep:1250,ccl:1280};
    for(const[source,value]of Object.entries(expected))check(`CP3-01 ${source} value/source/time`,{type:initial.dolar[source].type,buy:initial.dolar[source].buy,sell:initial.dolar[source].sell,timestamp:initial.dolar[source].timestamp.toISOString(),provider:initial.dolar[source].provider,origin:initial.dolar[source].origin},{type:source,buy:value,sell:value,timestamp:clock.start,provider:'criptoya',origin:'provider'});
    for(const[key,symbol,usd]of[['btc','BTC',60000],['eth','ETH',2500],['usdt','USDT',1]])check(`CP3-01 ${symbol} USD/source time`,{symbol:initial.crypto[key].symbol,priceUSD:initial.crypto[key].priceUSD,priceARS:initial.crypto[key].priceARS,timestamp:initial.crypto[key].timestamp.toISOString()},{symbol,priceUSD:usd,priceARS:usd*1300,timestamp:clock.start});
    check('CP3-01 aggregate timestamp',initial.timestamp,clock.start);check('CP3-01 actual HTTP double requests',counters,{primary:1,secondary:0,crypto:{bitcoin:1,ethereum:1,tether:1}});
    report.normalizedQuotes=initial;report.expectedNewFxRows=8;report.sourceScope='Dollar provider metadata is returned by the service. Crypto source is established by actual fixture HTTP request/response binding; no crypto provider field is invented.';
  }else{
    for(const source of ['blue','oficial','mep','ccl'])check(`${scenario} initial persisted provider sample`,{rate:initial[source].sell,time:initial[source].timestamp.toISOString(),origin:initial[source].origin},{rate:1200,time:clock.start,origin:'provider'});
    round=1;const offset={hit299:299,refresh300:300,refresh301:301,failure300:300}[scenario];clock.set(offset);
    const next=await service.getDolarQuotes(),fallback=scenario==='failure300',hit=scenario==='hit299';
    const expectedTime=hit||fallback?clock.start:new Date().toISOString(),expectedRate=hit||fallback?1200:1300;
    for(const source of ['blue','oficial','mep','ccl'])check(`${scenario} returned quote`,{buy:next[source].buy,sell:next[source].sell,time:next[source].timestamp.toISOString(),provider:next[source].provider,origin:next[source].origin},{buy:expectedRate,sell:expectedRate,time:expectedTime,provider:fallback?null:'criptoya',origin:fallback?'persisted':'provider'});
    check(`${scenario} provider request counters`,{primary:counters.primary,secondary:counters.secondary},{primary:hit?1:2,secondary:fallback?1:0});
    report.initialQuote=initial.blue;report.returnedQuote=next.blue;report.offsetSeconds=offset;report.expectedNewFxRows=hit||fallback?8:16;
    if(fallback){
      const {blueFxReference}=require(path.join(root,'lib/blue-fx-reference.ts'));const reference=blueFxReference(next.blue);
      const {default:Component}=require(path.join(root,'components/ui/BlueFxReferenceDetails.tsx'));
      assert.equal(typeof Component,'function');const html=renderToStaticMarkup(React.createElement(Component,{reference}));
      check('CP3-02 persisted real BlueFxReference',reference,{type:'blue',side:'sell',rate:1200,observedAt:clock.start,provider:null,origin:'persisted'});
      check('CP3-02 real SSR component keeps stored quote label',html.includes('Cotización guardada'),true);check('CP3-02 real SSR component keeps original T0',html.includes(`dateTime="${clock.start}"`),true);
      check('CP3-02 provider failures actually returned503',served.filter(x=>x.status===503).map(x=>x.path),['/dolar','/dolares']);report.reference=reference;report.ssrHtml=html;
    }
  }
  report.transportRequests=clock.requests;report.fakeClockScope=clock.scope;report.status='PASS';
}catch(error){report.status='FAIL';report.failure={type:error.name,code:typeof error.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:null,context:'Quote contract assertion/import/provider/persistence failed; raw details remain private'};console.error(error);}
finally{if(listening)await new Promise(resolve=>server.close(resolve));await fs.writeFile(process.env.ZARIX_QUOTE_CONTRACT_RESULT,JSON.stringify(report,null,2)+'\n',{mode:0o600});process.exitCode=report.status==='PASS'?0:1;}
