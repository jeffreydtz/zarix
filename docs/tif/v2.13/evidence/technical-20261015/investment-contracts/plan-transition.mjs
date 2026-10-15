// Derived local fixture lifecycle; not a paid subscription/provider test or original CSV case.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const ids=(c,list)=>list.map(c.lit).join(',');
const financialRows=(c,list)=>c.rows(`SELECT * FROM transactions WHERE account_id IN(${ids(c,list)}) ORDER BY id`);
const userHash=(c)=>c.sql(`SELECT md5(to_jsonb(u)::text) FROM users u WHERE id=${c.lit(c.a.id)}`);
const otherProfileHash=(c)=>c.sql(`SELECT md5((to_jsonb(u)-ARRAY['status','current_period_end','grace_period_end','updated_at'])::text) FROM users u WHERE id=${c.lit(c.a.id)}`);
const authHash=(c)=>c.sql(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(u) ORDER BY id)::text,'[]')) FROM auth.users u WHERE id IN(${c.lit(c.a.id)},${c.lit(c.b.id)})`);

export async function planDowngrade(c,{buy,portfolio}){
 assert.equal(c.apiUrl.origin,'http://127.0.0.1:59321');assert.equal(String(c.targetManifest.databasePort),'59322');assert.equal(c.appUrl.origin,'http://127.0.0.1:3003');
 assert.equal(process.env.ZARIX_PLAN_TRANSITION_FIXTURE,'authorized-sixth-cloned-B-only');
 // No original B accounts or historic rows can be rewritten by account selection.
 c.empty(c.a,{literal:true});
 if(process.env.ZARIX_PLAN_TRANSITION_FX_FIXTURE==='authorized-new-synthetic-row'&&Number(c.sql('SELECT count(*) FROM exchange_rates'))===0){
  const preserved=()=>c.sql("SELECT md5((jsonb_build_object('accounts',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')FROM accounts t),'transactions',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')FROM transactions t),'investments',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')FROM investments t),'investment_sales',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')FROM investment_sales t)))::text)");
  const before=preserved(),id=randomUUID();c.report.adminFixtureOperations=[{type:'INSERT_NEW_SYNTHETIC_FX',id,status:'RUNNING',target:'sixth59322'}];await c.checkpoint();const row=JSON.parse(c.sql(`WITH new_rate AS (INSERT INTO exchange_rates(id,source,from_currency,to_currency,rate,timestamp)VALUES(${c.lit(id)},'blue','USD','ARS',1200,now())RETURNING *)SELECT row_to_json(new_rate) FROM new_rate`));c.report.adminFixtureOperations[0].status='PASS';c.report.executionCount=1;
  c.check('Only new sixth synthetic rate row inserted',row.id,id);c.check('FX fixture setup preserves all original financial rows including imported A',preserved(),before);c.report.syntheticFxSetup={id,source:'blue',fromCurrency:'USD',toCurrency:'ARS',rate:1200,timestamp:row.timestamp,previousRateRows:0,actualProvider:false,originalFinancialBeforeAfterHash:before};
 }
 c.rate(1200);c.slots(c.a,4);
 c.check('Sixth cloned B has no preexisting account rows',Number(c.sql(`SELECT count(*) FROM accounts WHERE user_id=${c.lit(c.a.id)}`)),0);
 const beforeState=c.rows(`SELECT status,current_period_end,grace_period_end,mp_preapproval_id FROM users WHERE id=${c.lit(c.a.id)}`)[0];c.check('Local fixture has no MercadoPago subscription capability',beforeState.mp_preapproval_id,null);
 const authBefore=authHash(c),profileBefore=otherProfileHash(c),originalUserHash=userHash(c),accounts=[],history=[];
 for(let i=0;i<4;i++){const a=await c.account(0,{currency:'USD',type:i===3?'investment':'bank'});accounts.push(a);history.push(await c.tx(a.id,10,'income',{currency:'USD'}));}
 const position=await buy(c,accounts[3],{quantity:2,price:50,current:55,ticker:'FOOFIX'}),ownedIds=accounts.map(x=>x.id);
 c.check('Premium fixture has exactly four active enabled accounts',Number(c.sql(`SELECT count(*) FROM accounts WHERE user_id=${c.lit(c.a.id)} AND is_active AND movement_enabled`)),4);
 const beforeHistory=financialRows(c,ownedIds),beforePosition=c.rows(`SELECT * FROM investments WHERE id=${c.lit(position.id)}`)[0];
 const exports=new Map();
 for(const a of accounts){const r=await c.request('GET',`/api/export/transactions?format=json&accountId=${a.id}`);c.check('Premium own history export200',r.status,200);c.check('Premium export exact own history row',r.body.map(x=>x.id),history.filter(x=>x.account_id===a.id).map(x=>x.id));exports.set(a.id,r.body);}
 c.retainOwnFixture=true;
 c.report.planTransition={scope:'Only sixth cloned B administrative fixture, no MercadoPago operation, paid event, webhook or provider-entitlement acceptance',before:{status:beforeState.status,currentPeriodEnd:beforeState.current_period_end,gracePeriodEnd:beforeState.grace_period_end},newAccountIds:ownedIds,newHistoryIds:history.map(x=>x.id),positionId:position.id,originalUserHash,historyBeforeSha256:c.digest(JSON.stringify(beforeHistory)),intendedChanges:['B.status','B.current_period_end','B.grace_period_end','B.updated_at','movement_enabled/updated_at of only four newly created B accounts'],restorationAttempted:false};
 // This is the authorized expiry fixture, not backdating an audit timestamp. The existing
 // updated_at trigger runs normally and the final Free state is intentionally retained.
 c.check('Exactly one authorized cloned B plan fixture row updated',Number(c.sql(`WITH changed AS (UPDATE users SET status='CANCELED',current_period_end=now()-interval '1 second',grace_period_end=NULL WHERE id=${c.lit(c.a.id)} AND mp_preapproval_id IS NULL RETURNING id)SELECT count(*) FROM changed`)),1);
 c.allowedPlanMutation={afterRowMd5:userHash(c)};
 const state=await c.request('GET','/api/user/subscription');c.check('Actual ordinary Auth subscription reports Free200',state.status,200);c.check('Effective Free allowance and orchestrator gate',{plan:state.body.plan,accounts:state.body.limits.accounts,orchestrator:state.body.can_use_orchestrator},{plan:'free',accounts:3,orchestrator:false});
 c.check('Local SQL agrees with actual Free allowance',Number(c.sql(`SELECT plan_account_limit(${c.lit(c.a.id)})`)),3);
 const blocked=await c.request('POST','/api/transactions',{accountId:accounts[0].id,type:'income',amount:1,currency:'USD'});c.check('Over-cap four enabled accounts require selection403',blocked.status,403);c.check('Over-cap rejection changes no history',financialRows(c,ownedIds),beforeHistory);
 const beforeAccounts=c.rows(`SELECT * FROM accounts WHERE user_id=${c.lit(c.a.id)} ORDER BY id`),fifth=await c.request('POST','/api/accounts',{name:`Downgrade forbidden fifth ${c.run}`,type:'bank',currency:'USD',initialBalance:0});c.check('Free fifth account rejected403',fifth.status,403);c.check('Rejected fifth creates no partial account',c.rows(`SELECT * FROM accounts WHERE user_id=${c.lit(c.a.id)} ORDER BY id`),beforeAccounts);
 const four=await c.request('PUT','/api/accounts/movement-selection',{accountIds:ownedIds});c.check('Selecting four on Free rejected403',four.status,403);c.check('Rejected selection changes no account columns',c.rows(`SELECT * FROM accounts WHERE user_id=${c.lit(c.a.id)} ORDER BY id`),beforeAccounts);
 const selected=ownedIds.slice(0,3),selection=await c.request('PUT','/api/accounts/movement-selection',{accountIds:selected});c.check('Normal Auth explicitly selects three own new accounts200',selection.status,200);const flags=c.rows(`SELECT id,is_active,movement_enabled,balance FROM accounts WHERE user_id=${c.lit(c.a.id)} ORDER BY id`);c.check('Four retained accounts with exactly selected three enabled',flags.map(x=>({id:x.id,active:x.is_active,enabled:x.movement_enabled})),[...accounts].sort((a,b)=>a.id.localeCompare(b.id)).map(x=>({id:x.id,active:true,enabled:selected.includes(x.id)})));
 const disabled=await c.request('POST','/api/transactions',{accountId:accounts[3].id,type:'expense',amount:1,currency:'USD'});c.check('Unselected fourth rejects movement403',disabled.status,403);c.check('Disabled-account rejection preserves full history',financialRows(c,ownedIds),beforeHistory);
 const allowed=await c.tx(accounts[0].id,1,'income',{currency:'USD'});c.check('Selected account accepts one new movement201',allowed.user_id,c.a.id);
 for(const a of accounts){const read=await c.request('GET',`/api/transactions?accountId=${a.id}`);c.check('Free reads history including disabled account200',read.status,200);c.check('Every original own history row remains readable',exports.get(a.id).every(row=>read.body.some(x=>x.id===row.id)),true);const out=await c.request('GET',`/api/export/transactions?format=json&accountId=${a.id}`);c.check('Free export including disabled account200',out.status,200);c.check('Original exported rows remain semantically identical',out.body.filter(x=>history.some(t=>t.id===x.id)),exports.get(a.id));}
 c.check('Original four full history rows retained unchanged',c.rows(`SELECT * FROM transactions WHERE id IN(${ids(c,history.map(x=>x.id))}) ORDER BY id`),beforeHistory);
 c.check('Downgrade never deletes or rewrites original new position',c.rows(`SELECT * FROM investments WHERE id=${c.lit(position.id)}`)[0],beforePosition);const p=await portfolio(c);c.check('Free retains investment read',p.investments.some(x=>x.id===position.id),true);
 c.check('All other B profile/user columns unchanged',otherProfileHash(c),profileBefore);c.check('All original Auth user columns for A/B unchanged',authHash(c),authBefore);
 c.retainOwnFixture=true;c.report.fixtureRetention={accountIds:ownedIds,positionIds:[position.id],activeAccounts:4,enabledMovementAccounts:3,finalPlan:'free',reason:'Intended final sixth-clone fixture outcome for review; no old accounts existed or were archived/edited'};
 c.report.planTransition.after={plan:'free',status:state.body.status,currentPeriodEnd:state.body.current_period_end,gracePeriodEnd:state.body.grace_period_end,userRowHash:userHash(c),otherProfileHash:profileBefore,authUsersUnchanged:true};
 c.report.planTransition.preservedScope='A and all preexisting financial rows plus all other B profile/Auth fields; B plan fields/updated_at intentionally differ. This is not all-twelve-tables-byte-identical.';
}
