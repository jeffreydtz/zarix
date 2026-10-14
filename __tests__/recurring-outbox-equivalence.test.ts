import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { asRole, bootstrapSources, ids, platformSql, seedDatabase } from '../scripts/lib/test-isolated-database.mjs';
const provider = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/telegram/send', () => ({ sendTelegramDm: provider.send }));
import { deliverNotificationOutbox } from '@/lib/services/notification-outbox';

// PostgreSQL and its persisted rows are real. Auth is the documented synthetic
// fixture, this query adapter substitutes PostgREST, and Telegram is a double.
let db: PGlite;
let directory: string;
const ruleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const requestId = `recurring:${ruleId}:2026-10-09`;
const fingerprint = 'a'.repeat(64);
type OutboxFixture = { id: string; lease_token: string; attempts: number; delivered_at: string | null; last_error: string | null };
const movement = { user_id: ids.a, type: 'expense', account_id: ids.accountA,
  amount: 1000, currency: 'ARS', amount_in_account_currency: 1000,
  transaction_date: '2026-10-09T12:00:00Z', is_recurring: true,
  recurring_rule_id: ruleId, description: 'Alquiler sintético' };

async function reopen() {
  await db.close();
  db = await PGlite.create(directory, { extensions: { uuid_ossp, pg_trgm } });
}

async function createOccurrence() {
  return asRole(db, 'service_role', null, async (tx: Transaction) =>
    (await tx.query<{ receipt: { id: string } }>('SELECT create_transaction_once($1,$2,$3,$4,1) AS receipt',
      [ids.a, requestId, fingerprint, JSON.stringify(movement)])).rows[0].receipt);
}

async function snapshot() {
  return (await db.query<{ value: unknown }>(`SELECT jsonb_build_object(
    'balance',(SELECT balance FROM accounts WHERE id=$1),
    'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t),
    'marker',(SELECT last_executed_date FROM recurring_rules WHERE id=$2),
    'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY request_id) FROM transaction_requests r)) AS value`,
    [ids.accountA, ruleId])).rows[0].value;
}

function dispatcherClient(options = { loseAcknowledgement: false }): any {
  const query = (sql: string, values: unknown[] = []) => asRole(db, 'service_role', null, (tx: Transaction) => tx.query(sql, values));
  return {
    async rpc(name: string, args: Record<string, any>) {
      if (name === 'claim_notification_outbox') return { data: (await query('SELECT * FROM claim_notification_outbox($1)', [args.p_limit])).rows, error: null };
      if (name === 'release_notification_outbox') {
        await query('SELECT release_notification_outbox($1)', [JSON.stringify(args.p_claims)]);
        return { data: null, error: null };
      }
      throw new Error(`Unsupported fixture RPC: ${name}`);
    },
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let update: Record<string, unknown> | undefined;
      const execute = async () => {
        if (table === 'users' && !update) {
          return { data: (await query('SELECT telegram_chat_id, telegram_bot_token FROM users WHERE id=$1', [filters[0][1]])).rows[0], error: null };
        }
        if (table !== 'notification_outbox' || !update) throw new Error(`Unsupported fixture table: ${table}`);
        if (options.loseAcknowledgement && update.delivered_at) {
          options.loseAcknowledgement = false;
          return { data: null, error: new Error('Synthetic lost database acknowledgement') };
        }
        const columns = Object.keys(update);
        const allowed = ['delivered_at', 'lease_until', 'lease_token', 'last_error', 'available_at'];
        if (columns.some(column => !allowed.includes(column)) || filters.some(([column]) => !['id', 'user_id', 'lease_token'].includes(column))) throw new Error('Unsupported fixture column');
        const values = [...Object.values(update), ...filters.map(([, value]) => value)];
        const statement = `UPDATE notification_outbox SET ${columns.map((column, index) => `${column}=$${index + 1}`).join(',')}
          WHERE ${filters.map(([column], index) => `${column}=$${columns.length + index + 1}`).join(' AND ')} RETURNING id`;
        return { data: (await query(statement, values)).rows[0] ?? null, error: null };
      };
      const builder: any = {
        eq(column: string, value: unknown) { filters.push([column, value]); return builder; },
        select() { return builder; },
        update(value: Record<string, unknown>) { update = value; return builder; },
        single: execute,
        maybeSingle: execute,
        then(resolve: any, reject: any) { return execute().then(resolve, reject); },
      };
      return builder;
    },
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  provider.send.mockResolvedValue(undefined);
  directory = await mkdtemp(path.join(os.tmpdir(), 'zarix-outbox-contract-'));
  db = await PGlite.create(directory, { extensions: { uuid_ossp, pg_trgm } });
  await db.exec(platformSql);
  for (const file of await bootstrapSources()) await db.exec(file.sql);
  await seedDatabase(db);
  await db.query("UPDATE users SET status='ACTIVE',current_period_end=now()+interval '1 month',telegram_chat_id=12345 WHERE id=$1", [ids.a]);
  await db.query(`INSERT INTO recurring_rules(id,user_id,account_id,type,amount,currency,description,frequency,start_date,notification_enabled)
    VALUES($1,$2,$3,'expense',1000,'ARS','Alquiler sintético','daily','2026-10-01',true)`, [ruleId, ids.a, ids.accountA]);
}, 20_000);

