// Source-only preparation. No top-level filesystem/network/database/runtime actions.
// A future released runner must bind c to the exact new Native proof and CI6 copy.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFlight } from '../account-analysis-contracts/ssr-financial-read.mjs';

const decode = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();

async function moduleBinding(c, component) {
  assert.equal(c.productRevision, '84df929ab2f169251a49f3e95d0e0c148dfcb87c');
  assert.equal(c.nativeProofVerified, true);
  assert.equal(c.sourceManifestVerified, true);
  const relative = '.next/server/app/(authenticated)/dashboard/page_client-reference-manifest.js';
  const bytes = await fs.readFile(path.join(c.copyRoot, relative));
  const marker = 'globalThis.__RSC_MANIFEST["/(authenticated)/dashboard/page"]=';
  const at = bytes.toString().indexOf(marker);
  assert.ok(at >= 0, 'Actual compiled dashboard client reference manifest required');
  const manifest = JSON.parse(bytes.toString().slice(at + marker.length).trim().replace(/;$/, ''));
  const entries = Object.entries(manifest.clientModules).filter(([key]) => key.endsWith('/' + component));
  assert.equal(entries.length, 1);
  return { moduleId: entries[0][1].id, component, manifestPath: relative, manifestSha256: c.digest(bytes) };
}

function allPropsFor(flight, moduleId, accepts) {
  const refs = new Set([...flight.imports].filter(([, value]) => String(value[0]) === String(moduleId)).map(([id]) => '$L' + id));
  const found = [];
  function visit(value, seen = new Set()) {
    if (typeof value === 'string' && /^\$[\da-f]+$/i.test(value)) {
      const id = value.slice(1);
      if (!seen.has(id) && flight.rows.has(id)) visit(flight.rows.get(id), new Set([...seen, id]));
    } else if (Array.isArray(value)) {
      if (value[0] === '$' && refs.has(value[1]) && value[3] && accepts(value[3])) found.push(value[3]);
      for (const child of value) visit(child, seen);
    } else if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child, seen);
  }
  for (const value of flight.rows.values()) visit(value);
  const unique = [...new Map(found.map(value => [JSON.stringify(value), value])).values()];
  return unique;
}

function propsFor(flight, moduleId, accepts) {
  const unique = allPropsFor(flight, moduleId, accepts);
  assert.equal(unique.length, 1, 'One actual bound dashboard component payload required');
  return unique[0];
}

function counts(c) {
  return Object.fromEntries(['accounts', 'transactions', 'investments'].map(table => [table,
    Number(c.sql(`SELECT count(*) FROM public.${table} WHERE user_id=${c.lit(c.user.id)}`)),
  ]));
}

async function observeSnapshot(c, now, before) {
  assert.ok(before.length === 0 || (before.length === 1 && before[0].id === c.ownedSnapshotId), 'No original snapshot may be overwritten');
  let after;
  const until = Date.now() + 15000;
  do {
    after = c.rows(`SELECT * FROM public.net_worth_snapshots WHERE user_id=${c.lit(c.user.id)} ORDER BY id`);
    if (after.length === 1 && ['liquid_usd', 'investments_usd', 'total_usd', 'total_ars_blue'].every((key, index) =>
      Math.abs(Number(after[0][key]) - [now.liquidUSD, now.investmentsUSD, now.totalUSD, now.totalARSBlue][index]) < 1e-8)) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  } while (Date.now() < until);
  c.check('Actual own SSR snapshot completion observed before any fixture cleanup', after.length, 1);
  for (const [key, value] of Object.entries({ liquid_usd: now.liquidUSD, investments_usd: now.investmentsUSD, total_usd: now.totalUSD, total_ars_blue: now.totalARSBlue })) c.near(`Own snapshot ${key}`, Number(after[0][key]), value);
  if (c.ownedSnapshotId) c.check('Only the same newly owned empty-dashboard snapshot was updated', after[0].id, c.ownedSnapshotId);
  else c.ownedSnapshotId = after[0].id;
  return { before, after, ownedSnapshotId: c.ownedSnapshotId, ownership: 'Initially absent in this fresh fixture DB; created by this ordinary authenticated SSR request' };
}

async function readWealth(c, expectedARS) {
  const snapshotBefore = c.rows(`SELECT * FROM public.net_worth_snapshots WHERE user_id=${c.lit(c.user.id)} ORDER BY id`);
  assert.ok(snapshotBefore.length === 0 || (snapshotBefore.length === 1 && snapshotBefore[0].id === c.ownedSnapshotId));
  const binding = await moduleBinding(c, 'components/dashboard/NetWorthHero.tsx');
  const response = await c.serverGet('/dashboard');
  c.check('Actual normal-authenticated dashboard SSR status', response.status, 200);
  const flight = parseFlight(response.body);
  const props = propsFor(flight, binding.moduleId, value => value.now && Array.isArray(value.history));
  c.near('Actual server aggregate total ARS', props.now.totalARSBlue, expectedARS);
  c.check('Known valid fixture never becomes partial', props.now.valuation, undefined);
  const text = decode(response.body);
  c.check('No safe-error alert on this valid-FX empty/account dashboard', /No pudimos cargar tus datos financieros/.test(text), false);
  const snapshot = await observeSnapshot(c, props.now, snapshotBefore);
  return { responseSha256: c.digest(response.body), binding, now: props.now, history: props.history, text, flight, snapshot };
}

