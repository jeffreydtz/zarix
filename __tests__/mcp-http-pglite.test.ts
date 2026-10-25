import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const harness = vi.hoisted(() => ({
  client: null as null | { from: (table: string) => unknown; rpc: (name: string, args?: Record<string, unknown>) => unknown },
}));

vi.mock('@/lib/supabase/server', async () => {
  const { getPatRequestScope, wrapWithUserIdFilter } = await import('@/lib/supabase/request-scope');
  const scoped = () => {
    const client = harness.client!;
    const scope = getPatRequestScope();
    if (!scope) return client;
    return {
      from: (table: string) => wrapWithUserIdFilter(client.from(table) as object, table, scope.userId),
      rpc: (fn: string, args?: Record<string, unknown>) => {
        const claimed =
          args && typeof args.p_user_id === 'string'
            ? args.p_user_id
            : args && typeof args.user_id === 'string'
              ? args.user_id
              : null;
        if (claimed && claimed !== scope.userId) {
          const err = new Error('No autorizado') as Error & { status: number };
          err.status = 403;
          throw err;
        }
        return client.rpc(fn, args);
      },
    };
  };
  return {
    createBareServiceClient: () => harness.client!,
    createServiceClientSync: () => scoped(),
    createServiceClient: async () => scoped(),
  };
});

vi.mock('@/lib/services/cotizaciones', async () => {
  const { FxUnavailableError } = await import('@/lib/executable-fx');
  const unavailable = async () => {
    throw new FxUnavailableError('USD→ARS');
  };
  return {
    cotizacionesService: {
      getDolarQuotes: unavailable,
      getExchangeRate: unavailable,
    },
  };
});

import { generatePersonalAccessToken } from '@/lib/auth/personal-access-token';
import { POST as mcpPost } from '@/app/api/mcp/route';
import { POST as walletPost } from '@/app/api/ingest/wallet/route';
import { POST as restPost } from '@/app/api/v1/tools/[name]/route';
import { asRole, bootDatabase, ids, seedDatabase } from '../scripts/lib/test-isolated-database.mjs';
import { createPgliteSupabaseClient } from './helpers/pglite-supabase-client';

const PENDING_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
const PENDING_UPPER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
const PENDING_TIME = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9';
const PENDING_BATCH = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd9';

async function readMcpJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  const ctype = res.headers.get('content-type') || '';
  if (ctype.includes('text/event-stream')) {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    const payload = lines.at(-1);
    if (!payload) throw new Error(`empty SSE: ${text.slice(0, 400)}`);
    return JSON.parse(payload) as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function toolText(body: Record<string, unknown>): Record<string, unknown> {
  const result = body.result as { content?: Array<{ text?: string }>; isError?: boolean } | undefined;
  const raw = result?.content?.[0]?.text;
  if (!raw) return body;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { text: raw, isError: result?.isError };
  }
}