afterEach(async () => {
  if (db && !db.closed) await db.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('historical recurring contracts reconciled with durable outbox', () => {
  it('RTV-034 equivalent: one committed movement, marker and notification intention; one confirmed delivery', async () => {
    const [first, replay] = await Promise.all([createOccurrence(), createOccurrence()]);
    expect(replay).toEqual(first);
    expect(await snapshot()).toMatchObject({ balance: 9000, marker: '2026-10-09', transactions: [{ id: first.id }], receipts: [{ request_id: requestId }] });
    expect((await db.query('SELECT * FROM notification_outbox')).rows).toMatchObject([{ event_key: requestId, payload: { transactionId: first.id }, delivered_at: null }]);
    expect(await deliverNotificationOutbox(dispatcherClient())).toEqual({ delivered: 1, failed: 0 });
    expect(await deliverNotificationOutbox(dispatcherClient())).toEqual({ delivered: 0, failed: 0 });
    expect(provider.send).toHaveBeenCalledOnce();
    expect(provider.send).toHaveBeenCalledWith(12345, expect.stringContaining('Alquiler sintético'), expect.any(Object));
  }, 20_000);

  it('RTV-038 equivalent: unavailable Telegram preserves the confirmed movement and durable retry across database restart', async () => {
    const receipt = await createOccurrence();
    const financial = await snapshot();
    provider.send.mockRejectedValueOnce(new Error('Synthetic provider unavailable'));
    expect(await deliverNotificationOutbox(dispatcherClient())).toEqual({ delivered: 0, failed: 1 });
    expect(await snapshot()).toEqual(financial);
    const pending = (await db.query<OutboxFixture>('SELECT * FROM notification_outbox')).rows[0];
    expect(pending.delivered_at).toBeNull();
    expect(pending.last_error).toBe('Entrega no confirmada');
    await reopen();
    expect(await createOccurrence()).toEqual(receipt);
    expect(await snapshot()).toEqual(financial);
    await db.exec("UPDATE notification_outbox SET available_at=now()-interval '1 second'");
    expect(await deliverNotificationOutbox(dispatcherClient())).toEqual({ delivered: 1, failed: 0 });
    expect(await snapshot()).toEqual(financial);
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect((await db.query<{ n: number }>('SELECT count(*) AS n FROM notification_outbox WHERE delivered_at IS NOT NULL')).rows[0].n).toBe(1);
  }, 20_000);

  it('a lost delivery acknowledgement can repeat the notice after restart without repeating its financial effect', async () => {
    await createOccurrence();
    const financial = await snapshot();
    expect(await deliverNotificationOutbox(dispatcherClient({ loseAcknowledgement: true }))).toEqual({ delivered: 0, failed: 1 });
    await reopen();
    await db.exec("UPDATE notification_outbox SET available_at=now()-interval '1 second'");
    expect(await deliverNotificationOutbox(dispatcherClient())).toEqual({ delivered: 1, failed: 0 });
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(await snapshot()).toEqual(financial);
    expect((await db.query<{ n: number }>('SELECT count(*) AS n FROM notification_outbox')).rows[0].n).toBe(1);
  }, 20_000);

  it('active leases survive restart; expired leases recover with a fresh token and reject a stale acknowledgement', async () => {
    await createOccurrence();
    const financial = await snapshot();
    const first = (await asRole(db, 'service_role', null, (tx: Transaction) => tx.query<OutboxFixture>('SELECT * FROM claim_notification_outbox(1)'))).rows[0];
    await reopen();
    expect((await db.query('SELECT * FROM claim_notification_outbox(1)')).rows).toEqual([]);
    await db.exec("UPDATE notification_outbox SET lease_until=now()-interval '1 second'");
    const retry = (await db.query<OutboxFixture>('SELECT * FROM claim_notification_outbox(1)')).rows[0];
    expect(retry.id).toBe(first.id);
    expect(retry.lease_token).not.toBe(first.lease_token);
    expect(retry.attempts).toBe(2);
    const stale = await db.query('UPDATE notification_outbox SET delivered_at=now() WHERE id=$1 AND lease_token=$2 RETURNING id', [first.id, first.lease_token]);
    expect(stale.rows).toEqual([]);
    expect(await snapshot()).toEqual(financial);
  }, 20_000);
});
