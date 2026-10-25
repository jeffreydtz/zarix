import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  error: null as null | { code: string; message: string },
  head: false,
  allowed: true,
  throwClient: false,
  rateLimitError: null as null | { message: string },
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
  return {
    createClient: client,
    createServiceClient: client,
    createBareServiceClient: () => ({
      rpc: async () =>
        state.rateLimitError
          ? { data: null, error: state.rateLimitError }
          : { data: true, error: null },
    }),
  };
});
import { GET } from '@/app/api/health/route';
import { readFileSync } from 'node:fs';

describe('public health response', () => {
  beforeEach(() => {
    state.error = null;
    state.head = false;
    state.allowed = true;
    state.throwClient = false;
    state.rateLimitError = null;
  });
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
  it('reports missing_rpc when rate_limit_hit is absent', async () => {
    state.rateLimitError = { message: 'Could not find the function public.rate_limit_hit in the schema cache' };
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      db: 'ok',
      rateLimit: 'missing_rpc',
      hint: expect.stringMatching(/20261024200000/),
    });
  });
  it('runbook applies 200000 before deploying application code', () => {
    const src = readFileSync('supabase/manual/README.md', 'utf8');
    expect(src).toMatch(/20261024200000_inbox_dedupe_uncertain_rate_limit/);
    expect(src).toMatch(/rate_limit_hit/);
    expect(src.indexOf('20261024200000')).toBeLessThan(src.indexOf('Deploy the #16 application code'));
  });
});
