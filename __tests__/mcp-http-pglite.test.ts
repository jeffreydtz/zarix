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

  it('Wallet HTTP 40.129 returns 400 and never writes the ledger', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const before = (await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n;
    const raw =
      '{"amount":40.129,"currency":"ARS","merchant":"Excess café","cardName":"Visa Ejemplo","timestamp":"2026-10-25T12:00:00.000Z"}';
    const res = await walletPost(
      new NextRequest('http://localhost/api/ingest/wallet', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'wallet-http-40-129',
        },
        body: raw,
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/decimales/i);
    expect(
      (await query('SELECT count(*)::int AS n FROM pending_inbox_items WHERE merchant=$1', ['Excess café'])).rows[0].n
    ).toBe(0);
    expect((await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n).toBe(
      before
    );
  });

  it('Wallet HTTP 1e2 parks null instead of 1.00 and never writes the ledger', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const before = (await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n;
    const raw =
      '{"amount":1e2,"currency":"ARS","merchant":"Exponent café","cardName":"Visa Ejemplo","timestamp":"2026-10-25T12:00:00.000Z"}';
    const res = await walletPost(
      new NextRequest('http://localhost/api/ingest/wallet', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'wallet-http-1e2',
        },
        body: raw,
      })
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { autoConfirmed: boolean; item: { amount: number | null; id: string } };
    expect(json.autoConfirmed).toBe(false);
    expect(json.item.amount).toBeNull();
    const row = await query('SELECT amount, amount_ambiguous, status FROM pending_inbox_items WHERE id=$1', [
      json.item.id,
    ]);
    expect(row.rows[0].amount).toBeNull();
    expect(row.rows[0].amount).not.toBe(1);
    expect(row.rows[0].amount_ambiguous).toBe(true);
    expect(row.rows[0].status).toBe('pending');
    expect((await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n).toBe(
      before
    );
  });

  it('Wallet HTTP auto-confirm never writes the round-11 High wrong amounts', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    await query('UPDATE users SET wallet_auto_confirm=true WHERE id=$1', [ids.a]);
    await query(
      `INSERT INTO wallet_card_account_maps(user_id,card_name_normalized,account_id)
       VALUES ($1,'visa ejemplo',$2)
       ON CONFLICT (user_id, card_name_normalized) DO UPDATE SET account_id=EXCLUDED.account_id`,
      [ids.a, ids.accountA]
    );
    await query(
      `INSERT INTO transactions(user_id,type,account_id,category_id,amount,currency,amount_in_account_currency,description)
       VALUES ($1,'expense',$2,$3,80,'ARS',80,'COTO')`,
      [ids.a, ids.accountA, ids.categoryA]
    );
    const last4Raw = JSON.stringify({
      rawText: 'Tarjeta Visa 1234. Monto: $ 1.500',
      merchant: 'COTO',
      cardName: 'Visa Ejemplo',
      timestamp: '2026-10-25T12:00:00.000Z',
      currency: 'ARS',
    });
    const last4Before = (await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0]
      .n;
    const last4Res = await walletPost(
      new NextRequest('http://localhost/api/ingest/wallet', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'wallet-r11-high-last4',
        },
        body: last4Raw,
      })
    );
    expect(last4Res.status).toBe(201);
    const last4Json = (await last4Res.json()) as { autoConfirmed: boolean; item: { amount: number | null; id: string } };
    expect(last4Json.item.amount).toBe(1500);
    expect(last4Json.item.amount).not.toBe(1234);
    const last4Pending = await query('SELECT amount FROM pending_inbox_items WHERE id=$1', [last4Json.item.id]);
    expect(Number(last4Pending.rows[0].amount)).toBe(1500);
    expect(
      (await query('SELECT id FROM transactions WHERE user_id=$1 AND amount=ANY($2::numeric[])', [ids.a, [1234, 20000]]))
        .rows
    ).toHaveLength(0);
    if (last4Json.autoConfirmed) {
      expect((await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n).toBe(
        Number(last4Before) + 1
      );
    }

    const parkCases: Array<{ rawText: string; forbidden: number[]; key: string }> = [
      {
        rawText: 'Monto: $ 1.500 en COTO. Saldo disponible $ 20.000',
        forbidden: [1500, 20000],
        key: 'wallet-r12-two-amount-saldo',
      },
      {
        rawText: 'Saldo a favor $ 200 aplicado. Compra $ 1.500. Restan $ 1.300',
        forbidden: [200, 1500, 1300],
        key: 'wallet-r12-alto-restan',
      },
      {
        rawText: 'Mercado Pago: Pagaste con saldo $ 1.500 en COTO. Gracias por tu compra. Cashback $ 150',
        forbidden: [1500, 150],
        key: 'wallet-r12-alto-cashback',
      },
      {
        rawText: 'Ualá: Pagaste con saldo $ 1.500 en COTO. Consultá todos los detalles en la aplicación. Comisión $ 50',
        forbidden: [1500, 50],
        key: 'wallet-r12-alto-comision',
      },
      {
        rawText: 'Naranja X: Pagaste con saldo $ 1.500 en COTO. Gracias por elegir nuestra cuenta. Cargo $ 20',
        forbidden: [1500, 20],
        key: 'wallet-r12-alto-cargo',
      },
      {
        rawText: 'Brubank: Pagaste con saldo $ 1.500 en COTO. Tu comprobante ya está disponible. Propina $ 100',
        forbidden: [1500, 100],
        key: 'wallet-r12-alto-propina',
      },
      {
        rawText: 'Carga de saldo SUBE $ 2.000. La operación se completó correctamente desde tu cuenta. Cargo $ 20',
        forbidden: [2000, 20],
        key: 'wallet-r12-alto-sube',
      },
      {
        rawText: 'Disponible: $ 20.000. Compra $ 1.500 en COTO. Comprobante emitido. Cargo $ 20',
        forbidden: [20000, 1500, 20],
        key: 'wallet-r12-alto-disponible',
      },
      {
        rawText: 'Compra ARS 1500 en COTO. Saldo USD 200',
        forbidden: [1500, 200],
        key: 'wallet-r12-alto-mixed-fx',
      },
      { rawText: 'Compra $ 12:30 en COTO', forbidden: [12, 30], key: 'wallet-r12-alto-clock' },
      { rawText: 'Compra $ 12:30:45 en COTO', forbidden: [12], key: 'wallet-r12-alto-hms' },
      { rawText: 'Compra $ 2026/10/25 en COTO', forbidden: [2026, 10, 25], key: 'wallet-r12-alto-date' },
      { rawText: 'Compra $12:30 en COTO', forbidden: [12], key: 'wallet-r12-kael-clock-tight' },
      { rawText: 'Compra 25-10-2026 en COTO', forbidden: [25, 10, 2026], key: 'wallet-r12-date-dmy' },
      { rawText: 'Compra 2026-10-25 en COTO', forbidden: [10, 25, 2026], key: 'wallet-r12-date-ymd' },
      { rawText: 'Ticket 00123 COTO', forbidden: [123], key: 'wallet-r12-ticket' },
      { rawText: 'Compra 14 hs en COTO', forbidden: [14], key: 'wallet-r12-hours' },
      { rawText: 'Compra 10% de descuento en COTO', forbidden: [10], key: 'wallet-r12-percent' },
      { rawText: '3 cuotas de $ 500', forbidden: [500], key: 'wallet-r12-cuotas' },
      { rawText: 'Compra 3x $500 en COTO', forbidden: [500], key: 'wallet-r12-3x' },
      { rawText: 'Compra $ −50 en COTO', forbidden: [50], key: 'wallet-r12-unicode-minus' },
      { rawText: '$ 1.500 , 50', forbidden: [1500, 50], key: 'wallet-r12-split-cents' },
      { rawText: 'Compra rechazada $ 1.500 en COTO', forbidden: [1500], key: 'wallet-r12-rechazada' },
      { rawText: 'Compra denegada $ 1.500 en COTO', forbidden: [1500], key: 'wallet-r12-denegada' },
      { rawText: 'Pago fallido $ 1.500 en COTO', forbidden: [1500], key: 'wallet-r12-fallido' },
      { rawText: 'Anulación de compra $ 1.500 en COTO', forbidden: [1500], key: 'wallet-r12-anulacion' },
      { rawText: 'Compra USD 10 ($ 10) en COTO', forbidden: [10], key: 'wallet-r12-mixed-usd' },
    ];
    for (const { rawText, forbidden, key } of parkCases) {
      const before = (await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0]
        .n;
      const raw = JSON.stringify({
        rawText,
        merchant: 'COTO',
        cardName: 'Visa Ejemplo',
        timestamp: '2026-10-25T12:00:00.000Z',
        currency: 'ARS',
      });
      const res = await walletPost(
        new NextRequest('http://localhost/api/ingest/wallet', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${tokenA}`,
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          body: raw,
        })
      );
      expect(res.status, rawText).toBe(201);
      const json = (await res.json()) as { autoConfirmed: boolean; item: { amount: number | null; id: string } };
      expect(json.autoConfirmed, rawText).toBe(false);
      expect(json.item.amount, rawText).toBeNull();
      for (const n of forbidden) expect(json.item.amount, rawText).not.toBe(n);
      const pending = await query('SELECT amount, amount_ambiguous, status FROM pending_inbox_items WHERE id=$1', [
        json.item.id,
      ]);
      expect(pending.rows[0].amount, rawText).toBeNull();
      expect(pending.rows[0].amount_ambiguous, rawText).toBe(true);
      expect(pending.rows[0].status, rawText).toBe('pending');
      expect((await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n).toBe(
        before
      );
      const wrong = await query('SELECT id FROM transactions WHERE user_id=$1 AND amount=ANY($2::numeric[])', [
        ids.a,
        forbidden,
      ]);
      expect(wrong.rows, rawText).toHaveLength(0);
    }

    const singleRaw = JSON.stringify({
      rawText: 'Pagaste con saldo $ 1.500 en COTO',
      merchant: 'COTO',
      cardName: 'Visa Ejemplo',
      timestamp: '2026-10-25T12:00:00.000Z',
      currency: 'ARS',
    });
    const singleRes = await walletPost(
      new NextRequest('http://localhost/api/ingest/wallet', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'wallet-r12-single-saldo',
        },
        body: singleRaw,
      })
    );
    expect(singleRes.status).toBe(201);
    const singleJson = (await singleRes.json()) as { item: { amount: number | null } };
    expect(singleJson.item.amount).toBe(1500);
  });

  it('two concurrent MCP confirms write a single ledger row', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const itemId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9';
    await query(
      `INSERT INTO pending_inbox_items(
         id, user_id, amount, currency, merchant, account_id, status, fingerprint, source, direction, occurred_at, tool_payload
       ) VALUES ($1,$2,42,'ARS','Concurrent Café',$3,'pending','fp-mcp-http-concurrent','mcp','expense',NULL,$4::jsonb)`,
      [
        itemId,
        ids.a,
        ids.accountA,
        JSON.stringify({
          type: 'expense',
          amount: 42,
          currency: 'ARS',
          accountId: ids.accountA,
          description: 'Concurrent Café',
          _tool: 'create_transaction',
        }),
      ]
    );
    const before = (await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1 AND description=$2', [
      ids.a,
      'Concurrent Café',
    ])).rows[0].n;
    const headers = {
      authorization: `Bearer ${tokenA}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    const callBody = (id: number) =>
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: 'create_transaction',
          arguments: { confirm: true, pendingId: itemId },
        },
      });
    const [first, second] = await Promise.all([
      mcpPost(new NextRequest('http://localhost/api/mcp', { method: 'POST', headers, body: callBody(21) })),
      mcpPost(new NextRequest('http://localhost/api/mcp', { method: 'POST', headers, body: callBody(22) })),
    ]);
    expect(first.status).toBeLessThan(500);
    expect(second.status).toBeLessThan(500);
    const results = [toolText(await readMcpJson(first)), toolText(await readMcpJson(second))];
    const successes = results.filter((body) => body.success === true);
    expect(successes.length).toBeGreaterThanOrEqual(1);
    const inbox = await query('SELECT status FROM pending_inbox_items WHERE id=$1', [itemId]);
    expect(inbox.rows[0].status).toBe('confirmed');
    const ledger = await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1 AND description=$2', [
      ids.a,
      'Concurrent Café',
    ]);
    expect(ledger.rows[0].n).toBe(Number(before) + 1);
  });

  it('REST accepts 1048576.37 into the inbox and rejects 40.129 without a ledger write', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const before = (await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n;
    const large = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'rest-large-ars-cents',
        },
        body: '{"type":"expense","amount":1048576.37,"currency":"ARS","accountId":"' + ids.accountA + '","description":"Alquiler grande"}',
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    expect(large.status).toBe(200);
    const largeJson = (await large.json()) as { needs_confirm?: boolean; pendingId?: string };
    expect(largeJson.needs_confirm).toBe(true);
    expect(
      (await query('SELECT amount::text AS amount FROM pending_inbox_items WHERE id=$1', [largeJson.pendingId])).rows[0]
        .amount
    ).toMatch(/^1048576\.37/);

    const excess = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'rest-excess-40-129',
        },
        body: '{"type":"expense","amount":40.129,"currency":"ARS","accountId":"' + ids.accountA + '","description":"No redondear"}',
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    expect(excess.status).toBe(400);
    expect((await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n).toBe(
      before
    );

    const exponent = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'rest-exponent-1e3',
        },
        body: '{"type":"expense","amount":1e3,"currency":"ARS","accountId":"' + ids.accountA + '","description":"No exponent"}',
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    expect(exponent.status).toBe(400);
    const hex = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          'idempotency-key': 'rest-hex-0x10',
        },
        body: '{"type":"expense","amount":"0x10","currency":"ARS","accountId":"' + ids.accountA + '","description":"No hex"}',
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    expect(hex.status).toBe(400);
  });

  it('MCP rejects exponent amounts before parking or writing the ledger', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const beforeInbox = (await query('SELECT count(*)::int AS n FROM pending_inbox_items WHERE user_id=$1', [ids.a])).rows[0].n;
    const beforeLedger = (await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n;
    const call = await mcpPost(
      new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body:
          '{"jsonrpc":"2.0","id":91,"method":"tools/call","params":{"name":"create_transaction","arguments":{"type":"expense","amount":1e3,"currency":"ARS","accountId":"' +
          ids.accountA +
          '","description":"MCP exponent"}}}',
      })
    );
    expect(call.status).toBe(400);
    expect((await query('SELECT count(*)::int AS n FROM pending_inbox_items WHERE user_id=$1', [ids.a])).rows[0].n).toBe(
      beforeInbox
    );
    expect((await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n).toBe(
      beforeLedger
    );
  });

  it('mixed confirm of a valid item plus a fresh confirming item writes nothing', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const validId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
    const confirmingId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
    const payload = JSON.stringify({
      type: 'expense',
      amount: 18,
      currency: 'ARS',
      accountId: ids.accountA,
      description: 'Mixed confirming',
      _tool: 'create_transaction',
    });
    await query(
      `INSERT INTO pending_inbox_items(
         id, user_id, amount, currency, merchant, account_id, status, fingerprint, source, direction, tool_payload, request_canonical, updated_at
       ) VALUES
         ($1,$2,18,'ARS','Valid mix',$3,'pending','fp-mix-valid','mcp','expense',$4::jsonb,'', now()),
         ($5,$2,18,'ARS','Fresh confirming',$3,'confirming','fp-mix-confirming','mcp','expense',$4::jsonb,'', now())`,
      [validId, ids.a, ids.accountA, payload, confirmingId]
    );
    const before = (await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n;
    const res = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ confirm: true, pendingIds: [validId, confirmingId] }),
      }),
      { params: Promise.resolve({ name: 'create_transactions' }) }
    );
    expect(res.status).toBe(409);
    expect((await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n).toBe(
      before
    );
    expect((await query('SELECT status FROM pending_inbox_items WHERE id=$1', [validId])).rows[0].status).toBe(
      'pending'
    );
    expect((await query('SELECT status FROM pending_inbox_items WHERE id=$1', [confirmingId])).rows[0].status).toBe(
      'confirming'
    );
  });

  it('mixed confirm of a valid item plus an item without account writes nothing', async () => {
    const query = (sql: string, params: unknown[] = []) =>
      asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
        tx.query(sql, params)
      );
    const validId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3';
    const missingId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4';
    await query(
      `INSERT INTO pending_inbox_items(
         id, user_id, amount, currency, merchant, account_id, status, fingerprint, source, direction, tool_payload, request_canonical
       ) VALUES
         ($1,$2,18,'ARS','Valid account',$3,'pending','fp-mix-acc-valid','mcp','expense',$4::jsonb,''),
         ($5,$2,13,'ARS','No account',NULL,'pending','fp-mix-acc-missing','mcp','expense',$6::jsonb,'')`,
      [
        validId,
        ids.a,
        ids.accountA,
        JSON.stringify({
          type: 'expense',
          amount: 18,
          currency: 'ARS',
          accountId: ids.accountA,
          description: 'Valid account',
          _tool: 'create_transaction',
        }),
        missingId,
        JSON.stringify({ type: 'expense', amount: 13, description: 'No account', _tool: 'create_transaction' }),
      ]
    );
    const before = (await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n;
    const res = await restPost(
      new NextRequest('http://localhost/api/v1/tools/create_transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ confirm: true, pendingIds: [validId, missingId] }),
      }),
      { params: Promise.resolve({ name: 'create_transactions' }) }
    );
    expect(res.status).toBe(400);
    expect((await query('SELECT count(*)::int AS n FROM transactions WHERE user_id=$1', [ids.a])).rows[0].n).toBe(
      before
    );
    expect((await query('SELECT status FROM pending_inbox_items WHERE id=$1', [validId])).rows[0].status).toBe(
      'pending'
    );
  });
});
