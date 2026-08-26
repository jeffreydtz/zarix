import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { CronJob, IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';

vi.mock('@/lib/observability/alert', () => ({
  alertAdmin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: vi.fn(() => ({ from: vi.fn() })),
}));

import { alertAdmin } from '@/lib/observability/alert';

class OkJob extends CronJob {
  readonly name = 'ok-job';
  protected async execute(): Promise<Record<string, unknown>> {
    return { processed: 1 };
  }
}

class ErrorJob extends CronJob {
  readonly name = 'error-job';
  protected async execute(): Promise<Record<string, unknown>> {
    throw new Error('boom');
  }
}

class PartialErrorJob extends CronJob {
  readonly name = 'partial-error-job';
  protected async execute(): Promise<Record<string, unknown>> {
    return { errors: 2, processed: 3 };
  }
}

type Item = { id: string; skip?: boolean; fail?: boolean };

class TestIterativeJob extends IterativeCronJob<Item> {
  readonly name = 'iterative-test';

  constructor(private readonly items: Item[]) {
    super();
  }

  protected async fetchItems(): Promise<Item[]> {
    return this.items;
  }

  protected shouldProcess(item: Item): boolean {
    return !item.skip;
  }

  protected async processItem(_supabase: ServiceClient, item: Item): Promise<boolean | void> {
    if (item.fail) throw new Error(`fail ${item.id}`);
    return item.id !== 'skipped-result';
  }

  protected emptyMessage(): string {
    return 'No items';
  }
}

function makeRequest(authHeader: string | null): NextRequest {
  return new NextRequest('http://localhost/api/cron/test', {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe('CU-006 CronJob.run', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    vi.mocked(alertAdmin).mockClear();
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it('returns 401 when bearer is invalid (branch B1)', async () => {
    const res = await new OkJob().run(makeRequest('Bearer wrong'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when authorization header is missing (branch B1)', async () => {
    const res = await new OkJob().run(makeRequest(null));
    expect(res.status).toBe(401);
  });

  it('returns success payload when execute succeeds (branch B2)', async () => {
    const res = await new OkJob().run(makeRequest('Bearer test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, job: 'ok-job', processed: 1 });
    expect(alertAdmin).not.toHaveBeenCalled();
  });

  it('alerts admin when execute reports errors (branch B3)', async () => {
    const res = await new PartialErrorJob().run(makeRequest('Bearer test-secret'));
    expect(res.status).toBe(200);
    expect(alertAdmin).toHaveBeenCalledWith(
      'Cron "partial-error-job" terminó con 2 ítem(es) fallido(s).'
    );
  });

  it('returns 500 and alerts admin when execute throws (branch B4)', async () => {
    const res = await new ErrorJob().run(makeRequest('Bearer test-secret'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal error' });
    expect(alertAdmin).toHaveBeenCalledWith('Cron "error-job" FALLÓ: boom');
  });
});

describe('CU-006 IterativeCronJob.execute', () => {
  it('returns empty summary when fetch yields no items (branch B1)', async () => {
    const job = new TestIterativeJob([]);
    const result = await (job as unknown as { execute: (s: ServiceClient) => Promise<Record<string, unknown>> }).execute(
      {} as ServiceClient
    );
    expect(result).toEqual({
      total: 0,
      processed: 0,
      errors: 0,
      message: 'No items',
    });
  });

  it('skips items filtered by shouldProcess (branch B2)', async () => {
    const job = new TestIterativeJob([
      { id: 'a' },
      { id: 'b', skip: true },
    ]);
    const result = await (job as unknown as { execute: (s: ServiceClient) => Promise<Record<string, unknown>> }).execute(
      {} as ServiceClient
    );
    expect(result).toEqual({ total: 2, processed: 1, errors: 0 });
  });

  it('rethrows when fetchItems fails (branch B4)', async () => {
    class FetchFailJob extends IterativeCronJob<{ id: string }> {
      readonly name = 'fetch-fail';
      protected async fetchItems(): Promise<{ id: string }[]> {
        throw new Error('db down');
      }
      protected async processItem(): Promise<boolean> {
        return true;
      }
    }
    const job = new FetchFailJob();
    await expect(
      (job as unknown as { execute: (s: ServiceClient) => Promise<Record<string, unknown>> }).execute(
        {} as ServiceClient
      )
    ).rejects.toThrow('db down');
  });

  it('counts per-item failures without aborting the batch (branch B3)', async () => {
    const job = new TestIterativeJob([
      { id: 'ok' },
      { id: 'bad', fail: true },
      { id: 'skipped-result' },
    ]);
    const result = await (job as unknown as { execute: (s: ServiceClient) => Promise<Record<string, unknown>> }).execute(
      {} as ServiceClient
    );
    expect(result).toEqual({ total: 3, processed: 1, errors: 1 });
  });
});
