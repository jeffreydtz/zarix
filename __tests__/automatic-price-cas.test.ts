import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { bootDatabase, ids, seedDatabase } from '../scripts/lib/test-isolated-database.mjs';
import { createPgliteSupabaseClient } from './helpers/pglite-supabase-client';
import {
  applyObservedRowMatch,
  applyObservedTimestampMatch,
} from '@/lib/market-data/quote-refresh';
import type { InvestmentType } from '@/types/database';

let db: PGlite;
let client: ReturnType<typeof createPgliteSupabaseClient>;

const STOCK = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const CEDEAR = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const BOND = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3';
const CRYPTO = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';

const TYPES: Array<{ id: string; type: InvestmentType; ticker: string }> = [
  { id: STOCK, type: 'stock_arg', ticker: 'GGAL' },
  { id: CEDEAR, type: 'cedear', ticker: 'AAPL' },
  { id: BOND, type: 'bond', ticker: 'AL30' },
  { id: CRYPTO, type: 'crypto', ticker: 'BTC' },
];

type Observed = {
  id: string;
  type: InvestmentType;
  ticker: string | null;
  market_currency: string | null;
  current_price_updated_at: string | null;
  is_manual_price: boolean;
};

type WriteChain = {
  eq: (column: string, value: unknown) => WriteChain;
  is: (column: string, value: null) => WriteChain;
  update: (row: Record<string, unknown>) => WriteChain;
  select: (columns?: string) => WriteChain;
  then: (
    resolve: (value: { data: unknown; error: { message?: string } | null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

function fromInvestments(): WriteChain {
  return client.from('investments') as unknown as WriteChain;
}

async function insertPosition(opts: {
  id: string;
  type: InvestmentType;
  ticker: string | null;
  market_currency: string | null;
  current_price?: number;
  current_price_updated_at?: string | null;
}) {
  await db.query(
    `INSERT INTO investments(
       id, user_id, account_id, type, ticker, name, quantity, purchase_price, purchase_currency,
       purchase_date, current_price, current_price_updated_at, market_currency, is_manual_price, is_active
     ) VALUES ($1,$2,$3,$4,$5,$6,10,100,'USD','2026-10-01',$7,$8,$9,false,true)`,
    [
      opts.id,
      ids.a,
      ids.accountA,
      opts.type,
      opts.ticker,
      `${opts.type} ${opts.ticker ?? 'none'}`,
      opts.current_price ?? 100,
      opts.current_price_updated_at ?? null,
      opts.market_currency,
    ],
  );
}

async function readObserved(id: string): Promise<Observed> {
  const { data, error } = await fromInvestments()
    .select('id, type, ticker, market_currency, current_price_updated_at, is_manual_price')
    .eq('id', id);
  if (error) throw error;
  const rows = data as Observed[];
  const row = rows.find((item) => item.id === id) ?? rows[0];
  if (!row) throw new Error(`missing investment ${id}`);
  return row;
}

async function persistNonFci(
  observed: Observed,
  quote: { price: number; timestamp: string; changePct: number | null; currency: string },
): Promise<number> {
  const query = applyObservedTimestampMatch(
    applyObservedRowMatch(
      fromInvestments()
        .update({
          current_price: quote.price,
          current_price_updated_at: quote.timestamp,
          current_price_change_pct: quote.changePct,
          market_currency: quote.currency.trim().toUpperCase(),
        })
        .eq('id', observed.id),
      observed,
    ),
    observed.current_price_updated_at,
  );
  const { data, error } = await query.select('id');
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    console.warn('[quotes] skip price update', {
      reason: 'row_changed',
      ticker: observed.ticker,
      id: observed.id,
      type: observed.type,
    });
    return 0;
  }
  return data.length;
}

async function persistMain(
  id: string,
  quote: { price: number; timestamp: string; changePct: number | null; currency: string },
): Promise<number> {
  const { data, error } = await fromInvestments()
    .update({
      current_price: quote.price,
      current_price_updated_at: quote.timestamp,
      current_price_change_pct: quote.changePct,
      market_currency: quote.currency.trim().toUpperCase(),
    })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}

async function priceOf(id: string): Promise<number> {
  const result = await db.query<{ current_price: string }>(
    'SELECT current_price::text AS current_price FROM investments WHERE id=$1',
    [id],
  );
  return Number(result.rows[0].current_price);
}

beforeAll(async () => {
  const boot = await bootDatabase();
  db = boot.db;
  await seedDatabase(db);
  client = createPgliteSupabaseClient(db);
}, 60_000);

afterAll(async () => {
  if (db && !db.closed) await db.close();
});

beforeEach(async () => {
  await db.query(
    `DELETE FROM investments WHERE id = ANY($1::uuid[])`,
    [TYPES.map((row) => row.id)],
  );
});

describe('non-FCI automatic writers: raw identity + timestamp CAS vs main', () => {
  it.each([
    { market_currency: 'usd' as string | null, ticker: 'GGAL' },
    { market_currency: ' USD ', ticker: 'GGAL' },
    { market_currency: '', ticker: 'GGAL' },
    { market_currency: null, ticker: 'GGAL' },
    { market_currency: 'ARS', ticker: 'ggal' },
  ])('legacy $ticker / $market_currency matches an id-only main write', async (legacy) => {
    const id = STOCK;
    const storedTs = '2026-10-20T15:00:00.000Z';
    const quote = {
      price: 110,
      timestamp: '2026-10-26T15:00:00.000Z',
      changePct: 1,
      currency: 'USD',
    };
    await insertPosition({
      id,
      type: 'stock_arg',
      ticker: legacy.ticker,
      market_currency: legacy.market_currency,
      current_price: 100,
      current_price_updated_at: storedTs,
    });
    const observed = await readObserved(id);
    expect(await persistNonFci(observed, quote)).toBe(1);
    const oursPrice = await priceOf(id);

    await db.query(
      `UPDATE investments SET current_price=100, current_price_updated_at=$2, market_currency=$3, ticker=$4
       WHERE id=$1`,
      [id, storedTs, legacy.market_currency, legacy.ticker],
    );
    expect(await persistMain(id, quote)).toBe(1);
    expect(await priceOf(id)).toBe(oursPrice);
    expect(oursPrice).toBe(110);
  });

  it.each(TYPES)('$type concurrent newer write wins; stale writer is 0 rows and logs row_changed', async (row) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const observedTs = '2026-10-20T15:00:00.000Z';
    await insertPosition({
      id: row.id,
      type: row.type,
      ticker: row.ticker,
      market_currency: 'usd',
      current_price: 100,
      current_price_updated_at: observedTs,
    });
    const observed = await readObserved(row.id);
    const newer = {
      price: 200,
      timestamp: '2026-10-26T18:00:00.000Z',
      changePct: 2,
      currency: 'USD',
    };
    const stale = {
      price: 90,
      timestamp: '2026-10-21T15:00:00.000Z',
      changePct: -1,
      currency: 'USD',
    };
    expect(await persistNonFci(observed, newer)).toBe(1);
    expect(await persistNonFci(observed, stale)).toBe(0);
    expect(await priceOf(row.id)).toBe(200);
    expect(warn).toHaveBeenCalledWith('[quotes] skip price update', expect.objectContaining({
      reason: 'row_changed',
      id: row.id,
      type: row.type,
      ticker: row.ticker,
    }));
    warn.mockRestore();
  });

  it('concurrent identity change is 0 rows for the raw matcher and still writes on main', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const id = STOCK;
    await insertPosition({
      id,
      type: 'stock_arg',
      ticker: 'GGAL',
      market_currency: 'usd',
      current_price: 100,
      current_price_updated_at: '2026-10-20T15:00:00.000Z',
    });
    const observed = await readObserved(id);
    await db.query(`UPDATE investments SET type='bond' WHERE id=$1`, [id]);
    const quote = {
      price: 110,
      timestamp: '2026-10-26T15:00:00.000Z',
      changePct: 1,
      currency: 'USD',
    };
    expect(await persistNonFci(observed, quote)).toBe(0);
    expect(await priceOf(id)).toBe(100);
    expect(await persistMain(id, quote)).toBe(1);
    expect(await priceOf(id)).toBe(110);
    vi.restoreAllMocks();
  });
});
