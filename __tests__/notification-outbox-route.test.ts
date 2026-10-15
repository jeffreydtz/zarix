import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({drain:vi.fn(),client:vi.fn(()=>({})),alert:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServiceClientSync:mocks.client}));
vi.mock('@/lib/services/notification-outbox',()=>({deliverNotificationOutbox:mocks.drain}));
vi.mock('@/lib/observability/alert',()=>({alertAdmin:mocks.alert}));
import { GET } from '@/app/api/cron/notification-outbox/route';
const original=process.env.CRON_SECRET;
beforeEach(()=>{vi.clearAllMocks();process.env.CRON_SECRET='fixture-only';mocks.drain.mockResolvedValue({delivered:2,failed:1});mocks.alert.mockResolvedValue(undefined);});
afterEach(()=>{process.env.CRON_SECRET=original;});
describe('dedicated notification cron',()=>{
  it('does not create clients or deliver for an invalid bearer',async()=>{
    const result=await GET(new NextRequest('http://localhost/api/cron/notification-outbox'));
    expect(result.status).toBe(401);expect(mocks.client).not.toHaveBeenCalled();expect(mocks.drain).not.toHaveBeenCalled();
  });
  it('drains once, reports retries, and never runs financial work',async()=>{
    const result=await GET(new NextRequest('http://localhost/api/cron/notification-outbox',{headers:{authorization:'Bearer fixture-only'}}));
    expect(result.status).toBe(200);expect(await result.json()).toMatchObject({job:'notification-outbox',delivered:2,failed:1,errors:1});
    expect(mocks.drain).toHaveBeenCalledTimes(1);expect(mocks.alert).toHaveBeenCalledTimes(1);
  });
});
