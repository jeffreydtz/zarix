import { asRole } from '../../scripts/lib/test-isolated-database.mjs';

type Filter = { sql: string; params: unknown[] };
type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };

const RPC_ARGS: Record<string, string[]> = {
  rate_limit_hit: ['p_key', 'p_max', 'p_window_ms'],
  claim_pending_inbox_item: ['p_user_id', 'p_item_id'],
  discard_pending_inbox_item: ['p_user_id', 'p_item_id'],
  create_transaction_once: ['p_user_id', 'p_request_id', 'p_request_hash', 'p_transaction', 'p_installments'],
  get_multicurrency_balances: ['p_user_id', 'p_account_ids'],
  reserve_pending_inbox_item: [
    'p_user_id',
    'p_lock_key',
    'p_fingerprints',
    'p_lookback_ms',
    'p_ingest_key',
    'p_client_keyed',
    'p_fingerprint',
    'p_row',
  ],
};

const SETOF_RPC = new Set(['claim_pending_inbox_item', 'discard_pending_inbox_item']);

function ident(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`invalid identifier ${name}`);
  return `"${name}"`;
}

function bind(value: unknown): { sql: string; value: unknown } {
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    return { sql: '::jsonb', value: JSON.stringify(value) };
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return { sql: '::text[]', value };
  }
  return { sql: '', value };
}

