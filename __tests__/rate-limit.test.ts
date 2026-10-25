import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignals: [] as AbortSignal[],
}));
vi.mock('@/lib/supabase/server', () => ({
  createBareServiceClient: () => ({ rpc: mocks.rpc }),
}));

import { rateLimitAllow, rateLimitAllowShared, SHARED_RPC_TIMEOUT_MS } from '@/lib/rate-limit';

function rpcBuilder(result: Promise<{ data: unknown; error: { message?: string } | null }>) {
  const builder = {
    abortSignal(signal: AbortSignal) {
      mocks.abortSignals.push(signal);
      if (signal.aborted) {
        return Promise.resolve({ data: null, error: { message: 'AbortError' } });
      }
      return new Promise<{ data: unknown; error: { message?: string } | null }>((resolve, reject) => {
        const onAbort = () => resolve({ data: null, error: { message: 'AbortError' } });
        signal.addEventListener('abort', onAbort, { once: true });
        result.then(
          (value) => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
          },
          (error) => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
          }
        );
      });
    },
  };
  return Object.assign(result, builder);
}

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
    mocks.abortSignals.length = 0;
  });

  it('uses the shared atomic counter and distinguishes allow, exhausted, and unavailable', async () => {
    mocks.rpc.mockReturnValueOnce(rpcBuilder(Promise.resolve({ data: true, error: null })));
    expect(await rateLimitAllowShared('pat-token:abc', 2, 60_000)).toBe('allow');
    expect(mocks.rpc).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: 'pat-token:abc',
      p_max: 2,
      p_window_ms: 60_000,
    });
    mocks.rpc.mockReturnValueOnce(rpcBuilder(Promise.resolve({ data: false, error: null })));
    expect(await rateLimitAllowShared('pat-token:abc', 2, 60_000)).toBe('exhausted');
    mocks.rpc.mockReturnValueOnce(rpcBuilder(Promise.resolve({ data: null, error: { message: 'unavailable' } })));
    expect(await rateLimitAllowShared('pat-user:abc', 2, 60_000)).toBe('unavailable');
  });

  it('aborts a hung RPC and reports limiter unavailable instead of quota exhausted', async () => {
    vi.useFakeTimers();
    try {
      mocks.rpc.mockReturnValue(rpcBuilder(new Promise(() => {})));
      const pending = rateLimitAllowShared('pat-token:hang', 2, 60_000);
      await vi.advanceTimersByTimeAsync(SHARED_RPC_TIMEOUT_MS);
      await expect(pending).resolves.toBe('unavailable');
      expect(mocks.abortSignals).toHaveLength(1);
      expect(mocks.abortSignals[0]?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
