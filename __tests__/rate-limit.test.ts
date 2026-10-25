import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createBareServiceClient: () => ({ rpc: mocks.rpc }),
}));

import { rateLimitAllow, rateLimitAllowShared, SHARED_RPC_TIMEOUT_MS } from '@/lib/rate-limit';

describe('rateLimitAllow', () => {
  it('allows up to max then denies inside the window', () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect(rateLimitAllow(key, 2, 60_000)).toBe(true);
    expect(rateLimitAllow(key, 2, 60_000)).toBe(true);
    expect(rateLimitAllow(key, 2, 60_000)).toBe(false);
  });
});

describe('rateLimitAllowShared', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared atomic counter and fails closed on rpc errors', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await rateLimitAllowShared('pat-token:abc', 2, 60_000)).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: 'pat-token:abc',
      p_max: 2,
      p_window_ms: 60_000,
    });
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await rateLimitAllowShared('pat-token:abc', 2, 60_000)).toBe(false);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } });
    expect(await rateLimitAllowShared('pat-user:abc', 2, 60_000)).toBe(false);
  });

  it('times out a hung RPC and fails closed', async () => {
    vi.useFakeTimers();
    try {
      mocks.rpc.mockReturnValue(new Promise(() => {}));
      const pending = rateLimitAllowShared('pat-token:hang', 2, 60_000);
      await vi.advanceTimersByTimeAsync(SHARED_RPC_TIMEOUT_MS);
      await expect(pending).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