export async function readEmptyDashboard(c) {
  c.check('CP3-07 literal absence includes archived accounts and all own history/positions', counts(c), { accounts: 0, transactions: 0, investments: 0 });
  c.check('CP3-07 no prior synthetic history is presented as existing history', Number(c.sql(`SELECT count(*) FROM public.net_worth_snapshots WHERE user_id=${c.lit(c.user.id)}`)), 0);
  const observed = await readWealth(c, 0);
  c.near('CP3-07 liquid zero', observed.now.liquidUSD, 0);
  c.near('CP3-07 portfolio zero', observed.now.investmentsUSD, 0);
  c.near('CP3-07 total USD zero', observed.now.totalUSD, 0);
  c.check('CP3-07 actual server returned no invented historic points', observed.history, []);
  const accountsBinding = await moduleBinding(c, 'components/dashboard/AccountCards.tsx');
  const recentBinding = await moduleBinding(c, 'components/dashboard/RecentTransactions.tsx');
  c.check('CP3-07 actual empty accounts payload', propsFor(observed.flight, accountsBinding.moduleId, value => Array.isArray(value.accounts)).accounts, []);
  c.check('CP3-07 actual empty movements payload', propsFor(observed.flight, recentBinding.moduleId, value => Array.isArray(value.transactions)).transactions, []);
  c.check('CP3-07 actual HTML explains empty accounts and guides CU002', /No tenés cuentas todavía/.test(observed.text) && /Crear cuenta/.test(observed.text), true);
  c.check('CP3-07 actual HTML explains empty movements and guides CU001', /No tenés movimientos todavía/.test(observed.text) && /Nuevo/.test(observed.text), true);
  const projection = await c.apiGet('/api/ai/projections');
  c.check('CP3-07 deterministic projection status', projection.status, 200);
  c.check('CP3-07 no fabricated historical projection', projection.body.hasData, false);
  c.check('CP3-07 reads created no account movement or position', counts(c), { accounts: 0, transactions: 0, investments: 0 });
  const { text, flight, ...evidence } = observed;
  return { ...evidence, emptyAccountsBinding: accountsBinding, emptyMovementsBinding: recentBinding, scope: 'Actual authenticated HTTP/SSR/SQL. No browser, hydration, animation or visible viewport claim.' };
}

export async function readFirstAccountDashboard(c, accountId) {
  const observed = await readWealth(c, 50000);
  const own = c.rows(`SELECT id,user_id,name,type,is_active,currency,balance FROM public.accounts WHERE id=${c.lit(accountId)} AND user_id=${c.lit(c.user.id)}`);
  c.check('CP2-01 exactly one own active bank account exists', own.length, 1);
  c.check('CP2-01 account is active and ARS', { owner: own[0].user_id, active: own[0].is_active, currency: own[0].currency }, { owner: c.user.id, active: true, currency: 'ARS' });
  c.check('CP2-01 literal BancoARS is a bank account', { name: own[0].name, type: own[0].type }, { name: 'BancoARS', type: 'bank' });
  c.near('CP2-01 bank account balance', Number(own[0].balance), 50000);
  const history = c.rows(`SELECT type,amount::text,amount_in_account_currency::text,description FROM public.transactions WHERE account_id=${c.lit(accountId)} ORDER BY id`);
  c.check('CP2-01 one explicit opening adjustment documents the 50000 origin', history.map(row => ({ type: row.type, amount: Number(row.amount), authoritative: Number(row.amount_in_account_currency), description: row.description })), [{ type: 'adjustment', amount: 50000, authoritative: 50000, description: 'Saldo inicial' }]);
  const { text, flight, ...evidence } = observed;
  return { ...evidence, account: own[0], openingHistory: history, scope: 'Actual normal account API result plus independent SQL and authenticated server-calculated patrimony increase0→50000ARS; no browser claim.' };
}

export async function readUnavailableDashboard(c) {
  c.check('CP3-03 fixture DB has no persisted quote cache before request', Number(c.sql('SELECT count(*) FROM public.exchange_rates')), 0);
  const snapshotsBefore = c.rows('SELECT * FROM public.net_worth_snapshots ORDER BY id');
  const response = await c.serverGet('/dashboard');
  const text = decode(response.body);
  c.check('CP3-03 actual authenticated safe-error page status', response.status, 200);
  c.check('CP3-03 actual safe error explicitly declares financial unavailability', /role="alert"/.test(response.body) && /No pudimos cargar tus datos financieros/.test(text), true);
  c.check('CP3-03 actual retry is an anchor to dashboard, not an invented button', /<a\b[^>]*href="\/dashboard"[^>]*>\s*Reintentar\s*<\/a>/.test(response.body), true);
  c.check('CP3-03 no financial hero fabricates a consolidated zero or unit rate', /<h2\b[^>]*>Patrimonio total<\/h2>/.test(response.body), false);
  const binding = await moduleBinding(c, 'components/dashboard/NetWorthHero.tsx');
  c.check('CP3-03 actual Flight contains no financial Hero aggregate', allPropsFor(parseFlight(response.body), binding.moduleId, value => value.now && Array.isArray(value.history)).length, 0);
  c.check('CP3-03 failed quote requests persisted no0 or1 fallback', Number(c.sql('SELECT count(*) FROM public.exchange_rates')), 0);
  c.check('CP3-03 unavailable read does not create or overwrite any snapshot', c.rows('SELECT * FROM public.net_worth_snapshots ORDER BY id'), snapshotsBefore);
  return { status: response.status, responseSha256: c.digest(response.body), noHeroBinding: binding, snapshotCount: snapshotsBefore.length, scope: 'Safe unavailable financial SSR; zero-valued market strip placeholders are not treated as a financial total. Provider503/cold process proof and mixed-balance API checks must be supplied by the released runner.' };
}
