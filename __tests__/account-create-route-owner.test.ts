import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }));
vi.mock('@/lib/services/accounts', () => ({ accountsService: { create: mocks.create } }));
import { POST } from '@/app/api/accounts/route';
beforeEach(()=> { vi.clearAllMocks();mocks.user.mockResolvedValue({ data: { user: { id: 'owner-a' } } });mocks.create.mockResolvedValue({ id:'created-account' }); });
function req(owner:string) { return new NextRequest('http://localhost/api/accounts',{method:'POST',headers:{'X-Queue-Owner':owner,'Idempotency-Key':'fixture-key'},body:JSON.stringify({name:'Fixture',currency:'ARS',type:'bank'})}); }
it('does not replay queued account creation under another authenticated owner',async()=>{
 const response=await POST(req('owner-b'));expect(response.status).toBe(403);expect(mocks.create).not.toHaveBeenCalled();
});
it('binds the queue owner and echoes the durable request receipt key',async()=>{
 const response=await POST(req('owner-a'));expect(response.status).toBe(201);expect(response.headers.get('Idempotency-Key')).toBe('fixture-key');
 expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({userId:'owner-a',requestId:'fixture-key'}));
});
