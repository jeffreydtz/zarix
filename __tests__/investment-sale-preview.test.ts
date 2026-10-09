import { describe, expect, it } from 'vitest';
import { investmentSalePreview } from '@/lib/investment-sale-preview';
describe('investment sale preview currency safety',()=>{
  const input={quantity:1,price:150000,purchasePrice:100,currency:'ARS',purchaseCurrency:'USD',type:'stock_us'};
  it('hides raw price subtraction when sale and purchase currencies differ',()=>{
    expect(investmentSalePreview(input)).toBeNull();
  });
  it('shows same-currency gain and bond nominal scaling',()=>{
    expect(investmentSalePreview({...input,price:150,currency:'USD'})).toBe(50);
    expect(investmentSalePreview({...input,price:150,currency:'USD',type:'bond',quantity:100})).toBe(50);
  });
  it('does not show invalid or non-finite previews',()=>{
    expect(investmentSalePreview({...input,currency:'USD',price:Infinity})).toBeNull();
  });
});
