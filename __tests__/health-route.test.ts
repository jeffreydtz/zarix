import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  error: null as null | { code: string; message: string },
  head: false,
  allowed: true,
  throwClient: false,
}));

vi.mock('@/lib/rate-limit', () => ({
  clientIpFromRequest: () => 'synthetic-health-probe',
  rateLimitAllow: () => state.allowed,
}));
vi.mock('@/lib/supabase/server', () => {
  const result = () => ({ data: state.head ? null : [], error: state.head ? null : state.error });
  // Models the observed gateway/SDK failure: HEAD suppresses the GET error.
  const query: any = {
    select: (_columns: string, options?: { head?: boolean }) => { state.head = !!options?.head; return query; },
    eq: () => query,
    limit: () => Promise.resolve(result()),
    then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
  };
  const client = async () => {
    if (state.throwClient) throw new Error('PRIVATE_CREDENTIAL_SENTINEL');
    return { from: () => query };
  };
  return { createClient: client, createServiceClient: client };
});
import { GET } from '@/app/api/health/route';

describe('public health response', () => {
  beforeEach(() => { state.error = null; state.head = false; state.allowed = true; state.throwClient = false; });
  const request = () => new NextRequest('http://localhost/api/health');
  it('reports a successful empty system query without returning database rows', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', db: 'ok', latencyMs: expect.any(Number) });
  });
  it('does not call a failed GET healthy when HEAD would suppress its error', async () => {
    state.error = { code: 'PGRST205', message: 'PRIVATE_CREDENTIAL_SENTINEL' };
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'degraded', db: 'error', latencyMs: expect.any(Number) });
  });
  it('keeps client errors private', async () => {
    state.throwClient = true;
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('PRIVATE_CREDENTIAL_SENTINEL');
  });
  it('rate limits before requesting a database client', async () => {
    state.allowed = false; state.throwClient = true;
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ status: 'busy' });
  });
});