describe('MCP-over-HTTP confirm against PGlite (real transactionsService)', () => {
  let db: { close: () => Promise<void>; query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const boot = await bootDatabase();
    db = boot.db;
    await seedDatabase(db);
    const generatedA = generatePersonalAccessToken();
    const generatedB = generatePersonalAccessToken();
    tokenA = generatedA.token;
    tokenB = generatedB.token;
    await asRole(db, 'service_role', null, async (tx: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => {
      await tx.query(
        `INSERT INTO personal_access_tokens(user_id,name,token_prefix,token_hash,hash_version,scopes,expires_at)
         VALUES ($1,'MCP A',$2,$3,1,ARRAY['read','write','write:confirm','ingest'],'2099-01-01T00:00:00Z'),
                ($4,'MCP B',$5,$6,1,ARRAY['read','write','write:confirm'],'2099-01-01T00:00:00Z')`,
        [ids.a, generatedA.token.slice(0, 12), generatedA.hash, ids.b, generatedB.token.slice(0, 12), generatedB.hash]
      );
      await tx.query(
        `INSERT INTO pending_inbox_items(
           id, user_id, amount, currency, merchant, account_id, status, fingerprint, source, direction, occurred_at, tool_payload
         ) VALUES ($1,$2,18,'ARS','MCP Café',$3,'pending','fp-mcp-http-a','mcp','expense',NULL,$4::jsonb),
                  ($5,$2,18,'ARS','MCP Upper',$3,'pending','fp-mcp-http-upper','mcp','expense',NULL,$6::jsonb),
                  ($7,$2,18,'ARS','MCP Instant',$3,'pending','fp-mcp-http-time','mcp','expense','2026-10-24T23:30:00-03:00',$8::jsonb),
                  ($9,$2,18,'ARS','MCP Batch',$3,'pending','fp-mcp-http-batch','mcp','expense',NULL,$10::jsonb)`,
        [
          PENDING_A,
          ids.a,
          ids.accountA,
          JSON.stringify({
            type: 'expense',
            amount: 18,
            currency: 'ARS',
            accountId: ids.accountA,
            description: 'MCP Café',
            _tool: 'create_transaction',
          }),
          PENDING_UPPER,
          JSON.stringify({
            type: 'expense',
            amount: 18,
            currency: 'ARS',
            accountId: ids.accountA,
            description: 'MCP Upper',
            _tool: 'create_transaction',
          }),
          PENDING_TIME,
          JSON.stringify({
            type: 'expense',
            amount: 18,
            currency: 'ARS',
            accountId: ids.accountA,
            description: 'MCP Instant',
            transactionDate: '2026-10-24T23:30:00-03:00',
            _tool: 'create_transaction',
          }),
          PENDING_BATCH,
          JSON.stringify({
            type: 'expense',
            amount: 18,
            currency: 'ARS',
            accountId: ids.accountA,
            description: 'MCP Batch',
            _tool: 'create_transaction',
          }),
        ]
      );
    });
    harness.client = createPgliteSupabaseClient(db);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it('confirms over /api/mcp with one persisted ledger row and denies the other fixture', async () => {
    const headers = {
      authorization: `Bearer ${tokenA}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    const call = await mcpPost(
      new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'create_transaction',
            arguments: { confirm: true, pendingId: PENDING_A },
          },
        }),
      })
    );
    expect(call.status).toBeLessThan(500);
    const body = toolText(await readMcpJson(call));
    expect(body.success).toBe(true);

    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const ledger = await query('SELECT id, user_id, amount, source FROM transactions WHERE user_id=$1 AND description=$2', [
      ids.a,
      'MCP Café',
    ]);
    expect(ledger.rows).toHaveLength(1);
    expect(Number(ledger.rows[0].amount)).toBe(18);
    expect(ledger.rows[0].source).toBe('mcp');
    const receipts = await query('SELECT request_id FROM transaction_requests WHERE user_id=$1 AND request_id=$2', [
      ids.a,
      `wallet:${PENDING_A}`,
    ]);
    expect(receipts.rows).toHaveLength(1);
    const inbox = await query('SELECT status, confirmed_transaction_id FROM pending_inbox_items WHERE id=$1', [PENDING_A]);
    expect(inbox.rows[0].status).toBe('confirmed');
    expect(inbox.rows[0].confirmed_transaction_id).toBe(ledger.rows[0].id);

    const denied = await mcpPost(
      new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenB}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'create_transaction',
            arguments: { confirm: true, pendingId: PENDING_A },
          },
        }),
      })
    );
    const deniedBody = toolText(await readMcpJson(denied));
    expect(deniedBody.success).toBe(false);
    const otherLedger = await query('SELECT id FROM transactions WHERE user_id=$1', [ids.b]);
    expect(otherLedger.rows).toHaveLength(0);
    expect(JSON.stringify(deniedBody)).not.toContain(ids.a);
  });

  it('canonicalizes an uppercase pendingId so confirm cannot double-write', async () => {
    const headers = {
      authorization: `Bearer ${tokenA}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    const call = (pendingId: string, id: number) =>
      mcpPost(
        new NextRequest('http://localhost/api/mcp', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            method: 'tools/call',
            params: {
              name: 'create_transaction',
              arguments: { confirm: true, pendingId },
            },
          }),
        })
      );
    const upper = await call(PENDING_UPPER.toUpperCase(), 4);
    expect(upper.status).toBeLessThan(500);
    const upperBody = toolText(await readMcpJson(upper));
    expect(upperBody.success).toBe(true);

    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const ledger = await query('SELECT id, amount FROM transactions WHERE user_id=$1 AND description=$2', [
      ids.a,
      'MCP Upper',
    ]);
    expect(ledger.rows).toHaveLength(1);
    expect(Number(ledger.rows[0].amount)).toBe(18);
    const receipts = await query('SELECT request_id FROM transaction_requests WHERE user_id=$1 AND request_id LIKE $2', [
      ids.a,
      'wallet:%',
    ]);
    expect(receipts.rows.map((row: { request_id: string }) => row.request_id)).toEqual(
      expect.arrayContaining([`wallet:${PENDING_UPPER}`])
    );
    expect(receipts.rows.map((row: { request_id: string }) => row.request_id)).not.toContain(
      `wallet:${PENDING_UPPER.toUpperCase()}`
    );

    const retry = await call(PENDING_UPPER, 5);
    const retryBody = toolText(await readMcpJson(retry));
    expect(retryBody.success).toBe(true);
    const ledgerAfter = await query('SELECT id FROM transactions WHERE user_id=$1 AND description=$2', [
      ids.a,
      'MCP Upper',
    ]);
    expect(ledgerAfter.rows).toHaveLength(1);

    const dashless = await call(PENDING_UPPER.replaceAll('-', ''), 6);
    const dashlessBody = toolText(await readMcpJson(dashless));
    expect(dashlessBody.success).toBe(false);
    expect(JSON.stringify(dashlessBody)).toMatch(/pendingId|inválido|Argumentos/i);
    expect(
      (await query('SELECT id FROM transactions WHERE user_id=$1 AND description=$2', [ids.a, 'MCP Upper'])).rows
    ).toHaveLength(1);
  });

  it('counts mixed-case duplicate pendingIds once over MCP', async () => {
    const call = await mcpPost(
      new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'create_transactions',
            arguments: { confirm: true, pendingIds: [PENDING_BATCH, PENDING_BATCH.toUpperCase()] },
          },
        }),
      })
    );
    const body = toolText(await readMcpJson(call));
    expect(body.success).toBe(true);
    expect(body.executedCount).toBe(1);
    expect(body.total).toBe(1);
    expect(body.pendingIds).toEqual([PENDING_BATCH]);
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    expect(
      (await query('SELECT id FROM transactions WHERE user_id=$1 AND description=$2', [ids.a, 'MCP Batch'])).rows
    ).toHaveLength(1);
  });

  it('preserves 23:30-03:00 through MCP confirm instead of civil noon', async () => {
    const call = await mcpPost(
      new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: {
            name: 'create_transaction',
            arguments: { confirm: true, pendingId: PENDING_TIME },
          },
        }),
      })
    );
    const body = toolText(await readMcpJson(call));
    expect(body.success).toBe(true);
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const row = (
      await query('SELECT transaction_date FROM transactions WHERE user_id=$1 AND description=$2', [
        ids.a,
        'MCP Instant',
      ])
    ).rows[0];
    expect(new Date(String(row.transaction_date)).toISOString()).toBe('2026-10-25T02:30:00.000Z');
  });

  it('Wallet HTTP: date-only same day parks two items; anonymous retry is a possible duplicate; key replay and 409', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    await query(
      `INSERT INTO pending_inbox_items(user_id,amount,currency,merchant,status,fingerprint,source,direction,occurred_at,created_at)
       VALUES ($1,42,'ARS','Two-hour café','pending','fp-two-hour','wallet','expense','2026-10-24T12:00:00-03:00', now() - interval '2 hours')`,
      [ids.a]
    );
    const ingest = (body: Record<string, unknown>, key?: string) =>
      walletPost(
        new NextRequest('http://localhost/api/ingest/wallet', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${tokenA}`,
            'content-type': 'application/json',
            ...(key ? { 'idempotency-key': key } : {}),
          },
          body: JSON.stringify(body),
        })
      );
    const firstDate = await ingest({
      amount: 41,
      currency: 'ARS',
      merchant: 'Date-only café',
      cardName: 'Visa Ejemplo',
      timestamp: '2026-10-24',
    });
    expect(firstDate.status).toBe(201);
    const firstJson = (await firstDate.json()) as { duplicate: boolean; autoConfirmed: boolean; item: { id: string } };
    expect(firstJson.duplicate).toBe(false);
    expect(firstJson.autoConfirmed).toBe(false);

    const secondDate = await ingest({
      amount: 41,
      currency: 'ARS',
      merchant: 'Date-only café',
      cardName: 'Visa Ejemplo',
      timestamp: '2026-10-24',
    });
    const secondJson = (await secondDate.json()) as {
      duplicate: boolean;
      autoConfirmed: boolean;
      item: { id: string; possibleDuplicateOf?: string | null };
    };
    expect(secondDate.status).toBe(201);
    expect(secondJson.duplicate).toBe(false);
    expect(secondJson.autoConfirmed).toBe(false);
    expect(secondJson.item.id).not.toBe(firstJson.item.id);
    expect(secondJson.item.possibleDuplicateOf).toBe(firstJson.item.id);

    const keyed = await ingest(
      { amount: 43, currency: 'ARS', merchant: 'Keyed café', cardName: 'Visa Ejemplo' },
      'wallet-http-key-001'
    );
    expect(keyed.status).toBe(201);
    const keyedJson = (await keyed.json()) as { item: { id: string }; duplicate: boolean };
    const replay = await ingest(
      { amount: 43, currency: 'ARS', merchant: 'Keyed café', cardName: 'Visa Ejemplo' },
      'wallet-http-key-001'
    );
    expect(replay.status).toBe(200);
    const replayJson = (await replay.json()) as { item: { id: string }; duplicate: boolean };
    expect(replayJson.duplicate).toBe(true);
    expect(replayJson.item.id).toBe(keyedJson.item.id);

    const conflict = await ingest(
      { amount: 900, currency: 'ARS', merchant: 'Otro', cardName: 'Visa Ejemplo' },
      'wallet-http-key-001'
    );
    expect(conflict.status).toBe(409);
    const rest = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'wallet-http-key-001',
        },
        body: JSON.stringify({
          type: 'expense',
          amount: 900,
          currency: 'ARS',
          accountId: ids.accountA,
          description: 'REST reuse',
        }),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    expect(rest.status).toBe(409);
    const twoHour = await ingest({
      amount: 42,
      currency: 'ARS',
      merchant: 'Two-hour café',
      cardName: 'Visa Ejemplo',
      timestamp: '2026-10-24',
    });
    const twoHourJson = (await twoHour.json()) as {
      duplicate: boolean;
      item: { id: string; possibleDuplicateOf?: string | null };
    };
    expect(twoHour.status).toBe(201);
    expect(twoHourJson.duplicate).toBe(false);
    expect(twoHourJson.item.possibleDuplicateOf).toBeNull();
    expect(
      (await query('SELECT id FROM pending_inbox_items WHERE ingest_key=$1 AND user_id=$2', [
        'wallet-http-key-001',
        ids.a,
      ])).rows
    ).toHaveLength(1);
    expect(
      (await query("SELECT id FROM pending_inbox_items WHERE merchant='Date-only café' AND user_id=$1", [ids.a])).rows
        .length
    ).toBe(2);
    expect(
      (await query("SELECT id FROM pending_inbox_items WHERE merchant='Two-hour café' AND user_id=$1", [ids.a])).rows
        .length
    ).toBe(2);
  });

  it('REST keyed replay of a confirmed item returns stored status, not needs_confirm', async () => {
    const headers = {
      authorization: `Bearer ${tokenA}`,
      'content-type': 'application/json',
      'idempotency-key': 'rest-terminal-key-001',
    };
    const body = {
      type: 'expense',
      amount: 44,
      currency: 'ARS',
      accountId: ids.accountA,
      description: 'REST terminal',
    };
    const parked = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    const parkedJson = (await parked.json()) as { pendingId: string; needs_confirm?: boolean };
    expect(parkedJson.needs_confirm).toBe(true);
    const confirm = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ confirm: true, pendingId: parkedJson.pendingId }),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    expect(confirm.status).toBe(200);
    const replay = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    const replayJson = (await replay.json()) as {
      success?: boolean;
      duplicate?: boolean;
      status?: string;
      needs_confirm?: boolean;
      pendingId?: string;
    };
    expect(replay.status).toBe(200);
    expect(replayJson.needs_confirm).toBeUndefined();
    expect(replayJson.duplicate).toBe(true);
    expect(replayJson.status).toBe('confirmed');
    expect(replayJson.success).toBe(true);
    expect(replayJson.pendingId).toBe(parkedJson.pendingId);
  });

  it('REST equivalent canonical (UUID case, ARS default) replays; FX confirm returns 503', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const cardId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac';
    await query(
      `INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES ($1,$2,'Visa FX','credit_card','ARS',0)`,
      [cardId, ids.a]
    );
    const first = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'rest-canonical-key-001',
        },
        body: JSON.stringify({
          type: 'expense',
          amount: 45,
          currency: 'ars',
          accountId: String(ids.accountA).toUpperCase(),
          description: 'REST canonical',
        }),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    const firstJson = (await first.json()) as { pendingId: string; needs_confirm?: boolean };
    expect(firstJson.needs_confirm).toBe(true);
    const replay = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'rest-canonical-key-001',
        },
        body: JSON.stringify({
          type: 'expense',
          amount: 45,
          accountId: ids.accountA,
          description: 'REST canonical',
        }),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    const replayJson = (await replay.json()) as { pendingId?: string; needs_confirm?: boolean };
    expect(replay.status).toBe(200);
    expect(replayJson.pendingId).toBe(firstJson.pendingId);
    expect(replayJson.needs_confirm).toBe(true);

    const fxPark = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'rest-fx-key-001',
        },
        body: JSON.stringify({
          type: 'expense',
          amount: 10,
          currency: 'USD',
          accountId: cardId,
          description: 'USD on ARS card',
        }),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    const fxParked = (await fxPark.json()) as { pendingId: string };
    const fxConfirm = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ confirm: true, pendingId: fxParked.pendingId }),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    expect(fxConfirm.status).toBe(503);
    expect(
      (await query('SELECT id FROM transactions WHERE user_id=$1 AND description=$2', [ids.a, 'USD on ARS card'])).rows
    ).toHaveLength(0);
    expect(
      (await query('SELECT status FROM pending_inbox_items WHERE id=$1', [fxParked.pendingId])).rows[0].status
    ).toBe('pending');
  });

  it('REST confirmed expense resent as transfer with the same key returns 409 and writes nothing', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const headers = {
      authorization: `Bearer ${tokenA}`,
      'content-type': 'application/json',
      'idempotency-key': 'rest-type-key-040',
    };
    const parked = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'expense',
          amount: 40,
          currency: 'ARS',
          accountId: ids.accountA,
          description: 'REST type lock',
        }),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    const parkedJson = (await parked.json()) as { pendingId: string };
    const confirm = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ confirm: true, pendingId: parkedJson.pendingId }),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    expect(confirm.status).toBe(200);
    const before = (await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n;
    const transfer = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'transfer',
          amount: 40,
          currency: 'ARS',
          accountId: ids.accountA,
          destinationAccountId: ids.usdA,
          description: 'REST type lock',
        }),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    expect(transfer.status).toBe(409);
    expect(
      (await query('SELECT count(*)::int AS n FROM pending_inbox_items WHERE ingest_key=$1 AND user_id=$2', [
        'rest-type-key-040',
        ids.a,
      ])).rows[0].n
    ).toBe(1);
    expect((await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n).toBe(
      before
    );
  });

  it('REST mixed batch pendingIds include only confirmable items and mixed confirm does not partial-write', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const body = {
      transactions: [
        { type: 'expense', amount: 12, currency: 'ARS', accountId: ids.accountA, description: 'Batch pending' },
        { type: 'expense', amount: 13, currency: 'ARS', accountId: ids.accountA, description: 'Batch discarded' },
      ],
    };
    const headers = {
      authorization: `Bearer ${tokenA}`,
      'content-type': 'application/json',
      'idempotency-key': 'rest-batch-mix',
    };
    const first = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transactions', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ name: 'create_transactions' }) }
    );
    const firstJson = (await first.json()) as { pendingIds?: string[] };
    expect(firstJson.pendingIds).toHaveLength(2);
    const [pendingId, discardId] = firstJson.pendingIds ?? [];
    await query(`UPDATE pending_inbox_items SET status='discarded', discarded_at=now() WHERE id=$1 AND user_id=$2`, [
      discardId,
      ids.a,
    ]);
    const replay = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transactions', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ name: 'create_transactions' }) }
    );
    const replayJson = (await replay.json()) as {
      needs_confirm?: boolean;
      pendingIds?: string[];
      items?: Array<{ pendingId: string; status: string }>;
    };
    expect(replay.status).toBe(200);
    expect(replayJson.needs_confirm).toBe(true);
    expect(replayJson.pendingIds).toEqual([pendingId]);
    expect(replayJson.items).toEqual(
      expect.arrayContaining([
        { pendingId, status: 'pending' },
        { pendingId: discardId, status: 'discarded' },
      ])
    );
    const before = (await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n;
    const mixedConfirm = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ confirm: true, pendingIds: [pendingId, discardId] }),
      }),
      { params: Promise.resolve({ name: 'create_transactions' }) }
    );
    expect(mixedConfirm.status).toBe(400);
    expect((await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n).toBe(
      before
    );
    expect((await query('SELECT status FROM pending_inbox_items WHERE id=$1', [pendingId])).rows[0].status).toBe(
      'pending'
    );
  });
});
