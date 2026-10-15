// Standalone local HTTP double. Importing this file never starts a server.
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const fixedTime='2026-10-06T12:00:00.000Z';
const epochSeconds=Date.parse(fixedTime)/1000;
export function clockQuoteFixture(pathname) {
  if(pathname==='/dolar')return{status:200,body:{blue:{bid:1200,ask:1200,timestamp:epochSeconds},oficial:{bid:1200,ask:1200,timestamp:epochSeconds},mep:{al30:{'24hs':{price:1200,timestamp:epochSeconds}}},ccl:{al30:{'24hs':{price:1200,timestamp:epochSeconds}}}}};
  if(pathname==='/dolares')return{status:200,body:['blue','oficial','bolsa','contadoconliqui'].map(casa=>({casa,compra:1200,venta:1200,fechaActualizacion:fixedTime}))};
  if(pathname==='/simple/price')return{status:200,body:Object.fromEntries(Object.entries({bitcoin:60000,ethereum:2500,tether:1}).map(([id,usd])=>[id,{usd,ars:usd*1200,usd_24h_change:0,last_updated_at:epochSeconds}]))};
  return{status:404,body:{synthetic:true,error:'Unknown fixed fixture route'}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  assert.equal(process.env.ZARIX_FINAL_CLOCK_QUOTES_WINDOW,'parent-released-synthetic-provider');
  process.umask(0o077);
  const runtime='/tmp/zarix-runtime-20261015',statePath=runtime+'/clock-quote-server-state.json';
  assert.equal(fs.existsSync(statePath),false,'Never overwrite prior fixture process identity/counters');
  const state={purpose:'synthetic-clock-proof-quotes',status:'STARTING',pid:process.pid,origin:'http://127.0.0.1:57912',fixedTime,
    sourceSha256:createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),startedAt:new Date().toISOString(),requests:0,counts:{},
    scope:'Explicit standalone synthetic HTTP double with fixedT0/rates; no database, proxy, external provider, credential generation or OS-clock change. Original57910 service remains untouched.'};
  fs.writeFileSync(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});
  function checkpoint(){const next=statePath+'.partial-'+process.pid;fs.writeFileSync(next,JSON.stringify(state,null,2)+'\n',{mode:0o600});fs.renameSync(next,statePath);}
  const server=http.createServer((request,response)=>{
    let pathname;try{pathname=new URL(request.url,state.origin).pathname;}catch{response.writeHead(400).end();return;}
    const result=clockQuoteFixture(pathname),body=JSON.stringify(result.body);
    state.requests++;const key=String(result.status)+':'+(result.status===200?pathname:'other');state.counts[key]=(state.counts[key]||0)+1;checkpoint();
    response.writeHead(result.status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(body);
  });
  server.once('error',error=>{state.status='FAIL';state.errorCode=typeof error.code==='string'?error.code:null;checkpoint();process.exitCode=1;});
  server.listen(57912,'127.0.0.1',()=>{state.status='LISTENING';checkpoint();console.log(JSON.stringify({status:state.status,purpose:state.purpose,pid:state.pid,origin:state.origin,fixedTime}));});
  process.once('SIGTERM',()=>server.close(()=>{state.status='STOPPED';state.stoppedAt=new Date().toISOString();checkpoint();process.exit(0);}));
}
