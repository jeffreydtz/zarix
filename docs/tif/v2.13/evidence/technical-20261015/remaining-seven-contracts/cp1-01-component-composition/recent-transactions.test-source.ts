import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import RecentTransactions from '@/components/dashboard/RecentTransactions';
import type {TransactionWithCategory} from '@/lib/services/transactions';

// Real React and actual dashboard component, no mocks. No Next/browser/API/DB.
// Only recorded/confirmed fields plus submitted description are supplied; this is
// a composed display focal, not a claim that the historical dashboard limit5 was queried.
it('CP1-01 actual RecentTransactions formats the recorded native expense1500 with its exact identity',()=>{
 const historical=JSON.parse(readFileSync(fileURLToPath(new URL('../../remaining-cu001/attempt-1-eight-cases/verification.json',import.meta.url)),'utf8'));
 const result=historical.results.find((r:any)=>r.id==='CP1-01');
 const checked=(name:string)=>result.assertions.find((a:any)=>a.name===name);
 expect(result.assertions.every((a:any)=>a.status==='PASS')).toBe(true);
 const literal=checked('Literal amount/category/date/owner').actual, listed=checked('List API displays same1500 row').actual;
 const account=historical.fixtures.find((f:any)=>f.name?.startsWith('RemainingCU001 CP1-01 ')),category=historical.fixtures.find((f:any)=>f.kind==='category'&&f.id===literal.category);
 const transaction={id:listed.id,user_id:literal.owner,account_id:account.id,type:'expense',amount:listed.amount,currency:'ARS',
  category_id:category.id,transaction_date:literal.date,description:`RemainingCU001 CP1-01 ${historical.run}`,
  category:{name:category.name,icon:'🔁'},account:{name:account.name,currency:'ARS'}} as TransactionWithCategory;
 const element=createElement(RecentTransactions,{transactions:[transaction]});
 const identity={id:element.props.transactions[0].id,user_id:element.props.transactions[0].user_id,account_id:element.props.transactions[0].account_id,
  category_id:element.props.transactions[0].category_id,amount:element.props.transactions[0].amount,currency:element.props.transactions[0].currency,type:element.props.transactions[0].type,date:element.props.transactions[0].transaction_date};
 const expected={id:'2a3beea0-efe9-465b-a54f-d8adf04de9da',user_id:'172273ed-7c48-427d-a55b-742069a4d9de',account_id:'fcc34447-22d1-4b48-aec5-c03f8a0123f0',category_id:'438e9f9a-8736-4879-b0fc-16c2fa26f306',amount:1500,currency:'ARS',type:'expense',date:'2026-10-06'};
 expect(identity).toEqual(expected);expect(element.type).toBe(RecentTransactions);
 const html=renderToStaticMarkup(element),text=html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 writeFileSync(fileURLToPath(new URL('./recent-transactions.html',import.meta.url)),html+'\n');
 writeFileSync(fileURLToPath(new URL('./render-observation.json',import.meta.url)),JSON.stringify({case_id:'CP1-01',identity,text,scope:'Actual RecentTransactions SSR component with matching independently recorded native input. Historical and current global dashboard top5 membership were not observed; no Next request/browser/hydration/mobile expansion/animation acceptance.'},null,2)+'\n');
 expect(text).toContain('Ultimos Movimientos');expect(text).toMatch(/-\s*\$1\.500,00\s+ARS/);expect(text).toContain(transaction.description!);
});
