import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import InvestmentsList from '@/components/investments/InvestmentsList';
import {ConfirmProvider} from '@/components/ui/ConfirmDialog';
import type {InvestmentWithPnL} from '@/lib/services/investments';

// Real list/provider/privacy/motion; no UI, React/state or finance doubles.
// Explicit SSR composition of the independently executed API/DB fixture.
// This does not claim a Next request, hydrated browser, animation completion,
// action interaction or a new service price/timestamp calculation.
function fixture(ticker:string, quantity:number, purchase:number, current:number, manual:boolean):InvestmentWithPnL {
 const cost=quantity*purchase, value=quantity*current, pnl=value-cost;
 return {
  id:manual?'b07b0730-0618-4da8-b358-281612527342':'8cdf33b3-d0a4-40e1-8447-3ff5164e5110',
  user_id:'2d2b872f-d7b5-4b20-9aee-e94d6249fcc7',account_id:'6e2f1e07-5d46-4e2d-8848-a0b2d632f172',
  type:'stock_us',ticker,name:ticker+' fixture manual',quantity,
  purchase_price:purchase,purchase_currency:'USD',purchase_date:'2026-10-06',current_price:current,
  current_price_updated_at:'2026-10-06T12:00:00.000Z',current_price_change_pct:null,
  market_currency:'USD',is_manual_price:manual,maturity_date:null,interest_rate:null,notes:null,
  is_active:true,created_at:'2026-10-06T12:00:00.000Z',updated_at:'2026-10-06T12:00:00.000Z',
  valuation_price_source:manual?'manual':'live',current_value:value,profit_loss:pnl,
  profit_loss_percent:pnl/cost*100,market_price_currency:'USD',cost_basis_usd:cost,
  market_value_usd:value,profit_loss_usd:pnl,profit_loss_percent_usd:pnl/cost*100,
  market_value_ars_blue:value*1200,daily_change_pct:null,daily_pnl_usd:0,realized_pnl_usd:0,sales_count:0,
 };
}
function render(position:InvestmentWithPnL,filename:string){
 const html=renderToStaticMarkup(createElement(ConfirmProvider,null,
  createElement(InvestmentsList,{investments:[position]})));
 writeFileSync(fileURLToPath(new URL(filename,import.meta.url)),html+'\n');
 return html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
describe('Actual investment display components composed with existing accepted API/DB values; SSR only',()=>{
 it('CP4-01 AAPL5×185 at190.50 displays952.50,27.50 and2.97percent',()=>{
  const text=render(fixture('AAPL',5,185,190.5,true),'investment-display-cp4-01.html');
  for(const expected of ['AAPL','5 unidades','Compra: USD 185.00','Precio: USD 190.50','USD 952.50','+USD 27.50','(+2.97%)','Precio ingresado','Manual'])expect(text).toContain(expected);
  expect(text).not.toContain('Cotización de mercado');
 });
 it('CP4-06 FOOFIX2×50 at55 displays110,10 and manual provenance without a market claim',()=>{
  const text=render(fixture('FOOFIX',2,50,55,true),'investment-display-cp4-06.html');
  for(const expected of ['FOOFIX','2 unidades','Compra: USD 50.00','Precio: USD 55.00','USD 110.00','+USD 10.00','Precio ingresado','Manual'])expect(text).toContain(expected);
  expect(text).not.toContain('Cotización de mercado');
 });
});