export function createPgliteSupabaseClient(db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) {
  const exec = (sql: string, params: unknown[] = []) =>
    asRole(db, 'service_role', null, (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) =>
      tx.query(sql, params)
    );

  function from(table: string) {
    const state: {
      table: string;
      op: 'select' | 'insert' | 'update';
      columns: string;
      filters: Filter[];
      row: Record<string, unknown> | null;
      orderSql: string;
      limitN: number | null;
      returning: boolean;
    } = {
      table,
      op: 'select',
      columns: '*',
      filters: [],
      row: null,
      orderSql: '',
      limitN: null,
      returning: false,
    };

    const addEq = (column: string, value: unknown) => {
      const n = state.filters.reduce((count, filter) => count + filter.params.length, 0) + 1;
      state.filters.push({ sql: `${ident(column)} = $${n}`, params: [value] });
    };

    const builder: Record<string, unknown> = {};
    const self = builder;

    const execute = async (): Promise<RpcResult> => {
      try {
        const params: unknown[] = [];
        const push = (value: unknown) => {
          params.push(value);
          return `$${params.length}`;
        };
        const where = () =>
          state.filters.length
            ? ` WHERE ${state.filters
                .map((filter) => {
                  const rewritten = filter.sql.replace(/\$(\d+)/g, () => push(filter.params.shift()));
                  return rewritten;
                })
                .join(' AND ')}`
            : '';

        if (state.op === 'insert' && state.row) {
          const keys = Object.keys(state.row);
          const cols = keys.map(ident).join(', ');
          const values = keys.map((key) => {
            const bound = bind(state.row![key]);
            return `${push(bound.value)}${bound.sql}`;
          });
          const returning = state.returning ? ` RETURNING ${state.columns}` : '';
          const result = await exec(
            `INSERT INTO ${ident(state.table)} (${cols}) VALUES (${values.join(', ')})${returning}`,
            params
          );
          return { data: state.returning ? result.rows : null, error: null };
        }

        if (state.op === 'update' && state.row) {
          const assigns = Object.keys(state.row).map((key) => {
            const bound = bind(state.row![key]);
            return `${ident(key)} = ${push(bound.value)}${bound.sql}`;
          });
          const returning = state.returning ? ` RETURNING ${state.columns}` : '';
          const result = await exec(
            `UPDATE ${ident(state.table)} SET ${assigns.join(', ')}${where()}${returning}`,
            params
          );
          return { data: state.returning ? result.rows : null, error: null };
        }

        const result = await exec(
          `SELECT ${state.columns} FROM ${ident(state.table)}${where()}${state.orderSql}${
            state.limitN != null ? ` LIMIT ${state.limitN}` : ''
          }`,
          params
        );
        return { data: result.rows, error: null };
      } catch (error) {
        const err = error as { message?: string; code?: string };
        return { data: null, error: { message: err.message, code: err.code } };
      }
    };

    const finish = async (mode: 'many' | 'single' | 'maybe'): Promise<RpcResult> => {
      const result = await execute();
      if (result.error) return result;
      const rows = Array.isArray(result.data) ? result.data : result.data == null ? [] : [result.data];
      if (mode === 'many') return { data: rows, error: null };
      if (mode === 'maybe') {
        if (rows.length > 1) return { data: null, error: { message: 'Multiple rows', code: 'PGRST116' } };
        return { data: rows[0] ?? null, error: null };
      }
      if (rows.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      return { data: rows[0], error: null };
    };

    builder.select = (columns?: string) => {
      if (typeof columns === 'string' && columns.trim()) state.columns = columns;
      if (state.op !== 'select') state.returning = true;
      return self;
    };
    builder.eq = (column: string, value: unknown) => {
      addEq(column, value);
      return self;
    };
    builder.neq = (column: string, value: unknown) => {
      const n = state.filters.reduce((count, filter) => count + filter.params.length, 0) + 1;
      state.filters.push({ sql: `${ident(column)} <> $${n}`, params: [value] });
      return self;
    };
    builder.in = (column: string, values: unknown[]) => {
      if (!values.length) {
        state.filters.push({ sql: 'FALSE', params: [] });
        return self;
      }
      const start = state.filters.reduce((count, filter) => count + filter.params.length, 0);
      const placeholders = values.map((_, index) => `$${start + index + 1}`);
      state.filters.push({ sql: `${ident(column)} IN (${placeholders.join(', ')})`, params: [...values] });
      return self;
    };
    builder.is = (column: string, value: unknown) => {
      if (value === null) state.filters.push({ sql: `${ident(column)} IS NULL`, params: [] });
      else addEq(column, value);
      return self;
    };
    builder.or = (expr: string) => {
      const params: unknown[] = [];
      const parts = expr.split(',').map((part) => {
        const match = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\.(eq|is)\.(.+)$/);
        if (!match) throw new Error(`unsupported or() ${expr}`);
        const [, column, op, raw] = match;
        if (op === 'is' && raw === 'null') return `${ident(column)} IS NULL`;
        params.push(raw);
        return `${ident(column)} = $${params.length}`;
      });
      state.filters.push({ sql: `(${parts.join(' OR ')})`, params });
      return self;
    };
    builder.order = (column: string, options?: { ascending?: boolean }) => {
      state.orderSql = ` ORDER BY ${ident(column)} ${options?.ascending === false ? 'DESC' : 'ASC'}`;
      return self;
    };
    builder.limit = (n: number) => {
      state.limitN = n;
      return self;
    };
    builder.gte = (column: string, value: unknown) => {
      const n = state.filters.reduce((count, filter) => count + filter.params.length, 0) + 1;
      state.filters.push({ sql: `${ident(column)} >= $${n}`, params: [value] });
      return self;
    };
    builder.insert = (row: Record<string, unknown>) => {
      state.op = 'insert';
      state.row = row;
      return self;
    };
    builder.update = (row: Record<string, unknown>) => {
      state.op = 'update';
      state.row = row;
      return self;
    };
    builder.upsert = (row: Record<string, unknown>) => {
      state.op = 'insert';
      state.row = row;
      return self;
    };
    builder.maybeSingle = () => finish('maybe');
    builder.single = () => finish('single');
    builder.abortSignal = () => self;
    builder.then = (resolve: (value: RpcResult) => unknown, reject?: (reason: unknown) => unknown) =>
      finish('many').then(resolve, reject);
    return builder;
  }

  function rpc(name: string, args: Record<string, unknown> = {}) {
    const run = (async (): Promise<RpcResult> => {
      try {
        const keys = RPC_ARGS[name];
        if (!keys) return { data: null, error: { message: `unknown rpc ${name}` } };
        const params = keys.map((key) => {
          const value = key === 'p_installments' ? (args[key] ?? 1) : args[key];
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
          return value ?? null;
        });
        const placeholders = params.map((_, index) => {
          if (name === 'create_transaction_once' && keys[index] === 'p_transaction') return `$${index + 1}::jsonb`;
          if (name === 'reserve_pending_inbox_item' && keys[index] === 'p_row') return `$${index + 1}::jsonb`;
          if (name === 'reserve_pending_inbox_item' && keys[index] === 'p_fingerprints') return `$${index + 1}::text[]`;
          return `$${index + 1}`;
        });
        if (SETOF_RPC.has(name)) {
          const result = await exec(`SELECT * FROM ${ident(name)}(${placeholders.join(', ')})`, params);
          return { data: result.rows, error: null };
        }
        const result = await exec(`SELECT ${ident(name)}(${placeholders.join(', ')}) AS result`, params);
        return { data: result.rows[0]?.result ?? null, error: null };
      } catch (error) {
        const err = error as { message?: string; code?: string };
        return { data: null, error: { message: err.message, code: err.code } };
      }
    })();
    return Object.assign(run, {
      abortSignal() {
        return run;
      },
    });
  }

  return { from, rpc };
}
