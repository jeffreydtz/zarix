import { afterEach, describe, expect, it, vi } from 'vitest';
import { observe, observedRequest, observedStep } from '@/lib/observability/correlation';

const id = '00000000-0000-4000-8000-000000000013';
afterEach(() => vi.restoreAllMocks());

describe('request correlation and content-free counter samples', () => {
  it('keeps concurrent async contexts apart and returns their IDs', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = observedRequest(new Request('http://localhost/api/transactions', {
      headers: { 'x-correlation-id': 'corr-cnf13-01' },
    }), 'manual', 'transaction.create', async () => {
      await gate;
      observe({ component: 'database', action: 'persist', outcome: 'success', referenceType: 'transaction', referenceId: id });
      return new Response('{}', { status: 201 });
    });
    const second = await observedRequest(new Request('http://localhost/api/cron/recurring', {
      headers: { 'x-correlation-id': 'corr-cnf13-04' },
    }), 'cron', 'cron.run', async () => new Response('{}'));
    release();
    expect((await first).headers.get('x-correlation-id')).toBe('corr-cnf13-01');
    expect(second.headers.get('x-correlation-id')).toBe('corr-cnf13-04');
    const rows = log.mock.calls.map(([raw]) => JSON.parse(raw));
    expect(rows.find(row => row.referenceId === id)).toMatchObject({ correlationId: 'corr-cnf13-01', channel: 'manual' });
    expect(rows.filter(row => row.channel === 'cron')).toEqual(expect.arrayContaining([
      expect.objectContaining({ correlationId: 'corr-cnf13-04', job: 'recurring', outcome: 'success' }),
    ]));
    expect(rows.every(row => !Number.isNaN(Date.parse(row.timestamp)))).toBe(true);
  });

  it('drops unknown metadata, invalid row references and arbitrary correlation headers', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const marker = 'SECRETO_CNF13 SUELDO_PRIVADO_CNF13 IMAGEN_CNF13';
    const response = await observedRequest(new Request('http://localhost/api/transactions', {
      headers: { 'x-correlation-id': marker, authorization: marker, cookie: marker },
    }), 'manual', 'transaction.create', async () => {
      observe({ component: 'service', action: 'execute', outcome: 'error', failureClass: 'consistency',
        referenceId: marker, transactionId: marker, ...{ payload: marker, error: new Error(marker) } });
      return new Response('{}', { status: 500 });
    });
    expect(response.headers.get('x-correlation-id')).toMatch(/^[a-f0-9-]{36}$/);
    const output = JSON.stringify(log.mock.calls);
    for (const value of marker.split(' ')) expect(output).not.toContain(value);
    expect(output).not.toContain('authorization');
    expect(output).not.toContain('cookie');
  });

  it('keeps provider failures distinct from SQL failures and links delivery to the committed row', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    await observedRequest(new Request('http://localhost/api/cron/notification-outbox'), 'cron', 'cron.run', async () => {
      try {
        await observedStep({ component: 'service', action: 'execute', failureClass: 'consistency' }, () =>
          observedStep({ component: 'provider', action: 'deliver', failureClass: 'provider' }, async () => {
            throw new Error('SECRETO_CNF13');
          }));
      } catch {
        observe({ component: 'outbox', action: 'dispatch', outcome: 'error', failureClass: 'provider',
          referenceType: 'outbox', referenceId: id, transactionId: id });
      }
      return new Response('{}');
    });
    const rows = log.mock.calls.map(([raw]) => JSON.parse(raw));
    expect(rows.filter(row => row.outcome === 'error').every(row => row.failureClass === 'provider')).toBe(true);
    expect(rows.find(row => row.component === 'outbox')).toMatchObject({ referenceId: id, transactionId: id });
    expect(rows.at(-1)).toMatchObject({ component: 'request', outcome: 'error', status: 200,
      metric: 'zarix_operation_total', value: 1, failureClass: 'provider' });
    expect(JSON.stringify(rows)).not.toContain('SECRETO_CNF13');
  });

  it('does not classify a rejected domain request as a consistency failure', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    await observedRequest(new Request('http://localhost/api/transactions'), 'manual', 'transaction.create', async () => {
      try {
        await observedStep({ component: 'service', action: 'execute', failureClass: 'consistency' }, async () => {
          throw Object.assign(new Error('private message'), { status: 409 });
        });
      } catch { /* response owns the public domain error */ }
      return new Response('{}', { status: 409 });
    });
    expect(log.mock.calls.map(([raw]) => JSON.parse(raw)).at(-1)).toMatchObject({ outcome: 'rejected', failureClass: 'validation' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private message');
  });

  it('keeps provider 4xx/429 errors in the provider bucket', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    await observedRequest(new Request('http://localhost/api/webhooks/mercado-pago'), 'payment', 'payment.webhook', async () => {
      try {
        await observedStep({ component: 'service', action: 'execute', failureClass: 'consistency' }, () =>
          observedStep({ component: 'provider', action: 'lookup', failureClass: 'provider' }, async () => {
            throw Object.assign(new Error('private provider body'), { status: 429 });
          }));
      } catch { /* webhook asks the sender to retry */ }
      return new Response('{}', { status: 500 });
    });
    const failed = log.mock.calls.map(([raw]) => JSON.parse(raw)).filter(row => row.outcome === 'error');
    expect(failed).toHaveLength(3);
    expect(failed.every(row => row.failureClass === 'provider')).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private provider body');
  });
});
