import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('react', async () => ({ ...await vi.importActual('react'), cache: <T>(fn: T): T => fn }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
import { getCachedUser } from '@/lib/auth/session';

beforeEach(() => vi.clearAllMocks());

describe('server session distinguishes rejected credentials from upstream failure', () => {
  it('returns the authenticated user after a normal successful lookup', async () => {
    const user = { id: 'synthetic-user' };
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    expect(await getCachedUser()).toBe(user);
  });

  it.each([
    new AuthSessionMissingError(),
    new AuthApiError('synthetic invalid token', 401, 'bad_jwt'),
    new AuthApiError('synthetic rejected token', 403, 'bad_jwt'),
    new AuthApiError('synthetic expired token', 400, 'session_expired'),
  ])('returns no user for a missing or rejected session (%s)', async error => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    expect(await getCachedUser()).toBeNull();
  });

  it.each([
    new AuthRetryableFetchError('synthetic timeout', 504),
    new AuthApiError('synthetic server failure', 500, 'unexpected_failure'),
    new AuthApiError('synthetic rate limit', 429, 'over_request_rate_limit'),
    new AuthApiError('synthetic request timeout', 408, 'request_timeout'),
    new AuthApiError('synthetic missing endpoint', 404, undefined),
    new AuthApiError('synthetic unknown bad request', 400, undefined),
    new Error('synthetic network failure'),
  ])('propagates a temporary lookup failure instead of treating it as logout (%s)', async error => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    await expect(getCachedUser()).rejects.toBe(error);
  });
});
