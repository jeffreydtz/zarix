// Read-only public HTTP observations. This is not UI/API integration acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const output=path.resolve(process.env.ZARIX_PUBLIC_QUOTES_REPORT||'/tmp/zarix-public-quotes.json');
const providers=[
 ['CriptoYa','https://criptoya.com/api/dolar'],
 ['DolarApi','https://dolarapi.com/v1/dolares'],
 ['CoinGecko','https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,ars&include_24hr_change=true&include_last_updated_at=true'],
 ['Yahoo','https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d'],
];
const checks=[];
for(const [provider,url] of providers){
 const check={provider,url,method:'GET',observedAt:new Date().toISOString(),scope:'Actual public provider response only; no credentials, writes, authenticated application flow or availability claim'};
 try {
  const response=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'},redirect:'error'});
  const body=await response.text();
  check.httpStatus=response.status;
  check.responseSha256=createHash('sha256').update(body).digest('hex');
  let data;
  try{data=JSON.parse(body);check.parsedJson=true;}catch{check.parsedJson=false;}
  const sample=Array.isArray(data)?data[0]:data;
  check.schema=sample&&typeof sample==='object'?Object.keys(sample):[];
  check.status=response.ok&&check.parsedJson?'PASS':'BLOCKED';
  if(check.status==='BLOCKED')check.blocker=`Public endpoint returned HTTP ${response.status}; no application fallback result is inferred.`;
 } catch(error) {
  check.status='BLOCKED';check.blocker=error.name==='TimeoutError'?'Public provider timeout after 10000 ms':`Public provider transport failed (${error.name})`;
 }
 checks.push(check);
}
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify({runAt:new Date().toISOString(),node:process.version,checks},null,2)+'\n');
console.log(JSON.stringify({report:output,checks:checks.map(({provider,status,httpStatus,blocker})=>({provider,status,httpStatus,blocker}))},null,2));
