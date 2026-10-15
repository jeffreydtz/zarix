// Offline completion of the SSR assertion against the captured actual DB quote.
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import path from'node:path';
import{fileURLToPath}from'node:url';
import{createRequire}from'node:module';
import{createHash}from'node:crypto';
import{spawnSync}from'node:child_process';
import React from'react';
import{renderToStaticMarkup}from'react-dom/server';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../../../..'),require=createRequire(path.join(root,'package.json'));
globalThis.React=React;
globalThis.fetch=()=>{throw new Error('No HTTP is allowed in the captured-quote SSR followup');};
const sha=x=>createHash('sha256').update(x).digest('hex');
const capturedPath=path.join(here,'attempt-1/failure300.json'),capturedRaw=await fs.readFile(capturedPath),captured=JSON.parse(capturedRaw);
assert.equal(captured.scenario,'failure300');assert.equal(captured.t0,'2026-10-06T16:00:00.000Z');assert.equal(captured.failure.type,'ReferenceError');
assert.ok(captured.assertions.length===9&&captured.assertions.every(x=>x.status==='PASS'));
assert.deepEqual(captured.counters,{primary:2,secondary:1,crypto:{bitcoin:0,ethereum:0,tether:0}});
assert.deepEqual(captured.served.filter(x=>x.status===503).map(x=>x.path),['/dolar','/dolares']);
assert.deepEqual(captured.returnedQuote,{type:'blue',buy:1200,sell:1200,timestamp:captured.t0,provider:null,origin:'persisted'});
const revision='836fd18b310a51cced9074b372a80ce5d7e1a870';const sourceManifest=[];
for(const p of['lib/blue-fx-reference.ts','components/ui/BlueFxReferenceDetails.tsx']){
 const raw=await fs.readFile(path.join(root,p)),git=spawnSync('git',['show',revision+':'+p],{cwd:root,env:{...process.env,DEVELOPER_DIR:'/Library/Developer/CommandLineTools'}});assert.equal(git.status,0);assert.equal(sha(raw),sha(git.stdout));sourceManifest.push({path:p,sha256:sha(raw)});
}
const{blueFxReference}=require(path.join(root,'lib/blue-fx-reference.ts'));const{default:Component}=require(path.join(root,'components/ui/BlueFxReferenceDetails.tsx'));
const reference=blueFxReference(captured.returnedQuote),html=renderToStaticMarkup(React.createElement(Component,{reference}));
assert.deepEqual(reference,{type:'blue',side:'sell',rate:1200,observedAt:captured.t0,provider:null,origin:'persisted'});
assert.ok(html.includes('Cotización guardada'));assert.ok(html.includes('proveedor original no informado'));
assert.equal(html.match(/<time\b[^>]*\bdatetime=["']([^"']+)["']/i)?.[1],captured.t0);
const fixtureConfig=await fs.readFile(process.env.TSX_TSCONFIG_PATH);
const report={verifiedAt:new Date().toISOString(),status:'PASS',scope:'Offline SSR of the exact returnedQuote from the original actual DB fallback. Actual helper and component match immutable CI4 Git. Real React runtime provided for classic JSX; no service rerun, HTTP, DB, new FX, browser or application source change.',revision,capturedArtifact:{path:path.relative(root,capturedPath),sha256:sha(capturedRaw)},sourceManifest,rendererSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),tsxConfigSha256:sha(fixtureConfig),reactVersion:React.version,reference,ssrHtml:html,assertions:[{name:'Actual persisted BlueFxReference keeps1200/T0/null provider',status:'PASS'},{name:'Actual component labels saved quote',status:'PASS'},{name:'Actual component does not fabricate provider',status:'PASS'},{name:'Actual component time attribute preservesT0',status:'PASS'}]};
await fs.writeFile(path.join(here,'ssr-followup.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,assertions:report.assertions.length,httpRequests:0,sqlCalls:0,newFxRows:0}));
