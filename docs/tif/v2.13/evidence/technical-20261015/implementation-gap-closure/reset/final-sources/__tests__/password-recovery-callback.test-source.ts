import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({exchange:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{exchangeCodeForSession:mocks.exchange}})}));
import {GET} from '@/app/auth/callback/route';

beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NEXT_PUBLIC_APP_URL','https://zarix.example.invalid');mocks.exchange.mockResolvedValue({error:null});});
describe('Recovery PKCE callback destination',()=>{
 it('exchanges the ordinary PKCE code and reaches only the fixed password page',async()=>{
  const response=await GET(new NextRequest('http://127.0.0.1/auth/callback?code=synthetic-code&next=%2Fauth%2Fupdate-password'));
  expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('synthetic-code');
  expect(response.headers.get('location')).toBe('https://zarix.example.invalid/auth/update-password');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
 });
 it.each(['https://foreign.example.invalid','//foreign.example.invalid','/settings'])('retains the existing dashboard destination for unrecognized next=%s',async next=>{
  const response=await GET(new NextRequest('http://127.0.0.1/auth/callback?code=synthetic-code&next='+encodeURIComponent(next)));
  expect(response.headers.get('location')).toBe('https://zarix.example.invalid/dashboard');
 });
 it('rejects an expired recovery code without reflecting provider details or the code',async()=>{
  mocks.exchange.mockResolvedValueOnce({error:new Error('synthetic-sensitive-provider-detail')});
  const response=await GET(new NextRequest('http://127.0.0.1/auth/callback?code=synthetic-private-code&next=%2Fauth%2Fupdate-password'));
  expect(response.headers.get('location')).toBe('https://zarix.example.invalid/auth/forgot-password?invalid_link=1');
  expect(response.headers.get('location')).not.toContain('synthetic');
 });
 it('rejects a missing recovery code without trying to create a session',async()=>{
  const response=await GET(new NextRequest('http://127.0.0.1/auth/callback?next=%2Fauth%2Fupdate-password'));
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(response.headers.get('location')).toBe('https://zarix.example.invalid/auth/forgot-password?invalid_link=1');
 });
 it.each([false,true])('keeps provider errors private on the existing ordinary callback (throws=%s)',async throws=>{
  const marker='synthetic-private-auth-provider-marker';
  if(throws)mocks.exchange.mockRejectedValueOnce(new Error(marker));
  else mocks.exchange.mockResolvedValueOnce({error:new Error(marker)});
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{
   const response=await GET(new NextRequest('http://127.0.0.1/auth/callback?code=synthetic-code'));
   expect(response.headers.get('location')).not.toContain(marker);
   expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
   expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
  }finally{log.mockRestore();}
 });
});
