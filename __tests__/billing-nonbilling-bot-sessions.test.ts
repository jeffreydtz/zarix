import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), insert: vi.fn(), eq: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from }) }));
import { appendBotTurn, clearBotSession, getStoredTurns } from '@/lib/services/botSessions';

function result(value: Record<string, unknown>) {
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => { mocks.eq(...args); return query; },
    maybeSingle: async () => value,
    update: (changes: unknown) => { mocks.update(changes); return query; },
    insert: (changes: unknown) => { mocks.insert(changes); return query; },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve),
  };
  return query;
}
beforeEach(() => vi.clearAllMocks());

describe('bot session persistence', () => {
  it('rejects failed history reads instead of treating them as an empty history', async () => {
    const error = new Error('synthetic read failure');
    mocks.from.mockReturnValueOnce(result({ data: null, error }));
    await expect(getStoredTurns('user-A', 111)).rejects.toBe(error);
  });

  it('returns valid history turns when a read succeeds', async () => {
    mocks.from.mockReturnValueOnce(result({ data: { context: [{ role: 'user', text: 'hola' }, { role: 'invalid', text: 'bad' }] }, error: null }));
    await expect(getStoredTurns('user-A', 111)).resolves.toEqual([{ role: 'user', text: 'hola' }]);
  });

  it('does not insert a replacement session when reading the existing session failed', async () => {
    const error = new Error('synthetic read failure');
    mocks.from.mockReturnValueOnce(result({ data: null, error }));
    await expect(appendBotTurn('user-A', 111, 'hola', 'respuesta')).rejects.toBe(error);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([true, false])('rejects the returned database write error for existing=%s', async (existing) => {
    const error = new Error('synthetic write failure');
    mocks.from
      .mockReturnValueOnce(result({ data: existing ? { id: 'session-A', context: [] } : null, error: null }))
      .mockReturnValueOnce(result({ error }));
    await expect(appendBotTurn('user-A', 111, 'hola', 'respuesta')).rejects.toBe(error);
  });

  it('caps stored history and scopes updates to the owner', async () => {
    const context = Array.from({ length: 24 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: `turn ${i}` }));
    mocks.from
      .mockReturnValueOnce(result({ data: { id: 'session-A', context }, error: null }))
      .mockReturnValueOnce(result({ error: null }));
    await appendBotTurn('user-A', 111, 'new user', 'new model');
    expect(mocks.update.mock.calls[0][0].context).toHaveLength(24);
    expect(mocks.update.mock.calls[0][0].context.at(-1)).toEqual({ role: 'model', text: 'new model' });
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'user-A');
  });

  it('does not report a reset successful after a read failure', async () => {
    const error = new Error('synthetic read failure');
    mocks.from.mockReturnValueOnce(result({ data: null, error }));
    await expect(clearBotSession('user-A', 111)).rejects.toBe(error);
  });

  it('does not report a reset successful after an update failure', async () => {
    const error = new Error('synthetic write failure');
    mocks.from
      .mockReturnValueOnce(result({ data: { id: 'session-A' }, error: null }))
      .mockReturnValueOnce(result({ error }));
    await expect(clearBotSession('user-A', 111)).rejects.toBe(error);
  });
});
