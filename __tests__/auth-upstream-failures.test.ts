import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), cookies: undefined as undefined | { setAll: (items: Array<{ name: string; value: string; options: Record<string, unknown> }>) => void } }));
vi.mock('@supabase/ssr', () => ({ createServerClient: (_url: unknown, _key: unknown, options: { cookies: typeof mocks.cookies }) => {
  mocks.cookies = options.cookies;
  return { auth: { getUser: mocks.getUser } };
} }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
import { middleware } from '@/middleware';
import { withAuth } from '@/lib/api-handler';

beforeEach(() => vi.clearAllMocks());

describe('Auth upstream errors do not become false logout', () => {
  it.each([false, true])('returns a safe retryable middleware response on upstream failure (throws=%s)', async throws => {
    const error = new AuthRetryableFetchError('synthetic private upstream detail', 504);
    if (throws) mocks.getUser.mockRejectedValueOnce(error);
    else mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error });
    const response = await middleware(new NextRequest('http://127.0.0.1/dashboard'));
    expect(response.status).toBe(503);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('private upstream');
  });

  it('keeps unauthenticated or invalid-token requests denied by redirect', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthApiError('synthetic bad token', 401, 'bad_jwt') });
    const response = await middleware(new NextRequest('http://127.0.0.1/dashboard'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });

  it('keeps an HTTP408 timeout retryable in middleware and API', async () => {
    const error = new AuthApiError('synthetic request timeout', 408, 'request_timeout');
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    expect((await middleware(new NextRequest('http://127.0.0.1/dashboard'))).status).toBe(503);
    const handler = vi.fn(async () => NextResponse.json({ created: true }));
    expect((await withAuth(handler)(new Request('http://127.0.0.1/api/transactions'))).status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it('preserves rotated SDK cookies when a following user lookup times out', async () => {
    mocks.getUser.mockImplementationOnce(async () => {
      mocks.cookies!.setAll([{ name: 'synthetic-refresh', value: 'synthetic-rotated', options: { httpOnly: true, path: '/' } }]);
      return { data: { user: null }, error: new AuthRetryableFetchError('synthetic timeout after rotation', 504) };
    });
    const response = await middleware(new NextRequest('http://127.0.0.1/dashboard'));
    expect(response.status).toBe(503);
    expect(response.cookies.get('synthetic-refresh')).toMatchObject({ value: 'synthetic-rotated', httpOnly: true, path: '/' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('allows a normally authenticated request and public navigation during an outage', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'synthetic-user' } }, error: null });
    expect((await middleware(new NextRequest('http://127.0.0.1/dashboard'))).headers.get('x-middleware-next')).toBe('1');
    mocks.getUser.mockRejectedValueOnce(new Error('synthetic outage'));
    expect((await middleware(new NextRequest('http://127.0.0.1/demo'))).headers.get('x-middleware-next')).toBe('1');
  });

  it.each([false, true])('returns safe API503 without invoking a financial handler (throws=%s)', async throws => {
    const error = new AuthRetryableFetchError('synthetic private upstream detail', 504);
    if (throws) mocks.getUser.mockRejectedValueOnce(error);
    else mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error });
    const handler = vi.fn(async () => NextResponse.json({ created: true }));
    const response = await withAuth(handler)(new Request('http://127.0.0.1/api/transactions'));
    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain('private upstream');
  });

  it('keeps invalid credentials at API401 and does not invoke the handler', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthApiError('synthetic bad token', 401, 'bad_jwt') });
    const handler = vi.fn(async () => NextResponse.json({ created: true }));
    const response = await withAuth(handler)(new Request('http://127.0.0.1/api/transactions'));
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});
