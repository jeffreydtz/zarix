// Loaded only in each documentary worker, before tsx or application imports.
import assert from 'node:assert/strict';
assert.equal(process.env.ZARIX_QUOTE_CONTRACT_WINDOW,'proof-exclusive');
const scenarios={mapping:'2026-10-06T12:00:00.000Z',hit299:'2026-10-06T13:00:00.000Z',refresh300:'2026-10-06T14:00:00.000Z',refresh301:'2026-10-06T15:00:00.000Z',failure300:'2026-10-06T16:00:00.000Z'};
const start=scenarios[process.env.ZARIX_QUOTE_CONTRACT_SCENARIO];
assert.ok(start,'Unknown fixed quote scenario');
const RealDate=globalThis.Date;let now=RealDate.parse(start);
function WorkerDate(...args){if(new.target)return Reflect.construct(RealDate,args.length?args:[now],new.target);return new RealDate(now).toString();}
Object.setPrototypeOf(WorkerDate,RealDate);WorkerDate.prototype=RealDate.prototype;WorkerDate.now=()=>now;
globalThis.Date=WorkerDate;
const requests=[];
const actualFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert.ok(!url.username&&!url.password&&!url.hash);
  const method=String(init.method||(typeof input==='object'&&input.method)||'GET').toUpperCase();
  if(url.port==='57911')assert.ok(method==='GET'&&['/dolar','/dolares','/simple/price'].includes(url.pathname),'Unknown local double route');
  else{assert.equal(url.port,'58321');assert.equal(url.pathname,'/rest/v1/exchange_rates');assert.ok(['GET','POST'].includes(method),'Only rate reads/appends are allowed');}
  requests.push({origin:url.origin,path:url.pathname,method});
  const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));headers.set('Connection','close');
  return actualFetch(input,{...init,redirect:'error',headers});
};
Object.defineProperty(globalThis,'__zarixQuoteClock',{value:{start,requests,set(seconds){assert.ok([0,299,300,301].includes(seconds));now=RealDate.parse(start)+seconds*1000;},scope:'Date only in this worker; OS clock, timers and database clock unchanged'},writable:false});
