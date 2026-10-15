import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,afterAll} from 'vitest';
import {writeFileSync} from 'node:fs';
const observed: unknown[]=[];
afterAll(()=>writeFileSync(process.env.CP306_SSR_OBSERVATIONS!,JSON.stringify(observed,null,2)+'\n'));
import NetWorthHero from '@/components/dashboard/NetWorthHero';
import StickyNetWorthBar from '@/components/dashboard/StickyNetWorthBar';
import Amount from '@/components/ui/Amount';

// Real components/hooks/Amount. No React/state/Amount mocks, no decimals prop,
// browser, effect flush or financial API. SSR only reaches the default ARS view.
const text=(html:string)=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
function renderHero(usd:number,ars:number){
 return renderToStaticMarkup(createElement(NetWorthHero,{
  now:{liquidUSD:usd,investmentsUSD:0,totalUSD:usd,totalARSBlue:ars,blueRate:1200},
  history:[],inflacion:[],
 }));
}
describe('CP3-06 real SSR USD equivalent precision (client view and sticky visibility separate)',()=>{
 it.each([
  {usd:181.67,ars:218000,expected:'≈ US$ 181,67'},
  {usd:-181.67,ars:-218000,expected:'≈ US$ -181,67'},
  {usd:100,ars:120000,expected:'≈ US$ 100,00'},
 ])('preserves two fractional USD digits for the real Hero equivalent $usd',({usd,ars,expected})=>{
  const html=renderHero(usd,ars);
  const values=[...html.matchAll(/<data\b([^>]*)>([\s\S]*?)<\/data>/g)].map(match=>({attribute:match[1],visible:text(match[2])}));
  const equivalent=values.find(item=>item.visible.startsWith('≈ US$ '));
  observed.push({usd,ars,expected,actual:equivalent?.visible,data:values,html});
  expect(equivalent?.attribute).toContain(`value="${usd}"`);
  expect(equivalent?.visible).toBe(expected);
 });
 it.each([218000,218000.49])('preserves the existing real Amount ARS default display for %s',value=>{
  const html=renderToStaticMarkup(createElement(Amount,{value,currency:'ARS'}));
  expect(text(html)).toBe('$ 218.000');
  expect(text(html)).not.toContain(',00');
 });
 it('preserves Sticky SSR initially hidden; does not claim its visible USD branch was exercised',()=>{
  const html=renderToStaticMarkup(createElement(StickyNetWorthBar,{totalARSBlue:218000,totalUSD:181.67,sentinelId:'synthetic-cp306-sentinel'}));
  expect(html).toBe('');
 });
});
