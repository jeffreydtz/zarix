import { performance } from 'node:perf_hooks';
import os from 'node:os';
import fs from 'node:fs/promises';
import { bootDatabase, asRole, ids } from './lib/test-isolated-database.mjs';
const { db, manifest } = await bootDatabase();
const begun = new Date().toISOString();
try {
 await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2)',[ids.a,'performance@example.invalid']);
 await db.query("UPDATE users SET status='ACTIVE',current_period_end=now()+interval '30 days' WHERE id=$1",[ids.a]);
 await db.query(`INSERT INTO accounts(id,user_id,name,type,currency,balance) SELECT ('cccccccc-cccc-4ccc-8ccc-'||lpad(n::text,12,'0'))::uuid,$1,'Sintética '||n,'bank','ARS',0 FROM generate_series(1,10)n`,[ids.a]);
 await db.query(`INSERT INTO transactions(user_id,account_id,type,amount,currency,amount_in_account_currency,transaction_date) SELECT $1,('cccccccc-cccc-4ccc-8ccc-'||lpad(((n%10)+1)::text,12,'0'))::uuid,(CASE WHEN n%2=0 THEN 'expense' ELSE 'income' END)::transaction_type,100,'ARS',100,'2026-10-01'::timestamptz+n*interval '1 minute' FROM generate_series(1,5000)n`,[ids.a]);
 await db.query(`INSERT INTO investments(user_id,account_id,type,name,quantity,purchase_price,purchase_currency,purchase_date) SELECT $1,'cccccccc-cccc-4ccc-8ccc-000000000001','stock_us','Synthetic '||n,10,100,'USD','2026-10-01' FROM generate_series(1,100)n`,[ids.a]);
 const query = async () => asRole(db,'authenticated',ids.a,async tx => {
  const accounts = await tx.query('SELECT id,balance FROM accounts WHERE user_id=$1',[ids.a]);
  const transactions = await tx.query('SELECT type,sum(amount_in_account_currency) total,count(*) count FROM transactions WHERE user_id=$1 GROUP BY type',[ids.a]);
  const investments = await tx.query('SELECT count(*) count,sum(quantity*purchase_price) basis FROM investments WHERE user_id=$1',[ids.a]);
  if(accounts.rows.length!==10||transactions.rows.reduce((n,r)=>n+Number(r.count),0)!==5000||Number(investments.rows[0].count)!==100)throw Error('Incomplete financial rows');
 });
 const coldStart=performance.now();await query();const coldMs=performance.now()-coldStart;
 for(let n=0;n<5;n++)await query();
 const observations=[];
 for(let n=0;n<100;n++){const start=performance.now();let error=null;try{await query();}catch(e){error=e.message;}observations.push({index:n+1,durationMs:performance.now()-start,status:error?'FAIL':'PASS',error});}
 const sorted=observations.map(x=>x.durationMs).sort((a,b)=>a-b);
 const report={startedAt:begun,finishedAt:new Date().toISOString(),kind:'isolated SQL microbenchmark',scope:'One PGlite connection, normal PostgreSQL role; no HTTP, browser, network shaping, parallel sessions or provider calls. Does not establish CNF-01 dashboard SLO or monthly availability.',environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,postgres:(await db.query('SELECT version()')).rows[0].version},fixture:{accounts:10,transactions:5000,positions:100},sourceManifest:manifest,coldMs,warmup:5,observations,summary:{count:100,failures:observations.filter(x=>x.status==='FAIL').length,p50Ms:sorted[49],p95Ms:sorted[94],maxMs:sorted[99],percentileMethod:'Nearest rank, including failed observations in durations'},blocked:['20 simultaneous authenticated browser sessions','100 UI navigations at 20Mbps/50ms','real-provider outage profile','responsive browser matrix','monthly availability observation']};
 const destination=process.env.ZARIX_PERFORMANCE_REPORT||'/tmp/zarix-isolated-performance.json';await fs.writeFile(destination,JSON.stringify(report,null,2));console.log(JSON.stringify({report:destination,summary:report.summary,coldMs,scope:report.scope},null,2));if(report.summary.failures)process.exitCode=1;
} finally {await db.close();}
