// Real PostgreSQL WASM and synthetic roles only; never connects to a server.
import assert from 'node:assert/strict';
import { asRole, bootDatabase, ids, seedDatabase } from './lib/test-isolated-database.mjs';

const { db } = await bootDatabase({ legacyGrants: false });
const consume = async (user, feature) => (await asRole(db, 'service_role', null,
  tx => tx.query('SELECT public.consume_ai_daily_quota($1,$2) AS r', [user, feature]))).rows[0].r;
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', code: error.code ?? null, message: String(error.message).slice(0, 200) }); }
}
try {
  await seedDatabase(db);
  await test('new account: 20 AI messages allowed, 21st denied', async () => {
    for (let i = 1; i <= 20; i++) assert.deepEqual(await consume(ids.a, 'ai'), { allowed: true, limit: 20, used: i });
    assert.deepEqual(await consume(ids.a, 'ai'), { allowed: false, limit: 20, used: 20 });
    assert.equal((await db.query("SELECT used FROM ai_daily_usage WHERE user_id=$1 AND feature='ai'", [ids.a])).rows[0].used, 20);
  });
  await test('new account: 5 OCR allowed, 6th denied, independent of AI', async () => {
    for (let i = 1; i <= 5; i++) assert.equal((await consume(ids.a, 'ocr')).allowed, true);
    assert.equal((await consume(ids.a, 'ocr')).allowed, false);
  });
  await test('counter is per user', async () => {
    assert.deepEqual(await consume(ids.b, 'ai'), { allowed: true, limit: 20, used: 1 });
  });
  await test('previous day usage does not count today', async () => {
    await db.query("UPDATE ai_daily_usage SET usage_date=usage_date-1 WHERE user_id=$1", [ids.a]);
    assert.deepEqual(await consume(ids.a, 'ai'), { allowed: true, limit: 20, used: 1 });
  });
  await test('grandfathered account is unlimited and writes no counter', async () => {
    await db.query('UPDATE users SET ai_unlimited=true WHERE id=$1', [ids.b]);
    const before = (await db.query('SELECT count(*)::int c FROM ai_daily_usage WHERE user_id=$1', [ids.b])).rows[0].c;
    for (let i = 0; i < 30; i++) assert.equal((await consume(ids.b, 'ai')).unlimited, true);
    assert.equal((await db.query('SELECT count(*)::int c FROM ai_daily_usage WHERE user_id=$1', [ids.b])).rows[0].c, before);
  });
  await test('backfill grandfathers only accounts created before the cutoff', async () => {
    await db.query("UPDATE users SET ai_unlimited=false, created_at=TIMESTAMPTZ '2026-08-01 00:00:00+00' WHERE id=$1", [ids.b]);
    await db.query("UPDATE users SET ai_unlimited=false, created_at=TIMESTAMPTZ '2026-10-16 00:00:00+00' WHERE id=$1", [ids.a]);
    await db.query("UPDATE public.users SET ai_unlimited = TRUE WHERE created_at < TIMESTAMPTZ '2026-10-15 17:23:00+00' AND NOT ai_unlimited");
    const rows = Object.fromEntries((await db.query('SELECT id, ai_unlimited FROM users WHERE id = ANY($1)', [[ids.a, ids.b]])).rows.map(r => [r.id, r.ai_unlimited]));
    assert.deepEqual(rows, { [ids.a]: false, [ids.b]: true });
  });
  await test('browser roles cannot consume or read counters', async () => {
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(asRole(db, role, role === 'authenticated' ? ids.a : null, tx => tx.query("SELECT public.consume_ai_daily_quota($1,'ai')", [ids.a])));
      await assert.rejects(asRole(db, role, role === 'authenticated' ? ids.a : null, tx => tx.query('SELECT * FROM ai_daily_usage')));
    }
  });
  await test('unknown feature rejected', async () => {
    await assert.rejects(consume(ids.a, 'video'));
  });
} finally { await db.close?.(); }
console.log(JSON.stringify({ suite: 'ai-daily-caps', results }, null, 2));
if (results.some(r => r.status !== 'PASS')) process.exitCode = 1;
